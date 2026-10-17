/**
 * The figure under the clothes: torso, arms with hands, legs with bare feet. Limbs are single lathes skinned
 * across their joints (elbow, knee), so they bend smoothly instead of hinging like a toy. Natural adult
 * proportions; children rounder, elders thinner.
 */
import { Color, Matrix4, Vector3 } from 'three'
import type { BuildCtx } from './ctx'
import { B } from './rig'
import { T, Rx, blend2, bump, clamp, lerp, mul, profile, rigid, smooth, type GridPoint, type SkinFn, type SkinW } from './geo'
import { OCHRE, mixc, tone } from './looks'

export type TorsoShape = {
  /** body-space point on the torso surface at angle θ (0 = front, π/2 = left) and height y */
  point(th: number, y: number, out: Vector3): Vector3
  /** a radial distance from the torso axis in direction θ at height y */
  radius(th: number, y: number): number
  skin: SkinFn
}

const torsoSkinW = (d: BuildCtx['d'], y: number): SkinW => {
  const lo = d.hipY + (d.waistY - d.hipY) * 0.25
  if (y < lo) return { b: [B.hips], w: [1] }
  if (y < d.waistY) return blend2(B.hips, B.spine, smooth(lo, d.waistY, y))
  if (y < d.chestY) return blend2(B.spine, B.chest, smooth(d.waistY, d.chestY, y))
  return { b: [B.chest], w: [1] }
}

export function torsoShape(ctx: BuildCtx): TorsoShape {
  const { d } = ctx
  const core = profile([
    [d.hipY, d.hipW],
    [d.waistY, d.waistW],
    [d.chestY, d.chestW],
    [d.shoulderY, d.shoulderW * 0.97],
  ])
  const crotchSpan = d.hipY - d.crotchY
  const topSpan = d.topY - d.shoulderY
  const neckR0 = d.neckR * 1.05
  const baseR = (y: number): number => {
    if (y <= d.crotchY) return 0
    if (y < d.hipY) return d.hipW * Math.sqrt(Math.max(0, 1 - ((d.hipY - y) / crotchSpan) ** 2))
    if (y <= d.shoulderY) return core(y)
    if (y <= d.topY) {
      // the trapezius: a long slope from the shoulder caps up into the neck, not a flat-topped box
      const s = (y - d.shoulderY) / topSpan
      return neckR0 + (d.shoulderW * 0.97 - neckR0) * (1 - s ** 1.5) * (1 - 0.18 * Math.sin(Math.PI * s))
    }
    return 0
  }
  const H = d.stature
  const e = 2 / 2.3
  const point = (th: number, y: number, out: Vector3): Vector3 => {
    const r = baseR(y)
    const s = Math.sin(th)
    const c = Math.cos(th)
    let x = r * Math.sign(s) * Math.abs(s) ** e
    // depth: the chest is deeper than the waist; the upper back rounds
    const depthK = d.torsoDepthK * (y > d.waistY ? 1 + 0.08 * smooth(d.waistY, d.chestY, y) : 1)
    let z = r * depthK * Math.sign(c) * Math.abs(c) ** e
    const front = Math.max(0, c)
    const back = Math.max(0, -c)
    const ax = Math.abs(x)
    // belly
    z += d.belly * d.waistW * 0.35 * bump(((y - (d.hipY + d.waistY) / 2 - 0.02 * H) / (0.09 * H)) ** 2) * front ** 1.5
    // buttocks
    z -= d.hipDepth * 0.32 * bump(((y - d.hipY + 0.012 * H) / (0.07 * H)) ** 2) * bump(((ax - d.hipW * 0.42) / (d.hipW * 0.45)) ** 2) * back ** 1.2
    // chest: pectorals, or a bust
    const chestBand = bump(((y - (d.chestY + (d.shoulderY - d.chestY) * 0.2)) / (0.045 * H)) ** 2)
    z += (d.female ? d.bust * 0.32 : 0.15 * d.puberty) * d.chestW * chestBand * bump(((ax - d.chestW * 0.42) / (d.chestW * 0.34)) ** 2) * front
    // shoulder blades
    z -= 0.06 * d.chestW * bump(((y - (d.chestY + d.shoulderY) / 2) / (0.05 * H)) ** 2) * bump(((ax - d.chestW * 0.4) / (d.chestW * 0.3)) ** 2) * back
    // spine groove
    z += 0.04 * d.chestW * bump((x / (d.chestW * 0.08)) ** 2) * back * smooth(d.hipY, d.waistY, y)
    // clavicles: a slight ridge at the top front
    z += 0.04 * d.chestW * bump(((y - d.shoulderY - topSpan * 0.25) / (0.012 * H)) ** 2) * front * smooth(neckR0 * 0.9, neckR0 * 1.6, ax)
    // sides narrow a touch at the waist (obliques)
    x *= 1 - 0.03 * bump(((y - d.waistY) / (0.06 * H)) ** 2)
    return out.set(x, y, z)
  }
  const tmp = new Vector3()
  return {
    point,
    radius: (th, y) => {
      point(th, y, tmp)
      return Math.hypot(tmp.x, tmp.z)
    },
    skin: (_x, y) => torsoSkinW(d, y),
  }
}

