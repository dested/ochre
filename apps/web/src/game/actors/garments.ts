/**
 * Hide clothing: wrap dresses, chest bands, aprons, karosses (a back cape, or a drape over one shoulder). Each
 * is a grid offset from the body's envelope with soft folds, ragged edges and mottled hide colour. Skirts and
 * flaps blend toward the thighs so they follow the legs; capes hang off the chest with a lagging "cape" bone.
 */
import { Color, Matrix4, Vector3 } from 'three'
import type { BuildCtx } from './ctx'
import type { TorsoShape } from './figure'
import { B } from './rig'
import { bump, clamp, fbm3, lerp, noise3, smax, smooth, type GridPoint, type SkinFn, type SkinW } from './geo'
import { CORD, OCHRE, hideColor, tone } from './looks'

type Plan = {
  wrap: boolean
  chestBand: boolean
  apron: boolean
  cape: boolean
  /** a hide drape over one shoulder: +1 the left, −1 the right, 0 none */
  diagonal: 0 | 1 | -1
  /** a wrap skirt of soft hide over the hips: 'full' all round, 'side' an overskirt round one hip */
  skirt: 'none' | 'full' | 'side'
  /** a small hide pouch on the belt */
  pouch: boolean
}

/** what a person wears, from the garment field plus the modesty rules (adolescents and adults always covered) */
export function garmentPlan(ctx: BuildCtx): Plan {
  const { look, d } = ctx
  const g = look.garment
  const adultF = d.female && d.age >= 10.5
  const plan: Plan = { wrap: false, chestBand: false, apron: false, cape: false, diagonal: 0, skirt: 'none', pouch: false }
  if (d.age < 2.5) return plan
  const rng = ctx.rng.fork(0x9a7)
  switch (g) {
    case 'none':
      plan.apron = true
      break
    case 'apron':
      plan.apron = true
      break
    case 'wrap':
      plan.wrap = true
      break
    case 'kaross':
    case 'kaross-apron': {
      if (d.female) plan.wrap = g === 'kaross' || rng.chance(0.5)
      if (!plan.wrap) plan.apron = true
      // women and old men wear the full back cape; men and youths the one-shoulder drape
      if (d.female || d.age >= 45) plan.cape = true
      else plan.diagonal = 1
      break
    }
  }
  if (adultF && plan.apron && !plan.wrap) plan.chestBand = true
  // layers: grown women add an overskirt round one hip and, without a back cape, a drape over the right shoulder
  // (over the wrap's strap, which is on the right too, so the left stays bare for the arms carry); grown men trade the
  // apron for a wrap skirt; every adult carries a pouch
  if (d.age >= 14) {
    if (d.female && plan.wrap) {
      plan.skirt = 'side'
      if (!plan.cape) plan.diagonal = -1
    }
    if (!d.female && plan.apron) {
      plan.apron = false
      plan.skirt = 'full'
    }
    plan.pouch = rng.chance(0.85)
  }
  return plan
}

/* ─── shared helpers ───────────────────────────────────────────────────────────────────────────────────── */

const tmpC = new Color()

const BROWNING = new Color(0.6, 0.47, 0.36)
const CREAM = new Color('#d8b47e')

/** mottled hide: from cream patches through the base suede to warm brown blotches, finer grain, worn darker edges */
function hide(base: Color, p: Vector3, edge: number, seed: number, out: Color): Color {
  const n = fbm3(p.x * 8, p.y * 8, p.z * 8, seed)
  const n2 = fbm3(p.x * 17, p.y * 17, p.z * 17, seed ^ 0x51)
  const fine = noise3(p.x * 45, p.y * 45, p.z * 45, seed ^ 0x77)
  out.copy(base)
  out.lerp(tmpC.copy(base).multiply(BROWNING), smooth(0.46, 0.62, n) * 0.9)
  out.lerp(tmpC.copy(CREAM).lerp(base, 0.3), smooth(0.37, 0.22, n) * 0.75)
  out.multiplyScalar(0.8 + 0.34 * n2 + 0.12 * (fine - 0.5))
  if (edge > 0) out.lerp(tmpC.copy(base).multiply(BROWNING).multiplyScalar(0.8), edge * 0.7)
  return out
}

