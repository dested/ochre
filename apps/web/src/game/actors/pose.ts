/**
 * The pose solver. An anim describes a pose in body terms (hip position, spine angles, ankle targets, arm
 * angles or wrist targets, where a held item should point); the solver turns it into local bone quaternions for
 * this particular body, so every anim works for an infant, a child and an elder alike. Legs and IK arms are
 * two-bone solves with a shared hinge axis; spine and head are FK.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { B, BONE_COUNT, parentOf } from './rig'

export type Pose = {
  /** hips bone position relative to the root */
  hip: Vector3
  /** local rotation per bone */
  q: Quaternion[]
}

export function makePose(): Pose {
  return { hip: new Vector3(), q: Array.from({ length: BONE_COUNT }, () => new Quaternion()) }
}

export function copyPose(src: Pose, dst: Pose): void {
  dst.hip.copy(src.hip)
  for (let i = 0; i < BONE_COUNT; i++) dst.q[i]?.copy(src.q[i] ?? IDQ)
}

/** dst = lerp(a, b, t) */
export function blendPose(a: Pose, b: Pose, t: number, dst: Pose): void {
  dst.hip.lerpVectors(a.hip, b.hip, t)
  for (let i = 0; i < BONE_COUNT; i++) {
    const qa = a.q[i]
    const qb = b.q[i]
    const qd = dst.q[i]
    if (qa && qb && qd) qd.slerpQuaternions(qa, qb, t)
  }
}

export type LegSpec = {
  /** ankle target, body space */
  ankle: Vector3
  /** toes up (+) / down (−), radians */
  pitch: number
  /** toe-out, radians (positive = outward for either foot) */
  yaw: number
  /** where the knee points, body space direction */
  pole: Vector3
}

export type ArmSpec = {
  ik: boolean
  // FK: anatomical angles (radians)
  flex: number
  abduct: number
  twist: number
  elbow: number
  // IK: wrist target (body space) and where the elbow points
  wrist: Vector3
  pole: Vector3
  // wrist relative to the forearm: flex (palm-ward), deviation, pronation
  hand: Vector3
  /** if set, the held item axis (hand +Z) points along aimAxis with the palm facing aimPalm (body space) */
  aim: boolean
  aimAxis: Vector3
  aimPalm: Vector3
  /** 0 open .. 1 fist */
  curl: number
  thumb: number
}

export type PoseSpec = {
  hip: Vector3
  /** pitch (x), yaw (y), roll (z) */
  hipRot: Vector3
  spine: Vector3
  chest: Vector3
  neck: Vector3
  head: Vector3
  jaw: number
  /** [left, right] */
  legs: [LegSpec, LegSpec]
  arms: [ArmSpec, ArmSpec]
}

function legSpec(): LegSpec {
  return { ankle: new Vector3(), pitch: 0, yaw: 0, pole: new Vector3(0, 0, 1) }
}
function armSpec(): ArmSpec {
  return {
    ik: false,
    flex: 0,
    abduct: 0.1,
    twist: 0,
    elbow: 0.15,
    wrist: new Vector3(),
    pole: new Vector3(0, 0, -1),
    hand: new Vector3(),
    aim: false,
    aimAxis: new Vector3(0, 1, 0),
    aimPalm: new Vector3(1, 0, 0),
    curl: 0.25,
    thumb: 0.2,
  }
}

export function makeSpec(): PoseSpec {
  return {
    hip: new Vector3(),
    hipRot: new Vector3(),
    spine: new Vector3(),
    chest: new Vector3(),
    neck: new Vector3(),
    head: new Vector3(),
    jaw: 0,
    legs: [legSpec(), legSpec()],
    arms: [armSpec(), armSpec()],
  }
}

/** reset a spec to a neutral stand for a body (arms relaxed, feet under the hips) */
export function resetSpec(s: PoseSpec, rig: RigInfo): void {
  s.hip.set(0, rig.hipY, 0)
  s.hipRot.set(0, 0, 0)
  s.spine.set(0, 0, 0)
  s.chest.set(0, 0, 0)
  s.neck.set(0, 0, 0)
  s.head.set(0, 0, 0)
  s.jaw = 0
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1
    const l = s.legs[i]
    const a = s.arms[i]
    if (!l || !a) continue
    l.ankle.set(side * rig.hipX, rig.ankleY, 0)
    l.pitch = 0
    l.yaw = 0.1
    l.pole.set(side * 0.15, 0, 1)
    a.ik = false
    a.flex = 0
    a.abduct = 0.1
    a.twist = 0
    a.elbow = 0.15
    a.hand.set(0, 0, 0)
    a.aim = false
    a.curl = 0.25
    a.thumb = 0.2
  }
}

/** the body facts the solver and anims need */
export type RigInfo = {
  bind: readonly Vector3[]
  hipY: number
  hipX: number
  ankleY: number
  thigh: number
  shin: number
  upperArm: number
  foreArm: number
  stature: number
}

