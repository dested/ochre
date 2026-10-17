/**
 * The activity poses: kneeling work (dig, scrape, grind), seated work (knap, engrave, eat), grief, the fire,
 * lying down (sleep, death), the hunt (aim, throw), gestures (point, wave, talk), the dance and an infant's crawl.
 * Each writes a PoseSpec for one body at one moment, in body terms, so it fits an infant, a child or an elder.
 */
import { Vector3 } from 'three'
import type { AnimCtx } from './anims'
import { clamp, lerp, smooth } from './geo'
import type { ArmSpec, PoseSpec } from './pose'
import { FLAKE_REACH, POKER_REACH, gripPoint } from './props'
import { B } from './rig'

const TAU = Math.PI * 2
const frac = (x: number): number => x - Math.floor(x)
/** 0 → 1 → 0 over [a, b] of a cycle */
const pulse = (x: number, a: number, b: number): number => (x <= a || x >= b ? 0 : Math.sin((Math.PI * (x - a)) / (b - a)))

const _hx = new Vector3()
const _hy = new Vector3()
const _hz = new Vector3()
const _off = new Vector3()
const _p0 = new Vector3()
const _ax = new Vector3()
const _g = new Vector3()
const _palm = new Vector3()
const _pole = new Vector3()
// the tool poses' own scratch (wristForGrip writes _hx, _hy, _hz and _off)
const _tDir = new Vector3()
const _tGrip = new Vector3()
const _tPalm = new Vector3()
const _tPole = new Vector3()

/**
 * Where the wrist must be so a closed hand's grip lands on `grip` with the held item along `axis` and the palm
 * toward `palm` (all body space). Uses the same hand basis as the solver's aim.
 */
function wristForGrip(c: AnimCtx, i: 0 | 1, grip: Vector3, axis: Vector3, palm: Vector3, out: Vector3): Vector3 {
  const side = i === 0 ? 1 : -1
  const d = c.d
  _hz.copy(axis).normalize()
  _hx.copy(palm).multiplyScalar(-side)
  _hx.addScaledVector(_hz, -_hx.dot(_hz))
  if (_hx.lengthSq() < 1e-8) _hx.set(1, 0, 0)
  _hx.normalize()
  _hy.crossVectors(_hz, _hx)
  const wristY = d.shoulderJointY - d.upperArm - d.foreArm
  gripPoint(d, i === 0 ? 'left' : 'right', _off)
  _off.x -= side * d.shoulderX
  _off.y -= wristY
  return out.copy(grip).addScaledVector(_hx, -_off.x).addScaledVector(_hy, -_off.y).addScaledVector(_hz, -_off.z)
}

/** grip an item with a hand: IK the wrist so the grip lands, and aim the item */
function gripWith(c: AnimCtx, a: ArmSpec, i: 0 | 1, grip: Vector3, axis: Vector3, palm: Vector3, pole: Vector3): void {
  a.ik = true
  a.space = 0
  wristForGrip(c, i, grip, axis, palm, a.wrist)
  a.pole.copy(pole)
  a.aim = true
  a.aimAxis.copy(axis)
  a.aimPalm.copy(palm)
  a.curl = 0.9
  a.thumb = 0.75
}

/** the mouth and the eyes in bind body space (targets that ride on the head bone) */
function mouthAt(c: AnimCtx, out: Vector3): Vector3 {
  const d = c.d
  return out.set(0, d.headCy + d.eyeY - lerp(0.42, 0.56, d.maturity) * d.ry, d.headZ + d.ry * 0.9)
}

/* ─── kneeling ─────────────────────────────────────────────────────────────────────────────────────────── */

type Kneel = 'heels' | 'half' | 'up'

