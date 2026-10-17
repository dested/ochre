/**
 * Procedural anims: each writes a PoseSpec for one body at one moment. No clips. Locomotion is a planted-foot
 * gait (adapted from celworld's chars/walk.ts, Sal's engine): feet slide back exactly at ground speed during
 * stance and arc forward in swing, the pelvis bobs, sways and yaws, the chest counter-rotates. Stride length
 * follows the Froude number, so a child takes quick short steps and an adult long ones at the same speed.
 */
import type { CarrySlot, HeldItem, PersonAnim } from '../contracts'
import type { BodyDims } from './body'
import { clamp, lerp, smooth } from './geo'
import type { ArmSpec, PoseSpec, RigInfo } from './pose'
import { resetSpec } from './pose'

const TAU = Math.PI * 2
const frac = (x: number): number => x - Math.floor(x)

export type AnimCtx = {
  rig: RigInfo
  d: BodyDims
  /** seconds since the actor was made */
  t: number
  /** locomotion cycle phase 0..1 (0 = left heel strike) */
  phase: number
  /** cycle frequency (cycles per second) the phase is advancing at */
  freq: number
  speed: number
  held: readonly [HeldItem, HeldItem]
  /** what this person carries (as carrier) */
  carrying: CarrySlot | null
  /** how this person is carried (as the child) */
  carriedIn: CarrySlot | null
  /** 0..1 per-person variety */
  jit: number
  /** which locomotion pose to write while moving: 0 the walk, 1 the run (the actor blends the two) */
  runK: number
}

/* ─── gait ─────────────────────────────────────────────────────────────────────────────────────────────── */

export type Gait = { freq: number; duty: number; run: number }

/** cycle frequency and run weight for a ground speed */
export function gaitFor(d: BodyDims, speed: number): Gait {
  const legL = d.thigh + d.shin
  const v = Math.max(0.05, speed)
  const fr = (v * v) / (9.81 * legL)
  // relative stride (cycle length / leg length) ≈ 2.3·Fr^0.3 (Alexander), a touch shorter for small bodies
  const rel = 2.3 * fr ** 0.3 * lerp(0.82, 1, d.maturity)
  const stride = Math.max(0.2, rel * legL)
  const runV = Math.sqrt(9.81 * legL) * 0.78
  const run = smooth(runV * 0.82, runV * 1.12, v)
  return { freq: v / stride, duty: lerp(0.62, 0.36, run), run }
}

