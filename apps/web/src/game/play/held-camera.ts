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
/** on the back, a resting mouse lets the gaze drift back to forward past her head after this long, and how fast */
const FORWARD_IDLE = 2
const FORWARD_RATE = 0.8
/** forward on the back: just outside her head, on the infant's side */
const FORWARD_YAW = 0.12
/**
 * cradled, the view sits out in front of her face and a little below it, so her face is up at ~30° with the
 * horizon level (straight up at it, the view rolls and her hair crosses the lens)
 */
const CRADLE_OUT = 0.42
const CRADLE_DROP = 0.22
/** her body as a post under her head, for keeping a downward look out of it */
const BODY_RADIUS = 0.34
const BODY_BELOW_FACE = 0.12
const BODY_REACH = 1.6
/** the infant's field of view, and narrowed while the gaze rests within FOCUS_CONE of an offered thing */
const FOV = 62
const FOV_FOCUS = 46
const FOCUS_CONE = (10 * Math.PI) / 180

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

/** how far p sits to the infant's shoulder side (+ her left, as `side`) of her head, metres */
function lateral(p: Vector3, face: Vector3, heading: number): number {
  return (p.x - face.x) * Math.cos(heading) - (p.z - face.z) * Math.sin(heading)
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
  const focusTmp = new Vector3()
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
      // cradled, her face is above the view: up far enough to take it in, never straight up
      const pitchMin = slot === 'arms' ? -0.8 : -0.9
      const pitchMax = slot === 'arms' ? 0.6 : 1.0
      if (slot !== lastSlot) {
        // on the back: peek over the shoulder; in the arms: looking up into the carrier's face
        cam.yaw = slot === 'back' ? FORWARD_YAW : 0
        cam.pitch = 0.08
        // cradled, the view sits out along her heading and faces back up at her face
        if (slot === 'arms') {
          cam.yaw = 0
          cam.pitch = -Math.atan2(CRADLE_DROP, CRADLE_OUT)
        }
        lastSlot = slot
      }
      if (input.mouse.dx !== 0 || input.mouse.dy !== 0) idle = 0
      else idle += dt
      // measured from where the view actually sits (beside her head on the back), not the infant's head: the
      // offered hand is under a metre away, so the shoulder offset alone is a 25° miss
      const from = first ? eye : eyeSmooth
      if (cam.attract && idle > ATTRACT_IDLE) {
        const dx = cam.attract.x - from.x
        const dz = cam.attract.z - from.z
        let ty = Math.atan2(dx, dz) - facing
        ty = MathUtils.clamp(Math.atan2(Math.sin(ty), Math.cos(ty)), -cam.cone, cam.cone)
        const tp = MathUtils.clamp(
          -Math.atan2(cam.attract.y - from.y, Math.hypot(dx, dz)),
          pitchMin,
          pitchMax
        )
        const step = Math.min(1, dt * ATTRACT_RATE)
        cam.yaw += (ty - cam.yaw) * step
        cam.pitch += (tp - cam.pitch) * step
      } else if (slot === 'back' && idle > FORWARD_IDLE) {
        // carried on the back the infant looks where she is going
        const step = Math.min(1, dt * FORWARD_RATE)
        cam.yaw += (side * FORWARD_YAW - cam.yaw) * step
        cam.pitch += (0.08 - cam.pitch) * step
      }
      const k = 0.0019 * settings.sensitivity
      cam.yaw = MathUtils.clamp(cam.yaw - input.mouse.dx * k, -cam.cone, cam.cone)
      cam.pitch = MathUtils.clamp(
        cam.pitch + input.mouse.dy * k * (settings.invertY ? -1 : 1),
        pitchMin,
        pitchMax
      )
      // on the back: beside her head, on the side the infant is turned to; while she offers something, on the
      // side of her hand (aiming at a hand straight ahead would otherwise swing the view shoulder to shoulder)
      if (cam.attract && face) {
        const offered = lateral(cam.attract, face, carrierHeading)
        if (offered > 0.04) side = 1
        else if (offered < -0.04) side = -1
      } else if (cam.yaw > 0.15) side = 1
      else if (cam.yaw < -0.15) side = -1
      sideEase += (side - sideEase) * Math.min(1, dt * 3)
      eyeWant.copy(eye)
      if (slot === 'arms' && face) {
        eyeWant.set(
          face.x + Math.sin(carrierHeading) * CRADLE_OUT,
          face.y - CRADLE_DROP,
          face.z + Math.cos(carrierHeading) * CRADLE_OUT
        )
      } else if (slot === 'back') {
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
      // looking down never enters her body: lift the gaze until it clears the post under her head (not while she
      // offers something in her hand, which is held close against her)
      if (face && !cam.attract) {
        const top = face.y - BODY_BELOW_FACE
        // march the first BODY_REACH of the gaze: any sample inside the post (shoulders, back, sling) is too low
        const into = (pitch: number) => {
          const dx = Math.sin(yaw) * Math.cos(pitch)
          const dy = -Math.sin(pitch)
          const dz = Math.cos(yaw) * Math.cos(pitch)
          for (let s = 0.05; s <= BODY_REACH; s += 0.05) {
            if (eyeSmooth.y + dy * s > top) continue
            const hx = eyeSmooth.x + dx * s - face.x
            const hz = eyeSmooth.z + dz * s - face.z
            if (hx * hx + hz * hz < BODY_RADIUS * BODY_RADIUS) return true
          }
          return false
        }
        while (cam.pitch > 0.15 && into(cam.pitch)) cam.pitch -= 0.03
      }
      const p = cam.pitch
      camera.position.set(eyeSmooth.x, eyeSmooth.y + bob + breath, eyeSmooth.z)
      look
        .set(Math.sin(yaw) * Math.cos(p), -Math.sin(p), Math.cos(yaw) * Math.cos(p))
        .add(camera.position)
      camera.up.set(0, 1, 0)
      camera.lookAt(look)
      camera.rotateZ(sway)
      // resting on what she offers, the view narrows onto it (a shell bead is a fingertip across)
      let fovWant = FOV
      if (cam.attract) {
        look.sub(camera.position)
        if (look.angleTo(focusTmp.copy(cam.attract).sub(camera.position)) < FOCUS_CONE)
          fovWant = FOV_FOCUS
      }
      const fov = camera.fov + (fovWant - camera.fov) * Math.min(1, dt * 2)
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = Math.abs(fov - fovWant) < 0.02 ? fovWant : fov
        camera.updateProjectionMatrix()
      }
    },
  }
  return cam
}