/** kneel: sitting back on the heels, half-kneeling (right knee down, left foot forward), or upright on both knees */
function kneel(c: AnimCtx, s: PoseSpec, kind: Kneel): number {
  const { rig, d } = c
  const T = rig.thigh
  const S = rig.shin
  const kneeY = d.kneeR * 0.9
  if (kind === 'heels') {
    const az = -0.12 * S
    const kz = az + Math.sqrt(Math.max(0, S * S - (d.footH - kneeY) ** 2))
    const hipY = kneeY + Math.sqrt(Math.max(0.04 * T * T, T * T - kz * kz))
    s.hip.set(0, hipY + d.hipDepth * 0.15, 0)
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1
      const leg = s.legs[i]
      if (!leg) continue
      leg.ankle.set(side * rig.hipX * 0.8, d.footH * 0.85, az)
      leg.pitch = -2.75
      leg.yaw = -0.1
      leg.pole.set(side * 0.12, 0, 1)
    }
    return hipY
  }
  const hipY = kneeY + T * 0.93
  s.hip.set(0, hipY, -0.04 * T)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const leg = s.legs[i]
    if (!leg) continue
    if (kind === 'half' && i === 0) {
      leg.ankle.set(side * rig.hipX * 1.3, rig.ankleY, T * 0.82)
      leg.pitch = 0
      leg.yaw = 0.15
      leg.pole.set(side * 0.25, 0.2, 1)
    } else {
      // knee on the ground, toes tucked under
      leg.ankle.set(side * rig.hipX * 1.05, d.footLen * 0.42, -S * 0.9)
      leg.pitch = -1.15
      leg.yaw = 0.05
      leg.pole.set(side * 0.1, -0.2, 1)
    }
  }
  return hipY
}

export function poseDig(c: AnimCtx, s: PoseSpec): void {
  const { rig, d, t } = c
  const legL = rig.thigh + rig.shin
  kneel(c, s, 'half')
  const k = Math.max(0.6, d.stature / 1.65)
  const cyc = frac(t / 1.15 + c.jit)
  // lift, a hard drive down, then lever the earth loose
  const lift = smooth(0, 0.38, cyc) * (1 - smooth(0.42, 0.5, cyc))
  const lever = pulse(cyc, 0.55, 0.95)
  const main: 0 | 1 = c.held[0] === 'digging-stick' && c.held[1] !== 'digging-stick' ? 0 : 1
  const side = main === 0 ? 1 : -1
  s.hipRot.set(0.18 + 0.06 * lift, side * 0.12, 0)
  s.spine.set(0.28 + 0.08 * (1 - lift) - 0.06 * lever, 0, 0)
  s.chest.set(0.12, 0, 0)
  s.neck.set(0.05, 0, 0)
  s.head.set(0.3, 0, 0)
  _p0.set(-side * 0.02 * legL, 0.11 * k * lift - 0.05 * k, 0.6 * legL)
  _ax.set(0, 0.92, -0.38 - 0.22 * lever).normalize()
  _palm.set(side, 0, 0.3)
  const ma = s.arms[main]
  const oa = s.arms[1 - main]
  if (ma) gripWith(c, ma, main, _g.copy(_p0).addScaledVector(_ax, 0.72 * k), _ax, _palm, _pole.set(side * 0.8, -0.3, -0.6))
  if (oa) gripWith(c, oa, main === 0 ? 1 : 0, _g.copy(_p0).addScaledVector(_ax, 0.86 * k), _ax, _palm.set(-side, 0, 0.3), _pole.set(-side * 0.8, -0.3, -0.6))
}

export function poseScrape(c: AnimCtx, s: PoseSpec): void {
  const { rig, t } = c
  const legL = rig.thigh + rig.shin
  const hipY = kneel(c, s, 'heels')
  const cyc = frac(t / 1.2 + c.jit)
  const push = 0.5 - 0.5 * Math.cos(TAU * cyc)
  s.hipRot.set(0.35 + 0.15 * push, 0, 0)
  s.spine.set(0.35 + 0.1 * push, 0, 0)
  s.chest.set(0.15, 0, 0)
  s.neck.set(-0.05, 0, 0)
  s.head.set(0.25, 0, 0)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const a = s.arms[i]
    if (!a) continue
    // both hands on the scraper, pushed along the hide and drawn back
    a.ik = true
    a.wrist.set(side * 0.045 * legL, hipY * 0.12 + 0.03, lerp(0.42, 0.72, push) * legL)
    a.pole.set(side * 0.9, 0.1, -0.4)
    a.hand.set(-0.35, 0, 0)
    a.curl = 0.8
    a.thumb = 0.6
  }
}

export function poseGrind(c: AnimCtx, s: PoseSpec): void {
  const { rig, t } = c
  const legL = rig.thigh + rig.shin
  const hipY = kneel(c, s, 'heels')
  const a0 = TAU * frac(t / 1.4 + c.jit)
  s.hipRot.set(0.32, 0.04 * Math.sin(a0), 0)
  s.spine.set(0.32 + 0.04 * Math.cos(a0), 0.05 * Math.sin(a0), 0)
  s.chest.set(0.12, 0, 0)
  s.head.set(0.3, 0, 0)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const a = s.arms[i]
    if (!a) continue
    // round and round on the slab, both hands on the grinding stone
    a.ik = true
    a.wrist.set(side * 0.04 * legL + 0.06 * legL * Math.sin(a0), hipY * 0.2 + 0.05, 0.5 * legL + 0.06 * legL * Math.cos(a0))
    a.pole.set(side * 0.9, 0.1, -0.4)
    a.hand.set(-0.5, 0, 0)
    a.curl = 0.7
  }
}