function poseGait(c: AnimCtx, s: PoseSpec, runK: number): void {
  const { d, rig } = c
  const p = c.phase
  const legL = rig.thigh + rig.shin
  const duty = runK > 0.5 ? 0.36 : 0.62
  const f = Math.max(0.3, c.freq)
  const speed = Math.max(0.02, c.speed)
  const Ls = (speed * duty) / f
  const half = Ls / 2
  const elderK = d.elder
  const childK = 1 - d.maturity
  const run = runK > 0.5
  const bob = (run ? 0.045 : 0.022) * legL * (1 + childK * 0.5) * (1 - elderK * 0.4)
  const lift = (run ? 0.28 : 0.11) * legL * (1 - elderK * 0.4)
  const sway = Math.min(rig.hipX * (run ? 0.25 : 0.55), 0.06 * legL)
  const footX = rig.hipX * (run ? 0.55 : 0.82)
  const reach = 0.975 * legL
  const lateral = sway + rig.hipX - footX
  const budget = Math.sqrt(Math.max(0, reach * reach - lateral * lateral))
  const hipH = rig.ankleY + Math.min(budget * (run ? 0.94 : 0.985), Math.sqrt(Math.max(0, budget * budget - half * half)) + bob * (run ? 0.2 : 0.85))
  const pm = p - duty / 2
  const up = 0.5 + 0.5 * Math.cos(2 * TAU * pm)
  const hipYaw = (run ? 0.1 : 0.12) * (1 - elderK * 0.5)
  const hipRoll = run ? 0.03 : 0.045
  const lean = run ? 0.16 + 0.04 * clamp(speed / 5, 0, 1) : 0.03 + 0.02 * clamp(speed / 1.6, 0, 1)
  const yaw = -hipYaw * Math.cos(TAU * p)
  const roll = hipRoll * Math.cos(TAU * pm)
  s.hip.set(sway * Math.cos(TAU * pm), run ? hipH - bob * up : hipH - bob * (1 - up), 0)
  s.hipRot.set(lean * 0.4, yaw, roll)
  s.spine.set(lean * 0.6 + (run ? 0.04 * up : 0.015 * (1 - up)), -yaw * 0.55, -roll * 0.5)
  s.chest.set(lean * 0.3, -yaw * 0.7, -roll * 0.6)
  s.neck.set(-lean * 0.45, yaw * 0.15, 0)
  s.head.set(-lean * 0.5 - 0.02 * Math.cos(2 * TAU * pm), yaw * 0.25, roll * 0.3)

  const heelK = 0.1 + 0.25 * (Ls / legL)
  const toeK = 0.25 + 0.4 * (Ls / legL)
  const toe = d.footLen * 0.7
  const heel = d.footLen * 0.22
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const leg = s.legs[i]
    if (!leg) continue
    const q = frac(p + (i === 0 ? 0 : 0.5))
    let z: number
    let y = rig.ankleY
    let pitch: number
    if (q < duty) {
      const u = q / duty
      z = half - Ls * u
      pitch = u < 0.12 ? heelK * (1 - u / 0.12) ** 2 : u > 0.6 ? -toeK * ((u - 0.6) / 0.4) ** 1.6 : 0
    } else {
      const u = (q - duty) / (1 - duty)
      z = -half + Ls * (0.5 - 0.5 * Math.cos(Math.PI * u))
      // running: the heel kicks up behind before the knee drives forward
      const arc = run ? Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 + 0.4 * Math.sin(Math.PI * u * 0.8)) : Math.sin(Math.PI * Math.min(1, u * 1.08))
      y += lift * arc
      if (run) z -= Ls * 0.18 * Math.sin(Math.PI * u) * (1 - u)
      pitch = lerp(-toeK, heelK, smooth(0, 1, u))
    }
    y += (pitch < 0 ? toe : heel) * Math.sin(Math.abs(pitch)) * 0.85
    leg.ankle.set(side * footX, y, z)
    leg.pitch = pitch
    leg.yaw = run ? 0.04 : 0.08
    leg.pole.set(side * 0.12, 0, 1)
  }

  const swingAmp = (run ? 0.75 : 0.32 + 0.1 * clamp(speed - 1, 0, 1)) * (1 - elderK * 0.5)
  const swing = swingAmp * Math.cos(TAU * (p - 0.04))
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const a = s.arms[i]
    if (!a) continue
    const sw = -swing * side
    const forward = Math.max(0, sw / Math.max(swingAmp, 1e-3))
    a.ik = false
    a.flex = sw + (run ? 0.15 : 0)
    a.abduct = run ? 0.18 : 0.1 + 0.03 * (1 - up)
    a.twist = 0
    a.elbow = run ? 1.45 + 0.25 * forward : 0.18 + 0.4 * forward
    a.hand.set(run ? 0.1 : -0.1 * forward, 0, 0)
    a.curl = run ? 0.65 : 0.3
    a.thumb = run ? 0.5 : 0.2
  }
}

/* ─── standing ─────────────────────────────────────────────────────────────────────────────────────────── */

function poseIdle(c: AnimCtx, s: PoseSpec): void {
  const { d, rig, t } = c
  const H = rig.stature
  const lively = 1 + (1 - d.maturity) * 0.8
  const w = Math.sin(t * TAU * 0.065 * lively + c.jit * 6)
  const breath = Math.sin(t * TAU * (0.24 + 0.1 * (1 - d.maturity)))
  const sway = 0.012 * H * w
  s.hip.set(sway, rig.hipY - 0.006 * H - 0.004 * H * Math.abs(w), 0)
  s.hipRot.set(0.02, 0.04 * w, -0.035 * w)
  s.spine.set(0.02 + 0.008 * breath, -0.02 * w, 0.02 * w)
  s.chest.set(-0.03 - 0.012 * breath, -0.02 * w, 0.015 * w)
  s.neck.set(0.02, 0.06 * Math.sin(t * 0.37 + c.jit * 3), 0)
  s.head.set(0.01 + 0.02 * Math.sin(t * 0.29 + 1), 0.08 * Math.sin(t * 0.21 + c.jit * 9), 0.02 * w)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const leg = s.legs[i]
    const a = s.arms[i]
    if (!leg || !a) continue
    // the loaded leg straightens; the other knee eases forward
    const load = side * w
    leg.ankle.set(side * rig.hipX * 1.05, rig.ankleY, 0.015 * H * (side > 0 ? 1 : -0.4))
    leg.pitch = 0
    leg.yaw = 0.14
    leg.pole.set(side * 0.2, 0, 1)
    void load
    a.ik = false
    a.flex = 0.04 + 0.015 * breath
    a.abduct = 0.11 + 0.01 * breath
    a.twist = 0.1
    a.elbow = 0.22
    a.hand.set(0.12, 0, 0.05)
    a.curl = 0.32
    a.thumb = 0.25
  }
}

