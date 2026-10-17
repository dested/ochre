/**
 * The living band: createSim composes the clock, the band and its AI, the animals, the fires, learning and the
 * player's verbs into one deterministic Sim. Three-free and DOM-free.
 */
import { clockAt, DEFAULT_TIME_SCALE } from '../core/clock'
import { hashString, mix32, Rng } from '../core/rng'
import type { CreateSim, FireState, PlayerCommand, Sim, SimEvent, SimState } from '../game/contracts'
import { createAgent, syncCarried, updatePerson } from './ai'
import { replenishHerds, spawnAnimals, startleHerd, updateAnimals, woundAnimal } from './animals'
import { buildBand, PLAYER_ID } from './band'
import { MAX_SUBSTEP, PATH_BUDGET, type Agent, type SimCtx } from './ctx'
import { interact, interactionsNear, playerOf, relationOf, updateSleepSkip } from './interact'
import { gaze, spoil, updateAge, updateBonds, updateFires, updateLearning, updateNeeds } from './life'
import { PathService } from './path'
import { decodeSave, encodeSave, type SavePayload } from './save'
import { STAGE_EPOCH } from './time'
import { weatherAt } from './weather'

export { createTestWorld } from './test-world'
export { randomLook } from './looks'

const SLEEP_SPOTS = ['sleep-1', 'sleep-2', 'sleep-3', 'sleep-4', 'sleep-5', 'sleep-6']

const contexts = new WeakMap<Sim, SimCtx>()

/** the sim's internals, for the lab and tests only */
export function debugCtx(sim: Sim): SimCtx | undefined {
  return contexts.get(sim)
}

export const createSim: CreateSim = (opts) => {
  const { world, seed, stage, playerName } = opts
  const epoch = { ...STAGE_EPOCH[stage] }
  const clock = clockAt(0, epoch)
  const people = buildBand(seed, stage, playerName)
  const fires: FireState[] = world.poisOf('hearth').map((h) => ({ id: h.id, x: h.x, z: h.z, intensity: 0.5 }))

  const state: SimState = {
    seed,
    clock,
    weather: weatherAt(seed, stage, clock),
    people,
    animals: [],
    fires,
    hearth: { shellfish: 20, corms: 30, meat: 0, firewood: 24 },
    playerId: PLAYER_ID,
    stage,
    chapter: { stage, beatId: `${stage}.free`, objective: null, finished: false },
    watching: null,
    inventory: { shellfish: 0, corms: 0, silcrete: 0, firewood: 0, ochre: 0, gum: 0, beads: 0, point: 0, hafted: false },
    notes: [],
    timeScale: DEFAULT_TIME_SCALE,
  }

  const ctx: SimCtx = {
    world,
    state,
    rng: new Rng(mix32(seed, hashString(stage))),
    epoch,
    stage,
    paths: new PathService(world),
    events: [],
    agents: new Map(),
    brains: new Map(),
    herds: [],
    fuel: Object.fromEntries(fires.map((f, i) => [f.id, { fuel: i === 0 ? 0.7 : 0.4, tender: null }])),
    playerControlled: false,
    sleepSkip: null,
    sunCache: new Map(),
    nextAnimalId: 1,
    lastHour: 0,
  }

  // families share a sleeping hollow; everyone has a seat at the hearth
  const familyOrder: string[] = []
  const bedsTaken = new Map<string, number>()
  people.forEach((p, i) => {
    if (!familyOrder.includes(p.familyId)) familyOrder.push(p.familyId)
    const fi = familyOrder.indexOf(p.familyId)
    const bed = bedsTaken.get(p.familyId) ?? 0
    bedsTaken.set(p.familyId, bed + 1)
    ctx.agents.set(p.id, createAgent(p.id, SLEEP_SPOTS[fi % SLEEP_SPOTS.length] ?? 'sleep-1', i, bed))
  })
  // start the morning where each family slept
  for (const p of people) {
    const ag = ctx.agents.get(p.id)
    if (!ag) continue
    const spot = world.poi(ag.sleepId)
    const ang = ag.bed * 1.7
    const r = ag.bed === 0 ? 0 : 0.9 + ag.bed * 0.25
    p.position = { x: spot.x + Math.sin(ang) * r, z: spot.z + Math.cos(ang) * r }
    p.heading = ctx.rng.range(0, Math.PI * 2)
  }
  spawnAnimals(ctx)

  if (opts.save) restore(ctx, decodeSave(opts.save))
  for (const p of state.people) if (p.carriedBy) syncCarried(ctx, p)

  function substep(gameDt: number, realDt: number): void {
    const t = state.clock.t + gameDt
    state.clock = clockAt(t, ctx.epoch)
    state.weather = weatherAt(seed, ctx.stage, state.clock)
    ctx.paths.pump(PATH_BUDGET)
    updateFires(ctx, gameDt)
    for (const p of state.people) {
      if (!p.alive) continue
      updateAge(ctx, p)
      if (p.carriedBy) continue
      if (p.isPlayer && (ctx.playerControlled || ctx.sleepSkip)) continue
      const ag = ctx.agents.get(p.id)
      if (ag) updatePerson(ctx, p, ag, gameDt)
    }
    for (const p of state.people) {
      if (!p.alive) continue
      if (p.carriedBy) syncCarried(ctx, p)
      updateNeeds(ctx, p, gameDt)
    }
    updateAnimals(ctx, gameDt)
    updateLearning(ctx, realDt)
    updateBonds(ctx, gameDt)
    updateSleepSkip(ctx)
    const hour = Math.floor(t / 3600)
    if (hour !== ctx.lastHour) {
      ctx.lastHour = hour
      spoil(ctx)
      if (Math.floor(state.clock.hour) === 5) replenishHerds(ctx)
    }
  }

  function step(dt: number): SimEvent[] {
    ctx.events = []
    if (!(dt > 0)) return ctx.events
    const gameDt = dt * state.timeScale
    const n = Math.max(1, Math.ceil(gameDt / MAX_SUBSTEP))
    for (let i = 0; i < n; i++) substep(gameDt / n, dt / n)
    return ctx.events
  }

  function command(cmd: PlayerCommand): void {
    const player = playerOf(ctx)
    switch (cmd.type) {
      case 'move':
        if (player.carriedBy || ctx.sleepSkip) return
        ctx.playerControlled = true
        player.position = { x: cmd.position.x, z: cmd.position.z }
        player.heading = cmd.heading
        player.speed = cmd.speed
        player.anim = cmd.anim
        player.task = { kind: 'idle', targetId: null, target: null, until: null, skill: null }
        return
      case 'interact':
        interact(ctx, cmd.interactionId)
        return
      case 'gaze':
        gaze(ctx, cmd.personId, cmd.dt)
        return
      case 'spear-hit':
        woundAnimal(ctx, cmd.animalId, player.position)
        return
      case 'spear-miss': {
        const herd = ctx.herds.find((h) => Math.hypot(h.center.x - player.position.x, h.center.z - player.position.z) < 120)
        if (herd) startleHerd(ctx, herd, player.position)
        return
      }
      case 'minigame-result':
        if (cmd.game === 'knapping') state.inventory.point = Math.max(0.05, Math.min(1, cmd.quality))
        return
      case 'set-time-scale':
        state.timeScale = Math.max(0, cmd.scale)
        return
      case 'choose':
      case 'continue-as-heir':
        // the director's commands arrive in S2
        return
    }
  }

  function serialize() {
    const payload: SavePayload = {
      seed,
      stage: ctx.stage,
      playerName,
      epoch: ctx.epoch,
      t: state.clock.t,
      timeScale: ctx.sleepSkip ? ctx.sleepSkip.restore : state.timeScale,
      people: state.people,
      animals: state.animals,
      fires: state.fires,
      fuel: Object.fromEntries(Object.entries(ctx.fuel).map(([k, v]) => [k, { fuel: v.fuel }])),
      hearth: state.hearth,
      inventory: state.inventory,
      notes: state.notes,
      chapter: state.chapter,
      playerId: state.playerId,
      playerControlled: ctx.playerControlled,
      agents: [...ctx.agents.values()].map((a) => ({
        id: a.id,
        sleepId: a.sleepId,
        seat: a.seat,
        bed: a.bed,
        mealDay: a.mealDay,
        breakfastDay: a.breakfastDay,
        load: a.load,
        learn: a.learn,
        gaze: a.gaze,
      })),
      herds: ctx.herds,
      nextAnimalId: ctx.nextAnimalId,
    }
    return encodeSave(payload)
  }

  const sim: Sim = {
    state,
    step,
    command,
    interactionsNear: (p, radius) => interactionsNear(ctx, p, radius),
    relationOf: (id) => relationOf(ctx, id),
    serialize,
  }
  contexts.set(sim, ctx)
  return sim
}

