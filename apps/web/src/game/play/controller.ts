/**
 * Third-person controller (stages 2–5): WASD relative to the camera, Shift to run, a mouse-orbit camera that
 * keeps out of the terrain and ducks under the cave roof. Movement respects world.walkable and slows in water.
 */
import { MathUtils, type PerspectiveCamera } from 'three'
import type { PersonAnim, Vec2, WorldData } from '../contracts'
import type { Input } from './input'
import type { Obstacles } from './obstacles'
import type { StageFeel } from './stages'

/** the body's radius against rocks, metres */
const BODY = 0.25
/** collision samples along the camera boom */
const CAM_STEPS = 14
/** the camera's line to the player stays this far (m) from a lit fire */
const FIRE_CLEAR = 1.2
/** while aiming, the orbit pitch that looks level, and how much view pitch each radian of it gives */
const AIM_LEVEL = 0.15
const AIM_PITCH = 0.9
/** how far the orbit pivot sinks for a seated body, as a share of the standing pivot height */
const SEATED_DROP = 0.3
/** the seated over-the-shoulder shift, metres */
const SEATED_SHOULDER = 0.45
/** orbit offsets tried, nearest first, when a flame sits between the camera and the player */
const SWING = [0.45, -0.45, 0.9, -0.9, 1.5, -1.5]

export type ControllerOutput = { position: Vec2; heading: number; speed: number; anim: PersonAnim }

export type ControlSettings = { sensitivity: number; invertY: boolean }

