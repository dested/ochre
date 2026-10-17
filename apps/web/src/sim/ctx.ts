/**
 * The sim's internal state and shared constants: what each module reads and writes beyond the public SimState.
 */
import type { ClockEpoch } from '../core/clock'
import type { Rng } from '../core/rng'
import type { CarrySlot, HeldItem, Interaction, LifeStageId, PersonAnim, SimEvent, SimState, SkillId, TaskKind, Vec2, WorldData } from '../game/contracts'
import type { PathRequest, PathService } from './path'
import type { TalkState } from './talk'

/** game seconds per substep at most (movement and decisions stay stable at ×600) */
export const MAX_SUBSTEP = 6
/** node expansions per substep for the amortized pathfinder */
export const PATH_BUDGET = 4000
/** real seconds of watching to learn a skill */
export const LEARN_SECONDS = 8
export const WATCH_RADIUS = 6

/** youngest age at which someone can pick up a skill by watching */
export const SKILL_MIN_AGE: Record<SkillId, number> = {
  faces: 0,
  shellfish: 5,
  tides: 8,
  corms: 5,
  fire: 8,
  knapping: 12,
  heat: 13,
  hafting: 13,
  tracking: 10,
  spear: 12,
  beads: 8,
  ochre: 10,
  engraving: 12,
  hides: 10,
  medicine: 14,
  stories: 30,
}

export const SKILL_LABEL: Record<SkillId, string> = {
  faces: 'Faces',
  shellfish: 'Shellfish',
  tides: 'Tides',
  corms: 'Corms',
  fire: 'Fire',
  knapping: 'Knapping',
  heat: 'Heat',
  hafting: 'Hafting',
  tracking: 'Tracking',
  spear: 'Spear',
  beads: 'Beads',
  ochre: 'Ochre',
  engraving: 'Engraving',
  hides: 'Hides',
  medicine: 'Medicine',
  stories: 'Stories',
}

/** fed gained per unit eaten */
export const FOOD_VALUE = { shellfish: 0.03, corms: 0.08, meat: 0.05 } as const
export const ELAND_MEAT = 200

export type PlanKind =
  | 'sleep'
  | 'shore'
  | 'corms'
  | 'hunt'
  | 'stone'
  | 'knap'
  | 'wood'
  | 'play'
  | 'hearth'
  | 'eat'
  | 'story'
  | 'sing'
  | 'follow'
  | 'tend'
  | 'deposit'
  | 'hides'

export type HuntStage = 'stage' | 'stalk' | 'chase' | 'butcher'

export type Plan = {
  kind: PlanKind
  phase: 'go' | 'work'
  /** where the work happens */
  dest: Vec2
  /** a POI, person or animal id */
  targetId: string | null
  /** game time the work stops, if timed */
  until: number | null
  /** game time of the next small action inside the work (a mussel, a corm, a new spot) */
  tick: number
  hunt: { stage: HuntStage; attempts: number } | null
  /** a short shift along the rocks while gathering */
  shuffle: Vec2 | null
}

/** how a person looks while doing something: the task (and the skill it teaches), the pose, the hands */
export type Pose = { task: TaskKind; anim: PersonAnim; skill: SkillId | null; right: HeldItem; left: HeldItem }

/**
 * The director's hold on a person: while set, the AI's plans wait.
 * goto: walk to dest (pausing while `waitFor` lags more than `waitDist` behind), then hold the pose there.
 * hold: stay and hold the pose. follow: keep within `near` of targetId. flee: keep away from targetId inside `area`.
 */
export type Order = {
  kind: 'goto' | 'hold' | 'follow' | 'flee'
  dest: Vec2 | null
  targetId: string | null
  speed: number | null
  near: number
  waitFor: string | null
  waitDist: number
  pose: Pose | null
  /** face this point when standing */
  face: Vec2 | null
  slot: CarrySlot | null
  /** flee: stay inside this circle */
  area: { x: number; z: number; r: number } | null
  arrived: boolean
}

export type Load = { shellfish: number; corms: number; meat: number; firewood: number; silcrete: number }

