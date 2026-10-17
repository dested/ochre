/**
 * Stage 1: the infant's eyes. The camera rides the carrier's sling at the infant's head, mouse look within a
 * ±70° cone around the carrier's heading (wider when a beat needs it), with the sway of being carried.
 */
import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import type { Input } from './input'
import type { CarrySlot } from '../contracts'
import type { ControlSettings } from './controller'

/** the default look cone either side of the way the infant faces */
export const HELD_CONE = (70 * Math.PI) / 180
/** seconds of a resting mouse before an offered thing draws the gaze, and how fast it does */
const ATTRACT_IDLE = 0.8
const ATTRACT_RATE = 1.2
/** on the back the view sits beside the carrier's head, over the shoulder the infant is looking past */
const SHOULDER_SIDE = 0.25
const SHOULDER_UP = 0.1

export type HeldCamera = {
  /** relative to the carrier's heading */
  yaw: number
  pitch: number
  /** something offered to the infant: once the mouse rests, the gaze drifts toward it */
  attract: Vector3 | null
  /** half-width of the yaw clamp, radians (HELD_CONE unless a beat widens it) */
  cone: number
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
  let idle = 0
  const eyeSmooth = new Vector3()
  const eyeWant = new Vector3()
  const look = new Vector3()
  /** which shoulder (+1 her left, −1 her right) and its eased value */
  let side = 1
  let sideEase = 1

  const cam: HeldCamera = {
    yaw: 0,
    pitch: 0.08,
    attract: null,
    cone: HELD_CONE,
    reset() {
      lastSlot = null
      first = true
    },
    update(dt, input, camera, eye, carrierHeading, carrierSpeed, settings, slot, face) {
      // cradled in the arms the infant faces the carrier
      const facing = slot === 'arms' ? carrierHeading + Math.PI : carrierHeading
      // cradled, her face is almost straight above: the infant can look right up at it
      const pitchMin = slot === 'arms' ? -1.45 : -0.9
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
          cam.yaw = MathUtils.clamp(yaw, -cam.cone, cam.cone)
          cam.pitch = MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), pitchMin, 1.0)
        }
        lastSlot = slot
      }
      if (input.mouse.dx !== 0 || input.mouse.dy !== 0) idle = 0
      else idle += dt
      if (cam.attract && idle > ATTRACT_IDLE) {
        const dx = cam.attract.x - eye.x
        const dz = cam.attract.z - eye.z
        let ty = Math.atan2(dx, dz) - facing
        ty = MathUtils.clamp(Math.atan2(Math.sin(ty), Math.cos(ty)), -cam.cone, cam.cone)
        const tp = MathUtils.clamp(
          -Math.atan2(cam.attract.y - eye.y, Math.hypot(dx, dz)),
          pitchMin,
          1.0
        )
        const step = Math.min(1, dt * ATTRACT_RATE)
        cam.yaw += (ty - cam.yaw) * step
        cam.pitch += (tp - cam.pitch) * step
      }
      const k = 0.0019 * settings.sensitivity
      cam.yaw = MathUtils.clamp(cam.yaw - input.mouse.dx * k, -cam.cone, cam.cone)
      cam.pitch = MathUtils.clamp(
        cam.pitch + input.mouse.dy * k * (settings.invertY ? -1 : 1),
        pitchMin,
        1.0
      )
      // on the back: beside her head, on the side the infant is turned to
      if (cam.yaw > 0.15) side = 1
      else if (cam.yaw < -0.15) side = -1
      sideEase += (side - sideEase) * Math.min(1, dt * 3)
      eyeWant.copy(eye)
      if (slot === 'back') {
        eyeWant.x += Math.cos(carrierHeading) * SHOULDER_SIDE * sideEase
        eyeWant.z -= Math.sin(carrierHeading) * SHOULDER_SIDE * sideEase
        eyeWant.y += SHOULDER_UP
      }
      if (first) {
        smoothHeading = facing
        eyeSmooth.copy(eyeWant)
        sideEase = side
        first = false
      }
      let d = facing - smoothHeading
      d = Math.atan2(Math.sin(d), Math.cos(d))
      smoothHeading += d * Math.min(1, dt * 3)
      // the eye follows the sling with a little softness: being carried, not bolted on
      eyeSmooth.lerp(eyeWant, Math.min(1, dt * 14))

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
