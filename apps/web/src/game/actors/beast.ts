/**
 * The animal framework. Each kind is a Plan: a bone list in bind space (+Z forward, feet on y = 0), a geometry
 * builder (one body mesh in the shared gear material plus a detail mesh for eyes, horns, hooves and bills) and a
 * procedural pose for every AnimalAnim it knows. The actor here owns what they share: the skeleton, three detail
 * levels on a THREE.LOD (two draw calls at any distance), the gait phase, anim fades and the one-shot clock.
 */
import { Bone, Group, LOD, Quaternion, Skeleton, SkinnedMesh, Sphere, Vector3, type BufferGeometry } from 'three'
import type { AnimalActor, AnimalAnim, AnimalKind } from '../contracts'
import { Rng, mix32 } from '~/core/rng'
import { MeshBuilder, clamp, type SkinFn, type SkinW } from './geo'
import { actorMaterials } from './materials'

export type BoneDef = { name: string; parent: number; at: Vector3 }

/** a pose: the body bone's offset from its bind position, every bone's local rotation and scale */
export type AnimalPose = { off: Vector3; q: Quaternion[]; s: number[] }

export type AnimalCtx = {
  t: number
  /** gait phase in [0, 1), advanced by the plan's stride frequency */
  phase: number
  /** smoothed ground speed, m/s */
  speed: number
  /** seconds since the current anim was set (one-shots like 'fall' run on it) */
  animT: number
  /** a stable 0..1 per individual, to keep a herd out of step */
  jit: number
}

export type Plan = {
  bones: BoneDef[]
  /** build every part into the level's two builders (their q is the detail level) */
  build(body: MeshBuilder, detail: MeshBuilder): void
  /** strides per second for this anim at this speed, and a gait id (a change fades between gaits) */
  gait(anim: AnimalAnim, speed: number): { id: string; freq: number }
  pose(anim: AnimalAnim, c: AnimalCtx, k: Kin): void
  /** bounding sphere, bind space */
  bounds: Sphere
  /** camera distances where detail levels 1 and 2 start */
  lod: readonly [number, number]
}

export function makePose(n: number): AnimalPose {
  return { off: new Vector3(), q: Array.from({ length: n }, () => new Quaternion()), s: new Array<number>(n).fill(1) }
}

/* ─── kinematics ───────────────────────────────────────────────────────────────────────────────────────── */

const _a = new Vector3()
const _b = new Vector3()
const _d = new Vector3()
const _t = new Vector3()
const _m = new Vector3()
const _q = new Quaternion()
const _q2 = new Quaternion()

/**
 * Body-space FK and IK over a plan's bones. Bind rotations are identity, so a bone's local frame at rest is the
 * body frame and "point this bone along d" is a minimal rotation from its bind direction.
 */
export class Kin {
  readonly Q: Quaternion[]
  readonly P: Vector3[]
  readonly n: number
  private out: AnimalPose

  constructor(
    readonly bind: readonly Vector3[],
    readonly parent: readonly number[],
  ) {
    this.n = bind.length
    this.Q = Array.from({ length: this.n }, () => new Quaternion())
    this.P = Array.from({ length: this.n }, () => new Vector3())
    this.out = makePose(this.n)
  }

  /** where the next pose goes (the actor sets it before calling the plan) */
  writeTo(out: AnimalPose): void {
    this.out = out
  }

  /** start a pose: bone 0 is the ground root, bone 1 the body (moved by `off`, turned by `bodyQ`) */
  begin(off: Vector3, bodyQ: Quaternion): void {
    const out = this.out
    out.off.copy(off)
    for (const q of out.q) q.identity()
    out.s.fill(1)
    this.Q[0]?.identity()
    this.P[0]?.copy(this.bind[0] ?? _a.set(0, 0, 0))
    this.Q[1]?.copy(bodyQ)
    this.P[1]?.copy(this.bind[1] ?? _a.set(0, 0, 0)).add(off)
    out.q[1]?.copy(bodyQ)
  }

