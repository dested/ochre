/**
 * Hair as sculpted masses: a shell grown off the skull from a hairline, with coiled texture as displacement and
 * clumps ("bobbles") that break the silhouette, plus knots, locs (hanging or gathered up) and beards. Everything
 * is gear material, skinned to the head (beards below the mouth ride the jaw).
 */
import { Color, Matrix4, Vector3 } from 'three'
import type { BuildCtx } from './ctx'
import type { HeadShape } from './head'
import { B } from './rig'
import { blend2, bump, clamp, fbm3, lerp, mul, profile, rigid, smooth, T, type GridPoint } from './geo'
import { BONE_WHITE, hairSheen, tone } from './looks'
import { Rng, mix32 } from '~/core/rng'

/** hairline height (normalised Y) round the head; |θ| from 0 (front) to π (nape) */
function hairlineFn(ctx: BuildCtx, hs: HeadShape): (th: number) => number {
  const { d } = ctx
  const m = smooth(0, 15, d.age)
  const recede = d.female ? 0 : smooth(45, 70, d.age) * 0.12
  const p = profile([
    [0, lerp(0.38, 0.5, m) + recede],
    [0.5, lerp(0.34, 0.4, m) + recede * 1.4],
    [1.0, hs.earYn + lerp(0.38, 0.4, m)],
    [1.45, hs.earYn + 0.24],
    [1.85, hs.earYn + 0.06],
    [2.3, hs.earYn - 0.18],
    [Math.PI, lerp(-0.42, -0.5, m)],
  ])
  return (th: number) => {
    const a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)))
    return p(a)
  }
}

type ShellOpts = {
  /** thickness in units of ry at the crown */
  vol: number
  /** extra volume on top vs. the sides */
  top?: number
  /** coil texture amplitude (units of ry) and frequency (per metre) */
  amp: number
  freq: number
  color: Color
  /** extra rise at the crown (an updo) */
  crown?: number
  /** pushes the mass back (updo/bun) */
  back?: number
}

/** a hair shell over the skull above the hairline; returns a function mapping (θ, Y) to its outer surface */
function shell(ctx: BuildCtx, hs: HeadShape, o: ShellOpts): (th: number, Y: number, out: Vector3) => Vector3 {
  const { d } = ctx
  const ry = d.ry
  const line = hairlineFn(ctx, hs)
  const seed = ctx.look.seed & 0xffff
  const P = new Vector3()
  const surf = (th: number, Y: number, out: Vector3): Vector3 => {
    hs.point(th, Y, P)
    const h = line(th)
    const grow = smooth(h - 0.02, h + 0.16, Y)
    const topK = 1 + (o.top ?? 0.3) * smooth(0, 0.9, Y)
    let t = o.vol * ry * grow * topK
    t += (o.crown ?? 0) * ry * smooth(0.55, 1, Y) * grow
    const n = fbm3(P.x * o.freq, P.y * o.freq, P.z * o.freq, seed)
    t += (n - 0.5) * 2 * o.amp * ry * grow
    const len = P.length() || 1
    out.copy(P).multiplyScalar(1 + (t + ry * 0.006) / len)
    out.z -= (o.back ?? 0) * ry * smooth(0.3, 1, Y) * grow
    return out
  }
  const segs = 60
  const rings = 26
  const c = new Color()
  const dark = tone(o.color, 0.55)
  const light = hairSheen(o.color, 1.2)
  ctx.gear.at(hs.centre, rigid(B.head)).grid(
    segs,
    rings,
    (u, v, out: GridPoint) => {
      const th = 2 * Math.PI * u
      const h = line(th)
      const Y = lerp(h - 0.015, 1, 1 - (1 - v) ** 1.4)
      surf(th, Y, P)
      out.x = P.x
      out.y = P.y
      out.z = P.z
      const n = fbm3(P.x * o.freq * 1.7, P.y * o.freq * 1.7, P.z * o.freq * 1.7, seed ^ 0x55)
      c.copy(o.color).lerp(n > 0.5 ? light : dark, Math.abs(n - 0.5) * 1.6)
      out.c.copy(c)
    },
    { wrapU: true },
  )
  return surf
}

