/**
 * The body model: a PersonLook (age, sex, height, build) → every measurement the builder and the poser need.
 * Age morphs continuously through stations (0, 1, 3, 6, 10, 14, 18 years) of real forager-like proportions; the
 * face gets its seeded variety here too. Three-free and pure.
 */
import type { PersonLook } from '../contracts'
import { Rng, mix32 } from '~/core/rng'
import { clamp, lerp, smooth } from './geo'

const AGES = [0, 1, 3, 6, 10, 14, 18] as const

/** piecewise-linear table over AGES */
function table(age: number, vals: readonly number[]): number {
  const a = clamp(age, 0, 18)
  for (let i = 0; i < AGES.length - 1; i++) {
    const a0 = AGES[i] ?? 0
    const a1 = AGES[i + 1] ?? 18
    if (a <= a1) return lerp(vals[i] ?? 0, vals[i + 1] ?? 0, (a - a0) / (a1 - a0))
  }
  return vals[vals.length - 1] ?? 0
}

/** stature in metres for an age (before the look's height multiplier) */
export function statureFor(sex: PersonLook['sex'], age: number): number {
  const f = sex === 'female'
  const pts: [number, number][] = f
    ? [[0, 0.52], [0.5, 0.66], [1, 0.75], [2, 0.86], [4, 1.01], [6, 1.12], [8, 1.24], [10, 1.35], [12, 1.45], [14, 1.51], [16, 1.54], [18, 1.55], [55, 1.55], [65, 1.53], [80, 1.49]]
    : [[0, 0.53], [0.5, 0.67], [1, 0.76], [2, 0.87], [4, 1.02], [6, 1.12], [8, 1.24], [10, 1.35], [12, 1.45], [14, 1.53], [16, 1.6], [18, 1.64], [21, 1.65], [55, 1.65], [65, 1.63], [80, 1.58]]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i]
    const p1 = pts[i + 1]
    if (!p0 || !p1) break
    if (age <= p1[0]) return lerp(p0[1], p1[1], clamp((age - p0[0]) / (p1[0] - p0[0]), 0, 1))
  }
  return pts[pts.length - 1]?.[1] ?? 1.6
}

export type FaceDims = {
  /** all in units of the head half-height ry, head-centre relative */
  eyeSpacing: number
  eyeSize: number
  eyeTilt: number
  noseWidth: number
  noseLength: number
  noseBridge: number
  lipFull: number
  mouthWidth: number
  jaw: number
  chin: number
  cheekbones: number
  brow: number
  browThick: number
  earSize: number
  smile: number
  faceWidth: number
}

export type BodyDims = {
  age: number
  female: boolean
  /** 0 infant .. 1 adult (skeletal) */
  maturity: number
  /** 0..1 puberty (sex dimorphism) */
  puberty: number
  /** 0..1 old age (stoop, thinning) */
  elder: number
  /** 0..1 baby fat */
  chub: number
  stature: number
  build: number

  // head (absolute body-space y unless noted)
  headH: number
  ry: number
  headCy: number
  /** head centre's forward offset from the neck axis */
  headZ: number
  chinY: number
  /** eye centre relative to the head centre */
  eyeX: number
  eyeY: number
  eyeZ: number
  eyeR: number
  jawPivot: { y: number; z: number }
  face: FaceDims

  // neck and torso
  neckR: number
  neckZ: number
  topY: number
  shoulderY: number
  chestY: number
  waistY: number
  beltY: number
  hipY: number
  crotchY: number
  shoulderW: number
  chestW: number
  waistW: number
  hipW: number
  chestDepth: number
  hipDepth: number
  torsoDepthK: number
  bust: number
  belly: number

  // arms
  shoulderX: number
  shoulderJointY: number
  upperArm: number
  foreArm: number
  palm: number
  fingers: number
  handW: number
  armR: number
  elbowR: number
  foreR: number
  wristR: number

  // legs
  hipX: number
  thigh: number
  shin: number
  legR: number
  kneeR: number
  calfR: number
  ankleR: number
  ankleY: number
  footLen: number
  footW: number
  footH: number
}