/** the torso grid with its baked shading */
export function buildTorso(ctx: BuildCtx, ts: TorsoShape): void {
  const { d, skinC } = ctx
  const P = new Vector3()
  const deep = tone(skinC, 0.7)
  const lit = skinC.clone().multiply(new Color(1.05, 1.03, 1))
  const H = d.stature
  ctx.skin.at(new Matrix4(), ts.skin).grid(
    44,
    30,
    (u, v, out: GridPoint) => {
      const th = 2 * Math.PI * u
      // cosine spacing in y: dense near the crotch and neck caps
      const y = lerp(d.crotchY, d.topY, (1 - Math.cos(Math.PI * v)) / 2 * 0.6 + v * 0.4)
      ts.point(th, y, P)
      out.x = P.x
      out.y = P.y
      out.z = P.z
      const front = Math.max(0, Math.cos(th))
      const back = Math.max(0, -Math.cos(th))
      const ax = Math.abs(P.x)
      const navel = bump((P.x / (0.008 * H)) ** 2 + ((y - (d.hipY + d.waistY) / 2 - 0.01 * H) / (0.008 * H)) ** 2) * front
      const groove = bump((P.x / (d.chestW * 0.06)) ** 2) * back * smooth(d.hipY, d.waistY, y)
      const underChest = d.female ? bump(((y - d.chestY + 0.01 * H) / (0.012 * H)) ** 2) * front * d.bust : 0
      // a man's chest: lit pectorals with a shadow under them, the sternum and a faint line down the belly
      const male = d.female ? 0 : d.puberty
      const span = d.shoulderY - d.chestY
      const pecs = bump(((ax - d.chestW * 0.4) / (d.chestW * 0.3)) ** 2) * front * male
      const pecLit = pecs * bump(((y - d.chestY - span * 0.4) / (0.03 * H)) ** 2)
      const underPec = pecs * bump(((y - d.chestY + 0.004 * H) / (0.009 * H)) ** 2)
      const midline = bump((P.x / (d.chestW * 0.045)) ** 2) * front * male * smooth(d.hipY + 0.02 * H, d.waistY, y) * smooth(d.shoulderY, d.chestY, y)
      const crotch = smooth(d.hipY - (d.hipY - d.crotchY) * 0.3, d.crotchY, y)
      const sideLit = bump(((ax - d.chestW * 0.5) / (d.chestW * 0.3)) ** 2) * smooth(d.waistY, d.shoulderY, y) * front
      out.c
        .copy(skinC)
        .lerp(lit, Math.max(sideLit * 0.5, pecLit * 0.45))
        .lerp(deep, Math.min(0.85, navel * 0.8 + groove * 0.35 + underChest * 0.3 + crotch * 0.6 + underPec * 0.4 + midline * 0.22))
    },
    { wrapU: true },
  )
}

/** a skin band list for ochre stripes on a limb: seams make the edges crisp */
type Stripe = { from: number; to: number }

function stripesAt(stripes: readonly Stripe[], y: number): boolean {
  for (const s of stripes) if (y >= s.from && y <= s.to) return true
  return false
}

