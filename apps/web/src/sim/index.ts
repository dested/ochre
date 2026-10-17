/**
 * The living band: createSim composes the clock, the band and its AI, the animals, the fires, learning and the
 * player's verbs into one deterministic Sim. Three-free and DOM-free.
 */
import { clockAt, DEFAULT_TIME_SCALE } from '../core/clock'
import { hashString, mix32, Rng } from '../core/rng'
import type { CreateSim, FireState, PlayerCommand, Sim, SimEvent, SimOptions, SimState } from '../game/contracts'
import { createAgent, keepApart, syncCarried, updatePerson } from './ai'
import { replenishHerds, startleHerd, updateAnimals, woundAnimal } from './animals'
import { buildBand, PLAYER_ID } from './band'
import { MAX_SUBSTEP, moveDt, PATH_BUDGET, type Agent, type SimCtx } from './ctx'
import { createDirector, type Director } from './director'
import { interact, interactionsNear, playerOf, relationOf, updateSleepSkip } from './interact'
import { gaze, spoil, updateAge, updateBonds, updateFires, updateLearning, updateNeeds } from './life'
import { PathService } from './path'
import { decodeSave, encodeSave, type SavePayload } from './save'
import { afterLoad, emptyMoments, momentExtras, showerOver, updateMoments } from './moments'
import { emptyTalk, noticeRecent, updateChatter } from './talk'
import { resetStage } from './setup'
import { STAGE_EPOCH } from './time'
import { weatherAt } from './weather'

export { createTestWorld } from './test-world'
export { randomLook } from './looks'

/** game seconds per substep while the director skips time */
const SKIP_SUBSTEP = 30

const contexts = new WeakMap<Sim, SimCtx>()
const directors = new WeakMap<Sim, Director>()

/** the sim's internals, for the lab and tests only */
export function debugCtx(sim: Sim): SimCtx | undefined {
  return contexts.get(sim)
}

/** the sim's director (current beat, complete-beat), for the lab, QA and tests; none in a sandbox sim */
export function debugDirector(sim: Sim): Director | undefined {
  return directors.get(sim)
}

/** the game's sim: the living band with the director running the chapters */
export const createSim: CreateSim = (opts) => createSimWith(opts, { director: true })

/** the band without the director: daily life only (the lab's sandbox, tests, run-day) */
export function createSandboxSim(opts: SimOptions): Sim {
  return createSimWith(opts, { director: false })
}

