/**
 * Third-person controller (stages 2–5): WASD relative to the camera, Shift to run, a mouse-orbit camera that
 * keeps out of the terrain and ducks under the cave roof. Movement respects world.walkable and slows in water.
 */
import { MathUtils, type PerspectiveCamera } from 'three'
import type { PersonAnim, Vec2, WorldData } from '../contracts'
import type { Input } from './input'
import type { StageFeel } from './stages'

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
  /** move the player from input; frozen keeps the body still but lets the camera orbit */
  update(dt: number, input: Input, feel: StageFeel, seaLevel: number, settings: ControlSettings, frozen: boolean): ControllerOutput
  /** place the camera behind the player; aim tightens it over the shoulder */
  updateCamera(dt: number, camera: PerspectiveCamera, feel: StageFeel, aim: number): void
}

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function createController(world: WorldData): Controller {
  const position: Vec2 = { x: 0, z: 0 }
  const vel = { x: 0, z: 0 }
  let heading = 0
  let speed = 0
  let idleMouse = 0
  let moving = false
  let camDist = 3
  let zoom = 1
  let swayT = 0
  const camTarget = { x: 0, y: 0, z: 0 }
  let snapCamera = true

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
    update(dt, input, feel, seaLevel, settings, frozen) {
      const k = 0.0023 * settings.sensitivity
      if (input.mouse.dx !== 0 || input.mouse.dy !== 0) idleMouse = 0
      else idleMouse += dt
      ctl.yaw -= input.mouse.dx * k
      ctl.pitch = MathUtils.clamp(ctl.pitch + input.mouse.dy * k * (settings.invertY ? -1 : 1), -0.45, 1.15)
      zoom = MathUtils.clamp(zoom + input.mouse.wheel * 0.12, feel.camMin / feel.camDistance, feel.camMax / feel.camDistance)

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
      const running = feel.run > 0 && (input.down('ShiftLeft') || input.down('ShiftRight'))
      let target = moving ? (running ? feel.run : feel.walk) : 0
      if (moving) {
        dx /= len
        dz /= len
      }
      const depth = world.waterDepth(position.x, position.z, seaLevel)
      if (depth > 0.05) target *= 1 - Math.min(0.65, depth * 1.1)
      const a = 1 - Math.exp(-dt / Math.max(0.01, feel.accel))
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
      speed = Math.hypot(vel.x, vel.z)
      if (speed > 0.08) {
        const want = Math.atan2(vel.x, vel.z)
        heading += angleDiff(heading, want) * Math.min(1, feel.turn * dt)
      }
      // a gentle recentre behind the player while walking without touching the mouse
      if (moving && idleMouse > 2) ctl.yaw += angleDiff(ctl.yaw, heading) * Math.min(1, dt * 0.6)

      let anim: PersonAnim = 'idle'
      if (speed > feel.walk * 1.35) anim = 'run'
      else if (speed > 0.12) anim = 'walk'
      else if (!frozen && input.down('KeyC')) anim = 'crouch'
      return { position: { x: position.x, z: position.z }, heading, speed, anim }
    },
    updateCamera(dt, camera, feel, aim) {
      const ground = world.heightAt(position.x, position.z)
      const ty = ground + feel.camTarget * (1 - aim * 0.05)
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
      const yaw = ctl.yaw
      const pitch = inCave ? Math.min(ctl.pitch, 0.35) : ctl.pitch
      const fx = Math.sin(yaw)
      const fz = Math.cos(yaw)
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      // over the shoulder while aiming: shift the pivot right
      const sx = -fz * 0.55 * aim
      const sz = fx * 0.55 * aim
      const px = camTarget.x + sx
      const pz = camTarget.z + sz
      const py = camTarget.y + aim * 0.15

      // terrain collision: march out from the pivot and stop short of the ground
      let allowed = want
      const steps = 14
      for (let i = 1; i <= steps; i++) {
        const d = (want * i) / steps
        const x = px - fx * d * cp
        const z = pz - fz * d * cp
        const y = py + sp * d
        if (world.heightAt(x, z) + 0.35 > y) {
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
      cy = Math.max(cy, world.heightAt(cx, cz) + 0.3)
      if (inCave) cy = Math.min(cy, ground + 3.2)

      swayT += dt
      const sway = feel.sway
      cx += Math.sin(swayT * 0.7) * sway * 6
      cy += Math.sin(swayT * 1.1) * sway * 3
      camera.position.set(cx, cy, cz)
      camera.up.set(0, 1, 0)
      // look a little ahead of the pivot so the player sits low in frame and the world opens up
      const ahead = 1.5 + aim * 8
      camera.lookAt(px + fx * ahead, py + 0.1 + aim * 0.2, pz + fz * ahead)
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