export function buildArms(ctx: BuildCtx): void {
  const { d, skinC } = ctx
  const ochreC = mixc(skinC, OCHRE, 0.72)
  const bodyOchre = ctx.has('ochre-body')
  const rng = ctx.rng.fork(0xa53)
  const lit = skinC.clone().multiply(new Color(1.04, 1.02, 1))
  const elbowC = tone(skinC, 0.86)
  // how much muscle shapes the arm: a working adult's arms, more for men, little for children
  const muscle = smooth(6, 18, d.age) * (0.65 + 0.35 * d.build + (d.female ? 0 : 0.45 * d.puberty)) * (1 - 0.35 * d.elder)
  for (const s of [1, -1] as const) {
    const L = s > 0
    const sx = s * d.shoulderX
    const sy = d.shoulderJointY
    const ua = d.upperArm
    const fa = d.foreArm
    const top = sy + d.armR * 0.95
    const elbowY = sy - ua
    const wristY = elbowY - fa
    const bot = wristY - d.wristR * 0.4
    const prof = profile([
      [bot, d.wristR * 0.85],
      [wristY, d.wristR],
      [wristY + fa * 0.45, d.foreR * 0.88],
      [wristY + fa * 0.72, d.foreR],
      [elbowY + fa * 0.04, d.elbowR * 1.04],
      [elbowY, d.elbowR],
      [elbowY + ua * 0.18, d.armR * 0.82],
      [elbowY + ua * 0.5, d.armR * 0.9],
      [sy - ua * 0.12, d.armR * 0.98],
      [sy, d.armR],
    ])
    const r = (y: number): number => {
      if (y > sy) return d.armR * Math.sqrt(Math.max(0, 1 - ((y - sy) / (top - sy)) ** 2))
      if (y < bot + d.wristR * 0.3) return prof(y) * Math.sqrt(Math.max(0, 1 - ((bot + d.wristR * 0.3 - y) / (d.wristR * 0.3 + 1e-6)) ** 2))
      return prof(y)
    }
    // ochre: two thin bands on the upper arm, two on the forearm
    const stripes: Stripe[] = []
    if (bodyOchre) {
      const w = d.stature * 0.008
      const a = elbowY + ua * rng.range(0.45, 0.6)
      stripes.push({ from: a, to: a + w }, { from: a + w * 2.2, to: a + w * 3.2 })
      const b = wristY + fa * rng.range(0.5, 0.65)
      stripes.push({ from: b, to: b + w }, { from: b + w * 2.2, to: b + w * 3.2 })
    }
    const seams = stripes.flatMap((st) => [st.from, st.to])
    const armBone = L ? B.armL : B.armR
    const foreBone = L ? B.foreL : B.foreR
    const handBone = L ? B.handL : B.handR
    const armSkin: SkinFn = (_x, y) => {
      if (y > sy - d.armR * 0.6) {
        const tc = smooth(sy - d.armR * 0.6, top, y) * 0.35
        return { b: [armBone, B.chest], w: [1 - tc, tc] }
      }
      if (y < wristY + d.wristR) return blend2(foreBone, handBone, smooth(wristY + d.wristR, wristY - d.wristR * 0.3, y) * 0.5)
      return blend2(armBone, foreBone, smooth(elbowY + d.elbowR * 1.3, elbowY - d.elbowR * 1.3, y))
    }
    ctx.skin.at(T(sx, 0, 0), armSkin).lathe({
      y0: bot,
      y1: top,
      r,
      segs: 18,
      rings: 26,
      seams,
      color: (y, th) => {
        if (stripesAt(stripes, y) && Math.cos(th) > -0.3) return ochreC
        // the elbow point darkens, the outer upper arm catches light
        if (Math.abs(y - elbowY) < d.elbowR * 0.9 && Math.cos(th) < -0.4) return elbowC
        if (y > elbowY + ua * 0.3 && Math.sin(th) * s > 0.4) return lit
        return skinC
      },
      deform: (v, th, y) => {
        // the wrist is wider front-to-back than across (the palm faces in)
        const wk = smooth(wristY + fa * 0.6, wristY, y)
        v.z *= 1 + 0.32 * wk
        v.x *= 1 - 0.12 * wk
        const c = Math.cos(th)
        const out = Math.max(0, Math.sin(th) * s)
        // the deltoid caps the shoulder on the outside, front and back, and tapers into the upper arm
        const delt = bump(((y - (sy - ua * 0.1)) / (ua * 0.24)) ** 2) * (0.35 + 0.65 * out)
        v.x += s * d.armR * 0.3 * muscle * delt * out
        v.z += d.armR * 0.12 * muscle * delt * c
        // biceps at the front, triceps behind, the elbow point at the back
        if (y > elbowY && y < sy) {
          v.z += d.armR * 0.13 * muscle * Math.max(0, c) * bump(((y - (elbowY + ua * 0.42)) / (ua * 0.22)) ** 2)
          v.z += d.armR * 0.1 * muscle * Math.min(0, c) * bump(((y - (elbowY + ua * 0.62)) / (ua * 0.25)) ** 2)
        }
        if (c < 0) v.z += d.elbowR * 0.18 * c * bump(((y - elbowY) / (d.elbowR * 0.8)) ** 2)
        // the forearm swells just below the elbow on the outer-front (brachioradialis) and narrows to the wrist
        const fore = bump(((y - (elbowY - fa * 0.2)) / (fa * 0.2)) ** 2) * Math.max(0, 0.6 * c + 0.8 * Math.sin(th) * s)
        v.x += s * d.foreR * 0.14 * muscle * fore * out
        v.z += d.foreR * 0.1 * muscle * fore * Math.max(0, c)
      },
    })
    buildHand(ctx, s, sx, wristY, handBone, L ? B.fingersL : B.fingersR, L ? B.thumbL : B.thumbR)
    void Rx
  }
}

