/** Opens the minigame the bridge asks for and reports its quality with bridge.actions.minigameDone (U3 builds the games). */
import { bridge } from '~/game/bridge'
import type { MinigameId } from '~/game/contracts'
import { MenuButton } from '../widgets'

const TITLES: Record<MinigameId, string> = {
  knapping: 'Shape a spear point',
  engraving: 'Engrave the ochre',
  beads: 'Pierce the shells',
}

export function MinigameHost({ game }: { game: MinigameId }) {
  return (
    <div className="fixed inset-0 grid animate-ui-fade place-items-center bg-soot/80">
      <div className="flex flex-col items-center gap-6">
        <h2 className="font-serif text-[40px] text-bone">{TITLES[game]}</h2>
        <MenuButton onClick={() => bridge.actions.minigameDone(game, 0.7)}>Done</MenuButton>
      </div>
    </div>
  )
}
