/**
 * Setting a stage: the clock at the stage's epoch, the band placed at their sleeping hollows with fresh minds,
 * the fires laid, the animals out. Used when a sim is created and when a chapter hands over to the next in place.
 */
import { clockAt, DEFAULT_TIME_SCALE } from '../core/clock'
import type { LifeStageId, SimPerson } from '../game/contracts'
import { createAgent, syncCarried } from './ai'
import { spawnAnimals } from './animals'
import type { SimCtx } from './ctx'
import { STAGE_EPOCH } from './time'
import { weatherAt } from './weather'

const SLEEP_SPOTS = ['sleep-1', 'sleep-2', 'sleep-3', 'sleep-4', 'sleep-5', 'sleep-6']

/** families share a sleeping hollow; everyone has a seat at the hearth; the morning starts where they slept */
export function placeBand(ctx: SimCtx): void {
  const { world, state } = ctx
  ctx.agents.clear()
  const familyOrder: string[] = []
  const bedsTaken = new Map<string, number>()
  for (const p of state.people) if (!familyOrder.includes(p.familyId)) familyOrder.push(p.familyId)
  // hearth seats go round the ring family by family, so each family sits side by side
  const seated = [...state.people].sort((a, b) => familyOrder.indexOf(a.familyId) - familyOrder.indexOf(b.familyId))
  for (const p of state.people) {
    const fi = familyOrder.indexOf(p.familyId)
    const bed = bedsTaken.get(p.familyId) ?? 0
    bedsTaken.set(p.familyId, bed + 1)
    ctx.agents.set(p.id, createAgent(p.id, SLEEP_SPOTS[fi % SLEEP_SPOTS.length] ?? 'sleep-1', seated.indexOf(p), bed))
  }
  for (const p of state.people) {
    const ag = ctx.agents.get(p.id)
    if (!ag) continue
    const spot = world.poi(ag.sleepId)
    const ang = ag.bed * 1.7
    const r = ag.bed === 0 ? 0 : 0.9 + ag.bed * 0.25
    p.position = { x: spot.x + Math.sin(ang) * r, z: spot.z + Math.cos(ang) * r }
    p.heading = ctx.rng.range(0, Math.PI * 2)
    p.speed = 0
    p.task = { kind: 'idle', targetId: null, target: null, until: null, skill: null }
    p.speech = null
  }
  for (const p of state.people) if (p.carriedBy) syncCarried(ctx, p)
}

/** start `stage` with these people at its epoch's first morning */
export function resetStage(ctx: SimCtx, stage: LifeStageId, people: SimPerson[]): void {
  const state = ctx.state
  ctx.stage = stage
  ctx.epoch = { ...STAGE_EPOCH[stage] }
  state.stage = stage
  state.clock = clockAt(0, ctx.epoch)
  state.weather = weatherAt(state.seed, stage, state.clock)
  state.people.splice(0, state.people.length, ...people)
  state.hearth = { shellfish: 20, corms: 30, meat: 0, firewood: 24 }
  state.inventory = { shellfish: 0, corms: 0, silcrete: 0, firewood: 0, ochre: 0, gum: 0, beads: 0, point: 0, hafted: false }
  state.watching = null
  state.timeScale = DEFAULT_TIME_SCALE
  state.chapter = { stage, beatId: `${stage}.free`, objective: null, finished: false }
  state.fires.forEach((f, i) => {
    f.intensity = 0.5
    ctx.fuel[f.id] = { fuel: i === 0 ? 0.7 : 0.4, tender: null }
  })
  ctx.sleepSkip = null
  ctx.lastHour = 0
  ctx.noAiHunts = false
  ctx.demo = null
  // years pass between chapters: yesterday's talk is long said
  ctx.talk.used = {}
  ctx.talk.recent = {}
  ctx.talk.talkedAt = {}
  ctx.talk.lastMeat = state.hearth.meat
  ctx.moments.active = null
  ctx.moments.rain = null
  ctx.moments.fired = {}
  placeBand(ctx)
  state.animals.splice(0, state.animals.length)
  ctx.brains.clear()
  ctx.herds = []
  spawnAnimals(ctx)
}