/** a fur pelt: brown and cream patches */
function fur(p: Vector3, seed: number, out: Color): Color {
  const n = fbm3(p.x * 7, p.y * 5, p.z * 7, seed)
  const fine = noise3(p.x * 60, p.y * 60, p.z * 60, seed ^ 0x33)
  const dark = new Color('#4b3424')
  const mid = new Color('#8a6644')
  const cream = new Color('#cdb48a')
  if (n < 0.36) out.copy(dark)
  else if (n < 0.5) out.lerpColors(dark, mid, (n - 0.36) / 0.14)
  else out.lerpColors(mid, cream, smooth(0.5, 0.64, n))
  return out.multiplyScalar(0.85 + 0.3 * fine)
}

/** ragged edge offset in metres: noise plus pointed tabs */
function ragged(u: number, seed: number, amp: number): number {
  const n = noise3(u * 7.3, 0.5, 0.5, seed) - 0.5
  const tabs = Math.abs(Math.sin(u * 23 + noise3(u * 3, 1.5, 0.5, seed) * 4)) ** 3
  return amp * (n * 1.2 + tabs * 0.8)
}

/** skirt skinning: torso above the hips, then hips blended into the thighs by side */
function skirtSkin(ctx: BuildCtx, ts: TorsoShape, hemY: number, k = 0.8): SkinFn {
  const { d } = ctx
  return (x, y, z): SkinW => {
    if (y > d.hipY) return ts.skin(x, y, z)
    const g = smooth(d.hipY, Math.min(hemY, d.hipY - d.thigh * 0.4), y) * k
    const th = Math.atan2(x, z)
    const wl = clamp(0.5 + 0.5 * Math.sin(th), 0, 1)
    return { b: [B.hips, B.thighL, B.thighR], w: [1 - g, g * wl, g * (1 - wl)] }
  }
}

/** a body-space radius for a skirt below the hips: hips and thighs hulled, flaring toward the hem */
function skirtRadius(ctx: BuildCtx, ts: TorsoShape, th: number, y: number, hemY: number, flare: number): number {
  const { d } = ctx
  const atHip = ts.radius(th, d.hipY)
  const t = clamp((d.hipY - y) / Math.max(0.01, d.hipY - hemY), 0, 1)
  const legHull = d.hipX * Math.abs(Math.sin(th)) + d.legR * lerp(1, 0.85, t)
  const r = Math.max(atHip, legHull * 1.06)
  return r * (1 + flare * t ** 1.3)
}

/* ─── garments ─────────────────────────────────────────────────────────────────────────────────────────── */

export function buildGarments(ctx: BuildCtx, ts: TorsoShape): void {
  const plan = garmentPlan(ctx)
  if (plan.wrap) buildWrap(ctx, ts)
  if (plan.chestBand) buildChestBand(ctx, ts)
  if (plan.apron) buildApron(ctx, ts)
  if (plan.skirt !== 'none') buildSkirt(ctx, ts, plan.skirt)
  if (plan.cape) buildCape(ctx, ts)
  if (plan.diagonal !== 0) buildDiagonal(ctx, ts, plan.diagonal)
  if (plan.pouch) buildPouch(ctx, ts, plan)
}

/**
 * A wrap skirt of soft hide from the belt: 'full' goes all round with an overlap at the front, 'side' is an
 * overskirt round one hip, open on the other, so the layers under it show. Its hem runs on a long diagonal, ragged
 * and tabbed, and it hangs in uneven folds.
 */