/* ─── seated work ──────────────────────────────────────────────────────────────────────────────────────── */

/** seated work in the lap: the left hand steadies, the right works */
export function poseKnap(c: AnimCtx, s: PoseSpec, seatY: number): void {
  const { rig, t } = c
  const legL = rig.thigh + rig.shin
  const cyc = frac(t / 0.85 + c.jit)
  // a raise, a snap down onto the core, a check
  const up = smooth(0.1, 0.55, cyc) * (1 - smooth(0.6, 0.66, cyc))
  s.spine.x += 0.12
  s.chest.x += 0.08
  s.head.set(0.45, 0.05, 0)
  s.neck.x = 0.1
  const l = s.arms[0]
  const r = s.arms[1]
  if (l) {
    l.ik = true
    l.wrist.set(0.04 * legL, seatY + 0.2 * legL, 0.36 * legL)
    l.pole.set(0.8, -0.4, -0.4)
    l.hand.set(-0.4, 0, -0.4)
    l.curl = 0.6
    l.thumb = 0.7
  }
  if (r) {
    r.ik = true
    r.wrist.set(-0.03 * legL, seatY + lerp(0.26, 0.48, up) * legL, lerp(0.34, 0.3, up) * legL)
    r.pole.set(-0.9, -0.2, -0.4)
    r.hand.set(lerp(0.2, -0.3, up), 0, 0)
    r.curl = 0.85
    r.thumb = 0.7
  }
}

/**
 * engraving the ochre: the slab held flat in the left hand over the lap, the flake's point drawn across its face in
 * short careful strokes, a pause to look, again
 */
export function poseEngrave(c: AnimCtx, s: PoseSpec, seatY: number): void {
  const { rig, t } = c
  const legL = rig.thigh + rig.shin
  const cyc = frac(t / 3 + c.jit)
  const working = cyc < 0.75 ? 1 : 0
  const stroke = Math.sin(t * TAU * 2.6) * working
  s.spine.x += 0.16
  s.chest.x += 0.1
  s.head.set(0.5, -0.05, 0.05)
  s.neck.x = 0.12
  const l = s.arms[0]
  const r = s.arms[1]
  // the slab: over the lap a little left of centre, its long side across the body, its face up
  const slab = _p0.set(0.03 * legL, seatY + 0.26 * legL, 0.33 * legL)
  const along = _ax.set(-0.92, 0.1, 0.38).normalize()
  if (l) {
    gripWith(c, l, 0, slab, along, _palm.set(0, 1, 0), _pole.set(0.8, -0.4, -0.4))
    l.curl = 0.45
    l.thumb = 0.55
  }
  if (r) {
    // the point on the slab's face, sliding along it; the flake comes in from above and the right
    _g.copy(slab).addScaledVector(along, 0.012 * stroke)
    _g.y += 0.0065 + 0.006 * (1 - working)
    const dir = _tDir.set(0.45, -0.75, 0.2).normalize()
    const grip = _tGrip.copy(_g).addScaledVector(dir, -FLAKE_REACH)
    gripWith(c, r, 1, grip, dir, _tPalm.set(0.5, 0, -0.3), _tPole.set(-0.9, -0.3, -0.3))
    r.curl = 0.8
    r.thumb = 0.85
  }
}

export function poseEat(c: AnimCtx, s: PoseSpec, seatY: number): void {
  const { rig, d, t } = c
  const legL = rig.thigh + rig.shin
  const cyc = frac(t / 4.2 + c.jit)
  const bite = smooth(0.05, 0.25, cyc) * (1 - smooth(0.42, 0.62, cyc))
  const chew = cyc > 0.3 ? Math.max(0, Math.sin(t * TAU * 1.6)) : 0
  s.head.x += 0.08 - 0.08 * bite
  s.jaw += 0.05 * bite + 0.08 * chew
  const r = s.arms[1]
  const l = s.arms[0]
  if (l) {
    l.ik = true
    l.wrist.set(0.08 * legL, seatY + 0.18 * legL, 0.34 * legL)
    l.pole.set(0.8, -0.4, -0.4)
    l.hand.set(-0.6, 0, -0.8)
    l.curl = 0.5
  }
  if (r) {
    // from the lap (body space) up to the mouth (riding on the head)
    r.ik = true
    r.wrist.set(-0.06 * legL, seatY + 0.2 * legL, 0.34 * legL)
    mouthAt(c, r.wrist2)
    r.wrist2.x -= 0.02 * d.stature
    r.wrist2.y -= 0.06 * d.stature
    r.wrist2.z += 0.035 * d.stature
    r.space2 = B.head
    r.mix = bite
    r.hand.set(-0.4 - 0.7 * bite, 0, -0.6 + 0.3 * bite)
    r.pole.set(-0.9, -0.5, -0.3)
    r.curl = 0.65
  }
}

