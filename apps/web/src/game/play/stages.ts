/** How each stage of life feels to control: speeds, camera rig, sway. Tuned by playing. */
import type { LifeStageId } from '../contracts'

export type StageFeel = {
  walk: number
  /** 0 = can't run */
  run: number
  /** seconds to reach full speed */
  accel: number
  /** radians per second the body turns toward the move direction */
  turn: number
  /** orbit distance (m), min and max for the wheel */
  camDistance: number
  camMin: number
  camMax: number
  /** look-at height above the feet (m) */
  camTarget: number
  /** default pitch (radians, + looks down) */
  camPitch: number
  fov: number
  /** elder's slow head sway amplitude (radians) */
  sway: number
  /** camera lag (higher = snappier) */
  follow: number
}

export const STAGE_FEEL: Record<LifeStageId, StageFeel> = {
  held: {
    walk: 0, run: 0, accel: 1, turn: 0,
    camDistance: 0, camMin: 0, camMax: 0, camTarget: 0, camPitch: 0, fov: 62, sway: 0, follow: 10,
  },
  small: {
    walk: 1.2, run: 3.0, accel: 0.18, turn: 11,
    camDistance: 3.1, camMin: 1.8, camMax: 5.5, camTarget: 0.85, camPitch: 0.12, fov: 62, sway: 0, follow: 12,
  },
  youth: {
    walk: 1.4, run: 3.6, accel: 0.22, turn: 10,
    camDistance: 4.0, camMin: 2.2, camMax: 7, camTarget: 1.3, camPitch: 0.16, fov: 58, sway: 0, follow: 11,
  },
  provider: {
    walk: 1.4, run: 3.6, accel: 0.25, turn: 9,
    camDistance: 4.6, camMin: 2.4, camMax: 8, camTarget: 1.45, camPitch: 0.18, fov: 56, sway: 0, follow: 10,
  },
  elder: {
    walk: 0.8, run: 0, accel: 0.6, turn: 4.5,
    camDistance: 4.2, camMin: 2.4, camMax: 7, camTarget: 1.35, camPitch: 0.2, fov: 54, sway: 0.012, follow: 6,
  },
}

export const STAGE_AGE: Record<LifeStageId, number> = { held: 0.4, small: 6, youth: 14, provider: 26, elder: 58 }