function buildSkirt(ctx: BuildCtx, ts: TorsoShape, kind: 'full' | 'side'): void {
  const { d, look } = ctx
  const H = d.stature
  const seed = (look.seed ^ 0x5c17) & 0xffff
  const rng = ctx.rng.fork(0x5c17)
  // contrast with what is under it: a side overskirt goes pale over a darker wrap
  const base = kind === 'side' ? hideColor(look.seed, 7).lerp(CREAM, 0.2) : hideColor(look.seed, 8).multiply(new Color(0.85, 0.78, 0.7))
  const kneeY = d.hipY - d.thigh
  const side = rng.chance(0.5) ? 1 : -1
  const hemHi = kind === 'side' ? kneeY + d.thigh * rng.range(0.35, 0.5) : kneeY + d.thigh * rng.range(0.32, 0.45)
  const hemLo = kind === 'side' ? kneeY - d.shin * rng.range(0.05, 0.2) : kneeY + d.thigh * rng.range(0.05, 0.16)
  const topY = kind === 'side' ? d.beltY - 0.01 * H : d.beltY + 0.004 * H
  const off = (kind === 'side' ? 0.022 : 0.009) * (H / 1.6)
  const centre = kind === 'side' ? side * Math.PI * 0.55 : 0
  const half = kind === 'side' ? Math.PI * rng.range(0.55, 0.68) : Math.PI * 1.06
  const P = new Vector3()
  ctx.gear.at(new Matrix4(), skirtSkin(ctx, ts, hemLo, 0.85)).grid(kind === 'full' ? 60 : 40, 18, (u, v, out) => {
    const th = centre + (u * 2 - 1) * half
    // the long diagonal: low on one side, high on the other, plus ragged tabs
    const k = 0.5 + 0.5 * Math.sin(th * side - 0.4)
    const hem = lerp(hemHi, hemLo, k) - ragged(u * (half / Math.PI), seed, 0.045 * H)
    const y = lerp(topY, hem, v ** 0.95)
    // a side overskirt is tied snug at the belt and stands off the wrap under it only lower down
    const t = smooth(topY, hem, y)
    const o = kind === 'side' ? lerp(0.011 * (H / 1.6), off, smooth(0, 0.25, t)) : off
    let r = y > d.hipY ? ts.radius(th, y) + o : skirtRadius(ctx, ts, th, y, hem, kind === 'full' ? 0.3 : 0.38) + o
    // uneven folds that deepen toward the hem; a full skirt's overlap stands a little proud at the front
    r *= 1 + (0.035 + 0.07 * t) * Math.sin(th * 7 + noise3(th * 1.3, 0.5, 2.5, seed) * 6) * t
    if (kind === 'full') r += 0.006 * H * smooth(0.82, 1, u)
    P.set(r * Math.sin(th), y, r * Math.cos(th))
    out.x = P.x
    out.y = P.y
    out.z = P.z
    const edge = Math.max(smooth(0.88, 1, v), kind === 'side' ? smooth(0.9, 1, Math.abs(u * 2 - 1)) : 0)
    hide(base, P, edge, seed, out.c)
    // a fold's inner valley takes a little shade
    out.c.multiplyScalar(0.92 + 0.08 * Math.sin(th * 7 + noise3(th * 1.3, 0.5, 2.5, seed) * 6))
  })
  cordRing(ctx, ts, topY - 0.004 * H, (kind === 'side' ? 0.011 * (H / 1.6) : off) + 0.003 * H, rigid3(ts, topY))
}

