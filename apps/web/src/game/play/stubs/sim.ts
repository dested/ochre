/**
 * Stub Sim until src/sim lands: the fixed cast walking simple routines between POIs, watch-to-learn, gaze,
 * a handful of interactions and events. Just enough to drive the play session. Deterministic, three-free.
 */
import { clockAt, type ClockEpoch } from '../../../core/clock'
import { Rng, hashString } from '../../../core/rng'
import type {
  CreateSim,
  Interaction,
  LifeStageId,
  PersonLook,
  PlayerCommand,
  Sex,
  SimAnimal,
  SimEvent,
  SimPerson,
  SimState,
  SkillId,
  TaskKind,
  Vec2,
  WorldData,
} from '../../contracts'

const PLAYER_AGE: Record<LifeStageId, number> = { held: 0.4, small: 6, youth: 14, provider: 26, elder: 58 }

type CastDef = { id: string; name: string; sex: Sex; age: number; skills: SkillId[]; relation: string | null }

function castFor(stage: LifeStageId): CastDef[] {
  const dy = PLAYER_AGE[stage]
  return [
    { id: 'ama', name: 'Ama', sex: 'female', age: 22 + dy, skills: ['shellfish', 'tides', 'corms', 'beads'], relation: 'Mother' },
    { id: 'tuk', name: 'Tuk', sex: 'male', age: 25 + dy, skills: ['knapping', 'heat', 'tracking', 'spear'], relation: 'Father' },
    { id: 'oro', name: 'Oro', sex: 'female', age: 56 + dy, skills: ['corms', 'medicine', 'stories', 'ochre'], relation: 'Grandmother' },
    { id: 'kaya', name: 'Kaya', sex: 'female', age: 4 + dy, skills: ['shellfish'], relation: 'Sister' },
    { id: 'nehe', name: 'Nehe', sex: 'female', age: 30 + dy, skills: ['shellfish', 'hides'], relation: null },
    { id: 'ilu', name: 'Ilu', sex: 'male', age: 5 + dy, skills: [], relation: null },
    { id: 'sabo', name: 'Sabo', sex: 'male', age: 8 + dy, skills: [], relation: null },
  ]
}

const ROUTINE: Record<string, { poi: string; task: TaskKind; skill: SkillId | null; minutes: number }[]> = {
  ama: [
    { poi: 'shore-mussels', task: 'gather-shellfish', skill: 'shellfish', minutes: 90 },
    { poi: 'hearth-main', task: 'tend-fire', skill: null, minutes: 30 },
  ],
  tuk: [
    { poi: 'hearth-main', task: 'knap', skill: 'knapping', minutes: 60 },
    { poi: 'lookout-point', task: 'idle', skill: null, minutes: 30 },
  ],
  oro: [
    { poi: 'corm-slope', task: 'dig-corms', skill: 'corms', minutes: 80 },
    { poi: 'hearth-main', task: 'tend-fire', skill: null, minutes: 40 },
  ],
  kaya: [
    { poi: 'shore-limpets', task: 'gather-shellfish', skill: 'shellfish', minutes: 60 },
    { poi: 'cave-mouth', task: 'play', skill: null, minutes: 30 },
  ],
  nehe: [
    { poi: 'shore-mussels', task: 'gather-shellfish', skill: 'shellfish', minutes: 70 },
    { poi: 'hearth-2', task: 'idle', skill: null, minutes: 40 },
  ],
  ilu: [{ poi: 'cave-mouth', task: 'play', skill: null, minutes: 40 }],
  sabo: [{ poi: 'shore-path-top', task: 'play', skill: null, minutes: 40 }],
}

const ANIM_FOR: Partial<Record<TaskKind, SimPerson['anim']>> = {
  'gather-shellfish': 'gather',
  'dig-corms': 'dig',
  knap: 'knap',
  'tend-fire': 'tend-fire',
  sleep: 'sleep',
  play: 'idle',
}

type Region = 'cave' | 'shore' | 'plateau' | 'cove' | 'far'
const SHORE_PATH: Vec2[] = [
  { x: -40, z: 88 },
  { x: -34, z: 93 },
  { x: -12, z: 104 },
  { x: 18, z: 122 },
  { x: 30, z: 140 },
]
const PLATEAU_PATH: Vec2[] = [
  { x: -40, z: 76 },
  { x: -30, z: 48 },
]
const COVE_PATH: Vec2[] = [
  { x: -45, z: 86 },
  { x: -60, z: 92 },
  { x: -110, z: 135 },
]

