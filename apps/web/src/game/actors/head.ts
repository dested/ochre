/**
 * The head: a sculpted lathe (skull, brow, sockets, cheekbones, muzzle, jaw, chin) plus separate nose, lips,
 * ears, eyeballs and lids. Everything is measured in units of the head half-height ry from the head centre, then
 * placed in body space. Infant heads are round with a small low face; adult heads have a longer face and a jaw.
 * The eyes are spheres in sockets with skin lids on their own bones, so they blink and look around.
 */
import { Color, Matrix4, Quaternion, Vector3 } from 'three'
import type { BuildCtx } from './ctx'
import { B } from './rig'
import { MeshBuilder, T, Rx, Rz, Ry, blend2, bump, clamp, lerp, mul, profile, rigid, smooth, type GridPoint, type SkinFn } from './geo'
import { IRIS, IRIS_RIM, PUPIL, lipColor, scleraColor, tone } from './looks'

export type HeadShape = {
  /** head-local metres (origin at the head centre), θ 0 = front, Y ∈ [-1, 1] */
  point(th: number, Y: number, out: Vector3): Vector3
  /** the front surface z (head-local metres) at head-local x and normalised Y */
  frontZ(x: number, Y: number): number
  /** a body-space frame on the face at head-local x and normalised Y, +Z along the surface normal */
  onFace(x: number, Y: number, lift: number, roll?: number): Matrix4
  /** body-space translation of the head centre */
  centre: Matrix4
  /** normalised feature heights */
  eyeYn: number
  browYn: number
  noseBaseYn: number
  mouthYn: number
  earYn: number
  /** half-width of the skull side (normalised) at a height, for the ears and hair */
  sideAt(Y: number): number
  /** mouth half-width (normalised) and the mouth line's height at X (the corners lift with the smile) */
  mouthW: number
  mouthLine(X: number): number
  /**
   * jaw weight at a head-local point (normalised): a broad blend over the lower face, but a sharp split along
   * the mouth line between the corners so the lips part. `side` forces which lip a vertex belongs to.
   */
  jawWeight(X: number, Y: number, Z: number, side: 'upper' | 'lower' | 'auto'): number
}

const AZ = new Vector3(0, 0, 1)
const ONE = new Vector3(1, 1, 1)