/** a small soft pouch hanging from the belt on one hip, tied with a cord */
function buildPouch(ctx: BuildCtx, ts: TorsoShape, plan: Plan): void {
  const { d, look } = ctx
  const H = d.stature
  const seed = (look.seed ^ 0x9c4) & 0xffff
  const rng = ctx.rng.fork(0x9c4)
  const base = hideColor(look.seed, 9).multiply(new Color(0.8, 0.72, 0.62))
  const side = plan.diagonal === -1 ? 1 : rng.chance(0.5) ? 1 : -1
  const th = side * rng.range(1.15, 1.45)
  const beltY = plan.skirt === 'none' ? d.beltY : d.beltY + 0.004 * H
  const ph = 0.07 * H
  const pr = 0.026 * H
  const R = ts.radius(th, beltY) + (plan.skirt === 'side' || plan.wrap ? 0.026 : 0.014) * H + pr * 0.55
  const cx = R * Math.sin(th)
  const cz = R * Math.cos(th)
  const P = new Vector3()
  const skin: SkinFn = () => ({ b: [B.hips, side > 0 ? B.thighL : B.thighR], w: [0.8, 0.2] })
  ctx.gear.at(new Matrix4().makeTranslation(cx, beltY - ph * 0.55, cz).multiply(new Matrix4().makeRotationY(th)), skin).lathe({
    y0: -ph * 0.5,
    y1: ph * 0.5,
    // a teardrop sack: full at the bottom, gathered at the neck, a frilled mouth above the tie
    r: (y) => {
      const t = (y + ph * 0.5) / ph
      const body = Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 0.7 * (1 - 0.25 * t)
      const neck = lerp(1, 0.32, smooth(0.62, 0.8, t)) + 0.35 * smooth(0.82, 1, t)
      return pr * Math.max(0.05, body * neck)
    },
    depth: 0.62,
    segs: ctx.gear.q >= 1 ? 12 : 7,
    rings: ctx.gear.q >= 1 ? 10 : 5,
    color: (y, a, v) => {
      P.set(cx + v.x, beltY + v.y, cz + v.z)
      // the gathered neck and frill darken; soft vertical creases round the sack
      return hide(base, P, smooth(0.6, 1, (y + ph * 0.5) / ph), seed, new Color()).multiplyScalar(0.9 + 0.1 * Math.sin(a * 5))
    },
  })
  // the tie
  const ty = beltY - ph * 0.55 + ph * 0.24
  const pts: Vector3[] = []
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2
    pts.push(new Vector3(cx + Math.cos(a) * pr * 0.36, ty, cz + Math.sin(a) * pr * 0.26))
  }
  ctx.gear.at(new Matrix4(), skin).tube(pts, () => 0.0028 * H, CORD, 5)
  void clamp
}

function buildWrap(ctx: BuildCtx, ts: TorsoShape): void {
  const { d, look } = ctx
  const H = d.stature
  const base = hideColor(look.seed, 1)
  const seed = (look.seed ^ 0x3a9) & 0xffff
  const rng = ctx.rng.fork(0x3a9)
  const kneeY = d.hipY - d.thigh
  const hemBase = kneeY + d.thigh * rng.range(-0.05, 0.22)
  const diag = rng.range(0.03, 0.08) * H * (rng.chance(0.5) ? 1 : -1)
  const topFront = d.chestY + (d.shoulderY - d.chestY) * (d.female && d.age >= 10 ? 0.62 : 0.4)
  const topBack = topFront + (d.shoulderY - d.chestY) * 0.15
  const off = 0.006 * (H / 1.6)
  const P = new Vector3()
  const hemY = (th: number): number => hemBase + diag * Math.sin(th - 0.6) - ragged(th / (Math.PI * 2), seed, 0.035 * H)
  // the top edge runs on a diagonal: high under the strap on the right, low under the left arm (the child lies on that
  // arm in the arms carry and looks up past this side of the chest)
  const span = d.shoulderY - d.chestY
  const lowK = d.female && d.age >= 10 ? 0.12 : 0.3
  const topY = (th: number): number => {
    const s = -Math.sin(th)
    const diagK = s > 0 ? 0.28 * s : lowK * s
    return lerp(topFront, topBack, 0.5 - 0.5 * Math.cos(th)) + span * diagK + ragged(th / (Math.PI * 2) + 3.1, seed, 0.006 * H)
  }
  const vHip = 0.42
  ctx.gear.at(new Matrix4(), skirtSkin(ctx, ts, hemBase, 0.85)).grid(
    56,
    22,
    (u, v, out: GridPoint) => {
      const th = 2 * Math.PI * u
      const y0 = topY(th)
      const y1 = hemY(th)
      let y: number
      let r: number
      if (v <= vHip) {
        y = lerp(y0, d.hipY, v / vHip)
        r = ts.radius(th, y) + off * (1 + 0.6 * d.bust * bump(((y - d.chestY) / (0.04 * H)) ** 2))
        // the cord cinches at the waist
        r -= off * 0.6 * bump(((y - d.waistY) / (0.015 * H)) ** 2)
      } else {
        const t = (v - vHip) / (1 - vHip)
        y = lerp(d.hipY, y1, t)
        r = skirtRadius(ctx, ts, th, y, y1, 0.22) + off
        r *= 1 + 0.06 * t * Math.sin(th * 9 + noise3(th, 2.5, 0.5, seed) * 5)
      }
      const s = Math.sin(th)
      const c = Math.cos(th)
      P.set(r * s, y, r * c)
      out.x = P.x
      out.y = P.y
      out.z = P.z
      const edge = Math.max(smooth(0.9, 1, v), smooth(0.05, 0, v))
      hide(base, P, edge, seed, out.c)
    },
    { wrapU: true },
  )
  // the cord belt
  cordRing(ctx, ts, d.waistY + 0.004 * H, off * 2.2, rigid3(ts, d.waistY))
  // the strap over the right shoulder
  shoulderStrap(ctx, ts, topFront + span * 0.26, topBack + span * 0.26, base, seed, -1)
}