function regionOf(p: Vec2): Region {
  if (Math.hypot(p.x + 40, p.z - 80) < 22) return 'cave'
  if (p.x < -80 && p.z > 95) return 'cove'
  if (p.z > 110) return 'shore'
  if (p.z < 70) return 'plateau'
  return 'far'
}

function pathFromCave(r: Region): Vec2[] {
  if (r === 'shore') return SHORE_PATH
  if (r === 'plateau') return PLATEAU_PATH
  if (r === 'cove') return COVE_PATH
  return []
}

function route(from: Vec2, to: Vec2): Vec2[] {
  const a = regionOf(from)
  const b = regionOf(to)
  if (a === b) return [to]
  const out = [...pathFromCave(a)].reverse()
  out.push(...pathFromCave(b))
  out.push(to)
  return out
}

function lookFor(def: CastDef, seed: number): PersonLook {
  const r = new Rng(hashString(def.id) ^ seed)
  return {
    seed: r.int(0, 1 << 30),
    sex: def.sex,
    ageYears: def.age,
    skin: r.range(0.3, 0.9),
    height: r.range(0.95, 1.05),
    build: r.range(0.2, 0.7),
    hair: r.pick(['coils', 'knots', 'cropped', 'locs'] as const),
    garment: def.age < 12 ? 'apron' : 'kaross-apron',
    adornments: ['beads-neck'],
  }
}