/** grief: kneeling back on the heels, bowed, hands over the face, rocking */
export function poseMourn(c: AnimCtx, s: PoseSpec): void {
  const { d, t } = c
  kneel(c, s, 'heels')
  const rock = Math.sin(t * TAU * 0.28 + c.jit * 5)
  s.hipRot.set(0.25 + 0.08 * rock, 0, 0)
  s.spine.set(0.35 + 0.05 * rock, 0, 0)
  s.chest.set(0.2, 0, 0)
  s.neck.set(0.25, 0, 0)
  s.head.set(0.35, 0, 0.04 * rock)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const a = s.arms[i]
    if (!a) continue
    a.ik = true
    a.space = B.head
    // the heels of the hands at the jaw, the palms flat on the face and the fingers up over the eyes to the brow.
    // The bow tips the face toward the knees, so in body space the palms face up and back, the fingers forward
    a.wrist.set(side * d.ry * 0.36, d.headCy + d.eyeY - d.ry * 0.8, d.headZ + d.ry * 0.95)
    a.pole.set(side * 0.8, -0.6, -0.2)
    a.aim = true
    a.aimAxis.set(side, 0, 0.12)
    a.aimPalm.set(-side * 0.25, 0.94, -0.22)
    a.curl = 0.12
    a.thumb = 0.25
  }
}

/** squatting at the fire, feeding it: the right hand reaches in with a stick or a branch, the left arm on the knee */
export function poseTendFire(c: AnimCtx, s: PoseSpec): void {
  const { rig, t, d } = c
  const legL = rig.thigh + rig.shin
  const hipY = rig.ankleY + legL * lerp(0.36, 0.44, d.elder)
  s.hip.set(0, hipY, -0.08 * legL)
  s.hipRot.set(0.35, 0, 0)
  s.spine.set(0.3, 0, 0)
  s.chest.set(0.1, 0, 0)
  s.neck.set(-0.2, 0, 0)
  s.head.set(-0.05, 0.1 * Math.sin(t * 0.3), 0)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const leg = s.legs[i]
    if (!leg) continue
    leg.ankle.set(side * rig.hipX * 1.5, rig.ankleY, 0.08 * legL)
    leg.pitch = 0
    leg.yaw = 0.4
    leg.pole.set(side * 0.6, 0.4, 1)
  }
  const cyc = frac(t / 3.4 + c.jit)
  const reach = smooth(0.1, 0.35, cyc) * (1 - smooth(0.55, 0.8, cyc))
  const poke = reach * Math.max(0, Math.sin(t * TAU * 1.5))
  const l = s.arms[0]
  const r = s.arms[1]
  if (l) {
    // forearm resting across the knee
    l.ik = true
    l.wrist.set(0.02 * legL, hipY + 0.2 * legL, 0.42 * legL)
    l.pole.set(0.9, -0.2, -0.3)
    l.hand.set(0.3, 0, 0)
    l.curl = 0.4
  }
  if (r && c.held[1] === 'none') {
    // the poker: its tip rests by the stones, then goes into the coals (the sim seats a tender 1.27 m from the fire's
    // centre, the bed 0.35 m across) and stirs them
    const tip = _g.set(lerp(-0.13, -0.05, reach), lerp(0.015, 0.05, reach) + 0.02 * poke, lerp(0.74, 1.1 + 0.05 * poke, reach))
    const shoulder = _p0.set(-0.16 * legL, hipY + 0.5 * legL, 0.12 * legL)
    const dir = _tDir.subVectors(tip, shoulder).normalize()
    const grip = _tGrip.copy(tip).addScaledVector(dir, -POKER_REACH)
    gripWith(c, r, 1, grip, dir, _tPalm.set(0.4, -0.9, 0), _tPole.set(-0.9, -0.3, -0.3))
  } else if (r) {
    r.ik = true
    r.wrist.set(-0.12 * legL, lerp(hipY + 0.12 * legL, 0.18 * legL, reach), lerp(0.3, 0.75 + 0.04 * poke, reach) * legL)
    r.pole.set(-0.9, -0.3, -0.3)
    r.hand.set(0.2 + 0.3 * reach, 0, 0)
    r.curl = 0.8
  }
}

