/** Minigame sounds go through the game's own mixer when there is one (see game/audio/shared.ts). */
import { sharedSfx } from '~/game/audio/shared'
import type { SfxName } from '~/game/contracts'

export function uiSfx(name: SfxName): void {
  sharedSfx(name)
}
