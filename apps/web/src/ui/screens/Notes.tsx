/** The Field Notes codex (U2 fills it with the researched notes and their paintings). */
import { bridge, useBridge } from '~/game/bridge'
import { MenuButton } from '../widgets'

export function NotesScreen() {
  const unlocked = useBridge((s) => s.notesUnlocked)
  return (
    <div className="fixed inset-0 bg-soot/95 p-12 text-bone">
      <h2 className="font-serif text-[48px]">Field Notes</h2>
      <p className="mt-2 font-sans text-bone/70">{unlocked.length} found</p>
      <div className="mt-8">
        <MenuButton onClick={() => bridge.actions.closeOverlay()}>Back</MenuButton>
      </div>
    </div>
  )
}
