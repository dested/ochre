/**
 * The OCHRE UI root. Renders by `bridge.screen`, reads only through `useBridge`, and calls only
 * `bridge.actions.*`. Safe to render on the server: DOM access happens only inside effects.
 */
import { useBridge } from '~/game/bridge'
import { UiDefs } from './defs'
import { Hud } from './hud/Hud'
import { MinigameHost } from './minigames/MinigameHost'
import { ChapterCardScreen } from './screens/ChapterCard'
import { ChoiceDialog } from './screens/Choice'
import { IntroScreen } from './screens/Intro'
import { LineageScreen } from './screens/Lineage'
import { LoadingScreen } from './screens/Loading'
import { NotesScreen } from './screens/Notes'
import { PauseScreen } from './screens/Pause'
import { SummaryScreen } from './screens/Summary'
import { TitleScreen } from './screens/Title'

export function GameUI() {
  const screen = useBridge((s) => s.screen)
  const choice = useBridge((s) => s.choice)
  const minigame = useBridge((s) => s.minigame)
  return (
    <>
      <UiDefs />
      {screen === 'title' && <TitleScreen />}
      {screen === 'intro' && <IntroScreen />}
      {screen === 'loading' && <LoadingScreen />}
      {(screen === 'playing' || screen === 'paused') && <Hud dimmed={screen === 'paused' || minigame !== null} />}
      {screen === 'playing' && choice && !minigame && <ChoiceDialog choice={choice} />}
      {screen === 'playing' && minigame && <MinigameHost game={minigame} />}
      {screen === 'paused' && <PauseScreen />}
      {screen === 'chapter-card' && <ChapterCardScreen />}
      {screen === 'notes' && <NotesScreen />}
      {screen === 'lineage' && <LineageScreen />}
      {screen === 'summary' && <SummaryScreen />}
    </>
  )
}