const IDQ = new Quaternion()
const _e = new Euler()
const _m = new Matrix4()
const _x = new Vector3()
const _y = new Vector3()
const _z = new Vector3()
const _d = new Vector3()
const _t = new Vector3()
const _mid = new Vector3()
const _qi = new Quaternion()
const _qa = new Quaternion()

function eulerQ(v: Vector3, order: 'YXZ' | 'XYZ' | 'ZXY', out: Quaternion): Quaternion {
  return out.setFromEuler(_e.set(v.x, v.y, v.z, order))
}

/** quaternion of the basis whose Y axis is `y` and whose Z axis leans toward `zHint` */
function basisYZ(y: Vector3, zHint: Vector3, out: Quaternion): Quaternion {
  _y.copy(y).normalize()
  _z.copy(zHint).addScaledVector(_y, -zHint.dot(_y))
  if (_z.lengthSq() < 1e-10) _z.set(0, 0, 1).addScaledVector(_y, -_y.z)
  _z.normalize()
  _x.crossVectors(_y, _z)
  _m.makeBasis(_x, _y, _z)
  return out.setFromRotationMatrix(_m)
}

/** quaternion of the basis with the given X (hinge) and Y axes */
function basisXY(x: Vector3, y: Vector3, out: Quaternion): Quaternion {
  _y.copy(y).normalize()
  _x.copy(x).addScaledVector(_y, -x.dot(_y)).normalize()
  _z.crossVectors(_x, _y)
  _m.makeBasis(_x, _y, _z)
  return out.setFromRotationMatrix(_m)
}

/** two-bone IK: the middle joint position for root R, target T, lengths a, b, bending toward pole */
function solveMid(R: Vector3, T: Vector3, a: number, b: number, pole: Vector3, out: Vector3): void {
  _d.subVectors(T, R)
  const dist = _d.length()
  if (dist < 1e-6) {
    out.copy(R).addScaledVector(pole, a)
    return
  }
  _d.divideScalar(dist)
  const dd = Math.min(Math.max(dist, Math.abs(a - b) + 1e-4), (a + b) * 0.9995)
  const ca = (a * a + dd * dd - b * b) / (2 * a * dd)
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca))
  _t.copy(pole).addScaledVector(_d, -pole.dot(_d))
  if (_t.lengthSq() < 1e-10) _t.set(0, 0, 1).addScaledVector(_d, -_d.z)
  _t.normalize()
  out.copy(R).addScaledVector(_d, a * ca).addScaledVector(_t, a * sa)
}

export class Solver {
  /** body-space orientation and position per bone (valid after solve) */
  readonly Q: Quaternion[] = Array.from({ length: BONE_COUNT }, () => new Quaternion())
  readonly P: Vector3[] = Array.from({ length: BONE_COUNT }, () => new Vector3())
  private off: Vector3[]
  private rig: RigInfo
  private tmpQ = new Quaternion()
  private tmpV = new Vector3()
  private knee = new Vector3()
  private hingeX = new Vector3()

  constructor(rig: RigInfo) {
    this.rig = rig
    this.off = rig.bind.map((p, i) => {
      const pi = parentOf(i)
      const pp = pi >= 0 ? rig.bind[pi] : undefined
      return pp ? p.clone().sub(pp) : p.clone()
    })
  }

  private fk(b: number, parent: number, local: Quaternion, out: Pose): void {
    const Qp = this.Q[parent]
    const Pp = this.P[parent]
    const off = this.off[b]
    const Q = this.Q[b]
    const P = this.P[b]
    if (!Qp || !Pp || !off || !Q || !P) return
    P.copy(off).applyQuaternion(Qp).add(Pp)
    Q.multiplyQuaternions(Qp, local)
    out.q[b]?.copy(local)
  }

  /** set body-space orientation Qb for bone b; writes its local rotation */
  private setWorld(b: number, parent: number, Qb: Quaternion, out: Pose): void {
    const Qp = this.Q[parent]
    const Pp = this.P[parent]
    const off = this.off[b]
    const Q = this.Q[b]
    const P = this.P[b]
    if (!Qp || !Pp || !off || !Q || !P) return
    P.copy(off).applyQuaternion(Qp).add(Pp)
    Q.copy(Qb)
    out.q[b]?.copy(_qi.copy(Qp).invert().multiply(Qb))
  }

