/**
 * PersonActor: a built person plus its animation state. Each frame: advance the gait phase from the ground
 * speed, write the anim's pose (walk and run cross-faded by speed), add the layers (look-at, talking, blink,
 * breathing, the cape's lag), solve, and fade from the previous anim's last pose. `object` is the caller's: a
 * carried child's visible rig moves into the carrier's sling while its `object` stays wherever the caller puts it.
 */
import { Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import type { CarrySlot, CreatePerson, Hand, HeldItem, PersonActor, PersonAnim, PersonLook, Vec3 } from '../contracts'
import { Rng, mix32 } from '~/core/rng'
import { gaitFor, poseAnim, type AnimCtx } from './anims'
import { buildPerson, type BuiltPerson } from './build'
import { clamp } from './geo'
import { Solver, blendPose, copyPose, makePose, makeSpec, type PoseSpec } from './pose'
import { backSeat, gripPoint } from './props'
import { B } from './rig'

const people = new WeakMap<PersonActor, PersonImpl>()
const _v = new Vector3()
const _v2 = new Vector3()
const _m = new Matrix4()
const _q = new Quaternion()
const AX = new Vector3(1, 0, 0)
const AY = new Vector3(0, 1, 0)

const damp = (cur: number, target: number, rate: number, dt: number): number => cur + (target - cur) * (1 - Math.exp(-rate * dt))

class PersonImpl implements PersonActor {
  readonly object = new Group()
  private inner = new Group()
  private lookState: PersonLook
  private built: BuiltPerson
  private solver: Solver
  private spec: PoseSpec = makeSpec()
  private live = makePose()
  private poseA = makePose()
  private poseB = makePose()
  private prev = makePose()
  private out = makePose()
  private anim: PersonAnim = 'idle'
  private fade = 1
  private fadeDur = 0.25
  private speed = 0
  private speedS = 0
  private phase = 0
  private freq = 1
  private wasMoving = false
  private t = 0
  private rng: Rng
  private jit: number
  private target: Vector3 | null = null
  private headYaw = 0
  private headPitch = 0
  private eyeL = { yaw: 0, pitch: 0 }
  private eyeR = { yaw: 0, pitch: 0 }
  private saccade = { yaw: 0, pitch: 0, next: 0 }
  private talking = false
  private talkW = 0
  private blinkT = -1
  private nextBlink = 2
  private held: [HeldItem, HeldItem] = ['none', 'none']
  private carrying: { child: PersonImpl; slot: CarrySlot } | null = null
  private carrier: PersonImpl | null = null
  private carriedSlot: CarrySlot | null = null
  private attach = new Object3D()
  private pendingAge: number | null = null
  private rebuildWait = 0
  private cape = 0
  private capeV = 0
  private eyeMid = new Vector3()
  private disposed = false

  constructor(look: PersonLook) {
    this.lookState = { ...look, adornments: [...look.adornments] }
    this.rng = new Rng(mix32(look.seed, 0xac70))
    this.jit = this.rng.next()
    this.nextBlink = this.rng.range(1, 4)
    this.built = buildPerson(this.lookState)
    this.solver = new Solver(this.built.rig)
    this.object.name = 'person'
    this.inner.name = 'person-inner'
    this.object.add(this.inner)
    this.inner.add(this.built.group)
    this.attach.name = 'carry-attach'
    this.measureEyes()
    this.update(0)
  }

  get look(): PersonLook {
    return this.lookState
  }

  /* ── public API ── */

  setAnim(anim: PersonAnim, fadeSeconds = 0.25): void {
    if (anim === this.anim) return
    this.anim = anim
    this.startFade(fadeSeconds)
  }

  setSpeed(mps: number): void {
    this.speed = Math.max(0, mps)
  }

  setLookAt(target: Vec3 | null): void {
    if (!target) this.target = null
    else (this.target ??= new Vector3()).set(target.x, target.y, target.z)
  }

  setHeld(hand: Hand, item: HeldItem): void {
    const i = hand === 'left' ? 0 : 1
    if (this.held[i] === item) return
    this.held[i] = item
    this.refreshProps()
  }

  carry(child: PersonActor | null, slot: CarrySlot = 'back'): void {
    if (this.carrying) {
      const c = this.carrying.child
      this.carrying = null
      c.carrier = null
      c.carriedSlot = null
      c.object.add(c.inner)
      c.inner.position.set(0, 0, 0)
      c.inner.quaternion.identity()
      this.attach.removeFromParent()
    }
    if (child) {
      const impl = people.get(child)
      if (!impl || impl === this) {
        console.warn('[actors] carry: the child must be another actor from createPerson')
        return
      }
      impl.carrier?.carry(null)
      this.carrying = { child: impl, slot }
      impl.carrier = this
      impl.carriedSlot = slot
      this.placeAttach()
      this.attach.add(impl.inner)
      impl.inner.position.set(0, 0, 0)
      impl.inner.quaternion.identity()
    }
    this.refreshProps()
  }

  setAge(ageYears: number): void {
    const a = clamp(ageYears, 0, 90)
    if (Math.abs(a - this.lookState.ageYears) < 0.004 && this.pendingAge === null) return
    this.pendingAge = a
  }

  setTalking(on: boolean): void {
    this.talking = on
  }

  headPosition(out: Vector3): Vector3 {
    const head = this.built.bones[B.head]
    if (!head) return out.set(0, 0, 0)
    head.updateWorldMatrix(true, false)
    return out.copy(this.eyeMid).applyMatrix4(head.matrixWorld)
  }

  handPosition(hand: Hand, out: Vector3): Vector3 {
    const b = this.built.bones[hand === 'left' ? B.handL : B.handR]
    const bind = this.built.rig.bind[hand === 'left' ? B.handL : B.handR]
    if (!b || !bind) return out.set(0, 0, 0)
    b.updateWorldMatrix(true, false)
    gripPoint(this.built.dims, hand, out).sub(bind)
    return out.applyMatrix4(b.matrixWorld)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.carry(null)
    this.carrier?.carry(null)
    this.object.removeFromParent()
    this.built.dispose()
    people.delete(this)
  }

  /* ── internals ── */

  private startFade(seconds: number): void {
    copyPose(this.out, this.prev)
    this.fadeDur = Math.max(0.0001, seconds)
    this.fade = seconds <= 0 ? 1 : 0
  }

  private measureEyes(): void {
    const d = this.built.dims
    const headBind = this.built.rig.bind[B.head]
    if (!headBind) return
    this.eyeMid.set(0, d.headCy + d.eyeY, d.eyeZ + d.eyeR).sub(headBind)
  }

  private refreshProps(): void {
    const sling = this.carrying && this.carrying.slot === 'back' ? { child: this.carrying.child.built.dims, slot: this.carrying.slot } : null
    this.built.setProps(this.held[0], this.held[1], sling)
  }

  /** where a carried child's rig sits, relative to the carrier's chest or hips bone */
  private placeAttach(): void {
    const c = this.carrying
    if (!c) return
    const d = this.built.dims
    const cd = c.child.built.dims
    const bind = this.built.rig.bind
    const chest = this.built.bones[B.chest]
    const hips = this.built.bones[B.hips]
    const chestBind = bind[B.chest]
    const hipsBind = bind[B.hips]
    if (!chest || !hips || !chestBind || !hipsBind) return
    this.attach.quaternion.identity()
    if (c.slot === 'back') {
      chest.add(this.attach)
      this.attach.position.copy(backSeat(d, cd)).sub(chestBind)
    } else if (c.slot === 'hip') {
      hips.add(this.attach)
      const seat = new Vector3(d.hipW * 1.0 + cd.hipW * 0.5, d.waistY - cd.hipY + (d.hipY - d.waistY) * 0.1, d.hipDepth * 0.2)
      this.attach.position.copy(seat).sub(hipsBind)
      this.attach.quaternion.setFromAxisAngle(AY, -Math.PI / 2 + 0.7)
    } else {
      chest.add(this.attach)
      const seat = new Vector3(0, d.waistY - cd.hipY * 0.75, d.chestDepth + cd.hipDepth + 0.03)
      this.attach.position.copy(seat).sub(chestBind)
      this.attach.quaternion.setFromAxisAngle(AY, Math.PI)
    }
  }

  private rebuild(age: number): void {
    const carrier = this.carrier
    const slot = this.carriedSlot
    const child = this.carrying
    this.lookState = { ...this.lookState, ageYears: age }
    const old = this.built
    this.built = buildPerson(this.lookState)
    this.solver = new Solver(this.built.rig)
    old.group.removeFromParent()
    this.inner.add(this.built.group)
    old.dispose()
    this.measureEyes()
    if (child) {
      this.attach.removeFromParent()
      this.placeAttach()
    }
    this.refreshProps()
    if (carrier && slot) {
      carrier.placeAttach()
      carrier.refreshProps()
    }
  }

  update(dt: number): void {
    if (this.disposed) return
    this.t += dt
    this.rebuildWait -= dt
    if (this.pendingAge !== null && this.rebuildWait <= 0) {
      const a = this.pendingAge
      this.pendingAge = null
      this.rebuildWait = 0.08
      this.rebuild(a)
    }
    const d = this.built.dims
    const rig = this.built.rig
    this.speedS = damp(this.speedS, this.speed, 10, dt)
    const gait = gaitFor(d, this.speedS)
    const moving = this.speedS > 0.06 && !this.carrier
    if (moving) {
      this.freq = gait.freq
      this.phase = (this.phase + gait.freq * dt) % 1
    }
    if (moving !== this.wasMoving) {
      this.wasMoving = moving
      this.startFade(0.22)
    }
    this.lookLayer(dt)
    this.blinkLayer(dt)
    this.talkW = damp(this.talkW, this.talking ? 1 : 0, 8, dt)

    const ctx: AnimCtx = {
      rig,
      d,
      t: this.t,
      phase: this.phase,
      freq: this.freq,
      speed: moving ? this.speedS : 0,
      held: this.held,
      carrying: this.carrying?.slot ?? null,
      carriedIn: this.carriedSlot,
      jit: this.jit,
      runK: 0,
    }
    const anim = this.anim
    if (moving && gait.run > 0.02 && gait.run < 0.98) {
      ctx.runK = 0
      poseAnim(anim, ctx, this.spec)
      this.layers(this.spec)
      this.solver.solve(this.spec, this.poseA)
      ctx.runK = 1
      poseAnim(anim, ctx, this.spec)
      this.layers(this.spec)
      this.solver.solve(this.spec, this.poseB)
      blendPose(this.poseA, this.poseB, gait.run, this.live)
    } else {
      ctx.runK = gait.run >= 0.5 ? 1 : 0
      poseAnim(anim, ctx, this.spec)
      this.layers(this.spec)
      this.solver.solve(this.spec, this.live)
    }
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / this.fadeDur)
      const w = this.fade * this.fade * (3 - 2 * this.fade)
      blendPose(this.prev, this.live, w, this.out)
    } else {
      copyPose(this.live, this.out)
    }
    this.apply(dt)
  }

  /** head turn and talking, added onto the anim's spec */
  private layers(s: PoseSpec): void {
    s.neck.y += this.headYaw * 0.4
    s.head.y += this.headYaw * 0.6
    s.neck.x += this.headPitch * 0.3
    s.head.x += this.headPitch * 0.7
    if (this.talkW > 0.01) {
      const t = this.t
      const syl = Math.max(0, Math.sin(t * 25) * 0.6 + Math.sin(t * 9.3 + 1) * 0.5 + Math.sin(t * 3.1) * 0.3)
      s.jaw += this.talkW * (0.03 + 0.11 * Math.min(1, syl))
      s.head.x += this.talkW * 0.025 * Math.sin(t * 5.2)
      s.head.z += this.talkW * 0.02 * Math.sin(t * 2.3)
    }
    if (this.built.dims.age < 1.5) s.jaw += 0.03
  }

  private lookLayer(dt: number): void {
    let wantYaw = 0
    let wantPitch = 0
    const chest = this.built.bones[B.chest]
    if (this.target && chest) {
      chest.updateWorldMatrix(true, false)
      _m.copy(chest.matrixWorld).invert()
      _v.copy(this.target).applyMatrix4(_m)
      // from the head, in the chest's frame
      const neckUp = this.built.dims.headCy - this.built.dims.chestY
      _v.y -= neckUp
      const horiz = Math.hypot(_v.x, _v.z)
      wantYaw = clamp(Math.atan2(_v.x, _v.z), -1.3, 1.3)
      wantPitch = clamp(-Math.atan2(_v.y, Math.max(1e-3, horiz)), -0.55, 0.65)
      if (_v.z < -0.2 && Math.abs(wantYaw) > 1.2) wantYaw = Math.sign(wantYaw) * 1.2
    }
    this.headYaw = damp(this.headYaw, wantYaw, 5, dt)
    this.headPitch = damp(this.headPitch, wantPitch, 5, dt)
    // idle saccades when looking at nothing in particular
    if (this.t > this.saccade.next) {
      this.saccade.next = this.t + this.rng.range(0.8, 3.2)
      this.saccade.yaw = this.target ? this.rng.range(-0.03, 0.03) : this.rng.range(-0.18, 0.18)
      this.saccade.pitch = this.target ? this.rng.range(-0.02, 0.02) : this.rng.range(-0.08, 0.06)
    }
  }

  private blinkLayer(dt: number): void {
    if (this.blinkT >= 0) {
      this.blinkT += dt
      if (this.blinkT > 0.16) this.blinkT = -1
    } else {
      this.nextBlink -= dt
      if (this.nextBlink <= 0) {
        this.blinkT = 0
        this.nextBlink = this.rng.range(1.8, 5.5) * (this.rng.chance(0.15) ? 0.15 : 1)
      }
    }
  }

  /** write the pose into the bones, then the eyes, lids and cape directly */
  private apply(dt: number): void {
    const bones = this.built.bones
    for (let i = 0; i < bones.length; i++) {
      const q = this.out.q[i]
      const b = bones[i]
      if (q && b) b.quaternion.copy(q)
    }
    bones[B.hips]?.position.copy(this.out.hip)
    const d = this.built.dims
    // eyes: converge on the target from each eye's own position
    const head = bones[B.head]
    const headBind = this.built.rig.bind[B.head]
    if (head && headBind) {
      let haveTarget = false
      if (this.target) {
        head.updateWorldMatrix(true, false)
        _m.copy(head.matrixWorld).invert()
        _v2.copy(this.target).applyMatrix4(_m)
        haveTarget = true
      }
      for (const side of [1, -1] as const) {
        const st = side > 0 ? this.eyeL : this.eyeR
        let yaw = this.saccade.yaw
        let pitch = this.saccade.pitch
        if (haveTarget) {
          _v.set(side * d.eyeX, d.headCy + d.eyeY, d.eyeZ).sub(headBind)
          _v.subVectors(_v2, _v)
          yaw += clamp(Math.atan2(_v.x, Math.max(0.02, _v.z)), -0.5, 0.5)
          pitch += clamp(-Math.atan2(_v.y, Math.max(0.02, Math.hypot(_v.x, _v.z))), -0.35, 0.4)
        }
        st.yaw = damp(st.yaw, yaw, 22, dt)
        st.pitch = damp(st.pitch, pitch, 22, dt)
        const eye = bones[side > 0 ? B.eyeL : B.eyeR]
        if (eye) eye.quaternion.setFromAxisAngle(AY, st.yaw).multiply(_q.setFromAxisAngle(AX, st.pitch))
        // upper lids follow the gaze down and close in a blink
        const lid = bones[side > 0 ? B.lidL : B.lidR]
        const blink = this.blinkT >= 0 ? Math.sin(Math.PI * Math.min(1, this.blinkT / 0.16)) : 0
        const sleepy = this.anim === 'sleep' || this.anim === 'lie-dead' ? 1 : 0
        const close = Math.max(blink, sleepy)
        const follow = clamp(st.pitch * 0.7, -0.12, 0.3)
        if (lid) lid.quaternion.setFromAxisAngle(AX, follow + close * (0.82 - follow))
      }
    }
    // the cape lags with speed and swings back
    const cape = bones[B.cape]
    if (cape) {
      const target = 0.04 + 0.22 * Math.min(1, this.speedS / 3.5)
      this.capeV += ((target - this.cape) * 60 - this.capeV * 9) * dt
      this.cape += this.capeV * dt
      cape.quaternion.setFromAxisAngle(AX, this.cape)
    }
  }
}

export const createPerson: CreatePerson = (look) => {
  const p = new PersonImpl(look)
  people.set(p, p)
  return p
}