function buildChestBand(ctx: BuildCtx, ts: TorsoShape): void {
  const { d, look } = ctx
  const H = d.stature
  const base = hideColor(look.seed, 2)
  const seed = (look.seed ^ 0x5c1) & 0xffff
  const top = d.chestY + (d.shoulderY - d.chestY) * 0.6
  const bot = d.chestY - (d.shoulderY - d.chestY) * 0.32
  const off = 0.006 * (H / 1.6)
  const P = new Vector3()
  ctx.gear.at(new Matrix4(), ts.skin).grid(
    48,
    7,
    (u, v, out) => {
      const th = 2 * Math.PI * u
      const yb = bot - ragged(u, seed, 0.02 * H)
      const y = lerp(yb, top + (0.5 - 0.5 * Math.cos(th)) * 0.02 * H, v)
      const r = ts.radius(th, y) + off * (1 + 0.6 * d.bust)
      P.set(r * Math.sin(th), y, r * Math.cos(th))
      out.x = P.x
      out.y = P.y
      out.z = P.z
      hide(base, P, smooth(0.15, 0, v), seed, out.c)
    },
    { wrapU: true },
  )
  shoulderStrap(ctx, ts, top, top + (d.shoulderY - d.chestY) * 0.15, base, seed, -1)
}

function buildApron(ctx: BuildCtx, ts: TorsoShape): void {
  const { d, look } = ctx
  const H = d.stature
  const seed = (look.seed ^ 0xa9) & 0xffff
  const rng = ctx.rng.fork(0xa9)
  const front = hideColor(look.seed, 3)
  const back = hideColor(look.seed, 4)
  const off = 0.007 * (H / 1.6)
  const beltY = d.beltY
  const P = new Vector3()
  const child = d.age < 11
  // two flaps: front (narrow, to mid-thigh) and back (wide, longer)
  const flaps = [
    { c: 0, half0: 0.62, half1: 0.5, len: d.thigh * (child ? 0.42 : rng.range(0.4, 0.55)), col: front, k: 0 },
    { c: Math.PI, half0: 1.05, half1: 0.95, len: d.thigh * (child ? 0.5 : rng.range(0.6, 0.8)), col: back, k: 1 },
  ]
  for (const f of flaps) {
    const hem = d.hipY - f.len
    const skin: SkinFn = (_x, y) => {
      const g = smooth(d.hipY, hem, y) * 0.7
      return { b: [B.hips, B.thighL, B.thighR], w: [1 - g, g * 0.5, g * 0.5] }
    }
    ctx.gear.at(new Matrix4(), skin).grid(18, 14, (u, v, out) => {
      const half = lerp(f.half0, f.half1, v)
      const th = f.c + (u * 2 - 1) * half
      const yEnd = hem - ragged(u + f.k * 5, seed, 0.03 * H)
      const y = lerp(beltY, yEnd, v)
      const r =
        y > d.hipY
          ? ts.radius(th, y) + off
          : Math.max(ts.radius(th, d.hipY), d.hipX * Math.abs(Math.sin(th)) + d.legR) * 1.04 + off + (f.k === 0 ? 0.01 : 0.015) * H * smooth(d.hipY, hem, y)
      P.set(r * Math.sin(th), y, r * Math.cos(th))
      out.x = P.x
      out.y = P.y
      out.z = P.z
      const edge = Math.max(smooth(0.85, 1, v), smooth(0.85, 1, Math.abs(u * 2 - 1)))
      hide(f.col, P, edge, seed + f.k * 31, out.c)
    })
  }
  cordRing(ctx, ts, beltY + 0.004 * H, off * 1.6, rigid3(ts, beltY))
}