/** an infant too young to stand: sitting propped, legs out */
function poseBabySit(c: AnimCtx, s: PoseSpec): void {
  const { rig, t } = c
  const H = rig.stature
  s.hip.set(0, rig.ankleY * 0.5 + 0.1 * H, 0)
  s.hipRot.set(-0.15, 0, 0)
  s.spine.set(0.2, 0, 0)
  s.chest.set(0.05, 0, 0)
  s.neck.set(-0.1, 0.2 * Math.sin(t * 0.4), 0)
  s.head.set(-0.1 + 0.05 * Math.sin(t * 0.7), 0.25 * Math.sin(t * 0.3), 0)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const leg = s.legs[i]
    const a = s.arms[i]
    if (!leg || !a) continue
    leg.ankle.set(side * rig.hipX * 2.2, rig.ankleY, (rig.thigh + rig.shin) * 0.75)
    leg.pitch = 0.6
    leg.yaw = 0.5
    leg.pole.set(side * 1, 0.6, 0.3)
    a.flex = 0.6 + 0.2 * Math.sin(t * 1.3 + side)
    a.abduct = 0.3
    a.elbow = 0.6
    a.curl = 0.4
  }
}

function poseCrouch(c: AnimCtx, s: PoseSpec, gather: boolean): void {
  const { rig, t, d } = c
  const legL = rig.thigh + rig.shin
  const H = rig.stature
  const breath = Math.sin(t * TAU * 0.25)
  const hipY = rig.ankleY + legL * lerp(0.42, 0.5, d.elder)
  s.hip.set(0, hipY + 0.004 * H * breath, -0.06 * legL)
  s.hipRot.set(0.25, 0, 0)
  s.spine.set(0.32 + (gather ? 0.15 : 0), 0, 0)
  s.chest.set(0.12 + (gather ? 0.1 : 0) + 0.01 * breath, 0, 0)
  s.neck.set(-0.15, 0, 0)
  s.head.set(gather ? 0.35 : -0.25, 0, 0)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const leg = s.legs[i]
    const a = s.arms[i]
    if (!leg || !a) continue
    leg.ankle.set(side * rig.hipX * 1.45, rig.ankleY, 0.1 * legL)
    leg.pitch = 0
    leg.yaw = 0.35
    leg.pole.set(side * 0.55, 0.3, 1)
    a.ik = false
    a.flex = 0.75
    a.abduct = 0.22
    a.twist = 0.2
    a.elbow = 0.55
    a.hand.set(0.35, 0, 0)
    a.curl = 0.35
  }
  if (gather) {
    // the right hand picks from the ground and drops into the left hand's bag, over and over
    const cyc = frac(t / 2.3 + c.jit)
    const reach = cyc < 0.55 ? smooth(0, 0.3, cyc) * smooth(0.55, 0.38, cyc) : 0
    const toBag = cyc >= 0.55 ? Math.sin(Math.PI * (cyc - 0.55) / 0.45) : 0
    const r = s.arms[1]
    const l = s.arms[0]
    if (r && l) {
      r.ik = true
      const spot = Math.floor(t / 2.3 + c.jit) % 3
      const gx = -0.08 * legL + (spot - 1) * 0.07 * legL
      r.wrist.set(lerp(-0.18 * legL, gx, reach) + toBag * 0.12 * legL, lerp(hipY * 0.75, rig.ankleY * 0.9 + 0.02, reach) + toBag * 0.1 * legL, lerp(0.3 * legL, 0.55 * legL, reach))
      r.pole.set(-0.6, -0.3, -1)
      r.hand.set(0.5 * reach, 0, 0)
      r.curl = 0.25 + 0.6 * (cyc > 0.32 && cyc < 0.7 ? 1 : 0)
      l.flex = 0.85
      l.elbow = 0.9
      l.curl = 0.7
    }
    s.head.y = -0.15
  }
}

