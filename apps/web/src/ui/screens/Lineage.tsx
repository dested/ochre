/** The band as a family tree with bonds (U2). */
import { bridge, useBridge } from '~/game/bridge'
import { MenuButton } from '../widgets'

export function LineageScreen() {
  const lineage = useBridge((s) => s.lineage)
  return (
    <div className="fixed inset-0 bg-soot/95 p-12 text-bone">
      <h2 className="font-serif text-[48px]">Family</h2>
      <ul className="mt-6 font-sans text-bone/80">
        {lineage.map((p) => (
          <li key={p.id}>
            {p.name} · {p.relation}
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <MenuButton onClick={() => bridge.actions.closeOverlay()}>Back</MenuButton>
      </div>
    </div>
  )
}