/* ─── lying down ───────────────────────────────────────────────────────────────────────────────────────── */

/** asleep on the right side, knees drawn up, the hands by the face */
export function poseSleep(c: AnimCtx, s: PoseSpec): void {
  const { rig, d, t } = c
  const legL = rig.thigh + rig.shin
  const breath = Math.sin(t * TAU * 0.2)
  // rolled onto the right side: the body's up runs along −X
  s.hip.set(0, d.hipW * 0.95, 0)
  s.hipRot.set(0, 0, Math.PI / 2)
  s.spine.set(0.25 + 0.01 * breath, 0, 0)
  s.chest.set(0.12 - 0.015 * breath, 0, 0)
  s.neck.set(0.15, 0, 0.1)
  s.head.set(0.15, 0, 0.12)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const leg = s.legs[i]
    if (!leg) continue
    // knees drawn forward; the upper (left) leg a touch further
    const up = side > 0 ? 1 : 0
    leg.ankle.set(legL * 0.55, d.hipW * 0.95 + side * rig.hipX * 0.9 - 0.02, legL * (0.32 + 0.06 * up))
    leg.pitch = 0.25
    leg.yaw = 0
    leg.pole.set(0.1, 0, 1)
  }
  for (let i = 0; i < 2; i++) {
    const a = s.arms[i]
    if (!a) continue
    a.ik = false
    a.flex = 1.25 + (i === 0 ? 0.2 : 0)
    a.abduct = i === 0 ? 0.05 : 0.15
    a.twist = 0.4
    a.elbow = 1.6
    a.hand.set(0.4, 0, 0)
    a.curl = 0.45
    a.thumb = 0.3
  }
}

/** lying on the back, still */
export function poseLieDead(c: AnimCtx, s: PoseSpec): void {
  const { rig, d } = c
  const legL = rig.thigh + rig.shin
  // the buttocks and the shoulder blades both on the ground: the body's back reaches about 1.22× the hip depth and
  // 1.26× the chest depth behind the spine line, so the hips sit that high and the trunk tips up toward the head by
  // the difference
  const hipBack = d.hipDepth * 1.22
  const chestBack = d.chestDepth * 1.26
  const torso = d.shoulderJointY - d.hipY
  s.hip.set(0, hipBack + 0.002 * d.stature, 0)
  // on the back: the body's up runs along −Z, its front faces the sky
  s.hipRot.set(-Math.PI / 2 + Math.atan2(Math.max(0, chestBack - hipBack), torso * 0.8), 0, 0)
  s.spine.set(0, 0, 0)
  s.chest.set(0, 0, 0)
  s.neck.set(0.05, 0, 0.25)
  s.head.set(-0.1, 0, 0.3)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const leg = s.legs[i]
    const a = s.arms[i]
    if (!leg || !a) continue
    leg.ankle.set(side * rig.hipX * 1.5, d.footH * 0.9, legL * 0.96)
    leg.pitch = 1.35
    leg.yaw = 0.4
    leg.pole.set(side * 0.3, 1, 0.1)
    // the arms lie on the ground beside the body: back from the shoulder (which sits above the ground) and a little out
    a.ik = false
    a.flex = -Math.asin(clamp((hipBack - d.armR) / (rig.upperArm + rig.foreArm), 0, 0.6))
    a.abduct = 0.28
    a.twist = 0.3
    a.elbow = 0.12
    a.hand.set(0.1, 0, 0)
    a.curl = 0.35
    a.thumb = 0.2
  }
}

/* ─── the hunt ─────────────────────────────────────────────────────────────────────────────────────────── */