export const createStubSim: CreateSim = (opts) => {
  const world: WorldData = opts.world
  const rng = new Rng(opts.seed)
  const stage = opts.stage
  const epoch: ClockEpoch = { dayOfYear: 235, hour: 7.6, moonPhase: 0.5, year: 0 }
  const clock = clockAt(0, epoch)
  const cast = castFor(stage)
  const relations = new Map<string, string | null>()
  const plans = new Map<string, { waypoints: Vec2[]; step: number }>()
  const hearth = world.poi('hearth-main')

  const mkPerson = (def: CastDef, isPlayer: boolean, at: Vec2): SimPerson => ({
    id: def.id,
    name: def.name,
    look: lookFor(def, opts.seed),
    birthDay: Math.round(-def.age * 365),
    motherId: null,
    fatherId: null,
    partnerId: null,
    childIds: [],
    familyId: 'f1',
    alive: true,
    isPlayer,
    position: { ...at },
    heading: Math.PI,
    speed: 0,
    anim: 'idle',
    held: { left: 'none', right: 'none' },
    carrying: null,
    carriedBy: null,
    lookAt: null,
    task: { kind: 'idle', targetId: null, target: null, until: null, skill: null },
    needs: { fed: 0.8, warmth: 0.8, energy: 0.9, health: 1 },
    skills: [...def.skills],
    bond: 0.5,
    known: false,
    speech: null,
  })

  const people: SimPerson[] = []
  cast.forEach((def, i) => {
    relations.set(def.id, def.relation)
    const a = (i / cast.length) * Math.PI * 2
    people.push(mkPerson(def, false, { x: hearth.x + Math.cos(a) * 3, z: hearth.z + Math.sin(a) * 2.5 }))
  })
  const playerDef: CastDef = {
    id: 'player',
    name: opts.playerName,
    sex: 'female',
    age: PLAYER_AGE[stage],
    skills: stage === 'held' ? [] : stage === 'small' ? ['faces'] : ['faces', 'shellfish', 'corms'],
    relation: null,
  }
  const player = mkPerson(playerDef, true, { x: hearth.x, z: hearth.z + 4 })
  people.push(player)
  const ama = people.find((p) => p.id === 'ama')
  if (stage === 'held' && ama) {
    player.carriedBy = 'ama'
    ama.carrying = { id: 'player', slot: 'arms' }
    player.anim = 'held'
  }

  const animals: SimAnimal[] = []
  const herd = world.poi('eland-plateau')
  for (let i = 0; i < 8; i++)
    animals.push({
      id: `eland-${i}`,
      kind: 'eland',
      position: { x: herd.x + rng.range(-30, 30), z: herd.z + rng.range(-30, 30) },
      altitude: 0,
      heading: rng.range(0, Math.PI * 2),
      speed: 0,
      anim: 'graze',
      alive: true,
      wounded: false,
      herdId: 'h1',
    })
  const seals = world.poi('seal-rocks')
  for (let i = 0; i < 3; i++)
    animals.push({
      id: `seal-${i}`,
      kind: 'seal',
      position: { x: seals.x + rng.range(-5, 5), z: seals.z + rng.range(-5, 5) },
      altitude: 0,
      heading: rng.range(0, Math.PI * 2),
      speed: 0,
      anim: 'lie',
      alive: true,
      wounded: false,
      herdId: null,
    })
  for (let i = 0; i < 4; i++)
    animals.push({
      id: `gull-${i}`,
      kind: 'gull',
      position: { x: 0, z: 150 },
      altitude: 12,
      heading: 0,
      speed: 6,
      anim: 'fly',
      alive: true,
      wounded: false,
      herdId: null,
    })

  const objectiveFor = (s: LifeStageId) =>
    s === 'held'
      ? { id: 'held.faces', text: 'Look at the faces around you', done: 0, total: 4 }
      : { id: 'small.gather', text: 'Gather shellfish', done: 0, total: 12 }

  const state: SimState = {
    seed: opts.seed,
    clock,
    weather: { cloud: 0.25, rain: 0, wind: 0.3, windDir: 0.6, fog: 0, storm: false },
    people,
    animals,
    fires: [
      { id: 'hearth-main', x: hearth.x, z: hearth.z, intensity: 0.85 },
      { id: 'hearth-2', x: world.poi('hearth-2').x, z: world.poi('hearth-2').z, intensity: 0.55 },
    ],
    hearth: { shellfish: 0, corms: 0, meat: 0, firewood: 6 },
    playerId: 'player',
    stage,
    chapter: { stage, beatId: `${stage}.start`, objective: objectiveFor(stage), finished: false },
    watching: null,
    inventory: { shellfish: 0, corms: 0, silcrete: 0, firewood: 0, ochre: 0, gum: 0, beads: 0, point: 0, hafted: false },
    notes: [],
    timeScale: 72,
  }

  let pending: SimEvent[] = [
    { type: 'objective', objective: state.chapter.objective },
    {
      type: 'caption',
      caption: {
        id: 'open',
        text: stage === 'held' ? 'Warmth. A heartbeat. A voice you already know.' : 'Come. The sea is sleeping.',
        speaker: stage === 'held' ? null : 'Ama',
        kind: stage === 'held' ? 'narration' : 'speech',
        seconds: 5,
      },
    },
  ]
  const gaze = new Map<string, number>()
  let gathered = 0
  let watchReal = 0

  const emit = (e: SimEvent) => pending.push(e)
  const routineIdx = new Map<string, number>()

  const planNext = (p: SimPerson) => {
    const night = state.clock.hour < 6 || state.clock.hour > 20
    if (night) {
      const spot = world.poi(`sleep-${1 + (Math.abs(hashString(p.id)) % 6)}`)
      setTask(p, 'sleep', spot.id, spot, 60 * 60 * 2, null)
      return
    }
    const list = ROUTINE[p.id]
    if (!list || list.length === 0) return
    const i = (routineIdx.get(p.id) ?? -1) + 1
    routineIdx.set(p.id, i)
    const r = list[i % list.length]
    if (!r) return
    const poi = world.poi(r.poi)
    const jitter = new Rng(hashString(p.id) + i)
    const target = { x: poi.x + jitter.range(-poi.radius, poi.radius) * 0.6, z: poi.z + jitter.range(-poi.radius, poi.radius) * 0.6 }
    setTask(p, r.task, poi.id, target, r.minutes * 60, r.skill)
  }

  const setTask = (p: SimPerson, kind: TaskKind, targetId: string, target: Vec2, seconds: number, skill: SkillId | null) => {
    p.task = { kind: 'walk-to', targetId, target, until: null, skill: null }
    plans.set(p.id, { waypoints: route(p.position, target), step: 0 })
    pendingTask.set(p.id, { kind, seconds, skill, targetId })
  }
  const pendingTask = new Map<string, { kind: TaskKind; seconds: number; skill: SkillId | null; targetId: string }>()

  const stepPerson = (p: SimPerson, dt: number) => {
    if (p.isPlayer || p.carriedBy) return
    const plan = plans.get(p.id)
    if (p.task.kind === 'walk-to' && plan) {
      const wp = plan.waypoints[plan.step]
      if (!wp) {
        const next = pendingTask.get(p.id)
        if (next) {
          p.task = { kind: next.kind, targetId: next.targetId, target: null, until: state.clock.t + next.seconds, skill: next.skill }
          p.anim = ANIM_FOR[next.kind] ?? 'idle'
        }
        p.speed = 0
        plans.delete(p.id)
        return
      }
      const dx = wp.x - p.position.x
      const dz = wp.z - p.position.z
      const d = Math.hypot(dx, dz)
      const sp = p.look.ageYears < 12 ? 1.1 : p.look.ageYears > 50 ? 0.9 : 1.3
      if (d < 0.5) {
        plan.step++
        return
      }
      const step = Math.min(d, sp * dt)
      p.position.x += (dx / d) * step
      p.position.z += (dz / d) * step
      p.heading = Math.atan2(dx, dz)
      p.speed = sp
      p.anim = 'walk'
      return
    }
    if (p.task.until === null || state.clock.t >= p.task.until) planNext(p)
  }

  const stepAnimals = (dt: number) => {
    for (const a of animals) {
      if (a.kind === 'gull') {
        const i = Number(a.id.split('-')[1] ?? 0)
        const ang = state.clock.t * 0.002 + i * 1.6
        a.position = { x: 10 + Math.cos(ang) * 40, z: 170 + Math.sin(ang) * 25 }
        a.heading = ang + Math.PI / 2
        a.altitude = 10 + Math.sin(ang * 3) * 3
      } else if (a.kind === 'eland') {
        a.heading += Math.sin(state.clock.t * 0.001 + a.position.x) * dt * 0.1
        a.speed = 0.3
        a.anim = 'graze'
        a.position.x += Math.sin(a.heading) * a.speed * dt
        a.position.z += Math.cos(a.heading) * a.speed * dt
      }
    }
  }

  const stepWatching = (dt: number) => {
    if (player.carriedBy) return
    let best: { p: SimPerson; skill: SkillId; d: number } | null = null
    for (const p of people) {
      const skill = p.task.skill
      if (p.isPlayer || !skill || player.skills.includes(skill)) continue
      const d = Math.hypot(p.position.x - player.position.x, p.position.z - player.position.z)
      if (d <= 6 && (!best || d < best.d)) best = { p, skill, d }
    }
    if (!best) {
      state.watching = null
      watchReal = 0
      return
    }
    if (!state.watching || state.watching.personId !== best.p.id || state.watching.skill !== best.skill) {
      watchReal = 0
    }
    watchReal += dt
    const progress = Math.min(1, watchReal / 8)
    state.watching = { personId: best.p.id, skill: best.skill, progress }
    if (progress >= 1) {
      player.skills.push(best.skill)
      emit({ type: 'learned', personId: player.id, skill: best.skill, fromId: best.p.id })
      state.watching = null
      watchReal = 0
    }
  }

  const sim = {
    state,
    step(dt: number): SimEvent[] {
      state.clock = clockAt(state.clock.t + dt * state.timeScale, epoch)
      for (const p of people) stepPerson(p, dt)
      stepAnimals(dt)
      stepWatching(dt)
      for (const p of people) if (p.speech && p.speech.until < state.clock.t) p.speech = null
      const out = pending
      pending = []
      return out
    },
    command(cmd: PlayerCommand) {
      if (cmd.type === 'move') {
        if (player.carriedBy) return
        player.position = { ...cmd.position }
        player.heading = cmd.heading
        player.speed = cmd.speed
        player.anim = cmd.anim
      } else if (cmd.type === 'gaze') {
        if (!cmd.personId) return
        const p = people.find((q) => q.id === cmd.personId)
        if (!p || p.known) return
        const t = (gaze.get(p.id) ?? 0) + cmd.dt
        gaze.set(p.id, t)
        if (t >= 1.5) {
          p.known = true
          emit({ type: 'face-learned', personId: p.id })
          const known = people.filter((q) => q.known).length
          const obj = state.chapter.objective
          if (obj && obj.id === 'held.faces') {
            state.chapter.objective = { ...obj, done: Math.min(4, known) }
            emit({ type: 'objective', objective: state.chapter.objective })
          }
        }
      } else if (cmd.type === 'interact') {
        const [verb, target] = cmd.interactionId.split(':')
        if (verb === 'gather') {
          state.inventory.shellfish++
          gathered++
          emit({ type: 'item', item: 'shellfish', delta: 1 })
          emit({ type: 'sfx', name: 'gather', at: { ...player.position } })
          const obj = state.chapter.objective
          if (obj && obj.id === 'small.gather') {
            state.chapter.objective = { ...obj, done: Math.min(12, gathered) }
            emit({ type: 'objective', objective: state.chapter.objective })
            if (gathered === 1) emit({ type: 'note', noteId: 'shellfish' })
          }
        } else if (verb === 'dig') {
          state.inventory.corms++
          emit({ type: 'item', item: 'corms', delta: 1 })
        } else if (verb === 'give') {
          state.hearth.shellfish += state.inventory.shellfish
          state.hearth.corms += state.inventory.corms
          state.inventory.shellfish = 0
          state.inventory.corms = 0
          emit({ type: 'caption', caption: { id: `give-${state.clock.t}`, text: 'Everyone eats from the same fire.', speaker: null, kind: 'narration', seconds: 4 } })
        } else if (verb === 'talk' && target) {
          const p = people.find((q) => q.id === target)
          if (p) {
            const lines = ['Stay close to me.', 'The tide is turning soon.', 'Look at the gulls. They know.', 'Eat. You are growing.']
            const text = lines[(hashString(p.id) + Math.floor(state.clock.t)) % lines.length] ?? 'Hm.'
            p.speech = { text, until: state.clock.t + 4 * state.timeScale }
            emit({ type: 'caption', caption: { id: `talk-${state.clock.t}`, text, speaker: p.name, kind: 'speech', seconds: 4 } })
            p.bond = Math.min(1, p.bond + 0.05)
            emit({ type: 'bond', personId: p.id, value: p.bond })
          }
        } else if (verb === 'reach') {
          emit({ type: 'caption', caption: { id: 'reach', text: 'Look. Small, like you.', speaker: 'Ama', kind: 'speech', seconds: 4 } })
          emit({ type: 'note', noteId: 'shell-beads' })
        }
      } else if (cmd.type === 'set-time-scale') {
        state.timeScale = cmd.scale
      }
    },
    interactionsNear(p: Vec2, radius: number): Interaction[] {
      const out: (Interaction & { d: number })[] = []
      const sea = state.clock.seaLevel
      if (player.carriedBy) {
        const carrier = people.find((q) => q.id === player.carriedBy)
        if (carrier && carrier.task.kind === 'gather-shellfish')
          out.push({ id: 'reach:shell', verb: 'reach', label: 'Reach', targetKind: 'item', targetId: 'shell', position: { x: carrier.position.x + Math.sin(carrier.heading) * 0.5, z: carrier.position.z + Math.cos(carrier.heading) * 0.5 }, holdSeconds: 0, enabled: true, reason: null, d: 0 })
        return out
      }
      for (const poi of world.pois) {
        const d = Math.hypot(poi.x - p.x, poi.z - p.z) - poi.radius
        if (d > radius) continue
        if (poi.kind === 'shellfish-bed') {
          const knows = player.skills.includes('shellfish')
          const covered = poi.tideMax !== undefined && sea > poi.tideMax
          out.push({ id: `gather:${poi.id}`, verb: 'gather', label: poi.id === 'shore-limpets' ? 'Gather limpets' : 'Gather mussels', targetKind: 'poi', targetId: poi.id, position: { x: poi.x, z: poi.z }, holdSeconds: 1.2, enabled: knows && !covered, reason: !knows ? "You don't know how yet. Watch someone." : covered ? 'The sea covers them now.' : null, d })
        } else if (poi.kind === 'corm-patch') {
          const knows = player.skills.includes('corms')
          out.push({ id: `dig:${poi.id}`, verb: 'dig', label: 'Dig corms', targetKind: 'poi', targetId: poi.id, position: { x: poi.x, z: poi.z }, holdSeconds: 2, enabled: knows, reason: knows ? null : "You don't know how yet. Watch someone.", d })
        } else if (poi.id === 'hearth-main') {
          const has = state.inventory.shellfish + state.inventory.corms > 0
          out.push({ id: 'give:hearth', verb: 'give', label: 'Give food to the hearth', targetKind: 'poi', targetId: poi.id, position: { x: poi.x, z: poi.z }, holdSeconds: 0, enabled: has, reason: has ? null : 'You have nothing to give.', d: d + 0.5 })
        }
      }
      for (const q of people) {
        if (q.isPlayer || q.carriedBy) continue
        const d = Math.hypot(q.position.x - p.x, q.position.z - p.z)
        if (d > radius) continue
        out.push({ id: `talk:${q.id}`, verb: 'talk', label: `Talk to ${q.name}`, targetKind: 'person', targetId: q.id, position: { ...q.position }, holdSeconds: 0, enabled: true, reason: null, d })
      }
      out.sort((a, b) => a.d - b.d)
      return out.map(({ d: _d, ...rest }) => rest)
    },
    relationOf(personId: string) {
      return relations.get(personId) ?? null
    },
    serialize() {
      return { version: 1 as const, payload: { stub: true, stage, t: state.clock.t, name: opts.playerName } }
    },
  }
  for (const p of people) if (!p.isPlayer) planNext(p)
  return sim
}