export type Controller = {
  readonly position: Vec2
  readonly heading: number
  readonly speed: number
  /** camera look direction (heading convention) */
  yaw: number
  pitch: number
  teleport(x: number, z: number, heading: number): void
  /** an impulse in m/s (the surf knocking you back) */
  push(vx: number, vz: number): void
  /**
   * move the player from input; frozen keeps the body still but lets the camera orbit; aim (0..1) slows the
   * body, stops running and turns it to face where the camera looks
   */
  update(
    dt: number,
    input: Input,
    feel: StageFeel,
    seaLevel: number,
    settings: ControlSettings,
    frozen: boolean,
    aim: number
  ): ControllerOutput
  /**
   * place the camera behind the player; aim tightens it over the shoulder; the line to the player keeps clear
   * of lit fires (pull in, or swing the orbit aside)
   */
  updateCamera(
    dt: number,
    camera: PerspectiveCamera,
    feel: StageFeel,
    aim: number,
    fires?: readonly Vec2[],
    /** 0 standing … 1 seated: the orbit pivot sinks with the body */
    low?: number
  ): void
}

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** solids: rocks push the body out; rocks, bushes and canopies keep the camera out of them */
export function createController(world: WorldData, solids: Obstacles | null = null): Controller {
  const position: Vec2 = { x: 0, z: 0 }
  const vel = { x: 0, z: 0 }
  let heading = 0
  let speed = 0
  let idleMouse = 0
  let pushT = 0
  let moving = false
  let camDist = 3
  let zoom = 1
  let swayT = 0
  let seat = 0
  const camTarget = { x: 0, y: 0, z: 0 }
  let snapCamera = true
  let lastSea = -Infinity

  const ctl: Controller = {
    position,
    get heading() {
      return heading
    },
    get speed() {
      return speed
    },
    yaw: 0,
    pitch: 0.15,
    teleport(x, z, h) {
      position.x = x
      position.z = z
      heading = h
      ctl.yaw = h
      vel.x = 0
      vel.z = 0
      speed = 0
      snapCamera = true
    },
    push(vx, vz) {
      vel.x += vx
      vel.z += vz
      pushT = 0.7
    },
    update(dt, input, feel, seaLevel, settings, frozen, aim) {
      lastSea = seaLevel
      const k = 0.0023 * settings.sensitivity * (1 - aim * 0.45)
      if (input.mouse.dx !== 0 || input.mouse.dy !== 0) idleMouse = 0
      else idleMouse += dt
      ctl.yaw -= input.mouse.dx * k
      ctl.pitch = MathUtils.clamp(
        ctl.pitch + input.mouse.dy * k * (settings.invertY ? -1 : 1),
        -0.45,
        1.15
      )
      zoom = MathUtils.clamp(
        zoom + input.mouse.wheel * 0.12,
        feel.camMin / feel.camDistance,
        feel.camMax / feel.camDistance
      )

      let f = 0
      let r = 0
      if (!frozen) {
        if (input.down('KeyW') || input.down('ArrowUp')) f += 1
        if (input.down('KeyS') || input.down('ArrowDown')) f -= 1
        if (input.down('KeyD') || input.down('ArrowRight')) r += 1
        if (input.down('KeyA') || input.down('ArrowLeft')) r -= 1
      }
      const fx = Math.sin(ctl.yaw)
      const fz = Math.cos(ctl.yaw)
      // right of the look direction (Y up): (−cos, sin)
      let dx = fx * f + -fz * r
      let dz = fz * f + fx * r
      const len = Math.hypot(dx, dz)
      moving = len > 0.01
      const running =
        feel.run > 0 && aim < 0.3 && (input.down('ShiftLeft') || input.down('ShiftRight'))
      let target = moving ? (running ? feel.run : feel.walk) * (1 - aim * 0.55) : 0
      if (moving) {
        dx /= len
        dz /= len
      }
      const depth = world.waterDepth(position.x, position.z, seaLevel)
      if (depth > 0.05) target *= 1 - Math.min(0.65, depth * 1.1)
      // while a push is fresh, input only steers it a little
      pushT = Math.max(0, pushT - dt)
      const a = (1 - Math.exp(-dt / Math.max(0.01, feel.accel))) * (pushT > 0 ? 0.15 : 1)
      vel.x += (dx * target - vel.x) * a
      vel.z += (dz * target - vel.z) * a

      const nx = position.x + vel.x * dt
      const nz = position.z + vel.z * dt
      if (world.walkable(nx, nz, seaLevel)) {
        position.x = nx
        position.z = nz
      } else if (world.walkable(nx, position.z, seaLevel)) {
        position.x = nx
        vel.z *= 0.5
      } else if (world.walkable(position.x, nz, seaLevel)) {
        position.z = nz
        vel.x *= 0.5
      } else {
        vel.x = 0
        vel.z = 0
      }
      // never sunk in a rock: step out of any that stands above the knees
      solids?.pushOut(position, BODY)
      speed = Math.hypot(vel.x, vel.z)
      if (aim > 0.3) heading += angleDiff(heading, ctl.yaw) * Math.min(1, dt * 14)
      else if (pushT > 0) {
        // knocked back: keep facing the way you were
      } else if (speed > 0.08) {
        const want = Math.atan2(vel.x, vel.z)
        heading += angleDiff(heading, want) * Math.min(1, feel.turn * dt)
      }
      // a gentle recentre behind the player while walking without touching the mouse
      if (moving && idleMouse > 2) ctl.yaw += angleDiff(ctl.yaw, heading) * Math.min(1, dt * 0.6)

      let anim: PersonAnim = 'idle'
      if (aim > 0.3) anim = 'aim'
      else if (speed > feel.walk * 1.35) anim = 'run'
      else if (speed > 0.12) anim = 'walk'
      else if (!frozen && input.down('KeyC')) anim = 'crouch'
      return { position: { x: position.x, z: position.z }, heading, speed, anim }
    },
    updateCamera(dt, camera, feel, aim, fires = [], low = 0) {
      const ground = world.heightAt(position.x, position.z)
      seat += (low - seat) * Math.min(1, dt * 3)
      const ty = ground + feel.camTarget * (1 - aim * 0.05) * (1 - SEATED_DROP * seat)
      const follow = 1 - Math.exp(-dt * feel.follow)
      if (snapCamera) {
        camTarget.x = position.x
        camTarget.y = ty
        camTarget.z = position.z
      } else {
        camTarget.x += (position.x - camTarget.x) * Math.min(1, follow * 2)
        camTarget.y += (ty - camTarget.y) * follow
        camTarget.z += (position.z - camTarget.z) * Math.min(1, follow * 2)
      }

      const inCave = world.inCave(position.x, position.z)
      let want = feel.camDistance * zoom * (1 - aim * 0.55)
      if (inCave) want = Math.min(want, 2.6)
      const pitch = inCave ? Math.min(ctl.pitch, 0.35) : ctl.pitch
      // how far out along a yaw the camera can sit before its line to the player enters a fire's radius
      const fireClear = (y: number): number => {
        if (fires.length === 0) return want
        const fx = Math.sin(y)
        const fz = Math.cos(y)
        for (let i = 1; i <= CAM_STEPS; i++) {
          const d = (want * i) / CAM_STEPS
          const x = camTarget.x - fx * d
          const z = camTarget.z - fz * d
          for (const f of fires) {
            // only a line heading into the flame counts: beside a fire the camera can still back away
            const fd = Math.hypot(x - f.x, z - f.z)
            if (fd < FIRE_CLEAR && fd < Math.hypot(camTarget.x - f.x, camTarget.z - f.z) - 0.05)
              return Math.max(0.6, d - want / CAM_STEPS)
          }
        }
        return want
      }
      // a flame behind the player: swing the orbit toward the nearest clear side (not while aiming)
      if (aim < 0.3 && fireClear(ctl.yaw) < want * 0.7) {
        for (const off of SWING) {
          if (fireClear(ctl.yaw + off) >= want * 0.9) {
            ctl.yaw += Math.sign(off) * Math.min(Math.abs(off), dt * 1.6)
            break
          }
        }
      }
      const yaw = ctl.yaw
      const fx = Math.sin(yaw)
      const fz = Math.cos(yaw)
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      // over the shoulder while aiming, and while seated so the fire shows past the head: shift the pivot right
      const shoulder = 0.55 * aim + SEATED_SHOULDER * seat * (1 - aim)
      const sx = -fz * shoulder
      const sz = fx * shoulder
      const px = camTarget.x + sx
      const pz = camTarget.z + sz
      const py = camTarget.y + aim * 0.15

      // terrain collision: march out from the pivot and stop short of the ground
      let allowed = Math.min(want, fireClear(yaw))
      const steps = CAM_STEPS
      for (let i = 1; i <= steps; i++) {
        const d = (want * i) / steps
        const x = px - fx * d * cp
        const z = pz - fz * d * cp
        const y = py + sp * d
        if (world.heightAt(x, z) + 0.35 > y || solids?.blocks(px, py, pz, x, y, z)) {
          allowed = Math.max(0.6, d - want / steps)
          break
        }
      }
      if (snapCamera || allowed < camDist) camDist = allowed
      else camDist += (allowed - camDist) * Math.min(1, dt * 3)
      snapCamera = false

      let cx = px - fx * camDist * cp
      let cz = pz - fz * camDist * cp
      let cy = py + sp * camDist
      // never under the ground, and never under the sea's surface (waves ride ~0.4 m above sea level)
      cy = Math.max(cy, world.heightAt(cx, cz) + 0.3, lastSea + 0.45)
      if (inCave) cy = Math.min(cy, ground + 3.2)

      swayT += dt
      const sway = feel.sway
      cx += Math.sin(swayT * 0.7) * sway * 6
      cy += Math.sin(swayT * 1.1) * sway * 3
      camera.position.set(cx, cy, cz)
      camera.up.set(0, 1, 0)
      // look a little ahead of the pivot so the player sits low in frame and the world opens up; while aiming the
      // view turns with the mouse's pitch itself, so the reticle can drop onto an animal below the player
      const ahead = 1.5 + aim * 8
      const ap = (pitch - AIM_LEVEL) * AIM_PITCH
      const dirX = Math.sin(yaw) * Math.cos(ap)
      const dirY = -Math.sin(ap)
      const dirZ = Math.cos(yaw) * Math.cos(ap)
      camera.lookAt(
        px + fx * ahead + (cx + dirX * 10 - px - fx * ahead) * aim,
        py + 0.1 + (cy + dirY * 10 - py - 0.1) * aim,
        pz + fz * ahead + (cz + dirZ * 10 - pz - fz * ahead) * aim
      )
      if (sway > 0) camera.rotateZ(Math.sin(swayT * 0.9) * sway)
      const fov = feel.fov - aim * 12
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 8)
        camera.updateProjectionMatrix()
      }
    },
  }
  return ctl
}