/** a throwing stance: left foot forward, the body turned; `k` 0 = drawn back (aim), 1 = released */
function hunt(c: AnimCtx, s: PoseSpec, k: number, tremor: number): void {
  const { rig, d } = c
  const legL = rig.thigh + rig.shin
  const H = d.stature
  const drawn = 1 - k
  s.hip.set(-0.01 * H * drawn + 0.02 * H * k, rig.hipY - 0.03 * H, -0.02 * legL)
  s.hipRot.set(0.04 + 0.12 * k, -0.35 * drawn + 0.25 * k, 0)
  s.spine.set(-0.05 * drawn + 0.18 * k, -0.25 * drawn + 0.2 * k, 0.05 * drawn)
  s.chest.set(-0.04 * drawn + 0.12 * k, -0.25 * drawn + 0.25 * k, 0.06 * drawn)
  // the head stays on the target while the body winds
  s.neck.set(0, 0.35 * drawn - 0.2 * k, 0)
  s.head.set(-0.04, 0.3 * drawn - 0.25 * k + tremor * 0.01, 0)
  const l0 = s.legs[0]
  const l1 = s.legs[1]
  if (l0) {
    l0.ankle.set(rig.hipX * 1.2, rig.ankleY, 0.3 * legL)
    l0.yaw = 0.1
    l0.pole.set(0.2, 0, 1)
  }
  if (l1) {
    l1.ankle.set(-rig.hipX * 1.4, rig.ankleY, -0.26 * legL)
    l1.yaw = 0.5
    l1.pitch = -0.1 * k
    l1.pole.set(-0.3, 0, 1)
  }
  const throwing: 0 | 1 = c.held[0] === 'spear' && c.held[1] !== 'spear' ? 0 : 1
  const side = throwing === 0 ? 1 : -1
  const ta = s.arms[throwing]
  const oa = s.arms[1 - throwing]
  if (ta) {
    // drawn: the hand back beside the head, the spear level and pointing ahead; released: punched forward
    ta.ik = true
    ta.wrist.set(side * (d.shoulderX + 0.04 * H) * lerp(1, 0.4, k), d.shoulderJointY + lerp(0.07, 0.03, k) * H + tremor * 0.002, lerp(-0.12, 0.32, k) * H)
    ta.pole.set(side * 0.9, -0.6 + 0.4 * k, -0.4)
    ta.aim = true
    ta.aimAxis.set(side * lerp(0.05, -0.04, k), lerp(0.12, -0.05, k), 1)
    ta.aimPalm.set(0, 1, 0)
    ta.curl = 0.9
    ta.thumb = 0.7
  }
  if (oa) {
    // the other arm points the way, then swings down and back
    oa.ik = false
    oa.flex = lerp(1.35, 0.1, k)
    oa.abduct = lerp(0.15, 0.35, k)
    oa.twist = 0.2
    oa.elbow = lerp(0.15, 0.5, k)
    oa.hand.set(0, 0, 0)
    oa.curl = lerp(0.2, 0.5, k)
  }
}

export function poseAim(c: AnimCtx, s: PoseSpec): void {
  hunt(c, s, 0, Math.sin(c.t * 7.3) + Math.sin(c.t * 11.1))
}

export function poseThrow(c: AnimCtx, s: PoseSpec): void {
  // a 1.8 s loop: draw back, hold, release fast, follow through, recover
  const cyc = frac(c.t / 1.8 + c.jit)
  const k = cyc < 0.45 ? 0 : cyc < 0.55 ? smooth(0.45, 0.55, cyc) : 1 - smooth(0.75, 1, cyc)
  hunt(c, s, k, 0)
}

/* ─── gestures ─────────────────────────────────────────────────────────────────────────────────────────── */

/** point at the look target (body space) with the right arm, or ahead and to the right */
export function posePoint(c: AnimCtx, s: PoseSpec): void {
  const { d } = c
  const a = s.arms[1]
  if (!a) return
  const H = d.stature
  _ax.set(-0.35, 0.05, 1)
  if (c.look) _ax.set(c.look.x + d.shoulderX, c.look.y - d.shoulderJointY, c.look.z)
  if (_ax.z < 0.15) _ax.z = 0.15
  _ax.normalize()
  const reach = (d.upperArm + d.foreArm) * 0.97
  a.ik = true
  a.wrist.set(-d.shoulderX, d.shoulderJointY, 0).addScaledVector(_ax, reach)
  a.pole.set(-0.3, -1, 0)
  a.aim = true
  a.aimAxis.copy(_ax)
  a.aimPalm.set(0, -1, 0)
  a.curl = 0.85
  a.thumb = 0.6
  s.chest.y += clamp(Math.atan2(_ax.x, _ax.z) * 0.25, -0.3, 0.3)
  s.head.y += clamp(Math.atan2(_ax.x, _ax.z) * 0.2, -0.3, 0.3)
  void H
}