function restore(ctx: SimCtx, s: SavePayload): void {
  const state = ctx.state
  if (s.seed !== state.seed) throw new Error(`OCHRE save: the save is for seed ${s.seed}, not ${state.seed}`)
  ctx.stage = s.stage
  ctx.epoch = { ...s.epoch }
  state.stage = s.stage
  state.clock = clockAt(s.t, ctx.epoch)
  state.weather = weatherAt(s.seed, s.stage, state.clock)
  state.timeScale = s.timeScale
  state.people.splice(0, state.people.length, ...s.people)
  state.animals.splice(0, state.animals.length, ...s.animals)
  state.fires.splice(0, state.fires.length, ...s.fires)
  state.hearth = s.hearth
  state.inventory = s.inventory
  state.notes = s.notes
  state.chapter = s.chapter
  state.playerId = s.playerId
  ctx.playerControlled = s.playerControlled
  ctx.fuel = Object.fromEntries(Object.entries(s.fuel).map(([k, v]) => [k, { fuel: v.fuel, tender: null }]))
  ctx.rng = new Rng(mix32(s.seed, Math.floor(s.t)))
  ctx.agents.clear()
  for (const a of s.agents) {
    const ag: Agent = createAgent(a.id, a.sleepId, a.seat, a.bed)
    ag.mealDay = a.mealDay
    ag.breakfastDay = a.breakfastDay
    ag.load = a.load
    ag.learn = a.learn
    ag.gaze = a.gaze
    ctx.agents.set(a.id, ag)
  }
  ctx.herds = s.herds.map((h) => ({ ...h }))
  ctx.nextAnimalId = s.nextAnimalId
  ctx.lastHour = Math.floor(s.t / 3600)
  const den = [...ctx.brains.values()].find((b) => b.id.startsWith('hyena'))?.home ?? null
  ctx.brains.clear()
  for (const a of state.animals) {
    const dead = !a.alive
    ctx.brains.set(a.id, {
      id: a.id,
      mode: dead ? 'dead' : 'calm',
      target: null,
      until: dead ? s.t + 86_400 : 0,
      home: { x: a.position.x, z: a.position.z },
      orbit: a.kind === 'gull' ? { x: a.position.x, z: a.position.z, r: 40, dir: 1 } : null,
    })
  }
  for (const a of state.animals) {
    const b = ctx.brains.get(a.id)
    if (a.kind === 'hyena' && b && den) b.home = { ...den }
  }
}