function buildCape(ctx: BuildCtx, ts: TorsoShape): void {
  const { d, look } = ctx
  const H = d.stature
  const seed = (look.seed ^ 0xca9e) & 0xffff
  const rng = ctx.rng.fork(0xca9e)
  const isFur = !d.female && d.age >= 45
  const base = hideColor(look.seed, 5)
  const off = 0.012 * (H / 1.6)
  const kneeY = d.hipY - d.thigh
  const hemBase = kneeY + d.thigh * rng.range(-0.35, 0.15)
  const sJY = d.shoulderJointY
  const wristY = sJY - d.upperArm - d.foreArm
  const open0 = d.female ? 0.5 : 0.62
  const open1 = d.female ? 1.0 : 1.15
  const P = new Vector3()
  const armSupport = (th: number, y: number): number => {
    if (y > sJY + d.armR || y < wristY - d.wristR) return 0
    const ax = d.shoulderX + (sJY - y) * 0.1
    const ar = lerp(d.armR, d.wristR, clamp((sJY - y) / (d.upperArm + d.foreArm), 0, 1))
    return ax * Math.abs(Math.sin(th)) + ar
  }
  const env = (th: number, y: number): number => Math.max(ts.radius(th, Math.min(y, d.topY - 0.001)), armSupport(th, y))
  const capeSkin: SkinFn = (x, y, z): SkinW => {
    const th = Math.atan2(x, z)
    const wCape = smooth(d.chestY, hemBase, y) * 0.75
    const side = bump(((Math.abs(th) - Math.PI / 2) / 0.6) ** 2)
    const wArm = side * 0.45 * smooth(sJY + d.armR * 1.5, sJY - d.upperArm * 0.3, y) * (1 - smooth(wristY + d.foreArm * 0.3, wristY - 0.05, y))
    const arm = x > 0 ? B.armL : B.armR
    const rest = Math.max(0, 1 - wCape - wArm)
    return { b: [B.chest, B.cape, arm], w: [rest, wCape, wArm] }
  }
  ctx.gear.at(new Matrix4(), capeSkin).grid(40, 26, (u, v, out) => {
    const open = lerp(open0, open1, v)
    const th = open + u * (Math.PI * 2 - 2 * open)
    const hem = hemBase - ragged(u, seed, 0.04 * H) + 0.03 * H * Math.cos(th)
    // over the shoulder (v < 0.18), then down the body
    const vs = 0.18
    let y: number
    let r: number
    if (v < vs) {
      const t = v / vs
      const r0 = d.neckR * 1.25 + off
      const r1 = env(th, d.shoulderY) + off
      const y0 = d.topY + d.neckR * 0.3
      const y1 = d.shoulderY
      r = lerp(r0, r1, Math.sin((t * Math.PI) / 2))
      y = lerp(y0, y1, 1 - Math.cos((t * Math.PI) / 2))
    } else {
      const t = (v - vs) / (1 - vs)
      y = lerp(d.shoulderY, hem, t)
      const below = y < d.hipY ? skirtRadius(ctx, ts, th, y, hem, 0.25) : 0
      r = Math.max(env(th, y), below) + off + 0.05 * H * t * t
      r *= 1 + 0.03 * t * Math.sin(th * 7 + noise3(th, 0.5, 4.5, seed) * 4)
    }
    P.set(r * Math.sin(th), y, r * Math.cos(th))
    out.x = P.x
    out.y = P.y
    out.z = P.z
    const edge = Math.max(smooth(0.9, 1, v), smooth(0.9, 1, Math.abs(u * 2 - 1)))
    if (isFur) fur(P, seed, out.c).lerp(tone(out.c, 0.6), edge * 0.5)
    else hide(base, P, edge, seed, out.c)
  })
  void B.cape
}