function buildHand(ctx: BuildCtx, s: 1 | -1, sx: number, wristY: number, handBone: number, fingersBone: number, thumbBone: number): void {
  const { d, skinC } = ctx
  const near = ctx.skin.q >= 1
  const palmC = mixc(skinC, new Color('#c49a7c'), 0.35)
  const knuckle = tone(skinC, 0.86)
  const nail = mixc(skinC, new Color('#d9b49a'), 0.4)
  const hw = d.handW
  const palmH = d.palm
  const thick = hw * 0.24
  /*
   * the palm: a soft slab, palm facing in (−s·X), its broad side along Z, wider at the knuckles than the wrist,
   * the thenar pad swelling toward the thumb and a knuckle ridge across the back
   */
  const palmColor = (_y: number, th: number): Color => (Math.sin(th) * s < -0.3 ? palmC : skinC)
  const y0 = -palmH * 0.56
  const y1 = palmH * 0.56
  ctx.skin.at(T(sx, wristY - palmH * 0.5, 0), rigid(handBone)).lathe({
    y0,
    y1,
    r: (y) => {
      const t = (y - y0) / (y1 - y0)
      const cap = Math.sqrt(Math.max(0, 1 - Math.max(0, (0.22 - t) / 0.22) ** 2)) * Math.sqrt(Math.max(0, 1 - Math.max(0, (t - 0.88) / 0.12) ** 2))
      return thick * lerp(0.82, 1, smooth(0.9, 0.5, t)) * Math.max(0.05, cap)
    },
    depth: (hw * 0.5) / thick,
    sq: 2.15,
    segs: near ? 20 : 12,
    rings: near ? 16 : 8,
    color: palmColor,
    deform: (v, th, y) => {
      const t = (y - y0) / (y1 - y0)
      // knuckles wider than the wrist
      v.z *= lerp(1.02, 0.84, smooth(0.15, 0.95, t))
      const inner = Math.max(0, -Math.sin(th) * s)
      const back = Math.max(0, Math.sin(th) * s)
      // the thenar pad: palm side, toward the thumb (+Z), upper half
      v.x -= s * thick * 0.35 * inner * bump(((t - 0.62) / 0.28) ** 2) * smooth(-0.2, 0.8, v.z / (hw * 0.5))
      // the hollow of the palm, and the knuckle ridge across the back
      v.x += s * thick * 0.18 * inner * bump(((t - 0.45) / 0.2) ** 2) * bump((v.z / (hw * 0.3)) ** 2)
      v.x += s * thick * 0.14 * back * bump(((t - 0.06) / 0.08) ** 2)
      // a knuckle under each finger along that ridge, the grooves between them running a little way up the back
      let kn = 0
      for (let i = 0; i < 4; i++) kn += bump(((v.z - hw * (0.33 - i * 0.22)) / (hw * 0.085)) ** 2)
      v.x += s * thick * 0.16 * back * Math.min(1, kn) * bump(((t - 0.1) / 0.12) ** 2)
    },
  })
  // fingers: four, gently curled, spread a little, each with knuckle, joints and a rounded tip
  const lens = [0.92, 1, 0.95, 0.76]
  const knuckleY = wristY - palmH
  const n = near ? 9 : 5
  for (let i = 0; i < 4; i++) {
    const z0 = hw * (0.33 - i * 0.22)
    const len = d.fingers * (lens[i] ?? 1)
    const fr = hw * (i === 3 ? 0.085 : 0.1)
    const spread = (i - 1.4) * 0.07
    const pts: Vector3[] = []
    for (let k = 0; k < n; k++) {
      // samples pack toward the tip so it rounds off instead of coming to a point
      const t = 1 - (1 - k / (n - 1)) ** 1.5
      // a relaxed curl toward the palm, more at the far joints
      const a = t * t * 0.9
      pts.push(new Vector3(sx - s * Math.sin(a) * len * 0.42 * t, knuckleY + palmH * 0.1 - Math.cos(a * 0.6) * len * t, z0 - spread * len * t))
    }
    const rad = (t: number): number => {
      const joints = 1 + 0.12 * bump(((t - 0.02) / 0.08) ** 2) + 0.07 * bump(((t - 0.47) / 0.07) ** 2) + 0.05 * bump(((t - 0.76) / 0.06) ** 2)
      const tip = Math.sqrt(Math.max(0, 1 - Math.max(0, (t - 0.86) / 0.14) ** 2))
      return fr * (1 - 0.22 * t) * joints * Math.max(0.12, tip)
    }
    ctx.skin.at(new Matrix4(), rigid(fingersBone)).tube(pts, rad, (t) => (t < 0.08 ? knuckle : t > 0.84 ? nail : skinC), near ? 8 : 6, { flatten: 0.88 })
  }
  // thumb: from the thenar pad, out toward the front and down, two joints and a broad tip
  {
    const base = new Vector3(sx - s * thick * 0.35, wristY - palmH * 0.22, hw * 0.3)
    const pts: Vector3[] = []
    const tl = d.fingers * 0.88
    const nt = n + 2
    for (let k = 0; k < nt; k++) {
      const t = 1 - (1 - k / (nt - 1)) ** 1.6
      pts.push(new Vector3(base.x - s * thick * 0.75 * Math.sin(t * 1.4), base.y - tl * t * 0.78, base.z + tl * 0.42 * t - tl * 0.16 * t * t))
    }
    // a broad base off the thenar pad, the knuckle, then a flat, rounded pad and nail
    const rad = (t: number): number => {
      const tip = Math.sqrt(Math.max(0, 1 - Math.max(0, (t - 0.8) / 0.2) ** 2))
      return hw * 0.14 * (1.3 - 0.4 * smooth(0, 0.5, t) + 0.08 * bump(((t - 0.55) / 0.08) ** 2) + 0.05 * bump(((t - 0.8) / 0.1) ** 2)) * Math.max(0.2, tip)
    }
    ctx.skin.at(new Matrix4(), rigid(thumbBone)).tube(pts, rad, (t) => (t > 0.8 ? nail : skinC), near ? 8 : 6, { flatten: 0.85 })
  }
}

