/**
 * The person skeleton: 30 bones, all with identity rotation in the bind pose (arms and legs hang straight down,
 * feet point +Z). Animation writes local quaternions; the bind pose positions come from the body dims.
 * Left is +X (a person facing +Z has their left hand on the viewer's right).
 */
import { Bone, Vector3 } from 'three'
import type { BodyDims } from './body'

export const B = {
  root: 0,
  hips: 1,
  spine: 2,
  chest: 3,
  neck: 4,
  head: 5,
  jaw: 6,
  eyeL: 7,
  eyeR: 8,
  lidL: 9,
  lidR: 10,
  thighL: 11,
  shinL: 12,
  footL: 13,
  thighR: 14,
  shinR: 15,
  footR: 16,
  armL: 17,
  foreL: 18,
  handL: 19,
  fingersL: 20,
  thumbL: 21,
  armR: 22,
  foreR: 23,
  handR: 24,
  fingersR: 25,
  thumbR: 26,
  cape: 27,
  apronF: 28,
  apronB: 29,
} as const
export type BoneName = keyof typeof B
export const BONE_COUNT = 30
const NAMES = Object.keys(B) as BoneName[]

const PARENT: Record<Exclude<BoneName, 'root'>, BoneName> = {
  hips: 'root',
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  jaw: 'head',
  eyeL: 'head',
  eyeR: 'head',
  lidL: 'head',
  lidR: 'head',
  thighL: 'hips',
  shinL: 'thighL',
  footL: 'shinL',
  thighR: 'hips',
  shinR: 'thighR',
  footR: 'shinR',
  armL: 'chest',
  foreL: 'armL',
  handL: 'foreL',
  fingersL: 'handL',
  thumbL: 'handL',
  armR: 'chest',
  foreR: 'armR',
  handR: 'foreR',
  fingersR: 'handR',
  thumbR: 'handR',
  cape: 'chest',
  apronF: 'hips',
  apronB: 'hips',
}

export function parentOf(i: number): number {
  const name = NAMES[i]
  if (!name || name === 'root') return -1
  return B[PARENT[name]]
}

/** absolute bind positions of every bone (body space, feet at y = 0) */
export function bindPositions(d: BodyDims): Vector3[] {
  const abs = new Array<Vector3>(BONE_COUNT)
  const set = (n: BoneName, x: number, y: number, z: number): void => {
    abs[B[n]] = new Vector3(x, y, z)
  }
  set('root', 0, 0, 0)
  set('hips', 0, d.hipY, 0)
  set('spine', 0, d.waistY, 0)
  set('chest', 0, d.chestY, 0)
  set('neck', 0, d.topY, d.neckZ)
  set('head', 0, d.chinY + d.ry * 0.25, d.neckZ)
  set('jaw', 0, d.headCy + d.jawPivot.y, d.jawPivot.z)
  set('eyeL', d.eyeX, d.headCy + d.eyeY, d.eyeZ)
  set('eyeR', -d.eyeX, d.headCy + d.eyeY, d.eyeZ)
  set('lidL', d.eyeX, d.headCy + d.eyeY, d.eyeZ)
  set('lidR', -d.eyeX, d.headCy + d.eyeY, d.eyeZ)
  for (const s of [1, -1] as const) {
    const L = s > 0
    set(L ? 'thighL' : 'thighR', s * d.hipX, d.hipY, 0)
    set(L ? 'shinL' : 'shinR', s * d.hipX, d.hipY - d.thigh, 0)
    set(L ? 'footL' : 'footR', s * d.hipX, d.ankleY, 0)
    set(L ? 'armL' : 'armR', s * d.shoulderX, d.shoulderJointY, 0)
    set(L ? 'foreL' : 'foreR', s * d.shoulderX, d.shoulderJointY - d.upperArm, 0)
    const wristY = d.shoulderJointY - d.upperArm - d.foreArm
    set(L ? 'handL' : 'handR', s * d.shoulderX, wristY, 0)
    set(L ? 'fingersL' : 'fingersR', s * d.shoulderX, wristY - d.palm, 0)
    set(L ? 'thumbL' : 'thumbR', s * (d.shoulderX - d.handW * 0.15), wristY - d.palm * 0.3, d.handW * 0.32)
  }
  set('cape', 0, d.shoulderY, -d.chestDepth * 0.8)
  set('apronF', 0, d.beltY, d.hipDepth)
  set('apronB', 0, d.beltY, -d.hipDepth)
  return abs
}

export function makeBones(abs: readonly Vector3[]): Bone[] {
  const bones = NAMES.map((name) => {
    const b = new Bone()
    b.name = name
    return b
  })
  for (let i = 0; i < BONE_COUNT; i++) {
    const bone = bones[i]
    const p = abs[i]
    if (!bone || !p) continue
    const pi = parentOf(i)
    const parent = pi >= 0 ? bones[pi] : undefined
    const pp = pi >= 0 ? abs[pi] : undefined
    if (parent && pp) {
      bone.position.copy(p).sub(pp)
      parent.add(bone)
    } else {
      bone.position.copy(p)
    }
  }
  return bones
}