export function createSimWith(opts: SimOptions, flags: { director: boolean }): Sim {
  const { world, seed, stage, playerName } = opts
  const epoch = { ...STAGE_EPOCH[stage] }
  const clock = clockAt(0, epoch)
  const fires: FireState[] = world.poisOf('hearth').map((h) => ({ id: h.id, x: h.x, z: h.z, intensity: 0.5 }))

  const state: SimState = {
    seed,
    clock,
    weather: weatherAt(seed, stage, clock),
    people: [],
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
    fuel: {},
    // in a story the player is play's from the first frame; in a sandbox the AI lives their day until a move arrives
    playerControlled: flags.director,
    sleepSkip: null,
    sunCache: new Map(),
    nextAnimalId: 1,
    lastHour: 0,
    live: false,
    fastForward: false,
    noAiHunts: false,
    demo: null,
    director: null,
    pupil: null,
    talk: emptyTalk(),
    moments: emptyMoments(),
  }

  resetStage(ctx, stage, buildBand(seed, stage, playerName))
  const saved = opts.save ? decodeSave(opts.save) : null
  if (saved) {
    restore(ctx, saved)
    afterLoad(ctx, saved.moments?.window ?? null)
  }
  for (const p of state.people) if (p.carriedBy) syncCarried(ctx, p)

  const director: Director | null = flags.director
    ? createDirector({ ctx, advance: (s) => skip(s), playerName }, ctx.stage, saved?.director ?? null)
    : null
  ctx.director = director ? director.hooks : null

  function substep(gameDt: number, realDt: number): void {
    const t = state.clock.t + gameDt
    state.clock = clockAt(t, ctx.epoch)
    state.weather = weatherAt(seed, ctx.stage, state.clock)
    showerOver(ctx)
    ctx.paths.pump(PATH_BUDGET)
    updateFires(ctx, gameDt)
    for (const p of state.people) {
      if (!p.alive) continue
      updateAge(ctx, p)
      if (p.carriedBy) continue
      if (p.isPlayer && (ctx.playerControlled || ctx.sleepSkip)) continue
      const ag = ctx.agents.get(p.id)
      if (ag) updatePerson(ctx, p, ag, gameDt, moveDt(ctx, p.position, gameDt, realDt))
    }
    keepApart(ctx, realDt)
    for (const p of state.people) {
      if (!p.alive) continue
      if (p.carriedBy) syncCarried(ctx, p)
      updateNeeds(ctx, p, gameDt)
    }
    updateAnimals(ctx, gameDt, realDt)
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

  // events raised by commands between steps (a talk caption, an item, a face) go out with the next step
  let returned = 0
  function step(dt: number): SimEvent[] {
    ctx.events = ctx.events.slice(returned)
    returned = ctx.events.length
    if (!(dt > 0)) return ctx.events
    const gameDt = dt * state.timeScale
    const n = Math.max(1, Math.ceil(gameDt / MAX_SUBSTEP))
    for (let i = 0; i < n; i++) substep(gameDt / n, dt / n)
    noticeRecent(ctx)
    director?.update(dt)
    updateMoments(ctx)
    updateChatter(ctx, dt)
    returned = ctx.events.length
    return ctx.events
  }

  /** a director time skip: the world lives through it at speed; only deaths are reported */
  function skip(gameSeconds: number): void {
    if (!(gameSeconds > 0)) return
    const kept = ctx.events
    ctx.events = []
    ctx.fastForward = true
    const n = Math.max(1, Math.ceil(gameSeconds / SKIP_SUBSTEP))
    for (let i = 0; i < n; i++) substep(gameSeconds / n, 0)
    ctx.fastForward = false
    for (const e of ctx.events) if (e.type === 'death') kept.push(e)
    ctx.events = kept
  }

  function command(cmd: PlayerCommand): void {
    const player = playerOf(ctx)
    switch (cmd.type) {
      case 'move':
        ctx.live = true
        if (player.carriedBy || ctx.sleepSkip) return
        ctx.playerControlled = true
        player.position = { x: cmd.position.x, z: cmd.position.z }
        player.heading = cmd.heading
        player.speed = cmd.speed
        player.anim = cmd.anim
        player.task = { kind: 'idle', targetId: null, target: null, until: null, skill: null }
        return
      case 'interact': {
        const inv = state.inventory
        const before = { firewood: inv.firewood, food: inv.shellfish + inv.corms }
        const it = interact(ctx, cmd.interactionId)
        if (it && director) director.onInteract(it, before)
        return
      }
      case 'gaze':
        ctx.live = true
        gaze(ctx, cmd.personId, cmd.dt)
        return
      case 'spear-hit': {
        const hit = woundAnimal(ctx, cmd.animalId, player.position)
        director?.onSpearHit(cmd.animalId, hit)
        return
      }
      case 'spear-miss': {
        const herd = ctx.herds.find((h) => Math.hypot(h.center.x - player.position.x, h.center.z - player.position.z) < 120)
        if (herd) startleHerd(ctx, herd, player.position)
        return
      }
      case 'minigame-result':
        if (director) director.onMinigame(cmd.game, cmd.quality)
        else if (cmd.game === 'knapping') state.inventory.point = Math.max(0.05, Math.min(1, cmd.quality))
        return
      case 'set-time-scale':
        state.timeScale = Math.max(0, cmd.scale)
        return
      case 'choose':
        director?.onChoose(cmd.choiceId, cmd.optionId)
        return
      case 'continue-as-heir':
        director?.continueAsHeir()
        return
    }
  }

  function serialize() {
    const extras = momentExtras(ctx)
    const payload: SavePayload = {
      seed,
      stage: ctx.stage,
      playerName,
      epoch: ctx.epoch,
      t: state.clock.t,
      timeScale: ctx.sleepSkip ? ctx.sleepSkip.restore : state.timeScale,
      // a half-played moment's visitor or lion is not part of the world the save keeps
      people: state.people.filter((p) => !extras.people.has(p.id)),
      animals: state.animals.filter((a) => !extras.animals.has(a.id)),
      fires: state.fires,
      fuel: Object.fromEntries(Object.entries(ctx.fuel).map(([k, v]) => [k, { fuel: v.fuel }])),
      hearth: state.hearth,
      inventory: state.inventory,
      notes: state.notes,
      chapter: state.chapter,
      playerId: state.playerId,
      playerControlled: ctx.playerControlled,
      agents: [...ctx.agents.values()].filter((a) => !extras.people.has(a.id)).map((a) => ({
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
      talk: { used: ctx.talk.used, recent: ctx.talk.recent, talkedAt: ctx.talk.talkedAt },
      moments: { window: ctx.moments.window },
      ...(director ? { director: director.save() } : {}),
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
  if (director) directors.set(sim, director)
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
  ctx.talk = { ...emptyTalk(), ...(s.talk ?? {}), lastMeat: s.hearth.meat }
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