export function buildLegs(ctx: BuildCtx): void {
  const { d, skinC } = ctx
  const ochreC = mixc(skinC, OCHRE, 0.72)
  const bodyOchre = ctx.has('ochre-body')
  const rng = ctx.rng.fork(0x1e65)
  const kneeC = tone(skinC, 0.9)
  const lit = skinC.clone().multiply(new Color(1.04, 1.02, 1))
  for (const s of [1, -1] as const) {
    const L = s > 0
    const lx = s * d.hipX
    const top = d.hipY + d.legR * 0.7
    const kneeY = d.hipY - d.thigh
    const bot = d.ankleY - d.ankleR * 0.5
    const prof = profile([
      [bot, d.ankleR * 0.95],
      [d.ankleY + d.shin * 0.05, d.ankleR],
      [d.ankleY + d.shin * 0.3, d.ankleR * 1.2],
      [kneeY - d.shin * 0.3, d.calfR],
      [kneeY - d.shin * 0.08, d.kneeR * 1.02],
      [kneeY, d.kneeR],
      [kneeY + d.thigh * 0.15, d.kneeR * 1.12],
      [kneeY + d.thigh * 0.55, d.legR * 0.86],
      [d.hipY, d.legR],
    ])
    const r = (y: number): number => {
      if (y > d.hipY) return d.legR * Math.sqrt(Math.max(0, 1 - ((y - d.hipY) / (top - d.hipY)) ** 2))
      return prof(y)
    }
    const stripes: Stripe[] = []
    if (bodyOchre) {
      const w = d.stature * 0.009
      const a = d.ankleY + d.shin * rng.range(0.45, 0.6)
      stripes.push({ from: a, to: a + w }, { from: a + w * 2.2, to: a + w * 3.2 })
    }
    const thighBone = L ? B.thighL : B.thighR
    const shinBone = L ? B.shinL : B.shinR
    const legSkin: SkinFn = (_x, y) => {
      if (y > d.hipY - d.legR) return blend2(thighBone, B.hips, smooth(d.hipY - d.legR, top, y) * 0.5)
      return blend2(thighBone, shinBone, smooth(kneeY + d.kneeR * 1.4, kneeY - d.kneeR * 1.4, y))
    }
    ctx.skin.at(T(lx, 0, 0), legSkin).lathe({
      y0: bot,
      y1: top,
      r,
      segs: 18,
      rings: 26,
      seams: stripes.flatMap((st) => [st.from, st.to]),
      color: (y, th) => {
        if (stripesAt(stripes, y) && Math.cos(th) > -0.4) return ochreC
        if (Math.abs(y - kneeY) < d.kneeR && Math.cos(th) > 0.5) return kneeC
        if (Math.sin(th) * s > 0.5 && y > kneeY) return lit
        return skinC
      },
      deform: (v, th, y) => {
        const c = Math.cos(th)
        // calf bulges at the back, the kneecap at the front, the shin flattens
        if (c < 0) v.z += d.calfR * 0.28 * c * bump(((y - (kneeY - d.shin * 0.28)) / (d.shin * 0.2)) ** 2)
        if (c > 0) v.z += d.kneeR * 0.12 * c * bump(((y - kneeY) / (d.kneeR * 0.7)) ** 2)
        // the inner thigh flattens where the legs meet
        if (y > kneeY && Math.sin(th) * s < -0.5) v.x *= 1 - 0.12 * smooth(kneeY, d.hipY, y)
      },
    })
    buildFoot(ctx, s, lx, L ? B.footL : B.footR)
  }
}