  /** bone b with a local rotation */
  fk(b: number, local: Quaternion): void {
    const p = this.parent[b] ?? 0
    const Qp = this.Q[p]
    const Pp = this.P[p]
    const Qb = this.Q[b]
    const Pb = this.P[b]
    const bb = this.bind[b]
    const bp = this.bind[p]
    if (!Qp || !Pp || !Qb || !Pb || !bb || !bp) return
    Qb.copy(Qp).multiply(local)
    Pb.copy(bb).sub(bp).applyQuaternion(Qp).add(Pp)
    this.out.q[b]?.copy(local)
  }

  /** bone b with a local rotation from Euler angles (YXZ: yaw, then pitch, then roll) */
  rot(b: number, x: number, y: number, z: number): void {
    this.fk(b, eq(x, y, z, _q))
  }

  /** bone b with a body-space orientation */
  setWorld(b: number, Qb: Quaternion): void {
    const p = this.parent[b] ?? 0
    const Qp = this.Q[p]
    if (!Qp) return
    this.fk(b, _q2.copy(Qp).invert().multiply(Qb))
  }

  /** orient bone b so its bind direction toward joint c points along `dir` (body space) */
  point(b: number, c: number, dir: Vector3): void {
    const bb = this.bind[b]
    const bc = this.bind[c]
    if (!bb || !bc) return
    _a.subVectors(bc, bb).normalize()
    _b.copy(dir).normalize()
    this.setWorld(b, _q.setFromUnitVectors(_a, _b))
  }

  /** orient bone b so the bind-space direction `from` points along `dir` (body space) */
  aim(b: number, from: Vector3, dir: Vector3): void {
    _a.copy(from).normalize()
    _b.copy(dir).normalize()
    this.setWorld(b, _q.setFromUnitVectors(_a, _b))
  }

  /**
   * Scale bone b (and with it everything skinned below it) about its joint: hides a folded wing or pulls a head
   * into its shell. FK positions ignore it, so use it on chains whose children are not posed by position.
   */
  scale(b: number, s: number): void {
    this.out.s[b] = Math.max(1e-4, s)
  }

  /** the posed position of bone b's joint (valid once b's parent is posed) */
  jointOf(b: number, out: Vector3): Vector3 {
    const p = this.parent[b] ?? 0
    const Qp = this.Q[p]
    const Pp = this.P[p]
    const bb = this.bind[b]
    const bp = this.bind[p]
    if (!Qp || !Pp || !bb || !bp) return out.set(0, 0, 0)
    return out.copy(bb).sub(bp).applyQuaternion(Qp).add(Pp)
  }

  /** a two-bone limb a → b → c reaching `target`, the middle joint bending toward `pole` */
  twoBone(a: number, b: number, c: number, target: Vector3, pole: Vector3): void {
    const ba = this.bind[a]
    const bb = this.bind[b]
    const bc = this.bind[c]
    if (!ba || !bb || !bc) return
    const la = ba.distanceTo(bb)
    const lb = bb.distanceTo(bc)
    const root = this.jointOf(a, _t)
    solveMid(root, target, la, lb, pole, _m)
    this.point(a, b, _d.subVectors(_m, root))
    this.point(b, c, _d.subVectors(target, _m))
  }
}

export function eq(x: number, y: number, z: number, out: Quaternion): Quaternion {
  const cx = Math.cos(x / 2)
  const sx = Math.sin(x / 2)
  const cy = Math.cos(y / 2)
  const sy = Math.sin(y / 2)
  const cz = Math.cos(z / 2)
  const sz = Math.sin(z / 2)
  // YXZ order, as Euler(x, y, z, 'YXZ')
  return out.set(sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz)
}

const _sd = new Vector3()
const _st = new Vector3()
function solveMid(R: Vector3, T: Vector3, a: number, b: number, pole: Vector3, out: Vector3): void {
  _sd.subVectors(T, R)
  const dist = _sd.length()
  if (dist < 1e-6) {
    out.copy(R).addScaledVector(pole, a)
    return
  }
  _sd.divideScalar(dist)
  const dd = Math.min(Math.max(dist, Math.abs(a - b) + 1e-4), (a + b) * 0.9995)
  const ca = (a * a + dd * dd - b * b) / (2 * a * dd)
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca))
  _st.copy(pole).addScaledVector(_sd, -pole.dot(_sd))
  if (_st.lengthSq() < 1e-10) _st.set(0, 0, 1).addScaledVector(_sd, -_sd.z)
  _st.normalize()
  out.copy(R).addScaledVector(_sd, a * ca).addScaledVector(_st, a * sa)
}