/** a greeting wave: the right arm up, the hand swinging */
export function poseWave(c: AnimCtx, s: PoseSpec): void {
  const { d, t } = c
  const H = d.stature
  const a = s.arms[1]
  if (!a) return
  const w = Math.sin(t * TAU * 1.6)
  a.ik = true
  a.wrist.set(-d.shoulderX - 0.09 * H + 0.03 * H * w, d.shoulderJointY + 0.15 * H, 0.06 * H)
  a.pole.set(-1, -0.6, 0.2)
  a.aim = true
  a.aimAxis.set(-0.25 * w, 1, 0.1)
  a.aimPalm.set(0, 0, 1)
  a.curl = 0.1
  a.thumb = 0.15
  s.chest.z += 0.04
  s.head.z += 0.03 * w
}

/**
 * conversation: beat gestures with the free hands, palms up, an occasional open-handed sweep. `w` scales it:
 * the 'talk' anim at 1, a bare talking layer at ~0.5. Arms already in IK (holding, carrying) are left alone.
 */
export function talkGestures(c: AnimCtx, s: PoseSpec, w: number): void {
  const { t } = c
  // the phrase: a slow swell that sets how animated this stretch of talk is
  const phrase = 0.5 + 0.5 * Math.sin(t * 0.43 + c.jit * 11)
  let beatAll = 0
  for (let i = 0; i < 2; i++) {
    const a = s.arms[i]
    if (!a || a.ik || a.aim) continue
    // the right hand leads; each hand rises and settles on its own slow rhythm
    const amp = i === 1 ? 1 : 0.7
    const slow = 0.5 + 0.5 * Math.sin(t * (0.61 + 0.23 * i) + c.jit * 7 + i * 2.1)
    const lift = w * amp * (0.25 + 0.75 * slow) * (0.6 + 0.4 * phrase)
    // sharp down-beats on the stressed syllables
    const beat = lift * Math.max(0, Math.sin(t * TAU * (1.35 + 0.15 * i) + i * 1.7)) ** 3
    // now and then an open-handed sweep out to the side
    const sweep = lift * smooth(0.75, 0.95, 0.5 + 0.5 * Math.sin(t * 0.37 + i * 3 + c.jit * 5))
    beatAll = Math.max(beatAll, beat)
    a.flex += 0.5 * lift - 0.14 * beat + 0.15 * sweep
    a.elbow += 1.35 * lift + 0.22 * beat - 0.35 * sweep
    a.abduct += 0.08 * lift + 0.45 * sweep
    // the forearm rolls the palm up and in
    a.twist += 0.75 * lift + 0.3 * sweep
    a.hand.set(a.hand.x - 0.3 * lift + 0.25 * beat, 0, a.hand.z - 0.35 * lift)
    a.curl = lerp(a.curl, 0.18, Math.min(1, lift * 1.5))
    a.thumb = lerp(a.thumb, 0.1, Math.min(1, lift * 1.5))
  }
  // the head nods on the beats and tilts with the phrase; the chest turns a little toward the listener
  s.head.x += 0.05 * beatAll + w * 0.02 * Math.sin(t * 2.3)
  s.head.z += w * 0.05 * (phrase - 0.5)
  s.chest.y += w * 0.05 * Math.sin(t * 0.7 + c.jit * 3)
}

/* ─── the dance ────────────────────────────────────────────────────────────────────────────────────────── */

/** the healing dance: bent forward, short stamping steps, arms back; women clap the rhythm */
export function poseDance(c: AnimCtx, s: PoseSpec): void {
  const { rig, d, t } = c
  const legL = rig.thigh + rig.shin
  const H = d.stature
  // two stamps a second, left and right; each lands hard, the body dropping onto it
  const ph = frac(t * 1.1 + c.jit)
  const u2 = frac(ph * 2)
  const land = Math.exp(-u2 * 9)
  const lift = Math.sin(Math.PI * smooth(0.25, 0.95, u2))
  const sway = Math.sin(TAU * ph)
  s.hip.set(0.018 * H * sway, rig.hipY - 0.075 * H - 0.02 * H * land + 0.006 * H * lift, 0)
  s.hipRot.set(0.32, 0.1 * sway, 0.05 * sway)
  s.spine.set(0.3 + 0.06 * land, 0, -0.03 * sway)
  s.chest.set(0.14, -0.08 * sway, 0)
  s.neck.set(-0.35, 0, 0)
  s.head.set(-0.12 + 0.12 * land, 0.12 * Math.sin(t * 0.8), 0.04 * sway)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const leg = s.legs[i]
    if (!leg) continue
    // the stepping foot rises while the other carries the weight, then stamps down beside it
    const mine = i === 0 ? ph < 0.5 : ph >= 0.5
    const up = mine ? lift : 0
    leg.ankle.set(side * rig.hipX * 1.2, rig.ankleY + 0.1 * legL * up, 0.06 * legL + 0.05 * legL * up)
    leg.pitch = 0.3 * up
    leg.yaw = 0.18
    leg.pole.set(side * 0.3, 0, 1)
  }
  const clap = d.female ? Math.max(0, Math.sin(TAU * ph * 2)) : 0
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const a = s.arms[i]
    if (!a) continue
    if (d.female) {
      // the clap rides the chest, so it stays in front of the breastbone however far she bends
      a.ik = true
      a.space = B.chest
      a.wrist.set(side * lerp(0.1, 0.012, clap) * H, d.chestY + 0.07 * H + 0.015 * H * clap, d.chestDepth + 0.13 * H)
      a.pole.set(side, -0.7, -0.3)
      a.aim = true
      a.aimAxis.set(0, 0.75, 0.65)
      a.aimPalm.set(-side, 0, 0)
      a.curl = 0.12
    } else {
      // the arms held back and bent, hands loose, jolting with each stamp
      a.ik = false
      a.flex = -0.55 - 0.12 * land
      a.abduct = 0.3
      a.twist = 0.35
      a.elbow = 1.45 + 0.1 * land
      a.hand.set(0.45, 0, 0)
      a.curl = 0.45
    }
  }
}