export function headShape(ctx: BuildCtx): HeadShape {
  const { d } = ctx
  const f = d.face
  const ry = d.ry
  const m = smooth(0, 15, d.age)
  const eyeYn = d.eyeY / ry
  const browYn = eyeYn + lerp(0.12, 0.16, m)
  const noseBaseYn = eyeYn - lerp(0.24, 0.37, m) * f.noseLength
  const mouthYn = eyeYn - lerp(0.42, 0.56, m)
  const earYn = eyeYn - lerp(0.08, 0.16, m)
  const ex = d.eyeX / ry
  const male = d.female ? 0 : d.puberty

  // width, front depth and back depth as multipliers on the unit circle's sqrt(1 − Y²)
  const kW = profile([
    [-1, lerp(0.74, 0.66, m)],
    [-0.6, lerp(0.79, 0.71, m) * (1 + (f.jaw - 1) * 0.5)],
    [-0.2, lerp(0.8, 0.71, m)],
    [0.2, lerp(0.8, 0.72, m)],
    [0.6, lerp(0.8, 0.74, m)],
    [1, lerp(0.76, 0.72, m)],
  ])
  const kF = profile([
    [-1, lerp(0.9, 1.05, m)],
    [-0.6, lerp(0.9, 0.92, m)],
    [-0.25, lerp(0.86, 0.86, m)],
    [0.1, lerp(0.84, 0.8, m)],
    [0.5, lerp(0.86, 0.82, m)],
    [1, lerp(0.8, 0.76, m)],
  ])
  const kB = profile([
    [-1, 0.3],
    [-0.55, lerp(0.7, 0.62, m)],
    [-0.1, lerp(0.95, 0.88, m)],
    [0.4, lerp(0.98, 0.92, m)],
    [1, lerp(0.84, 0.8, m)],
  ])
  const jawP = lerp(2.1, d.female ? 2.45 : 2.75, m)
  const eF = 2 / 2.4
  const eB = 2 / 2.05
  const fw = f.faceWidth

  /** displacement (normalised, outward) from the facial features at (X, Y) on the front */
  const features = (X: number, Y: number, front: number): number => {
    const ax = Math.abs(X)
    let dsp = 0
    // eye sockets
    dsp -= 0.06 * bump(((ax - ex) / 0.19) ** 2 + ((Y - eyeYn - 0.01) / 0.13) ** 2)
    // brow ridge (over the sockets, fading at the temples)
    dsp += (0.03 + 0.025 * male) * f.brow * bump(((Y - browYn - 0.03) / 0.07) ** 2) * smooth(0.62, 0.3, ax)
    // nose root between the eyes
    dsp += 0.035 * f.noseBridge * bump((X / 0.09) ** 2 + ((Y - eyeYn + 0.02) / 0.13) ** 2)
    // cheekbones
    dsp += 0.04 * f.cheekbones * m * bump(((ax - 0.43) / 0.15) ** 2 + ((Y - eyeYn + 0.2) / 0.12) ** 2)
    // baby cheeks
    dsp += (0.04 + 0.08 * d.chub) * bump(((ax - 0.36) / 0.2) ** 2 + ((Y - eyeYn + 0.4) / 0.2) ** 2)
    // muzzle (the lips sit on it)
    dsp += lerp(0.05, 0.075, m) * bump((X / 0.33) ** 2 + ((Y - mouthYn) / 0.22) ** 2)
    // chin
    dsp += lerp(0.02, 0.06, m) * f.chin * bump((X / (0.17 + 0.05 * male)) ** 2 + ((Y + 0.86) / 0.11) ** 2)
    // temples
    dsp -= 0.025 * m * bump(((ax - 0.6) / 0.12) ** 2 + ((Y - 0.32) / 0.16) ** 2)
    return dsp * front
  }

  const point = (th: number, Y: number, out: Vector3): Vector3 => {
    const circ = Math.sqrt(Math.max(0, 1 - Y * Y))
    // below the eyes the width follows a squarer curve: a jaw and a broad chin, not a ball
    const circW = Y < 0 ? Math.max(0, 1 - (-Y) ** jawP) ** (1 / jawP) : circ
    const s = Math.sin(th)
    const c = Math.cos(th)
    const front = c > 0
    const e = front ? eF : eB
    const sx = Math.sign(s) * Math.abs(s) ** e
    const cz = Math.sign(c) * Math.abs(c) ** e
    let w = kW(Y) * circW * fw
    // the jaw converges to the chin at the front (a U, not a box)
    const fr = Math.max(0, c)
    w *= 1 - lerp(0.12, 0.22, m) * smooth(-0.15, -0.95, Y) * fr ** 1.5 * (1.15 - 0.15 * f.jaw)
    const zf = kF(Y) * circ
    const zb = kB(Y) * circ
    let x = w * sx
    let z = (front ? zf : zb) * cz
    // the chin and lower face reach forward beyond the circle
    if (front) z += smooth(-0.5, -0.92, Y) * smooth(-1.02, -0.9, Y) * 0.32 * fr ** 2 * m
    const dsp = features(x, Y, fr ** 1.2)
    const hl = Math.hypot(x, z) || 1
    x += (x / hl) * dsp
    z += (z / hl) * dsp
    return out.set(x * ry, Y * ry, z * ry)
  }

  const tmp = new Vector3()
  const frontZ = (x: number, Y: number): number => {
    // the left half of the front: x grows with θ on [0, π/2]
    const target = Math.abs(x)
    let lo = 0
    let hi = Math.PI / 2
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      point(mid, Y, tmp)
      if (tmp.x < target) lo = mid
      else hi = mid
    }
    point((lo + hi) / 2, Y, tmp)
    return tmp.z
  }

  const centre = T(0, d.headCy, d.headZ)
  const onFace = (x: number, Y: number, lift: number, roll = 0): Matrix4 => {
    const h = ry * 0.01
    const dzdx = (frontZ(x + h, Y) - frontZ(x - h, Y)) / (2 * h)
    const dzdy = (frontZ(x, Y + 0.01) - frontZ(x, Y - 0.01)) / (2 * ry * 0.01)
    const n = new Vector3(-dzdx, -dzdy, 1).normalize()
    const q = new Quaternion().setFromUnitVectors(AZ, n)
    if (roll !== 0) q.multiply(new Quaternion().setFromAxisAngle(AZ, roll))
    const p = new Vector3(x, Y * ry, frontZ(x, Y)).addScaledVector(n, lift)
    return mul(centre, new Matrix4().compose(p, q, ONE))
  }
  const sideAt = (Y: number): number => kW(Y) * Math.sqrt(Math.max(0, 1 - Y * Y)) * fw

  const mouthW = f.mouthWidth * lerp(0.15, 0.2, m)
  const smileK = f.smile * 0.018
  const mouthLine = (X: number): number => mouthYn + smileK * Math.min(1, (X / mouthW) ** 2)
  const jawWeight = (X: number, Y: number, Z: number, side: 'upper' | 'lower' | 'auto'): number => {
    const broad = smooth(mouthYn + 0.02, mouthYn - 0.14, Y) * smooth(-0.35, 0.15, Z)
    const lip = smooth(mouthW * 1.35, mouthW * 0.95, Math.abs(X)) * smooth(0.2, 0.45, Z)
    const sharp = side === 'upper' ? 0 : side === 'lower' ? 1 : Y < mouthLine(X) ? 1 : 0
    return lerp(broad, sharp, lip)
  }

  return { point, frontZ, onFace, centre, eyeYn, browYn, noseBaseYn, mouthYn, earYn, sideAt, mouthW, mouthLine, jawWeight }
}