export function bodyDims(look: PersonLook): BodyDims {
  const age = clamp(look.ageYears, 0, 90)
  const female = look.sex === 'female'
  const rng = new Rng(mix32(look.seed, 0xb0d1))
  const maturity = smooth(0, 17, age)
  const puberty = smooth(10, 16.5, age)
  const elder = smooth(50, 78, age)
  const chub = 1 - smooth(0.5, 6, age)
  const build = clamp(look.build, 0, 1)
  const H = statureFor(look.sex, age) * clamp(look.height, 0.85, 1.15)
  const pf = female ? puberty : 0
  const pm = female ? 0 : puberty

  // head: stylized a touch large (reads at third-person distance, ~1/7.2 of an adult)
  const headH = H * table(age, [0.25, 0.215, 0.192, 0.172, 0.158, 0.148, 0.139])
  const ry = headH / 2
  const chinY = H - headH
  const headCy = chinY + ry
  const headZ = ry * lerp(0.08, 0.16, maturity)

  const f: FaceDims = {
    eyeSpacing: 0.29 + rng.range(-0.02, 0.02) + 0.02 * (1 - maturity),
    eyeSize: lerp(0.2, 0.135, smooth(0, 15, age)) * rng.range(0.94, 1.06),
    eyeTilt: rng.range(-0.04, 0.1),
    noseWidth: rng.range(0.95, 1.25) * lerp(0.8, 1, maturity),
    noseLength: rng.range(0.9, 1.1) * lerp(0.65, 1, maturity),
    noseBridge: rng.range(0.5, 1) * lerp(0.2, 1, maturity),
    lipFull: rng.range(0.9, 1.2),
    mouthWidth: rng.range(0.92, 1.08),
    jaw: rng.range(0.85, 1.1) + pm * 0.15 - elder * 0.05,
    chin: rng.range(0.8, 1.2),
    cheekbones: rng.range(0.7, 1.2),
    brow: rng.range(0.6, 1.1) + pm * 0.35,
    browThick: rng.range(0.8, 1.2) * (female ? 0.85 : 1.1),
    earSize: rng.range(0.9, 1.1),
    smile: rng.range(0.2, 0.75),
    faceWidth: rng.range(0.95, 1.05),
  }
  const eyeR = ry * f.eyeSize
  const eyeYn = lerp(-0.2, 0.0, smooth(0, 16, age))
  const eyeX = ry * f.eyeSpacing * f.faceWidth
  // the eyeball sits in its socket with its front ~0.35 r proud of the face plane
  const faceFrontN = lerp(0.8, 0.78, maturity)
  const eyeZ = headZ + ry * faceFrontN - eyeR * 0.92

  const neckVis = H * table(age, [0.008, 0.016, 0.028, 0.036, 0.041, 0.046, 0.049])
  const topY = chinY - neckVis + ry * 0.05
  const neckR = H * table(age, [0.06, 0.05, 0.04, 0.034, 0.031, 0.03, 0.03]) * (1 + pm * 0.14) * lerp(0.92, 1.08, build)

  const hipY = H * (table(age, [0.33, 0.37, 0.42, 0.46, 0.48, 0.495, 0.505]) + (female ? 0 : 0.008 * puberty)) - elder * 0.012 * H
  const TL = topY - hipY
  const shoulderY = hipY + TL * 0.86
  const chestY = hipY + TL * 0.64
  const waistY = hipY + TL * 0.36
  const beltY = hipY + TL * 0.2

  const widthK = lerp(0.9, 1.1, build) * (1 - elder * 0.05)
  const shoulderW = H * (table(age, [0.135, 0.13, 0.122, 0.118, 0.115, 0.114, 0.112]) + pm * 0.014 - pf * 0.002) * lerp(0.96, 1.04, build)
  const chestW = H * (table(age, [0.128, 0.12, 0.105, 0.097, 0.093, 0.093, 0.093]) + pm * 0.012 + pf * 0.004) * widthK
  const waistW = H * (table(age, [0.125, 0.112, 0.095, 0.083, 0.079, 0.076, 0.075]) + pm * 0.004) * lerp(0.88, 1.18, build) * (1 + elder * 0.05)
  const hipW = H * (table(age, [0.12, 0.112, 0.098, 0.09, 0.088, 0.092, 0.094]) + pf * 0.014) * lerp(0.92, 1.1, build)
  const torsoDepthK = lerp(0.86, 0.66, maturity)

  const upperArm = H * table(age, [0.15, 0.158, 0.168, 0.176, 0.181, 0.185, 0.186])
  const foreArm = H * table(age, [0.118, 0.124, 0.13, 0.138, 0.142, 0.145, 0.146])
  const handL = H * table(age, [0.1, 0.1, 0.104, 0.105, 0.107, 0.108, 0.108])
  const limbK = lerp(0.88, 1.14, build) * (1 - elder * 0.1) * (1 + chub * 0.25)
  const armR = H * (table(age, [0.04, 0.037, 0.032, 0.029, 0.027, 0.026, 0.026]) + pm * 0.0045) * limbK
  const thigh = H * table(age, [0.15, 0.17, 0.2, 0.222, 0.235, 0.243, 0.245])
  const ankleY = H * table(age, [0.03, 0.034, 0.037, 0.039, 0.04, 0.04, 0.04])
  const shin = hipY - thigh - ankleY
  const legR = H * (table(age, [0.066, 0.06, 0.051, 0.045, 0.042, 0.043, 0.045]) + pf * 0.004 + pm * 0.002) * limbK

  return {
    age,
    female,
    maturity,
    puberty,
    elder,
    chub,
    stature: H,
    build,
    headH,
    ry,
    headCy,
    headZ,
    chinY,
    eyeX,
    eyeY: ry * eyeYn,
    eyeZ,
    eyeR,
    jawPivot: { y: ry * (eyeYn - 0.3), z: headZ - ry * 0.32 },
    face: f,
    neckR,
    neckZ: 0,
    topY,
    shoulderY,
    chestY,
    waistY,
    beltY,
    hipY,
    crotchY: hipY - legR * 0.75,
    shoulderW,
    chestW,
    waistW,
    hipW,
    chestDepth: chestW * torsoDepthK,
    hipDepth: hipW * torsoDepthK * 1.02,
    torsoDepthK,
    bust: pf * lerp(0.6, 1.1, build) * (1 - elder * 0.3),
    belly: chub * 0.9 + (age > 30 ? smooth(30, 60, age) * build * 0.35 : 0),
    shoulderX: shoulderW - armR * 0.55,
    shoulderJointY: shoulderY - armR * 0.15,
    upperArm,
    foreArm,
    palm: handL * 0.52,
    fingers: handL * 0.48,
    handW: handL * 0.48,
    armR,
    elbowR: armR * 0.68,
    foreR: armR * 0.78,
    wristR: armR * 0.54,
    hipX: Math.max(hipW * 0.5, legR * 1.05),
    thigh,
    shin,
    legR,
    kneeR: legR * 0.6,
    calfR: legR * 0.62,
    ankleR: legR * 0.36,
    ankleY,
    footLen: H * table(age, [0.14, 0.146, 0.15, 0.152, 0.152, 0.152, 0.152]),
    footW: H * table(age, [0.062, 0.06, 0.058, 0.056, 0.055, 0.055, 0.056]) * lerp(0.95, 1.06, build),
    footH: ankleY * 1.25,
  }
}
