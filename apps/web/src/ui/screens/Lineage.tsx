/**
 * Family: the band laid out by generation around the player, with the bond to each person drawn as a ring
 * that fills with warmth. Your own family sits on the tree; everyone else in the band sits below it.
 */
import { useEffect } from 'react'
import { bridge, useBridge, type LineageEntry } from '~/game/bridge'
import { SKILL_LABELS } from '~/content/skills'
import { CrossHatch } from '../motifs'
import { C, mix } from '../palette'
import { MenuButton } from '../widgets'

/** −2 grandparents … +2 grandchildren; null for the wider band */
function generationOf(relation: string): number | null {
  const r = relation.toLowerCase()
  if (r.includes("'s ")) return null
  if (/grand(son|daughter|child)/.test(r)) return 2
  if (/grand(mother|father|parent)/.test(r)) return -2
  if (/^(mother|father|aunt|uncle|parent)/.test(r)) return -1
  if (/^(son|daughter|child)/.test(r)) return 1
  if (/^(sister|brother|partner|husband|wife|cousin|you)/.test(r)) return 0
  return null
}

function bondWord(bond: number): string {
  if (bond > 0.75) return 'Close'
  if (bond > 0.5) return 'Warm'
  if (bond > 0.25) return 'Friendly'
  return 'Distant'
}

const ROW_LABELS: Record<number, string> = {
  [-2]: 'Grandparents',
  [-1]: 'Parents',
  0: 'Your generation',
  1: 'Children',
  2: 'Grandchildren',
}

export function LineageScreen() {
  const lineage = useBridge((s) => s.lineage)
  const hud = useBridge((s) => s.hud)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') bridge.actions.closeOverlay()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const rows = new Map<number, LineageEntry[]>()
  const band: LineageEntry[] = []
  for (const p of lineage) {
    const g = generationOf(p.relation)
    if (g === null) band.push(p)
    else rows.set(g, [...(rows.get(g) ?? []), p])
  }
  const you: LineageEntry = {
    id: 'you',
    name: hud.name,
    relation: 'You',
    ageYears: hud.ageYears,
    alive: true,
    bond: 1,
    skills: [],
  }
  const gen0 = rows.get(0) ?? []
  // you stand in the middle of your generation
  const mid = Math.ceil(gen0.length / 2)
  rows.set(0, [...gen0.slice(0, mid), you, ...gen0.slice(mid)])
  const gens = [...rows.keys()].sort((a, b) => a - b)

  return (
    <div className="fixed inset-0 animate-ui-fade overflow-hidden bg-soot ui-grain">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.14] blur-[8px]"
        style={{ backgroundImage: 'url(/art/chapters/held.webp)', transform: 'scale(1.1)' }}
      />
      <div className="absolute inset-0 overflow-y-auto px-[clamp(24px,5vw,80px)] pb-12 pt-[clamp(24px,5vh,52px)]">
        <div className="mb-6 flex items-end justify-between gap-6">
          <div>
            <h2
              className="font-serif text-[clamp(36px,3.4vw,52px)] leading-none text-bone"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 100', fontWeight: 480 }}>
              Family
            </h2>
            <CrossHatch width={160} height={14} className="mt-3" />
            <p className="mt-2 font-sans text-[14px] text-bone-dim">The ring around each face is how close you are.</p>
          </div>
          <MenuButton onClick={() => bridge.actions.closeOverlay()}>Back</MenuButton>
        </div>

        <div className="flex flex-col items-center">
          {gens.map((g, i) => (
            <div key={g} className="flex w-full flex-col items-center">
              {i > 0 && <Connector />}
              <h3 className="mb-3 font-serif text-[15px] italic text-bone-dim" style={{ fontVariationSettings: '"opsz" 18' }}>
                {ROW_LABELS[g] ?? ''}
              </h3>
              <div className="flex flex-wrap justify-center gap-x-[clamp(16px,2.4vw,40px)] gap-y-5">
                {(rows.get(g) ?? []).map((p) => (
                  <Person key={p.id} p={p} self={p.id === 'you'} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {band.length > 0 && (
          <div className="mt-10">
            <h3 className="font-serif text-[22px] text-bone" style={{ fontVariationSettings: '"opsz" 36, "SOFT" 100' }}>
              The band
            </h3>
            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-5">
              {band.map((p) => (
                <Person key={p.id} p={p} small />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Connector() {
  return (
    <svg width="40" height="26" viewBox="0 0 40 26" aria-hidden className="my-1">
      <g fill="none" stroke={C.ochreBright} strokeOpacity="0.6" strokeWidth="1.4" strokeLinecap="round" style={{ filter: 'url(#ui-brush)' }}>
        <path d="M20 2 L20 24" />
        <path d="M14 9 L26 17 M26 9 L14 17" strokeOpacity="0.45" />
      </g>
    </svg>
  )
}

function Person({ p, self = false, small = false }: { p: LineageEntry; self?: boolean; small?: boolean }) {
  const size = small ? 52 : 66
  const r = size / 2 - 3
  const len = 2 * Math.PI * r
  const warm = self ? C.amber : mix(C.boneDim, C.amber, p.bond)
  const skills = p.skills.map((s) => SKILL_LABELS[s]).join(', ')
  return (
    <div className={'flex items-center gap-3 ' + (p.alive ? '' : 'opacity-55')} style={{ minWidth: small ? 0 : 168 }}>
      <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill={C.charcoal} fillOpacity="0.85" stroke="rgb(239 227 200 / 0.18)" strokeWidth="2" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={warm}
            strokeWidth={self ? 3 : 2.6}
            strokeLinecap="round"
            strokeDasharray={`${len * (self ? 1 : p.bond)} ${len}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ filter: 'url(#ui-brush)' }}
          />
        </svg>
        <span
          className="relative font-serif text-bone"
          style={{ fontSize: small ? 20 : 26, fontVariationSettings: '"opsz" 48, "SOFT" 100', fontWeight: 500 }}>
          {p.name.slice(0, 1)}
        </span>
      </div>
      <div className="min-w-0">
        <p className="font-serif text-[18px] leading-tight text-bone" style={{ fontVariationSettings: '"opsz" 24, "SOFT" 60', fontWeight: 540 }}>
          {p.name}
          {!p.alive && <span className="ml-2 font-sans text-[12px] italic text-bone-dim">remembered</span>}
        </p>
        <p className="whitespace-nowrap font-sans text-[13px] text-bone-dim">
          {p.relation}
          {p.ageYears > 0 ? ` · ${p.ageYears}` : ''}
        </p>
        {!self && <p className="font-sans text-[12px]" style={{ color: warm }}>{bondWord(p.bond)}</p>}
        {!small && skills && <p className="mt-0.5 max-w-[200px] font-sans text-[12px] leading-snug text-bone/60">{skills}</p>}
      </div>
    </div>
  )
}