function poseSit(c: AnimCtx, s: PoseSpec): void {
  const { rig, t, d } = c
  const legL = rig.thigh + rig.shin
  const H = rig.stature
  const breath = Math.sin(t * TAU * 0.22)
  const seat = 0.075 * H
  s.hip.set(0, seat, -0.05 * legL)
  s.hipRot.set(-0.12, 0, 0)
  s.spine.set(0.22 + 0.1 * d.elder + 0.008 * breath, 0, 0)
  s.chest.set(0.05 - 0.012 * breath, 0, 0)
  s.neck.set(0, 0.1 * Math.sin(t * 0.23 + c.jit * 4), 0)
  s.head.set(-0.05, 0.1 * Math.sin(t * 0.17 + c.jit * 7), 0)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const leg = s.legs[i]
    const a = s.arms[i]
    if (!leg || !a) continue
    // cross-legged: knees out, ankles crossed in front
    leg.ankle.set(-side * rig.hipX * 0.9, rig.ankleY * 0.9, 0.55 * legL)
    leg.pitch = 0.15
    leg.yaw = -0.9
    leg.pole.set(side * 1, 0.55, 0.45)
    a.ik = true
    a.wrist.set(side * rig.hipX * 2.2, seat + 0.2 * legL, 0.42 * legL)
    a.pole.set(side * 0.7, -0.4, -0.6)
    a.hand.set(0.5, 0, 0.1)
    a.curl = 0.35
  }
}

/** carrying something or someone: the upper body only; legs come from the base anim */
function carryArms(c: AnimCtx, s: PoseSpec): void {
  const { rig, d } = c
  const H = rig.stature
  const l = s.arms[0]
  const r = s.arms[1]
  if (!l || !r) return
  const chestZ = d.chestDepth
  if (c.carrying === 'back') {
    // one hand holds the strap at the chest
    l.ik = true
    l.wrist.set(d.shoulderW * 0.25, d.chestY + 0.02 * H, chestZ + 0.05 * H)
    l.pole.set(0.6, -0.5, -0.5)
    l.hand.set(0.3, 0, 0)
    l.curl = 0.75
    s.spine.x += 0.06
  } else if (c.carrying === 'hip') {
    l.ik = true
    l.wrist.set(d.hipW * 0.6, d.waistY - 0.02 * H, chestZ * 0.9)
    l.pole.set(0.8, -0.2, -0.4)
    l.curl = 0.5
    s.hipRot.z += 0.06
    s.hip.x += 0.015 * H
    s.spine.z -= 0.05
  } else {
    // in the arms, or a load in front
    for (const a of [l, r]) {
      const side = a === l ? 1 : -1
      a.ik = true
      a.wrist.set(side * d.chestW * 0.35, d.waistY + 0.04 * H, chestZ + 0.12 * H)
      a.pole.set(side * 0.9, -0.3, -0.3)
      a.hand.set(0.2, side * 0.3, 0)
      a.curl = 0.5
    }
    s.spine.x -= 0.04
    s.chest.x -= 0.03
  }
}

/** the carried child: legs round the carrier, arms forward */
function poseHeld(c: AnimCtx, s: PoseSpec): void {
  const { rig, t } = c
  const legL = rig.thigh + rig.shin
  const slot = c.carriedIn ?? 'back'
  s.hip.set(0, rig.hipY, 0)
  s.hipRot.set(slot === 'arms' ? -0.2 : 0.05, 0, 0)
  s.spine.set(0.08, 0, 0)
  s.chest.set(0.04, 0, 0)
  s.neck.set(-0.1, 0.15 * Math.sin(t * 0.31), 0)
  s.head.set(-0.15 + 0.05 * Math.sin(t * 0.53), 0.3 * Math.sin(t * 0.23 + 1), 0.05)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const leg = s.legs[i]
    const a = s.arms[i]
    if (!leg || !a) continue
    if (slot === 'back' || slot === 'hip') {
      // straddling: thighs forward and out, knees bent
      leg.ankle.set(side * rig.hipX * 3.2, rig.hipY - legL * 0.55, legL * 0.45)
      leg.pole.set(side * 1.2, 0.2, 0.6)
    } else {
      leg.ankle.set(side * rig.hipX * 1.4, rig.hipY - legL * 0.35, legL * 0.65)
      leg.pole.set(side * 0.3, 0.6, 0.8)
    }
    leg.pitch = 0.3
    leg.yaw = 0.3
    a.ik = false
    a.flex = slot === 'back' ? 0.9 + 0.1 * Math.sin(t * 0.9 + side) : 0.6
    a.abduct = 0.4
    a.twist = 0.3
    a.elbow = 0.9
    a.curl = 0.55
  }
}

