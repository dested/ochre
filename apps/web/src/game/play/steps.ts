/** Footsteps for the player: one sfx per stride, picked by the ground underfoot. */
import type { SfxName, Surface } from '../contracts'

const STEP: Record<Surface, SfxName | null> = {
  'deep-sea': null,
  shallows: 'step-sand',
  surf: 'step-sand',
  'wet-rock': 'step-rock',
  rock: 'step-rock',
  sand: 'step-sand',
  'wet-sand': 'step-sand',
  dune: 'step-sand',
  fynbos: 'step-grass',
  grass: 'step-grass',
  cliff: 'step-rock',
  cave: 'step-rock',
  path: 'step-rock',
  lagoon: 'step-sand',
  river: 'step-sand',
}

export type Steps = {
  /** distance moved this frame and the stride for this body; returns the sfx to play on a footfall */
  advance(distance: number, stride: number, surface: Surface): SfxName | null
}

export function createSteps(): Steps {
  let acc = 0
  return {
    advance(distance, stride, surface) {
      acc += distance
      if (acc < stride) return null
      acc %= stride
      return STEP[surface]
    },
  }
}