/** small coiled clumps over a shell, for a broken, living silhouette */
function bobbles(ctx: BuildCtx, hs: HeadShape, surf: (th: number, Y: number, out: Vector3) => Vector3, count: number, size: number, color: Color, minY: number): void {
  const { d } = ctx
  const ry = d.ry
  const rng = ctx.rng.fork(0xb0bb)
  const line = hairlineFn(ctx, hs)
  const P = new Vector3()
  for (let i = 0; i < count; i++) {
    const th = rng.range(0, Math.PI * 2)
    const h = line(th)
    const Y = lerp(Math.max(h + 0.1, minY), 0.98, Math.sqrt(rng.next()))
    surf(th, Y, P)
    const r = ry * size * rng.range(0.7, 1.25)
    const len = P.length() || 1
    P.multiplyScalar(1 - (r * 0.45) / len)
    const k = rng.range(0.82, 1.15)
    const col = hairSheen(color, k - 0.8)
    const dark = tone(col, 0.6)
    ctx.gear.at(mul(hs.centre, T(P.x, P.y, P.z)), rigid(B.head)).ellipsoid(r, r * 0.9, r, (_y, _t, v) => (v.y < -r * 0.2 ? dark : col), 7, 5)
  }
}

export function buildHair(ctx: BuildCtx, hs: HeadShape): void {
  const { d, look } = ctx
  const ry = d.ry
  const hairC = ctx.hairC
  const rng = ctx.rng.fork(0x4a12)
  const infant = d.age < 2
  const babyK = infant ? 0.45 + 0.55 * smooth(0, 2, d.age) : 1

  switch (look.hair) {
    case 'shaved': {
      shell(ctx, hs, { vol: 0.004, top: 0, amp: 0.002, freq: 300, color: hairC.clone().lerp(ctx.skinC, 0.55) })
      break
    }
    case 'cropped': {
      const surf = shell(ctx, hs, { vol: 0.035 * babyK, top: 0.2, amp: 0.01, freq: 160, color: hairC })
      if (!infant) bobbles(ctx, hs, surf, 60, 0.045, hairC, -0.6)
      break
    }
    case 'coils': {
      const vol = (0.1 + rng.range(0, 0.12) + (d.female ? 0.04 : 0)) * babyK * lerp(0.6, 1, smooth(1, 8, d.age))
      const surf = shell(ctx, hs, { vol, top: 0.45, amp: 0.035, freq: 70, color: hairC })
      bobbles(ctx, hs, surf, infant ? 36 : 120, infant ? 0.06 : 0.08, hairC, -0.7)
      break
    }
    case 'knots': {
      const surf = shell(ctx, hs, { vol: 0.03 * babyK, top: 0.1, amp: 0.01, freq: 150, color: hairC })
      // knots in rows over the crown and back
      const P = new Vector3()
      const rows = [
        { Y: 0.55, n: 5, sp: 0.75 },
        { Y: 0.82, n: 3, sp: 0.6 },
        { Y: 0.2, n: 4, sp: 0.55, back: true },
      ]
      for (const row of rows) {
        for (let i = 0; i < row.n; i++) {
          const th = row.back ? Math.PI + (i - (row.n - 1) / 2) * row.sp : (i - (row.n - 1) / 2) * row.sp + (row.Y > 0.7 ? Math.PI * 0.12 : 0)
          surf(th, row.Y, P)
          const r = ry * 0.13 * babyK * rng.range(0.85, 1.1)
          const len = P.length() || 1
          P.multiplyScalar(1 + (r * 0.35) / len)
          const col = hairC.clone().multiplyScalar(rng.range(0.85, 1.12))
          const seed = ctx.look.seed
          ctx.gear.at(mul(hs.centre, T(P.x, P.y, P.z)), rigid(B.head)).ellipsoid(r, r * 0.95, r, (_y, _t, v) => col.clone().multiplyScalar(0.7 + 0.55 * fbm3(v.x * 300, v.y * 300, v.z * 300, seed)), 10, 8)
        }
      }
      break
    }
    case 'locs': {
      const up = d.female && d.age >= 16
      const surf = shell(ctx, hs, { vol: up ? 0.045 : 0.05, top: up ? 0.15 : 0.1, amp: 0.012, freq: 120, color: hairC, crown: up ? 0.08 : 0, back: up ? 0.04 : 0 })
      locs(ctx, hs, surf, up)
      break
    }
  }

  if (ctx.has('beads-hair')) hairBeads(ctx, hs, look.hair === 'locs')
  buildBeard(ctx, hs)
}

