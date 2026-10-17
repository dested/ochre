/**
 * The most recently created GameAudio, so UI that has no handle on the game (the minigames, the lab) can play a
 * sound through the same mixer. Silent until createAudio has run.
 */
import type { GameAudio, SfxName } from '~/game/contracts'

let current: GameAudio | null = null

export function setSharedAudio(audio: GameAudio | null): void {
  current = audio
}

export function sharedSfx(name: SfxName): void {
  current?.sfx(name)
}
