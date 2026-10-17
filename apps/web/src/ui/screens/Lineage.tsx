/**
 * Family: the player's family laid out by generation from the bridge's mother/father/partner links (couples side
 * by side, children under their parents), the bond to each person drawn as a ring that fills with warmth.
 * Everyone else in the band sits below the tree.
 */
import { useEffect } from 'react'
import { bridge, useBridge, type LineageEntry } from '~/game/bridge'
import { SKILL_LABELS } from '~/content/skills'
import { CrossHatch } from '../motifs'
import { C, mix } from '../palette'
import { ageShort } from '../format'
import { MenuButton } from '../widgets'

/**
 * The player's family: every ancestor, everyone descended from an ancestor (siblings, aunts, cousins), and their
 * partners. Everyone else in the band sits below the tree.
 */
function familyIds(all: readonly LineageEntry[], playerId: string): Set<string> {
  const byId = new Map(all.map((p) => [p.id, p]))
  const blood = new Set<string>([playerId])
  const up = [playerId]
  while (up.length > 0) {
    const p = byId.get(up.pop() ?? '')
    for (const parent of [p?.motherId, p?.fatherId]) {
      if (parent && byId.has(parent) && !blood.has(parent)) {
        blood.add(parent)
        up.push(parent)
      }
    }
  }
  for (let grew = true; grew; ) {
    grew = false
    for (const p of all) {
      if (blood.has(p.id)) continue
      if ((p.motherId && blood.has(p.motherId)) || (p.fatherId && blood.has(p.fatherId))) {
        blood.add(p.id)
        grew = true
      }
    }
  }
  const family = new Set(blood)
  for (const p of all) {
    if (blood.has(p.id) && p.partnerId && byId.has(p.partnerId)) family.add(p.partnerId)
    if (p.partnerId && blood.has(p.partnerId)) family.add(p.id)
  }
  return family
}

type Unit = LineageEntry[]

/** one generation as units (a person, or a couple side by side), children ordered under their parents */
function orderRow(row: readonly LineageEntry[], above: readonly LineageEntry[]): Unit[] {
  const ids = new Set(row.map((p) => p.id))
  const NONE = Number.POSITIVE_INFINITY
  const parentIndex = (p: LineageEntry) => {
    const i = above.findIndex((a) => a.id === p.motherId || a.id === p.fatherId)
    return i < 0 ? NONE : i
  }
  const partnerIn = (p: LineageEntry) => (p.partnerId && ids.has(p.partnerId) ? row.find((q) => q.id === p.partnerId) : undefined)
  // an in-law (no parents in the row above) sits beside their partner instead of sorting on their own
  const followsPartner = (p: LineageEntry) => {
    const partner = partnerIn(p)
    return partner !== undefined && parentIndex(p) === NONE && parentIndex(partner) !== NONE
  }
  const anchors = row.filter((p) => !followsPartner(p))
  const sorted = anchors
    .map((p, i) => ({ p, i }))
    .sort((a, b) => parentIndex(a.p) - parentIndex(b.p) || (a.p.isPlayer ? 0.5 : 0) - (b.p.isPlayer ? 0.5 : 0) || a.i - b.i)
    .map((x) => x.p)
  const placed = new Set<string>()
  const units: Unit[] = []
  for (const p of sorted) {
    if (placed.has(p.id)) continue
    placed.add(p.id)
    const partner = partnerIn(p)
    if (partner && !placed.has(partner.id)) {
      placed.add(partner.id)
      units.push([p, partner])
    } else units.push([p])
  }
  for (const p of row) if (!placed.has(p.id)) units.push([p])
  return units
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

  const player: LineageEntry = lineage.find((p) => p.isPlayer) ?? {
    id: 'you',
    name: hud.name,
    relation: 'You',
    ageYears: hud.ageYears,
    alive: true,
    bond: 1,
    skills: [],
    motherId: null,
    fatherId: null,
    partnerId: null,
    generation: 0,
    isPlayer: true,
  }
  const everyone = lineage.some((p) => p.isPlayer) ? lineage : [...lineage, player]
  const family = familyIds(everyone, player.id)
  const band = everyone.filter((p) => !family.has(p.id))
  const byGen = new Map<number, LineageEntry[]>()
  for (const p of everyone) if (family.has(p.id)) byGen.set(p.generation, [...(byGen.get(p.generation) ?? []), p])
  const gens = [...byGen.keys()].sort((a, b) => a - b)
  const rows: { gen: number; units: Unit[] }[] = []
  let above: LineageEntry[] = []
  for (const g of gens) {
    const units = orderRow(byGen.get(g) ?? [], above)
    rows.push({ gen: g, units })
    above = units.flat()
  }

  return (
    <div className="fixed inset-0 animate-ui-fade overflow-hidden bg-soot ui-grain">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.14] blur-[8px]"
        style={{ backgroundImage: 'url(/art/chapters/held.webp)', transform: 'scale(1.1)' }}
      />
      <div className="ui-scale absolute inset-0 overflow-y-auto px-[clamp(24px,5vw,80px)] pb-12 pt-[clamp(24px,5vh,52px)]">
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
          {rows.map(({ gen, units }, i) => (
            <div key={gen} className="flex w-full flex-col items-center">
              {i > 0 && <Connector />}
              <h3 className="mb-3 font-serif text-[15px] italic text-bone-dim" style={{ fontVariationSettings: '"opsz" 18' }}>
                {ROW_LABELS[gen] ?? ''}
              </h3>
              <div className="flex flex-wrap justify-center gap-x-[clamp(20px,3vw,52px)] gap-y-5">
                {units.map((unit) => (
                  <div key={unit.map((p) => p.id).join('+')} className="flex items-center gap-3">
                    {unit.map((p, j) => (
                      <div key={p.id} className="flex items-center gap-3">
                        {j > 0 && <PartnerMark />}
                        <Person p={p} self={p.isPlayer} />
                      </div>
                    ))}
                  </div>
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

/** two short strokes bound by a crossing: partners */
function PartnerMark() {
  return (
    <svg width="26" height="18" viewBox="0 0 26 18" aria-label="partners" className="shrink-0">
      <g fill="none" stroke={C.amber} strokeOpacity="0.7" strokeWidth="1.4" strokeLinecap="round" style={{ filter: 'url(#ui-brush)' }}>
        <path d="M2 9 L24 9" />
        <path d="M9 4 L17 14 M17 4 L9 14" strokeOpacity="0.5" />
      </g>
    </svg>
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
          {p.ageYears > 0 ? ` · ${ageShort(p.ageYears)}` : ''}
        </p>
        {!self && <p className="font-sans text-[12px]" style={{ color: warm }}>{bondWord(p.bond)}</p>}
        {!small && skills && <p className="mt-0.5 max-w-[200px] font-sans text-[12px] leading-snug text-bone/60">{skills}</p>}
      </div>
    </div>
  )
}