/** the skull lathe, nose, lips, ears, eyes and lids */
export function buildHead(ctx: BuildCtx, hs: HeadShape): void {
  const { d, skinC } = ctx
  const ry = d.ry
  const f = d.face
  const m = smooth(0, 15, d.age)
  const ex = d.eyeX / ry
  const { eyeYn, mouthYn, noseBaseYn, browYn } = hs

  /* ── the skull ── */
  const warm = skinC.clone().multiply(new Color(1, 0.86, 0.84))
  const deep = tone(skinC, 0.62)
  const lit = skinC.clone().multiply(new Color(1.07, 1.04, 1.0))
  /** the baked skin colour at a face point: socket and under-chin occlusion, warm cheeks, lit forehead and cheekbones */
  const skinAt = (X: number, Y: number, fr: number, out: Color): Color => {
    const ax = Math.abs(X)
    const socket = bump(((ax - ex) / 0.17) ** 2 + ((Y - eyeYn) / 0.12) ** 2) * fr
    const underBrow = bump(((ax - ex) / 0.2) ** 2 + ((Y - eyeYn - 0.09) / 0.05) ** 2) * fr
    const cheek = bump(((ax - 0.38) / 0.18) ** 2 + ((Y - eyeYn + 0.32) / 0.16) ** 2) * fr
    const forehead = bump((X / 0.35) ** 2 + ((Y - browYn - 0.22) / 0.2) ** 2) * fr
    const cheekbone = bump(((ax - 0.42) / 0.12) ** 2 + ((Y - eyeYn + 0.18) / 0.08) ** 2) * fr
    const underChin = smooth(-0.82, -1, Y)
    const nasolabial = bump(((ax - 0.21) / 0.05) ** 2 + ((Y - (noseBaseYn + mouthYn) / 2) / 0.14) ** 2) * fr
    out.copy(skinC)
    out.lerp(warm, cheek * 0.55)
    out.lerp(lit, Math.max(forehead * 0.5, cheekbone * 0.7))
    out.lerp(deep, Math.min(0.8, socket * 0.5 + underBrow * 0.35 + underChin * 0.5 + nasolabial * 0.3))
    return out
  }
  const faceSkin =
    (side: 'upper' | 'lower' | 'auto'): SkinFn =>
    (x, y, z) =>
      blend2(B.head, B.jaw, hs.jawWeight(x / ry, (y - d.headCy) / ry, (z - d.headZ) / ry, side))
  const mw = hs.mouthW
  const segs = 64
  const rings = 48
  const P = new Vector3()
  ctx.skin.at(hs.centre, faceSkin('auto')).grid(
    segs,
    rings,
    (u, v, out: GridPoint) => {
      const th = 2 * Math.PI * u - 0.55 * Math.sin(2 * Math.PI * u)
      const Y = clamp(-Math.cos(Math.PI * v) * 0.45 + (2 * v - 1) * 0.55, -1, 1)
      hs.point(th, Y, P)
      // behind the lips the skull steps back, so an open mouth shows the dark inside, not stretched skin
      const X = P.x / ry
      const fr = Math.max(0, Math.cos(th))
      P.z -= ry * 0.07 * smooth(mw * 1.15, mw * 0.75, Math.abs(X)) * bump(((Y - mouthYn) / 0.05) ** 2) * fr
      out.x = P.x
      out.y = P.y
      out.z = P.z
      skinAt(X, Y, fr, out.c)
    },
    { wrapU: true },
  )

  /* ── neck ── */
  const neckBot = d.topY - d.neckR * 0.6
  const neckTop = d.chinY + ry * 0.45
  const neckSkin: SkinFn = (_x, y) => {
    if (y < d.topY) return blend2(B.chest, B.neck, smooth(neckBot, d.topY, y))
    return blend2(B.neck, B.head, smooth(d.chinY - ry * 0.05, neckTop, y))
  }
  const throat = tone(skinC, 0.9)
  ctx.skin.at(T(0, 0, d.neckZ), neckSkin).lathe({
    y0: neckBot,
    y1: neckTop,
    r: (y) => d.neckR * (1 + 0.35 * smooth(d.topY + d.neckR * 0.4, neckBot, y)),
    depth: 0.95,
    segs: 24,
    rings: 8,
    color: (y, th) => (Math.cos(th) > 0.3 && y > d.topY ? throat : skinC),
    open: true,
  })

  /* ── the face patches: nose, philtrum and lips sculpted as height fields laid over the skull ── */
  buildFace(ctx, hs, skinAt, faceSkin, lit, deep)

  /* ── ears ── */
  const earDeep = tone(skinC, 0.55)
  const earC = tone(skinC, 0.94)
  for (const s of [1, -1] as const) {
    const Y = hs.earYn
    const side = hs.sideAt(Y)
    const eh = ry * lerp(0.22, 0.27, m) * f.earSize
    const ew = eh * 0.6
    const et = ry * 0.05
    const at = mul(hs.centre, T(s * (side * ry + et * 0.2), Y * ry, -ry * 0.08), Ry(s * (Math.PI / 2 - 0.35)))
    ctx.skin.at(at, rigid(B.head)).ellipsoid(ew, eh, et, (_y, _t, v) => (v.z > 0 && v.x * v.x / (ew * ew) + v.y * v.y / (eh * eh) < 0.45 ? earDeep : earC), 16, 12, (v) => {
      // the bowl: the outer face dishes in, the rim stays
      const r2 = (v.x / ew) ** 2 + (v.y / eh) ** 2
      if (v.z > 0) v.z -= et * 1.4 * Math.max(0, 0.75 - r2)
      // lobe narrows and the top leans back
      if (v.y < -eh * 0.4) v.x *= 0.85
    })
  }

  /* ── eyes ── */
  buildEyes(ctx, hs, ex, eyeYn)
}

