/** The life summary and "Continue as <heir>" (U2). */
import { bridge, useBridge } from '~/game/bridge'
import { MenuButton } from '../widgets'

export function SummaryScreen() {
  const summary = useBridge((s) => s.summary)
  return (
    <div className="fixed inset-0 bg-soot p-12 text-bone">
      <h2 className="font-serif text-[48px]">{summary?.name ?? 'A life'}</h2>
      <div className="mt-8 flex flex-col items-start gap-2">
        {summary?.heirName && <MenuButton onClick={() => bridge.actions.summaryContinue(true)}>Continue as {summary.heirName}</MenuButton>}
        <MenuButton onClick={() => bridge.actions.summaryContinue(false)}>Return to the title</MenuButton>
      </div>
    </div>
  )
}