function locs(ctx: BuildCtx, hs: HeadShape, surf: (th: number, Y: number, out: Vector3) => Vector3, up: boolean): void {
  const { d } = ctx
  const ry = d.ry
  const rng = ctx.rng.fork(0x10c5)
  const P = new Vector3()
  const lr = ry * 0.075 * lerp(0.7, 1, smooth(4, 16, d.age))
  const hairC = ctx.hairC
  const dark = tone(hairC, 0.6)
  const light = hairSheen(hairC, 1.1)
  const twist = (t: number, a: number): Color => (Math.sin(a * 2 + t * 40) > 0.3 ? light : Math.sin(a * 2 + t * 40) < -0.5 ? dark : hairC)
  if (!up) {
    // hanging locs from the back and sides
    const n = Math.round(lerp(14, 26, smooth(4, 16, d.age)))
    const len = d.stature * rng.range(0.1, 0.17) * lerp(0.6, 1, smooth(4, 14, d.age))
    for (let i = 0; i < n; i++) {
      const a = lerp(0.85, Math.PI * 2 - 0.85, (i + 0.5) / n) + rng.range(-0.06, 0.06)
      const Y = lerp(0.1, 0.45, rng.next())
      surf(a, Y, P)
      const root = P.clone()
      const outward = new Vector3(root.x, 0, root.z).normalize()
      const pts: Vector3[] = []
      const L = len * rng.range(0.8, 1.15)
      for (let k = 0; k < 7; k++) {
        const t = k / 6
        pts.push(root.clone().addScaledVector(outward, lr * 1.2 * Math.sin(t * Math.PI * 0.6) + t * L * 0.12).add(new Vector3(0, -t * L, 0)).applyMatrix4(hs.centre))
      }
      ctx.gear.at(new Matrix4(), rigid(B.head)).tube(pts, (t) => lr * (1 - 0.25 * t), twist, 6)
    }
    return
  }
  // gathered up: locs rise from the hairline to a crown bun, wound into loops
  const crownP = new Vector3()
  surf(Math.PI * 0.85, 0.92, crownP)
  crownP.y += ry * 0.12
  crownP.z -= ry * 0.06
  const line = hairlineFn(ctx, hs)
  const n = 22
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    surf(a, Math.max(line(a) + 0.06, -0.3), P)
    const root = P.clone().multiplyScalar(1 - (lr * 0.7) / (P.length() || 1))
    const pts: Vector3[] = []
    const r0 = root.length()
    const r1 = crownP.length()
    const d0 = root.clone().normalize()
    const d1 = crownP.clone().normalize()
    for (let k = 0; k < 8; k++) {
      const t = k / 7
      // over the surface of the mass (directions blended, radius eased), not along a chord through the skull
      const q = new Vector3().lerpVectors(d0, d1, t).normalize()
      q.multiplyScalar(lerp(r0, r1, t) + lr * 0.9 * Math.sin(t * Math.PI))
      pts.push(q.applyMatrix4(hs.centre))
    }
    ctx.gear.at(new Matrix4(), rigid(B.head)).tube(pts, () => lr * 0.85, twist, 6)
  }
  // the bun: loops of locs
  const bunR = ry * 0.32
  for (let k = 0; k < 7; k++) {
    const pts: Vector3[] = []
    const tilt = rng.range(-0.6, 0.6)
    const spin = (k / 7) * Math.PI * 2
    for (let i = 0; i <= 12; i++) {
      const t = (i / 12) * Math.PI * 1.6
      const lp = new Vector3(Math.cos(t) * bunR * 0.55, Math.sin(t) * bunR * 0.45 + bunR * 0.3, 0)
      lp.applyAxisAngle(new Vector3(1, 0, 0), tilt).applyAxisAngle(new Vector3(0, 1, 0), spin)
      pts.push(lp.add(crownP).applyMatrix4(hs.centre))
    }
    ctx.gear.at(new Matrix4(), rigid(B.head)).tube(pts, () => lr, twist, 6)
  }
  ctx.gear.at(mul(hs.centre, T(crownP.x, crownP.y + bunR * 0.3, crownP.z)), rigid(B.head)).ellipsoid(bunR * 0.5, bunR * 0.45, bunR * 0.5, hairC, 12, 8)
}