function buildFoot(ctx: BuildCtx, s: 1 | -1, lx: number, footBone: number): void {
  const { d, skinC } = ctx
  const soleC = mixc(skinC, new Color('#c49a7c'), 0.4)
  const Lf = d.footLen
  const W = d.footW
  const Hf = d.footH
  const z0 = -Lf * 0.22
  const z1 = Lf * 0.7
  const topH = profile([
    [0, Hf * 0.55],
    [0.22, Hf * 1.25],
    [0.42, Hf * 1.05],
    [0.75, Hf * 0.55],
    [1, Hf * 0.32],
  ])
  const halfW = profile([
    [0, W * 0.3],
    [0.25, W * 0.36],
    [0.55, W * 0.4],
    [0.85, W * 0.5],
    [1, W * 0.46],
  ])
  ctx.skin.at(T(lx, 0, 0), rigid(footBone)).grid(
    18,
    16,
    (u, v, out) => {
      // θ runs clockwise seen from the heel so the shell faces out
      const th = -2 * Math.PI * u
      // round both ends: v runs heel → toes
      const t = v
      const endK = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 8))
      const w = halfW(t) * endK
      const h = topH(t)
      const sn = Math.sin(th)
      const cs = Math.cos(th)
      // superellipse cross-section, flat sole, the inner arch lifted mid-foot
      const xr = Math.sign(sn) * Math.abs(sn) ** 0.8
      const yr = Math.sign(cs) * Math.abs(cs) ** 0.8
      const inner = xr * s < 0
      const arch = inner ? 0.35 * Hf * bump(((t - 0.45) / 0.2) ** 2) * Math.max(0, -yr) : 0
      const yTop = h * endK ** 0.5
      let y = yr > 0 ? yTop * yr : Math.max(0, yr) + arch * Math.abs(yr)
      y = Math.max(y, 0)
      // the outer side is lower: feet roll out
      if (!inner) y *= 0.92
      // the builder's matrix already carries lx
      out.x = w * xr
      out.y = y
      out.z = lerp(z0, z1, t)
      out.c.copy(yr < -0.2 ? soleC : skinC)
    },
    { wrapU: true },
  )
  // toes: the big toe inward, four smaller ones out
  for (let i = 0; i < 5; i++) {
    const big = i === 0
    const tx = lx - s * W * (0.34 - i * 0.17) - (big ? s * W * 0.04 : 0)
    const tz = z1 - Lf * (big ? 0.0 : 0.02 + i * 0.022)
    const tr = W * (big ? 0.15 : 0.1 - i * 0.008)
    ctx.skin.at(T(tx, tr * 0.85, tz), rigid(footBone)).ellipsoid(tr, tr * 0.85, tr * 1.25, (_y, _t, v) => (v.y < -tr * 0.4 ? soleC : skinC), 10, 7)
  }
  void clamp
}