/** a smooth maximum: max(a, b) with the crease rounded over k */
function smax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.max(a, b) + h * h * k * 0.25
}

/**
 * The nose, philtrum and lips as height fields over the face: one patch above the mouth line (the head) and one
 * below it (the jaw), each lifted a hair off the skull and coloured with the skull's own baked skin so their
 * edges vanish. Heights are normalised to ry; X and Y are head-local, normalised.
 */
function buildFace(
  ctx: BuildCtx,
  hs: HeadShape,
  skinAt: (X: number, Y: number, fr: number, out: Color) => Color,
  faceSkin: (side: 'upper' | 'lower' | 'auto') => SkinFn,
  lit: Color,
  deep: Color,
): void {
  const { d, skinC } = ctx
  const ry = d.ry
  const f = d.face
  const m = smooth(0, 15, d.age)
  const { eyeYn, mouthYn, noseBaseYn: yb } = hs
  const mw = hs.mouthW

  /* nose: a tip bulb, two alae and a bridge ridge, smooth-unioned */
  const nw = f.noseWidth
  const tipY = yb + lerp(0.05, 0.062, m)
  const tipOut = lerp(0.06, 0.115, m) * (0.8 + 0.2 * f.noseLength)
  const rt = lerp(0.075, 0.1, m) * Math.sqrt(nw)
  const alaX = lerp(0.08, 0.125, m) * nw
  const alaY = yb + 0.032
  const raX = lerp(0.062, 0.085, m) * nw
  const raY = lerp(0.05, 0.06, m)
  const alaH = lerp(0.026, 0.046, m)
  const rootY = eyeYn + 0.03
  const rootH = 0.008 + 0.03 * f.noseBridge
  const noseH = (X: number, Y: number): number => {
    const ax = Math.abs(X)
    const dt = (X / rt) ** 2 + ((Y - tipY) / (rt * 0.95)) ** 2
    const hT = dt < 1 ? tipOut * Math.sqrt(1 - dt) : 0
    const da = ((ax - alaX) / raX) ** 2 + ((Y - alaY) / raY) ** 2
    const hA = da < 1 ? alaH * (1 - da) ** 0.8 : 0
    const s = clamp((Y - tipY) / (rootY - tipY), 0, 1)
    const hb = lerp(tipOut * 0.78, rootH, s ** 0.85)
    const wb = lerp(rt * 0.78, 0.06 + 0.02 * nw, s)
    const q = ax / wb
    const hB = Y >= tipY - 0.03 && q < 1 ? hb * Math.cos((q * Math.PI) / 2) ** 1.4 * smooth(rootY + 0.07, rootY - 0.01, Y) : 0
    return smax(smax(hT, hB, 0.025), hA, 0.045)
  }

  /* lips: vermilion borders with a cupid's bow, the lips curling in at the mouth line, a groove under the lower */
  const lf = f.lipFull * lerp(0.75, 1, m)
  const uh = lerp(0.042, 0.062, m) * lf
  const lh = lerp(0.058, 0.085, m) * lf
  const lipOut = lerp(0.04, 0.065, m) * lf
  const upperBorder = (X: number): number => {
    const ax = Math.abs(X)
    const across = Math.max(0, 1 - (ax / mw) ** 2)
    const bow = 0.011 * bump(((ax - 0.042) / 0.032) ** 2) - 0.007 * bump((X / 0.022) ** 2)
    return hs.mouthLine(X) + uh * across ** 0.55 + bow * across
  }
  const lowerBorder = (X: number): number => hs.mouthLine(X) - lh * Math.max(0, 1 - (X / mw) ** 2) ** 0.5
  const lipsH = (X: number, Y: number, lower: boolean): number => {
    const ax = Math.abs(X)
    const across = Math.max(0, 1 - (ax / mw) ** 2)
    const ml = hs.mouthLine(X)
    let h = -0.008 * bump(((ax - mw) / 0.025) ** 2 + ((Y - ml) / 0.03) ** 2)
    if (!lower) {
      const yU = upperBorder(X)
      const t = (Y - ml) / Math.max(0.004, yU - ml)
      if (t <= 1) h += lipOut * across ** 0.6 * (smooth(0, 0.4, t) * (1 - 0.22 * smooth(0.5, 1, t)) - 0.25 * (1 - smooth(0, 0.18, t)))
      else {
        const dy = Y - yU
        h += 0.78 * lipOut * across ** 0.6 * smooth(0.09, 0, dy)
        // the philtrum: two soft columns from the bow up toward the nose
        h += 0.007 * bump(((ax - 0.034) / 0.014) ** 2) * smooth(0, 0.015, dy) * smooth(yb - yU, (yb - yU) * 0.4, dy)
      }
    } else {
      const yL = lowerBorder(X)
      const t = (ml - Y) / Math.max(0.004, ml - yL)
      if (t <= 1) h += 1.12 * lipOut * across ** 0.55 * (smooth(0, 0.35, t) * (1 - 0.18 * smooth(0.6, 1, t)) - 0.25 * (1 - smooth(0, 0.15, t)))
      else {
        const dy = yL - Y
        h += 0.85 * lipOut * across ** 0.55 * smooth(0.05, 0, dy)
        h -= 0.012 * bump(((dy - 0.045) / 0.025) ** 2) * smooth(mw * 1.3, mw * 0.3, ax)
      }
    }
    return h
  }

  const lipC = lipColor(skinC)
  const lipLower = lipC.clone().multiply(new Color(1.12, 1.06, 1.05))
  const lipLit = lipLower.clone().multiplyScalar(1.12)
  const mouthDark = tone(skinC, 0.16).lerp(new Color('#1c0c09'), 0.5)
  const nostril = tone(skinC, 0.16).lerp(new Color('#1c0c09'), 0.35)
  const under = tone(skinC, 0.78)
  const lipW = mw + 0.09
  const noseW0 = alaX + raX + 0.06
  const halfW = (Yt: number): number => {
    if (Yt < yb + 0.04) return lerp(lipW, noseW0, smooth(yb - 0.07, yb - 0.01, Yt))
    return lerp(noseW0, 0.12, smooth(yb + 0.04, rootY + 0.06, Yt))
  }
  const lift = 0.0035
  const e = 0.006

  const patch = (lower: boolean, nu: number, nv: number, y0: number, y1: number): void => {
    ctx.skin.at(hs.centre, faceSkin(lower ? 'lower' : 'upper')).grid(nu, nv, (u, v, out) => {
      const Yt = lerp(y0, y1, v)
      const X = (2 * u - 1) * halfW(Yt)
      // rows next to the mouth line follow its smile curve
      const ml = hs.mouthLine(X)
      const Y = Yt + (ml - mouthYn) * (lower ? smooth(y0, mouthYn, Yt) : smooth(y1, mouthYn, Yt))
      const nh = lower ? 0 : noseH(X, Y)
      const h = nh + lipsH(X, Y, lower)
      out.x = X * ry
      out.y = Y * ry
      out.z = hs.frontZ(X * ry, Y) + (h + lift) * ry
      const c = skinAt(X, Y, 1, out.c)
      const ax = Math.abs(X)
      const xn = ax / mw
      if (!lower && nh > 0.001) {
        const sx = (noseH(X + e, Y) - noseH(X - e, Y)) / (2 * e)
        const sy = (noseH(X, Y + e) - noseH(X, Y - e)) / (2 * e)
        // ridge and tip catch the light; the sides and the underside fall away; the alar crease and nostrils dark
        c.lerp(lit, 0.5 * bump((X / 0.03) ** 2) * smooth(rootY - 0.02, tipY + 0.01, Y) * smooth(tipY - 0.07, tipY - 0.02, Y))
        c.lerp(deep, 0.2 * smooth(0.6, 2.2, Math.abs(sx)))
        c.lerp(under, smooth(0.8, 2.4, sy))
        const da = Math.sqrt(((ax - alaX) / raX) ** 2 + ((Y - alaY) / raY) ** 2)
        c.lerp(deep, 0.45 * bump(((da - 1) / 0.13) ** 2) * smooth(0.02, 0.05, ax))
        const inNostril = ((ax - 0.05 * nw) / (0.03 * nw)) ** 2 + ((Y - (yb + 0.004)) / 0.016) ** 2 < 1
        if (inNostril && sy > 0.9) c.lerp(nostril, 0.6)
      }
      // vermilion
      if (lower) {
        const yL = lowerBorder(X)
        const k = smooth(yL - 0.007, yL + 0.007, Y) * smooth(1.04, 0.9, xn)
        c.lerp(lipLower, k)
        const t = (ml - Y) / Math.max(0.004, ml - yL)
        c.lerp(lipLit, 0.35 * k * bump(((t - 0.42) / 0.22) ** 2) * bump((X / (mw * 0.55)) ** 2))
      } else {
        const yU = upperBorder(X)
        c.lerp(lipC, smooth(yU + 0.007, yU - 0.007, Y) * smooth(1.04, 0.9, xn))
      }
      // the mouth line itself
      c.lerp(mouthDark, 0.9 * smooth(0.013, 0, Math.abs(Y - ml)) * smooth(1.08, 0.8, xn))
    })
  }
  patch(false, 36, 46, mouthYn, rootY + 0.07)
  patch(true, 36, 16, mouthYn - 0.17, mouthYn)

  /* inside the mouth: a dark back wall (top half head, bottom half jaw) and the upper teeth, seen when it opens */
  const zM = hs.frontZ(0, mouthYn)
  ctx.skin
    .at(mul(hs.centre, T(0, mouthYn * ry, zM - ry * 0.035)), (_x, y) => blend2(B.head, B.jaw, y < d.headCy + mouthYn * ry ? 1 : 0))
    .ellipsoid(mw * ry * 0.95, ry * 0.032, ry * 0.022, mouthDark, 16, 8, (v) => {
      v.y += ry * (hs.mouthLine(v.x / ry) - mouthYn)
    })
  ctx.detail.at(mul(hs.centre, T(0, (mouthYn - 0.015) * ry, zM - ry * 0.028)), rigid(B.head)).ellipsoid(mw * ry * 0.6, ry * 0.02, ry * 0.025, new Color('#e0d6c2'), 14, 6)
}

