/** Stub GameAudio until game/audio lands: silent, same API. */
import type { CreateAudio } from '../../contracts'

export const createStubAudio: CreateAudio = () => ({
  resume: () => Promise.resolve(),
  update() {},
  sfx() {},
  music() {},
  setVolume() {},
  dispose() {},
})