export type Agent = {
  id: string
  /** the family's sleeping hollow */
  sleepId: string
  /** place in the ring around the hearth */
  seat: number
  /** place among the family at the sleeping hollow */
  bed: number
  plan: Plan | null
  path: Vec2[]
  pathReq: PathRequest | null
  /** game time of the next decision check */
  nextThink: number
  /** the day of the last evening meal */
  mealDay: number
  /** the day of the last morning meal */
  breakfastDay: number
  /** a man's choice for the day */
  dayChoice: { day: number; kind: 'hunt' | 'stone' | 'knap' | 'wood' | 'corms' } | null
  load: Load
  /** watch progress per skill, 0..1 */
  learn: Partial<Record<SkillId, number>>
  /** stage 1: seconds the player has looked at this face */
  gaze: number
  /** the director's hold on this person, if any */
  order: Order | null
  /** a follower walking to catch up (starts past 4.5 m, stops inside 2.5 m, so it doesn't stutter at one edge) */
  catchingUp: boolean
  /** a child with its carer: following or gathering beside them, and since when (held FOLLOW_HOLD seconds) */
  followMode: { kind: 'follow' | 'gather'; since: number } | null
}

export type AnimalBrain = {
  id: string
  mode: 'calm' | 'flee' | 'wounded' | 'dying' | 'dead' | 'land' | 'swim'
  target: Vec2 | null
  /** game time the current mode or target ends */
  until: number
  home: Vec2
  /** gull circle centre and radius */
  orbit: { x: number; z: number; r: number; dir: 1 | -1 } | null
}

export type Herd = { id: string; center: Vec2; home: Vec2; settleAt: number }

export type FireFuel = Record<string, { fuel: number; tender: string | null }>

/** what the director adds to the player's verbs */
export type DirectorHooks = {
  /** extra interactions here and now (reach, tag, knap, tell a story, sit…) */
  extras(p: Vec2, radius: number): Interaction[]
  /** false hides one of the sandbox's own interactions during a beat */
  allows(i: Interaction): boolean
  /** a line a person says when the player talks to them during a beat, or null for their usual talk */
  talk(personId: string): string | null
}

export type SimCtx = {
  world: WorldData
  state: SimState
  rng: Rng
  epoch: ClockEpoch
  stage: LifeStageId
  paths: PathService
  events: SimEvent[]
  agents: Map<string, Agent>
  brains: Map<string, AnimalBrain>
  herds: Herd[]
  fuel: FireFuel
  /** the play layer has taken the player (a 'move' arrived): the AI stops driving them */
  playerControlled: boolean
  /** sleeping through the night at speed; restore this time scale at dawn */
  sleepSkip: { restore: number } | null
  /** sunrise and sunset hours per day of year */
  sunCache: Map<number, { rise: number; set: number }>
  nextAnimalId: number
  /** whole game hours since t = 0 at the last hourly tick */
  lastHour: number
  /** someone is playing (a move or gaze command arrived): things near the player move in real time */
  live: boolean
  /** a director time skip is running: everything moves in game time */
  fastForward: boolean
  /** the director runs this chapter's hunt itself: the AI's men stay off the herd */
  noAiHunts: boolean
  /** what the player is showing right now (a dig, a gather), for the watchers; real seconds left */
  demo: { skill: SkillId; left: number } | null
  director: DirectorHooks | null
  /** this child learns only from the player (Provider's teaching beat) */
  pupil: string | null
  /** lines said today, what the band is talking about, chatter timing */
  talk: TalkState
}

/**
 * Seconds of movement for something at `pos` this substep. A day lasts 20 real minutes, but a walk must look
 * like a walk: near the player things move in real time; past 120 m they move in game time so the band's day
 * still fits. In the lab and headless (nobody playing) everything moves in game time.
 */
export function moveDt(ctx: SimCtx, pos: Vec2, gameDt: number, realDt: number): number {
  if (!ctx.live || ctx.fastForward) return gameDt
  const player = ctx.state.people.find((p) => p.id === ctx.state.playerId)
  if (!player) return gameDt
  const d = Math.hypot(pos.x - player.position.x, pos.z - player.position.z)
  const t = Math.min(1, Math.max(0, (d - 60) / 60))
  const s = t * t * (3 - 2 * t)
  return realDt + Math.max(0, gameDt - realDt) * s
}
