/**
 * Stage 1: the infant's eyes. The camera rides the carrier's sling at the infant's head, mouse look within a
 * ±70° cone around the carrier's heading, with the sway of being carried.
 */
import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import type { Input } from './input'
import type { CarrySlot } from '../contracts'
import type { ControlSettings } from './controller'

const CONE = (70 * Math.PI) / 180

export type HeldCamera = {
  /** relative to the carrier's heading */
  yaw: number
  pitch: number
  reset(): void
  update(
    dt: number,
    input: Input,
    camera: PerspectiveCamera,
    eye: Vector3,
    carrierHeading: number,
    carrierSpeed: number,
    settings: ControlSettings,
    slot: CarrySlot,
    /** the carrier's face: in the arms the view starts on it */
    face: Vector3 | null
  ): void
}

export function createHeldCamera(): HeldCamera {
  let phase = 0
  let smoothHeading = 0
  let first = true
  let lastSlot: CarrySlot | null = null
  const eyeSmooth = new Vector3()
  const look = new Vector3()

  const cam: HeldCamera = {
    yaw: 0,
    pitch: 0.08,
    reset() {
      lastSlot = null
      first = true
    },
    update(dt, input, camera, eye, carrierHeading, carrierSpeed, settings, slot, face) {
      // cradled in the arms the infant faces the carrier
      const facing = slot === 'arms' ? carrierHeading + Math.PI : carrierHeading
      if (slot !== lastSlot) {
        // on the back: peek over the shoulder; in the arms: looking up into the carrier's face
        cam.yaw = slot === 'back' ? 0.6 : 0
        cam.pitch = 0.08
        if (slot === 'arms' && face) {
          const dx = face.x - eye.x
          const dy = face.y - eye.y
          const dz = face.z - eye.z
          let yaw = Math.atan2(dx, dz) - facing
          yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw))
          cam.yaw = MathUtils.clamp(yaw, -CONE, CONE)
          cam.pitch = MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.9, 1.0)
        }
        lastSlot = slot
      }
      const k = 0.0019 * settings.sensitivity
      cam.yaw = MathUtils.clamp(cam.yaw - input.mouse.dx * k, -CONE, CONE)
      cam.pitch = MathUtils.clamp(
        cam.pitch + input.mouse.dy * k * (settings.invertY ? -1 : 1),
        -0.9,
        1.0
      )
      if (first) {
        smoothHeading = facing
        eyeSmooth.copy(eye)
        first = false
      }
      let d = facing - smoothHeading
      d = Math.atan2(Math.sin(d), Math.cos(d))
      smoothHeading += d * Math.min(1, dt * 3)
      // the eye follows the sling with a little softness: being carried, not bolted on
      eyeSmooth.lerp(eye, Math.min(1, dt * 14))

      phase += dt * (carrierSpeed > 0.1 ? 1.9 + carrierSpeed * 1.6 : 0.9) * Math.PI
      const walking = Math.min(1, carrierSpeed / 1.2)
      const bob = Math.sin(phase) * (0.006 + walking * 0.022)
      const sway = Math.sin(phase * 0.5) * (0.004 + walking * 0.025)
      // breathing even when still
      const breath = Math.sin(phase * 0.35) * 0.004

      const yaw = smoothHeading + cam.yaw
      const p = cam.pitch
      camera.position.set(eyeSmooth.x, eyeSmooth.y + bob + breath, eyeSmooth.z)
      look
        .set(Math.sin(yaw) * Math.cos(p), -Math.sin(p), Math.cos(yaw) * Math.cos(p))
        .add(camera.position)
      camera.up.set(0, 1, 0)
      camera.lookAt(look)
      camera.rotateZ(sway)
      if (Math.abs(camera.fov - 62) > 0.01) {
        camera.fov = 62
        camera.updateProjectionMatrix()
      }
    },
  }
  return cam
}