function buildDiagonal(ctx: BuildCtx, ts: TorsoShape, sd: 1 | -1): void {
  const { d, look } = ctx
  const H = d.stature
  const seed = (look.seed ^ 0xd1a9) & 0xffff
  // a woman's drape over her wrap goes pale (cream suede), a man's stays the base hide
  const base = d.female ? hideColor(look.seed, 6).lerp(CREAM, 0.22) : hideColor(look.seed, 6)
  const off = 0.011 * (H / 1.6)
  const sJY = d.shoulderJointY
  const TL = d.topY - d.hipY
  const lowY = d.chestY - 0.2 * TL
  const A = (d.topY + lowY) / 2
  const Bv = (d.topY - lowY) / 2
  const band = (d.female ? 0.36 : 0.46) * TL
  const P = new Vector3()
  const upperArm = (th: number, y: number): number => {
    const win = smooth(sJY + d.armR * 1.6, sJY + d.armR * 0.8, y) * smooth(sJY - d.upperArm * 0.62, sJY - d.upperArm * 0.45, y)
    return (d.shoulderX * Math.max(0, sd * Math.sin(th)) + d.armR * 1.05) * win
  }
  const skin: SkinFn = (x, y, z): SkinW => {
    const th = Math.atan2(x, z)
    const w = 0.5 * bump(((th - (sd * Math.PI) / 2) / 0.55) ** 2) * smooth(sJY + d.armR, sJY - d.upperArm * 0.25, y)
    const t = ts.skin(x, y, z)
    return { b: [...t.b, sd > 0 ? B.armL : B.armR], w: [...t.w.map((k) => k * (1 - w)), w] }
  }
  // close up (the held chapter looks past this shoulder) the drape gets the rows to round over it smoothly
  const near = ctx.gear.q >= 1
  ctx.gear.at(new Matrix4(), skin).grid(near ? 96 : 52, near ? 24 : 12, (u, v, out) => {
    const th = 2 * Math.PI * u
    const s = Math.sin(th)
    const top = A + Bv * s * sd + ragged(u + 2, seed, 0.008 * H)
    const bot = top - band * (1 + 0.25 * Math.max(0, -s * sd)) - ragged(u, seed, 0.045 * H)
    const y = lerp(bot, top, v)
    let r = smax(ts.radius(th, Math.min(y, d.topY - 0.001)), upperArm(th, y), 0.02 * H) + off
    // the free lower edge hangs away from the body a little, in soft folds
    r += 0.012 * H * (1 - v) ** 2 * (0.6 + 0.4 * Math.sin(th * 5 + noise3(th, 1.5, 0.5, seed) * 3))
    // over the top of the shoulder the hide rides up toward the neck
    if (y > d.shoulderY - 0.02 * H) r = smax(r, (d.neckR * 1.3 + off) * smooth(d.shoulderY - 0.02 * H, d.shoulderY + 0.01 * H, y), 0.015 * H)
    r *= 1 + 0.02 * Math.sin(th * 6 + v * 2)
    P.set(r * s, y, r * Math.cos(th))
    out.x = P.x
    out.y = P.y
    out.z = P.z
    hide(base, P, Math.max(smooth(0.85, 1, v), smooth(0.15, 0, v)), seed, out.c)
  }, { wrapU: true })
}

/* ─── cords and straps ─────────────────────────────────────────────────────────────────────────────────── */

function rigid3(ts: TorsoShape, y: number): SkinFn {
  const w = ts.skin(0, y, 0)
  return () => w
}

function cordRing(ctx: BuildCtx, ts: TorsoShape, y: number, off: number, skin: SkinFn): void {
  const pts: Vector3[] = []
  const n = 40
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI * 2
    const r = ts.radius(th, y) + off
    pts.push(new Vector3(r * Math.sin(th), y, r * Math.cos(th)))
  }
  const cr = ctx.d.stature * 0.0035
  ctx.gear.at(new Matrix4(), skin).tube(pts, () => cr, (_t, a) => (Math.sin(a * 3) > 0 ? CORD : tone(CORD, 0.75)), 6)
}