/* ─── skinning helpers ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Skin along a chain: bone i spans joints[i] → joints[i + 1]. A vertex takes the bone of the nearest segment and
 * blends into the neighbour over `blend` metres either side of each joint.
 */
export function chainSkin(bones: readonly number[], joints: readonly Vector3[], blend: number): SkinFn {
  const segs = bones.map((_, i) => {
    const a = joints[i] ?? new Vector3()
    const b = joints[i + 1] ?? a
    const d = new Vector3().subVectors(b, a)
    return { a, d, len: d.length(), l2: Math.max(1e-9, d.lengthSq()) }
  })
  const p = new Vector3()
  const w: SkinW = { b: [0, 0], w: [1, 0] }
  const bw = w.b as number[]
  const ww = w.w as number[]
  return (x, y, z) => {
    p.set(x, y, z)
    let best = 0
    let bestD = Infinity
    let bestAlong = 0
    segs.forEach((s, i) => {
      const t = clamp(_a.subVectors(p, s.a).dot(s.d) / s.l2, 0, 1)
      const dist = _b.copy(s.a).addScaledVector(s.d, t).distanceToSquared(p)
      if (dist < bestD) {
        bestD = dist
        best = i
        bestAlong = t * s.len
      }
    })
    const s = segs[best]
    const me = bones[best] ?? 0
    bw[0] = me
    ww[0] = 1
    bw[1] = me
    ww[1] = 0
    if (!s) return w
    const prev = bones[best - 1]
    const next = bones[best + 1]
    if (prev !== undefined && bestAlong < blend) {
      const k = 0.5 + 0.5 * (bestAlong / blend)
      bw[1] = prev
      ww[0] = k
      ww[1] = 1 - k
    } else if (next !== undefined && s.len - bestAlong < blend) {
      const k = 0.5 + 0.5 * ((s.len - bestAlong) / blend)
      bw[1] = next
      ww[0] = k
      ww[1] = 1 - k
    }
    return w
  }
}

/* ─── the actor ────────────────────────────────────────────────────────────────────────────────────────── */

const damp = (cur: number, target: number, rate: number, dt: number): number => cur + (target - cur) * (1 - Math.exp(-rate * dt))

function blendPose(a: AnimalPose, b: AnimalPose, t: number, dst: AnimalPose): void {
  dst.off.lerpVectors(a.off, b.off, t)
  for (let i = 0; i < dst.s.length; i++) dst.s[i] = (a.s[i] ?? 1) + ((b.s[i] ?? 1) - (a.s[i] ?? 1)) * t
  for (let i = 0; i < dst.q.length; i++) {
    const qa = a.q[i]
    const qb = b.q[i]
    const qd = dst.q[i]
    if (qa && qb && qd) qd.slerpQuaternions(qa, qb, t)
  }
}

function copyPose(src: AnimalPose, dst: AnimalPose): void {
  dst.off.copy(src.off)
  for (let i = 0; i < dst.s.length; i++) dst.s[i] = src.s[i] ?? 1
  for (let i = 0; i < dst.q.length; i++) {
    const s = src.q[i]
    if (s) dst.q[i]?.copy(s)
  }
}

type Built = { group: Group; bones: Bone[]; dispose(): void }

