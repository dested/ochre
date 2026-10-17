/**
 * The sim's internal state and shared constants: what each module reads and writes beyond the public SimState.
 */
import type { ClockEpoch } from '../core/clock'
import type { Rng } from '../core/rng'
import type { LifeStageId, SimEvent, SimState, SkillId, Vec2, WorldData } from '../game/contracts'
import type { PathRequest, PathService } from './path'

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
}

/**
 * Seconds of movement for something at `pos` this substep. A day lasts 20 real minutes, but a walk must look
 * like a walk: near the player things move in real time; past 120 m they move in game time so the band's day
 * still fits. In the lab and headless (nobody playing) everything moves in game time.
 */
export function moveDt(ctx: SimCtx, pos: Vec2, gameDt: number, realDt: number): number {
  if (!ctx.live) return gameDt
  const player = ctx.state.people.find((p) => p.id === ctx.state.playerId)
  if (!player) return gameDt
  const d = Math.hypot(pos.x - player.position.x, pos.z - player.position.z)
  const t = Math.min(1, Math.max(0, (d - 60) / 60))
  const s = t * t * (3 - 2 * t)
  return realDt + Math.max(0, gameDt - realDt) * s
}