  solve(s: PoseSpec, out: Pose): void {
    const rig = this.rig
    const Q = this.Q
    const P = this.P
    Q[B.root]?.identity()
    P[B.root]?.set(0, 0, 0)
    out.q[B.root]?.identity()
    // hips
    out.hip.copy(s.hip)
    P[B.hips]?.copy(s.hip)
    const Qh = Q[B.hips]
    if (Qh) eulerQ(s.hipRot, 'YXZ', Qh)
    out.q[B.hips]?.copy(Qh ?? IDQ)
    // spine chain
    this.fk(B.spine, B.hips, eulerQ(s.spine, 'YXZ', this.tmpQ), out)
    this.fk(B.chest, B.spine, eulerQ(s.chest, 'YXZ', this.tmpQ), out)
    this.fk(B.neck, B.chest, eulerQ(s.neck, 'YXZ', this.tmpQ), out)
    this.fk(B.head, B.neck, eulerQ(s.head, 'YXZ', this.tmpQ), out)
    this.fk(B.jaw, B.head, this.tmpQ.setFromAxisAngle(AX, s.jaw), out)
    for (const b of [B.eyeL, B.eyeR, B.lidL, B.lidR]) this.fk(b, B.head, IDQ, out)
    this.fk(B.cape, B.chest, IDQ, out)
    this.fk(B.apronF, B.hips, IDQ, out)
    this.fk(B.apronB, B.hips, IDQ, out)

    // legs
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1
      const leg = s.legs[i]
      if (!leg) continue
      const thigh = i === 0 ? B.thighL : B.thighR
      const shin = i === 0 ? B.shinL : B.shinR
      const foot = i === 0 ? B.footL : B.footR
      const Ph = P[B.hips]
      const offT = this.off[thigh]
      const Pt = P[thigh]
      if (!Ph || !offT || !Pt || !Qh) continue
      Pt.copy(offT).applyQuaternion(Qh).add(Ph)
      solveMid(Pt, leg.ankle, rig.thigh, rig.shin, leg.pole, this.knee)
      basisYZ(this.tmpV.subVectors(Pt, this.knee), leg.pole, _qa)
      this.setWorld(thigh, B.hips, _qa, out)
      this.hingeX.set(1, 0, 0).applyQuaternion(_qa)
      basisXY(this.hingeX, this.tmpV.subVectors(this.knee, leg.ankle), _qa)
      this.setWorld(shin, thigh, _qa, out)
      _qa.setFromEuler(_e.set(-leg.pitch, side * leg.yaw, 0, 'YXZ'))
      // feet follow the hips' yaw so a turned pelvis turns the feet
      this.setWorld(foot, shin, _qa, out)
    }

    // arms
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1
      const arm = s.arms[i]
      if (!arm) continue
      const ua = i === 0 ? B.armL : B.armR
      const fa = i === 0 ? B.foreL : B.foreR
      const hb = i === 0 ? B.handL : B.handR
      const fb = i === 0 ? B.fingersL : B.fingersR
      const tb = i === 0 ? B.thumbL : B.thumbR
      if (!arm.ik) {
        _qa.setFromAxisAngle(AZ, side * arm.abduct)
        _qa.multiply(this.tmpQ.setFromAxisAngle(AX, -arm.flex))
        _qa.multiply(this.tmpQ.setFromAxisAngle(AY, side * arm.twist))
        this.fk(ua, B.chest, _qa, out)
        this.fk(fa, ua, this.tmpQ.setFromAxisAngle(AX, -arm.elbow), out)
      } else {
        const Pc = P[B.chest]
        const Qc = Q[B.chest]
        const offA = this.off[ua]
        const Pa = P[ua]
        if (!Pc || !Qc || !offA || !Pa) continue
        Pa.copy(offA).applyQuaternion(Qc).add(Pc)
        solveMid(Pa, arm.wrist, rig.upperArm, rig.foreArm, arm.pole, this.knee)
        // the upper arm's Z leans toward where the forearm goes
        _t.subVectors(arm.wrist, this.knee)
        _mid.subVectors(Pa, this.knee)
        basisYZ(_mid, _t.lengthSq() > 1e-8 ? _t : this.tmpV.copy(arm.pole).negate(), _qa)
        this.setWorld(ua, B.chest, _qa, out)
        this.hingeX.set(1, 0, 0).applyQuaternion(_qa)
        basisXY(this.hingeX, this.tmpV.subVectors(this.knee, arm.wrist), _qa)
        this.setWorld(fa, ua, _qa, out)
      }
      if (arm.aim) {
        // hand +Z along the item axis, palm (−side·X) toward aimPalm
        _z.copy(arm.aimAxis).normalize()
        _x.copy(arm.aimPalm).multiplyScalar(-side)
        _x.addScaledVector(_z, -_x.dot(_z))
        if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0)
        _x.normalize()
        _y.crossVectors(_z, _x)
        _m.makeBasis(_x, _y, _z)
        _qa.setFromRotationMatrix(_m)
        this.setWorld(hb, fa, _qa, out)
      } else {
        _qa.setFromEuler(_e.set(arm.hand.x, side * arm.hand.y, side * arm.hand.z, 'XYZ'))
        this.fk(hb, fa, _qa, out)
      }
      // fingers curl toward the palm (−side·X), the thumb across it
      this.fk(fb, hb, this.tmpQ.setFromAxisAngle(AZ, -side * arm.curl * 1.45), out)
      _qa.setFromAxisAngle(AZ, -side * arm.thumb * 0.7).multiply(this.tmpQ.setFromAxisAngle(AY, side * arm.thumb * 0.5))
      this.fk(tb, hb, _qa, out)
    }
  }
}

const AX = new Vector3(1, 0, 0)
const AY = new Vector3(0, 1, 0)
const AZ = new Vector3(0, 0, 1)