/** shell beads in the hair: a forehead band for girls with hanging locs, else scattered in the mass */
function hairBeads(ctx: BuildCtx, hs: HeadShape, locsStyle: boolean): void {
  const { d } = ctx
  const ry = d.ry
  const rng = ctx.rng.fork(0xbead)
  const line = hairlineFn(ctx, hs)
  const P = new Vector3()
  const br = ry * 0.06
  const bead = (m: Matrix4): void => {
    const c = BONE_WHITE.clone().multiplyScalar(rng.range(0.85, 1.05))
    const slot = tone(c, 0.55)
    ctx.gear.at(m, rigid(B.head)).ellipsoid(br * 0.75, br * 0.55, br, (_y, _t, v) => (v.z > br * 0.7 && Math.abs(v.x) < br * 0.15 ? slot : c), 8, 6)
  }
  if (d.age < 14 || !locsStyle) {
    // a band of beads along the hairline
    const n = Math.round(lerp(12, 18, smooth(4, 16, d.age)))
    for (let i = 0; i < n; i++) {
      const th = lerp(-1.55, 1.55, i / (n - 1))
      const Y = line(th) + 0.02
      hs.point(th, Y, P)
      const len = P.length() || 1
      P.multiplyScalar(1 + (ry * 0.05) / len)
      bead(mul(hs.centre, T(P.x, P.y, P.z), new Matrix4().makeRotationY(th)))
    }
    return
  }
  for (let i = 0; i < 14; i++) {
    const th = rng.range(0, Math.PI * 2)
    const Y = rng.range(0.4, 0.95)
    hs.point(th, Y, P)
    const len = P.length() || 1
    P.multiplyScalar(1 + (ry * 0.11) / len)
    bead(mul(hs.centre, T(P.x, P.y, P.z), new Matrix4().makeRotationY(th)))
  }
}

function buildBeard(ctx: BuildCtx, hs: HeadShape): void {
  const { d, look } = ctx
  if (d.female || d.puberty < 0.85) return
  const rng = new Rng(mix32(look.seed, 0xbea7d))
  const roll = rng.next()
  const style = d.age >= 50 ? 'full' : d.age < 22 ? 'none' : roll < 0.2 ? 'none' : roll < 0.7 ? 'short' : 'full'
  if (style === 'none') return
  const ry = d.ry
  const full = style === 'full'
  const color = full ? ctx.hairC : ctx.hairC.clone().lerp(ctx.skinC, 0.35)
  const dark = tone(color, 0.6)
  const light = hairSheen(color, 1)
  const thick = full ? ry * rng.range(0.07, 0.12) : ry * 0.025
  const { mouthYn, noseBaseYn, earYn } = hs
  const topAt = profile([
    [0, mouthYn - 0.13],
    [0.3, mouthYn - 0.11],
    [0.5, mouthYn + 0.01],
    [0.9, noseBaseYn - 0.04],
    [1.35, earYn],
  ])
  const fade = tone(ctx.skinC, 0.82)
  const P = new Vector3()
  const seed = look.seed & 0xffff
  const beardSkin = (x: number, y: number, z: number) => blend2(B.head, B.jaw, hs.jawWeight(x / ry, (y - d.headCy) / ry, (z - d.headZ) / ry, 'auto'))
  ctx.gear.at(hs.centre, beardSkin).grid(36, 14, (u, v, out) => {
    const th = lerp(-1.38, 1.38, u)
    const top = topAt(Math.abs(th))
    const Y = lerp(-1.02, top, v)
    hs.point(th, Y, P)
    const edge = smooth(0, 0.25, v) * smooth(1, 0.8, v) * smooth(1.38, 1.15, Math.abs(th))
    const chinK = 1 + (full ? 0.8 : 0.2) * bump((th / 0.5) ** 2) * smooth(-0.6, -1, Y)
    const n = fbm3(P.x * 140, P.y * 140, P.z * 140, seed)
    const t = (thick * chinK + (n - 0.5) * thick * 0.5) * Math.max(0.15, edge) + ry * 0.004
    const len = P.length() || 1
    P.multiplyScalar(1 + t / len)
    // the beard hangs: lower points drop a little
    if (Y < -0.85) P.y -= thick * 0.6 * smooth(-0.85, -1.02, Y) * bump((th / 0.9) ** 2)
    out.x = P.x
    out.y = P.y
    out.z = P.z
    out.c.copy(color).lerp(n > 0.5 ? light : dark, Math.abs(n - 0.5) * 1.4)
    // the edges thin out into the skin rather than stopping at a line
    out.c.lerp(fade, 1 - smooth(0, 0.3, v) * smooth(1, 0.62, v) * smooth(1.38, 1.05, Math.abs(th)))
  })
  // moustache: a curved band above the upper lip
  const pts: Vector3[] = []
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const X = lerp(-0.25, 0.25, t)
    const Y = mouthYn + 0.085 - 0.06 * (2 * t - 1) ** 2
    const z = hs.frontZ(X * ry, Y) + ry * (0.015 + 0.05 * (1 - (2 * t - 1) ** 2))
    pts.push(new Vector3(X * ry, Y * ry, z).applyMatrix4(hs.centre))
  }
  ctx.gear.at(new Matrix4(), rigid(B.head)).tube(pts, (t) => ry * (full ? 0.04 : 0.022) * (0.6 + 0.4 * Math.sin(Math.PI * t)), color, 8, { flatten: 0.6, roll: Math.PI / 2 })
  void clamp
}