function buildEyes(ctx: BuildCtx, hs: HeadShape, ex: number, eyeYn: number): void {
  const { d, skinC } = ctx
  const ry = d.ry
  const er = d.eyeR
  const sclera = scleraColor(skinC)
  const scleraShade = tone(sclera, 0.72)
  const lidC = tone(skinC, 0.93)
  const lash = new Color('#140d09').lerp(skinC, 0.15)
  const crease = tone(skinC, 0.78)
  const zLocal = d.eyeZ - d.headZ
  // iris and pupil as angular radii from the gaze axis, crisp via lathe seams
  const aIris = 0.56
  const aPupil = 0.23
  const yIris = er * Math.cos(aIris)
  const yIrisRim = er * Math.cos(aIris * 0.86)
  const yPupil = er * Math.cos(aPupil)
  const openUp = 0.36 + d.chub * 0.06
  const openDown = -0.4
  const corner = 0.98

  for (const s of [1, -1] as const) {
    const eyeBone = s > 0 ? B.eyeL : B.eyeR
    const lidBone = s > 0 ? B.lidL : B.lidR
    const centre = mul(hs.centre, T(s * ex * ry, eyeYn * ry, zLocal))
    // eyeball: lathe axis along +Z (gaze)
    ctx.detail.at(mul(centre, Rx(Math.PI / 2)), rigid(eyeBone)).lathe({
      y0: -er,
      y1: er,
      r: (y) => Math.sqrt(Math.max(0, er * er - y * y)),
      segs: 24,
      rings: 18,
      seams: [yIris, yIrisRim, yPupil],
      color: (y) => (y > yPupil ? PUPIL : y > yIrisRim ? IRIS : y > yIris ? IRIS_RIM : y > er * 0.2 ? sclera : scleraShade),
      deform: (v, _th, y) => {
        // the cornea bulges a little over the iris
        if (y > yIris) {
          const k = 1 + 0.06 * smooth(yIris, er, y)
          v.y *= k
        }
      },
    })
    // catchlight: up and toward the viewer's left on both eyes
    {
      const dir = new Vector3(-0.32, 0.36, 1).normalize()
      const p = dir.clone().multiplyScalar(er * 1.04)
      ctx.detail.at(mul(centre, T(p.x, p.y, p.z)), rigid(eyeBone)).ellipsoid(er * 0.15, er * 0.15, er * 0.05, new Color(1.6, 1.55, 1.45), 8, 6)
    }
    // lids: spherical shells round the eye centre. φ across (0 = forward), λ up.
    const tilt = d.face.eyeTilt * s
    const margin = (phi: number, upper: boolean): number => {
      const t = clamp(Math.abs(phi) / corner, 0, 1.6)
      const outer = phi * s > 0 ? 1 : 0
      const tiltAt = tilt * (phi * s) / corner
      if (upper) {
        const arch = openUp * (1 - t * t) * (1 - 0.1 * outer)
        return t >= 1 ? -0.5 * (t - 1) + tiltAt * 0 + 0.02 : arch + tiltAt * 0.6 + 0.02
      }
      const arch = openDown * (1 - t ** 2.4)
      return t >= 1 ? 0.6 * (t - 1) + 0.0 : arch + tiltAt * 0.4
    }
    const lidPoint = (phi: number, lam: number, r: number, out: GridPoint): void => {
      out.x = r * Math.sin(phi) * Math.cos(lam)
      out.y = r * Math.sin(lam)
      out.z = r * Math.cos(phi) * Math.cos(lam)
    }
    // upper lid (on the lid bone: blinks)
    ctx.skin.at(centre, rigid(lidBone)).grid(26, 9, (u, v, out) => {
      const phi = (u * 2 - 1) * 1.75
      const lm = margin(phi, true)
      const lam = lerp(lm, 1.35, v ** 1.3)
      const r = er * (lerp(1.035, 1.2, v ** 0.8) + 0.04 * smooth(0, 0.25, v) * (1 - v))
      lidPoint(phi, lam, r, out)
      out.c.copy(v < 0.13 ? lash : v < 0.5 && v > 0.36 ? crease : lidC)
    })
    // lower lid (fixed)
    ctx.skin.at(centre, rigid(B.head)).grid(26, 7, (u, v, out) => {
      // u runs right to left here so the shell faces out (v runs down)
      const phi = (1 - u * 2) * 1.75
      const lm = margin(phi, false)
      const lam = lerp(lm, -1.0, v ** 1.2)
      const r = er * lerp(1.03, 1.12, v ** 0.8)
      lidPoint(phi, lam, r, out)
      out.c.copy(v < 0.1 ? tone(lash, 1.6).lerp(skinC, 0.4) : v < 0.45 ? tone(skinC, 0.86) : skinC)
    })
  }
  // brows (gear: hair-coloured), tubes laid along the brow ridge
  const browC = tone(ctx.hairC, 0.85).lerp(skinC, 0.3)
  for (const s of [1, -1] as const) {
    const pts: Vector3[] = []
    const n = 9
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const X = s * (ex - 0.13 + t * 0.33)
      const Y = hs.browYn + 0.02 + 0.045 * Math.sin(Math.PI * Math.min(1, t * 1.15)) - 0.03 * t + d.face.eyeTilt * 0.1 * t
      const z = hs.frontZ(X * ry, Y) + ry * 0.012
      pts.push(new Vector3(X * ry, Y * ry, z).applyMatrix4(hs.centre))
    }
    const th = ry * 0.024 * d.face.browThick * lerp(0.6, 1, smooth(0, 12, d.age))
    ctx.gear.at(new Matrix4(), rigid(B.head)).tube(pts, (t) => th * (1 - 0.65 * t * t) * (0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, t + 0.3))), browC, 8, { flatten: 0.42, roll: Math.PI / 2 })
  }
}