function buildRig(plan: Plan): Built {
  const n = plan.bones.length
  const bones = plan.bones.map((def) => {
    const b = new Bone()
    b.name = def.name
    return b
  })
  plan.bones.forEach((def, i) => {
    const bone = bones[i]
    if (!bone) return
    const parent = i > 0 ? bones[def.parent] : undefined
    const pp = plan.bones[def.parent]?.at
    if (parent && pp && i > 0) {
      bone.position.copy(def.at).sub(pp)
      parent.add(bone)
    } else bone.position.copy(def.at)
  })
  const group = new Group()
  group.name = 'animal-rig'
  const root = bones[0]
  if (root) group.add(root)
  group.updateMatrixWorld(true)
  const skeleton = new Skeleton(bones)
  const mats = actorMaterials()
  const geos: BufferGeometry[] = []
  const lod = new LOD()
  lod.name = 'animal-lod'
  const quality = [1, 0.45, 0.22]
  const starts = [0, plan.lod[0], plan.lod[1]]
  quality.forEach((q, i) => {
    const body = new MeshBuilder(q)
    const detail = new MeshBuilder(q)
    plan.build(body, detail)
    const level = new Group()
    for (const [mb, mat] of [
      [body, mats.gear],
      [detail, mats.detail],
    ] as const) {
      if (mb.vertexCount === 0) continue
      const geo = mb.build()
      geos.push(geo)
      const m = new SkinnedMesh(geo, mat)
      m.castShadow = true
      m.receiveShadow = true
      m.bind(skeleton)
      m.boundingSphere = plan.bounds.clone()
      level.add(m)
    }
    lod.addLevel(level, starts[i] ?? 0, 0.08)
  })
  group.add(lod)
  void n
  return {
    group,
    bones,
    dispose() {
      for (const g of geos) g.dispose()
      skeleton.dispose()
    },
  }
}

export class BeastActor implements AnimalActor {
  readonly object = new Group()
  private built: Built
  private kin: Kin
  private live: AnimalPose
  private poseA: AnimalPose
  private prev: AnimalPose
  private out: AnimalPose
  private anim: AnimalAnim = 'idle'
  private gaitId = ''
  private fade = 1
  private fadeDur = 0.3
  private speed = 0
  private speedS = 0
  private phase = 0
  private t = 0
  private animT = 0
  private jit: number
  private disposed = false

  constructor(
    readonly kind: AnimalKind,
    private plan: Plan,
    seed: number,
  ) {
    const rng = new Rng(mix32(seed, 0xa11a))
    this.jit = rng.next()
    this.phase = rng.next()
    this.t = rng.range(0, 30)
    this.built = buildRig(plan)
    this.object.name = `animal-${kind}`
    this.object.add(this.built.group)
    const n = plan.bones.length
    this.kin = new Kin(
      plan.bones.map((b) => b.at),
      plan.bones.map((b) => b.parent),
    )
    this.live = makePose(n)
    this.poseA = makePose(n)
    this.prev = makePose(n)
    this.out = makePose(n)
    this.update(0)
  }

  setAnim(anim: AnimalAnim, fadeSeconds = 0.3): void {
    if (anim === this.anim) return
    this.anim = anim
    this.animT = 0
    this.startFade(fadeSeconds)
  }

  setSpeed(mps: number): void {
    this.speed = Math.max(0, mps)
  }

  private startFade(seconds: number): void {
    copyPose(this.out, this.prev)
    this.fadeDur = Math.max(0.0001, seconds)
    this.fade = seconds <= 0 ? 1 : 0
  }

  update(dt: number): void {
    if (this.disposed) return
    this.t += dt
    this.animT += dt
    this.speedS = damp(this.speedS, this.speed, 6, dt)
    const g = this.plan.gait(this.anim, this.speedS)
    if (g.id !== this.gaitId) {
      if (this.gaitId !== '') this.startFade(0.35)
      this.gaitId = g.id
    }
    this.phase = (this.phase + g.freq * dt) % 1
    const ctx: AnimalCtx = { t: this.t, phase: this.phase, speed: this.speedS, animT: this.animT, jit: this.jit }
    this.kin.writeTo(this.poseA)
    this.plan.pose(this.anim, ctx, this.kin)
    copyPose(this.poseA, this.live)
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / this.fadeDur)
      const w = this.fade * this.fade * (3 - 2 * this.fade)
      blendPose(this.prev, this.live, w, this.out)
    } else copyPose(this.live, this.out)
    this.apply()
  }

  private apply(): void {
    const bones = this.built.bones
    for (let i = 0; i < bones.length; i++) {
      const q = this.out.q[i]
      const b = bones[i]
      if (q && b) b.quaternion.copy(q)
      if (b) b.scale.setScalar(this.out.s[i] ?? 1)
    }
    const body = bones[1]
    const def = this.plan.bones[1]
    const root = this.plan.bones[0]
    if (body && def && root) body.position.copy(def.at).sub(root.at).add(this.out.off)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.object.removeFromParent()
    this.built.dispose()
  }
}