function shoulderStrap(ctx: BuildCtx, ts: TorsoShape, yFront: number, yBack: number, base: Color, seed: number, side: 1 | -1): void {
  const { d } = ctx
  const H = d.stature
  const x = side * d.shoulderW * 0.55
  const ax = Math.abs(x)
  // the height where the trapezius slope passes a given |x|: the strap's crest there (the torso narrows toward the neck)
  const crest = (at: number): number => {
    let lo = d.shoulderY
    let hi = d.topY
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2
      if (ts.radius((side * Math.PI) / 2, m) >= at) lo = m
      else hi = m
    }
    return lo
  }
  const yTop = crest(ax)
  // the slope rises toward the neck under the band's inner edge: lift the crest by that much
  const rise = crest(ax - 0.01 * H) - yTop
  // the torso's section in the x = const plane: front surface up to the crest, back surface down from it
  const Q = new Vector3()
  const surf = (y: number, front: boolean): Vector3 => {
    const r = Math.max(ax + 1e-4, ts.radius((side * Math.PI) / 2, y))
    // invert the superellipse x = r·|sin θ|^e (e = 2/2.3) for this x
    const th = Math.asin(Math.min(1, (ax / r) ** 1.15))
    ts.point(side * (front ? th : Math.PI - th), y, Q)
    return new Vector3(x, y, Q.z)
  }
  const raw: Vector3[] = []
  const m = 48
  const yF = Math.min(yFront, yTop - 0.004 * H)
  const yB = Math.min(yBack, yTop - 0.004 * H)
  // squared spacing crowds the samples at the crest, where the section turns fastest
  for (let i = 0; i <= m; i++) raw.push(surf(yTop - (yTop - yF) * (1 - i / m) ** 2, true))
  for (let i = m - 1; i >= 0; i--) raw.push(surf(yTop - (yTop - yB) * (1 - i / m) ** 2, false))
  const cum: number[] = []
  let total = 0
  let prev: Vector3 | null = null
  for (const q of raw) {
    if (prev) total += q.distanceTo(prev)
    cum.push(total)
    prev = q
  }
  // resample evenly by arc length and lift each point off the skin along the section's outward normal (the path runs
  // front → crest → back, so the tangent turned a quarter clockwise in the z-y plane points out)
  const pts: Vector3[] = []
  const n = 16
  let j = 0
  for (let i = 0; i <= n; i++) {
    const at = (i / n) * total
    while (j < raw.length - 2 && (cum[j + 1] ?? total) < at) j++
    const a = raw[j]
    const b = raw[j + 1]
    if (!a || !b) continue
    const ca = cum[j] ?? 0
    const cb = cum[j + 1] ?? total
    const q = a.clone().lerp(b, cb > ca ? Math.min(1, Math.max(0, (at - ca) / (cb - ca))) : 0)
    const tz = b.z - a.z
    const ty = b.y - a.y
    const tl = Math.hypot(tz, ty) || 1
    const ny = -tz / tl
    const lift = 0.0055 * H + rise * Math.max(0, ny)
    q.z += (ty / tl) * lift
    q.y += ny * lift
    pts.push(q)
  }
  // a flat band lying on the shoulder (rolled a quarter turn: the transported frame would stand it on edge), mottled
  // along its length and a touch narrower where it tucks into the wrap
  const P = new Vector3()
  const colorAt = (t: number, a: number): Color => hide(base, P.set(0.3 + t * 0.35, 0.2 + 0.02 * Math.cos(a), 0.1), 0, seed, new Color())
  const near = ctx.gear.q >= 1
  ctx.gear.at(new Matrix4(), ts.skin).tube(pts, (t) => H * 0.015 * (0.8 + 0.2 * Math.sin(Math.PI * t)), colorAt, near ? 12 : 8, { flatten: 0.24, roll: Math.PI / 2 })
  void OCHRE
}
