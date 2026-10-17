/**
 * The last walk's memories: the three strongest things this life's record holds, in the order they were lived,
 * as narration lines from `MEMORY_LINES`. Pure, so the walk can ask again on any frame (and after a load).
 */
import type { LifeStageId, SimPerson } from '../../game/contracts'
import { MEMORY_FALLBACK, MEMORY_LINES, type MemoryKind } from '../lines'
import { pickHeir, type LifeRecord } from './history'

const STAGE_ORDER: readonly LifeStageId[] = ['held', 'small', 'youth', 'provider', 'elder']

/** the order within a stage when two memories share one */
const KIND_ORDER: readonly MemoryKind[] = [
  'mother',
  'mother-shell',
  'seal-pup',
  'tide',
  'lion-eyes',
  'rain-dash',
  'honeyguide',
  'hunt',
  'beads',
  'partner',
  'children-1',
  'children-2',
  'children-3',
  'first-steps',
  'taught',
  'whale',
  'moon-dance',
  'buried',
  'engraving',
  'story',
  'heir',
]

/** moments the walk can recall, by moment id, and how strongly */
const MOMENTS: Partial<Record<string, { kind: MemoryKind; strength: number }>> = {
  'seal-pup': { kind: 'seal-pup', strength: 3 },
  honeyguide: { kind: 'honeyguide', strength: 3 },
  'lion-eyes': { kind: 'lion-eyes', strength: 2 },
  'rain-dash': { kind: 'rain-dash', strength: 1 },
  'moon-dance': { kind: 'moon-dance', strength: 3 },
  'first-steps': { kind: 'first-steps', strength: 4 },
}

type Candidate = { kind: MemoryKind; stage: LifeStageId; strength: number; text: string }

function fill(kind: MemoryKind, vars: Record<string, string> = {}): string {
  return MEMORY_LINES[kind].replace(/\{(\w+)\}/g, (m: string, k: string) => vars[k] ?? m)
}

function isStage(s: string): s is LifeStageId {
  return STAGE_ORDER.some((x) => x === s)
}

export function pickMemories(life: LifeRecord, people: readonly SimPerson[], playerId: string): string[] {
  const pl = people.find((p) => p.id === playerId)
  const byId = (id: string | null | undefined) => (id ? people.find((p) => p.id === id) : undefined)
  const lived = (id: string) => life.lived.includes(id)
  const children = pl ? pl.childIds.flatMap((id) => byId(id) ?? []) : []
  const out: Candidate[] = []
  const add = (kind: MemoryKind, stage: LifeStageId, strength: number, vars?: Record<string, string>) => {
    if (out.some((c) => c.kind === kind)) return
    out.push({ kind, stage, strength, text: fill(kind, vars) })
  }

  if (life.motherName) add(lived('held.shell') ? 'mother-shell' : 'mother', 'held', lived('held.faces') ? 4 : 3, { name: life.motherName })
  if (lived('small.tide')) add('tide', 'small', 2)
  if (lived('youth.throw') || lived('youth.track')) add('hunt', 'youth', 3)
  if (life.beadsGivenTo) add('beads', 'youth', 4, { name: life.beadsGivenTo })
  else if (life.partnerName) add('partner', 'youth', 3, { name: life.partnerName })
  const [a, b, c] = children
  if (a && b && c) add('children-3', 'provider', 5, { a: a.name, b: b.name, c: c.name })
  else if (a && b) add('children-2', 'provider', 5, { a: a.name, b: b.name })
  else if (a) add('children-1', 'provider', 4, { a: a.name })
  const pupil = life.taught[0]
  if (pupil) add('taught', 'provider', 3, { name: pupil.name })
  if (lived('provider.whale')) add('whale', 'provider', 5)
  for (const entry of life.lived) {
    const [head, rest] = entry.split(':')
    if (head === 'buried' && rest) add('buried', 'provider', 4, { name: rest })
    else if (head && rest && isStage(head)) {
      const m = MOMENTS[rest]
      if (m) add(m.kind, head, m.strength, m.kind === 'first-steps' ? { name: a?.name ?? 'the baby' } : {})
    }
  }
  if (life.engraving !== null) add('engraving', 'elder', 2)
  if (life.storyTold) add('story', 'elder', 2)
  const heir = pickHeir(people, playerId)
  if (heir) add('heir', 'elder', 3, { name: heir.name })

  const when = (c: Candidate) => STAGE_ORDER.indexOf(c.stage) * 100 + KIND_ORDER.indexOf(c.kind)
  const strongest = [...out].sort((x, y) => y.strength - x.strength || when(x) - when(y)).slice(0, 3)
  const lines = strongest.sort((x, y) => when(x) - when(y)).map((c) => c.text)
  for (const f of MEMORY_FALLBACK) if (lines.length < 3) lines.push(f)
  return lines
}
