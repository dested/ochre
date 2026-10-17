/**
 * Headless day log: `bun apps/web/src/sim/run-day.ts --seed 1 --days 2 [--stage small]`
 * Prints an hourly line for the whole band and a line whenever someone in the fixed cast changes what they do.
 */
import type { LifeStageId, SimPerson, TaskKind } from '../game/contracts'
import { LIFE_STAGES } from '../game/contracts'
import { createSim } from './index'
import { createTestWorld } from './test-world'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback
}

function isStage(s: string): s is LifeStageId {
  return (LIFE_STAGES as readonly string[]).includes(s)
}

const seed = Number(arg('seed', '1'))
const days = Number(arg('days', '1'))
const stageArg = arg('stage', 'small')
const stage: LifeStageId = isStage(stageArg) ? stageArg : 'small'

const world = createTestWorld(seed)
const sim = createSim({ seed, world, stage, playerName: 'Teni' })
const s = sim.state
const CAST = new Set(['ama', 'tuk', 'oro', 'kaya', 'player', 'nehe'])

const fmt = (h: number) => {
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
const poiLabel = (id: string | null) => {
  if (!id) return ''
  const p = world.pois.find((q) => q.id === id)
  if (p) return p.label
  const person = s.people.find((q) => q.id === id)
  if (person) return person.name
  return id
}

const SHORT: Partial<Record<TaskKind, string>> = {
  'gather-shellfish': 'shore',
  'dig-corms': 'corms',
  'walk-to': 'walk',
  'fetch-wood': 'wood',
  socialize: 'hearth',
  'tend-fire': 'fire',
  'tell-story': 'story',
}

function describe(p: SimPerson): string {
  const k = p.task.kind
  if (k === 'walk-to' || k === 'follow' || k === 'hunt') return `${k} ${poiLabel(p.task.targetId) || nearestPoi(p)}`
  return `${k}${p.task.skill ? ` (${p.task.skill})` : ''} @ ${nearestPoi(p)}`
}

function nearestPoi(p: SimPerson): string {
  let best = ''
  let bd = Infinity
  for (const q of world.pois) {
    const d = Math.hypot(q.x - p.position.x, q.z - p.position.z) - q.radius
    if (d < bd) {
      bd = d
      best = q.label
    }
  }
  return bd < 30 ? best : `(${p.position.x.toFixed(0)}, ${p.position.z.toFixed(0)})`
}

console.log(`OCHRE sim · seed ${seed} · stage ${stage} · ${s.people.length} people · ${s.animals.length} animals · fixture world`)
const last = new Map<string, string>()
let lastHour = -1
const dt = 10 / s.timeScale
const end = days * 86_400
let elapsedMs = 0
let steps = 0
while (s.clock.t < end) {
  const t0 = performance.now()
  const events = sim.step(dt)
  elapsedMs += performance.now() - t0
  steps++
  const day = `D${s.clock.day} ${fmt(s.clock.hour)}`
  for (const e of events) {
    if (e.type === 'learned') {
      const p = s.people.find((q) => q.id === e.personId)
      const from = s.people.find((q) => q.id === e.fromId)
      console.log(`${day}   ★ ${p?.name ?? e.personId} learned ${e.skill}${from ? ` from ${from.name}` : ''}`)
    }
    if (e.type === 'sfx' && (e.name === 'eland-snort' || e.name === 'hit')) {
      console.log(`${day}   ${e.name === 'hit' ? '✦ a spear finds an eland' : '~ the eland bolt'}`)
    }
  }
  for (const p of s.people) {
    if (!CAST.has(p.id)) continue
    const d = p.task.kind === 'walk-to' ? `walk-to ${poiLabel(p.task.targetId) || '…'}` : p.task.kind
    if (last.get(p.id) !== d) {
      last.set(p.id, d)
      console.log(`${day}   ${p.name.padEnd(5)} ${describe(p)}`)
    }
  }
  const hour = Math.floor(s.clock.t / 3600)
  if (hour !== lastHour) {
    lastHour = hour
    const counts = new Map<string, number>()
    let inCave = 0
    for (const p of s.people) {
      const k = p.carriedBy ? 'held' : p.task.skill === 'hides' ? 'hides' : (SHORT[p.task.kind] ?? p.task.kind)
      counts.set(k, (counts.get(k) ?? 0) + 1)
      if (world.inCave(p.position.x, p.position.z)) inCave++
    }
    const tide = s.clock.seaLevel
    const w = s.weather
    const fire = s.fires.map((f) => f.intensity.toFixed(1)).join('/')
    const h = s.hearth
    const avg = (k: 'fed' | 'warmth' | 'energy') => (s.people.reduce((a, p) => a + p.needs[k], 0) / s.people.length).toFixed(2)
    const elands = s.animals.filter((a) => a.kind === 'eland' && a.alive).length
    console.log(
      `${day} ── sea ${tide >= 0 ? '+' : ''}${tide.toFixed(1)} · fire ${fire} · store s${h.shellfish} c${h.corms} m${h.meat} w${h.firewood}` +
        ` · cave ${inCave}/${s.people.length} · fed ${avg('fed')} warm ${avg('warmth')} energy ${avg('energy')}` +
        ` · ${w.rain > 0.1 ? `rain ${w.rain.toFixed(1)} ` : ''}wind ${w.wind.toFixed(1)} · eland ${elands}` +
        ` · ${[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    )
  }
}
console.log(`done · ${steps} steps · ${(elapsedMs / steps).toFixed(3)} ms per step (10 game s each)`)