/* ─── held items ───────────────────────────────────────────────────────────────────────────────────────── */

function holdItems(c: AnimCtx, s: PoseSpec, anim: PersonAnim, moving: boolean): void {
  const { d, rig } = c
  const H = rig.stature
  for (let i = 0; i < 2; i++) {
    const item = c.held[i]
    const a: ArmSpec | undefined = s.arms[i]
    if (!item || item === 'none' || !a) continue
    const side = i === 0 ? 1 : -1
    a.curl = 0.88
    a.thumb = 0.7
    const standing = anim === 'idle' || anim === 'talk' || anim === 'walk' || anim === 'run' || anim === 'carry'
    if (!standing) continue
    if (item === 'spear' || item === 'digging-stick') {
      if (!moving) {
        // butt on the ground by the foot, held upright at chest height
        a.ik = true
        a.wrist.set(side * (d.shoulderX + 0.05 * H), d.shoulderJointY - rig.upperArm * 0.62, 0.11 * H)
        a.pole.set(side * 0.5, -0.4, -1)
        a.aim = true
        a.aimAxis.set(side * 0.04, 1, 0.06)
        a.aimPalm.set(-side, 0, 0)
      } else {
        // carried at a slant, point forward and up
        a.ik = false
        a.flex = 0.3 + a.flex * 0.25
        a.elbow = 1.05
        a.abduct = 0.14
        a.aim = true
        a.aimAxis.set(side * 0.05, 0.75, 0.66)
        a.aimPalm.set(-side, 0, 0)
      }
    } else if (item === 'stick') {
      // an elder's staff, planted ahead
      a.ik = true
      const step = moving ? Math.sin(TAU * c.phase) * 0.04 * H : 0
      a.wrist.set(side * (d.shoulderX + 0.06 * H), d.hipY + 0.03 * H, 0.14 * H + step)
      a.pole.set(side * 0.6, -0.3, -1)
      a.aim = true
      a.aimAxis.set(side * 0.05, 0.94, -0.32)
      a.aimPalm.set(-side * 0.3, 0, 1)
    } else if (item === 'shell' || item === 'corm' || item === 'stone' || item === 'ochre' || item === 'beads') {
      if (!moving) {
        a.flex = 0.55
        a.elbow = 1.35
        a.hand.set(-0.2, 0, -0.9)
        a.curl = 0.55
        a.thumb = 0.5
      }
    } else if (item === 'firebrand') {
      a.flex = 0.45
      a.elbow = 1.0
      a.aim = true
      a.aimAxis.set(side * 0.2, 0.8, 0.55)
      a.aimPalm.set(-side, 0, 0)
    }
  }
}

/* ─── entry ────────────────────────────────────────────────────────────────────────────────────────────── */

/** write the pose for `anim` (before the look/talk layers) */
export function poseAnim(anim: PersonAnim, c: AnimCtx, s: PoseSpec): void {
  resetSpec(s, c.rig)
  const moving = c.speed > 0.06
  const infant = c.d.age < 1.1
  let base: PersonAnim = anim
  if (c.carriedIn) base = 'held'
  switch (base) {
    case 'held':
      poseHeld(c, s)
      break
    case 'crouch':
      poseCrouch(c, s, false)
      break
    case 'gather':
    case 'dig':
    case 'scrape':
    case 'grind':
      poseCrouch(c, s, true)
      break
    case 'sit':
    case 'knap':
    case 'eat':
    case 'engrave':
    case 'sleep':
    case 'mourn':
    case 'tend-fire':
      poseSit(c, s)
      break
    case 'crawl':
      poseBabySit(c, s)
      break
    default: {
      // walk/run/idle and the upper-body anims share the locomotion legs
      if (infant) poseBabySit(c, s)
      else if (moving) poseGait(c, s, c.runK)
      else poseIdle(c, s)
      if (anim === 'carry' || c.carrying) carryArms(c, s)
    }
  }
  if (!c.carriedIn && !infant) holdItems(c, s, base, moving)
  // old age: a stoop, the head lifted to keep the gaze level, knees soft
  const e = c.d.elder
  if (e > 0 && base !== 'held') {
    s.spine.x += 0.1 * e
    s.chest.x += 0.1 * e
    s.neck.x += 0.12 * e
    s.head.x -= 0.22 * e
    s.hip.y -= 0.012 * c.rig.stature * e
  }
}
