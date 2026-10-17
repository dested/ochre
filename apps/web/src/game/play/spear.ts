/**
 * The hafted spear (stage 3+): RMB aims (camera tightens, reticle), LMB throws a spear on a ballistic arc.
 * A hit on an animal's body sends spear-hit with quality from the point and the distance; a miss leaves the
 * spear stuck in the ground to pick up again.
 */
import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Camera,
  type Object3D,
} from 'three'
import type { AnimalKind, PaintMaterial, SimAnimal, Vec2, WorldData } from '../contracts'

const GRAVITY = 9.8
const SPEED = 24
const SHAFT = 2.1
const PICKUP_RADIUS = 1.8
const MAX_AIM = 45

/** body spheres per kind: [height of centre, radius, half-length along the heading] */
const BODY: Record<AnimalKind, [number, number, number] | null> = {
  eland: [1.15, 0.65, 0.75],
  seal: [0.3, 0.4, 0.5],
  gull: null,
  hyena: [0.6, 0.38, 0.4],
  lion: [0.8, 0.5, 0.6],
  tortoise: [0.12, 0.2, 0],
  whale: [1.4, 1.8, 5],
}

export type SpearState = 'held' | 'flying' | 'stuck'

export type SpearHit = { kind: 'hit'; animalId: string; quality: number } | { kind: 'miss' }

export type Spear = {
  readonly root: Object3D
  readonly state: SpearState
  /** where it lies when stuck */
  readonly stuckAt: Vec2 | null
  /** launch from the hand along the camera's aim; returns false when not held */
  throw(from: Vector3, camera: Camera, animals: readonly SimAnimal[]): boolean
  /** advance a flying spear; reports the outcome once */
  update(dt: number, animals: readonly SimAnimal[], seaLevel: number): SpearHit | null
  canPickUp(p: Vec2): boolean
  pickUp(): void
  /** point quality (0..1) used for hits */
  pointQuality: number
  dispose(): void
}

export function createSpear(world: WorldData, paint: PaintMaterial): Spear {
  const root = new Group()
  root.name = 'spear'
  const wood = paint(new MeshStandardMaterial({ color: '#8a6a44', roughness: 0.85, metalness: 0 }))
  const stone = paint(new MeshStandardMaterial({ color: '#b5654a', roughness: 0.7, metalness: 0 }))
  const shaftGeo = new CylinderGeometry(0.018, 0.022, SHAFT, 6)
  const pointGeo = new ConeGeometry(0.035, 0.14, 5)
  // the spear points along +Y in its own space, the point at the top
  const shaft = new Mesh(shaftGeo, wood)
  const point = new Mesh(pointGeo, stone)
  point.position.y = SHAFT / 2 + 0.07
  root.add(shaft, point)
  root.visible = false

  const pos = new Vector3()
  const vel = new Vector3()
  const prev = new Vector3()
  const up = new Vector3(0, 1, 0)
  const q = new Quaternion()
  const dir = new Vector3()
  const tmp = new Vector3()
  const centre = new Vector3()
  let state: SpearState = 'held'
  let stuckAt: Vec2 | null = null
  let travelled = 0
  const start = new Vector3()

  const orient = () => {
    dir.copy(vel).normalize()
    q.setFromUnitVectors(up, dir)
    root.quaternion.copy(q)
    // keep the tip at pos: the centre sits half a shaft behind it
    root.position.copy(pos).addScaledVector(dir, -SHAFT / 2)
  }

  /** closest distance from point c to segment ab */
  const segDist = (a: Vector3, b: Vector3, c: Vector3): number => {
    tmp.subVectors(b, a)
    const len2 = tmp.lengthSq()
    const t = len2 > 0 ? Math.min(1, Math.max(0, centre.subVectors(c, a).dot(tmp) / len2)) : 0
    return a.clone().addScaledVector(tmp, t).distanceTo(c)
  }

  const spear: Spear = {
    root,
    get state() {
      return state
    },
    get stuckAt() {
      return stuckAt
    },
    pointQuality: 0.6,
    throw(from, camera, animals) {
      if (state !== 'held') return false
      // the reticle's point: march the camera ray to the ground, capped at hunting range
      camera.getWorldDirection(dir)
      const eye = camera.getWorldPosition(tmp)
      let range = MAX_AIM
      for (let d = 2; d <= MAX_AIM && range === MAX_AIM; d += 0.5) {
        const x = eye.x + dir.x * d
        const y = eye.y + dir.y * d
        const z = eye.z + dir.z * d
        if (y <= world.heightAt(x, z)) range = d
        for (const a of animals) {
          const body = a.alive ? BODY[a.kind] : null
          if (!body || Math.abs(a.position.x - x) > 8 || Math.abs(a.position.z - z) > 8) continue
          const ay = world.heightAt(a.position.x, a.position.z) + a.altitude + body[0]
          if (Math.hypot(a.position.x - x, ay - y, a.position.z - z) < body[1] + body[2]) range = d
        }
      }
      centre.copy(eye).addScaledVector(dir, range)
      pos.copy(from)
      start.copy(from)
      // fly at the reticle, lifted by exactly the drop over the flight so the arc meets it
      vel.subVectors(centre, from)
      const flat = Math.hypot(vel.x, vel.z)
      vel.normalize().multiplyScalar(SPEED)
      const t = flat / Math.max(1, Math.hypot(vel.x, vel.z))
      vel.y += 0.5 * GRAVITY * t
      state = 'flying'
      travelled = 0
      root.visible = true
      orient()
      return true
    },
    update(dt, animals, seaLevel) {
      if (state !== 'flying') return null
      prev.copy(pos)
      vel.y -= GRAVITY * dt
      pos.addScaledVector(vel, dt)
      travelled += prev.distanceTo(pos)
      orient()
      for (const a of animals) {
        if (!a.alive) continue
        const body = BODY[a.kind]
        if (!body) continue
        const [h, r, half] = body
        const ground = world.heightAt(a.position.x, a.position.z)
        const fx = Math.sin(a.heading)
        const fz = Math.cos(a.heading)
        for (const k of [-1, 0, 1]) {
          if (half === 0 && k !== 0) continue
          tmp.set(
            a.position.x + fx * half * k,
            ground + a.altitude + h,
            a.position.z + fz * half * k
          )
          const c = tmp.clone()
          if (segDist(prev, pos, c) < r) {
            state = 'held'
            root.visible = false
            const dist = start.distanceTo(c)
            const quality = Math.min(
              1,
              Math.max(0.1, spear.pointQuality * Math.min(1, Math.max(0.2, 1.25 - dist / 35)))
            )
            return { kind: 'hit', animalId: a.id, quality }
          }
        }
      }
      const ground = Math.max(world.heightAt(pos.x, pos.z), seaLevel - 0.6)
      if (pos.y <= ground || travelled > 120) {
        // bury the tip a little and leave it standing at the angle it came in
        pos.y = Math.min(pos.y, ground) - 0.15
        orient()
        state = 'stuck'
        stuckAt = { x: pos.x, z: pos.z }
        return { kind: 'miss' }
      }
      return null
    },
    canPickUp(p) {
      return (
        state === 'stuck' &&
        stuckAt !== null &&
        Math.hypot(stuckAt.x - p.x, stuckAt.z - p.z) < PICKUP_RADIUS
      )
    },
    pickUp() {
      state = 'held'
      stuckAt = null
      root.visible = false
    },
    dispose() {
      root.removeFromParent()
      shaftGeo.dispose()
      pointGeo.dispose()
      wood.dispose()
      stone.dispose()
    },
  }
  return spear
}
