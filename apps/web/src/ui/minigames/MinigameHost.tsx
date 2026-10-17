/** Opens the minigame the bridge asks for and reports its quality (0..1) with bridge.actions.minigameDone. */
import { bridge } from '~/game/bridge'
import type { MinigameId } from '~/game/contracts'
import { Beads } from './Beads'
import { Engraving } from './Engraving'
import { Knapping } from './Knapping'

export function MinigameHost({ game }: { game: MinigameId }) {
  const done = (quality: number) => bridge.actions.minigameDone(game, Math.min(1, Math.max(0, quality)))
  if (game === 'knapping') return <Knapping key={game} onDone={done} />
  if (game === 'engraving') return <Engraving key={game} onDone={done} />
  return <Beads key={game} onDone={done} />
}