/* ─── crawling ─────────────────────────────────────────────────────────────────────────────────────────── */

/** an infant on hands and knees; crawls with diagonal pairs when moving */
export function poseCrawl(c: AnimCtx, s: PoseSpec): void {
  const { rig, d, t } = c
  const T = rig.thigh
  const S = rig.shin
  const arm = (d.upperArm + d.foreArm) * 0.95 + d.palm * 0.6
  const kneeH = d.kneeR
  const hipH = kneeH + T * 0.92 + 0.012 * d.stature
  const torso = d.shoulderJointY - d.hipY
  // pitch the torso so the shoulders sit at arm's height
  const pitch = Math.acos(clamp((arm - hipH) / torso, -0.2, 0.96))
  const moving = c.speed > 0.03
  const f = Math.max(0.3, c.freq)
  const duty = 0.65
  const Ls = moving ? (c.speed * duty) / f : 0
  const p = c.phase
  const bob = moving ? 0.015 * d.stature * Math.cos(TAU * 2 * p) : 0.004 * d.stature * Math.sin(t * 1.4)
  s.hip.set(0, hipH + bob, 0)
  s.hipRot.set(pitch, moving ? 0.1 * Math.cos(TAU * p) : 0, moving ? 0.06 * Math.cos(TAU * p) : 0)
  s.spine.set(0.05, 0, 0)
  s.chest.set(-0.05, 0, 0)
  // the head lifts to look ahead
  s.neck.set(-0.55, 0.15 * Math.sin(t * 0.5), 0)
  s.head.set(-0.55, 0.2 * Math.sin(t * 0.37), 0)
  const shoulderZ = Math.sin(pitch) * torso
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    // diagonal pairs: the left hand moves with the right knee
    const legQ = frac(p + (i === 0 ? 0.5 : 0))
    const armQ = frac(p + (i === 0 ? 0 : 0.5))
    const slide = (q: number): { z: number; lift: number } => {
      if (q < duty) return { z: Ls / 2 - (Ls * q) / duty, lift: 0 }
      const u = (q - duty) / (1 - duty)
      return { z: -Ls / 2 + Ls * (0.5 - 0.5 * Math.cos(Math.PI * u)), lift: Math.sin(Math.PI * u) }
    }
    const lq = slide(legQ)
    const aq = slide(armQ)
    const leg = s.legs[i]
    const a = s.arms[i]
    if (leg) {
      // knee down, the shin back along the ground, the foot sole-up behind it
      leg.ankle.set(side * rig.hipX * 1.3, d.footH + 0.03 * d.stature * lq.lift, -S * 0.92 + lq.z)
      leg.pitch = -2.95
      leg.yaw = 0.1
      leg.pole.set(side * 0.15, -1, 0.7)
    }
    if (a) {
      a.ik = true
      a.wrist.set(side * d.shoulderX * 1.1, d.palm * 0.5 + 0.04 * d.stature * aq.lift, shoulderZ + 0.02 * d.stature + aq.z)
      a.pole.set(side * 0.3, 0, -1)
      a.hand.set(-1.2, 0, 0)
      a.curl = 0.15
      a.thumb = 0.2
    }
  }
}
