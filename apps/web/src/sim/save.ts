/**
 * Save and load: `serialize()` writes `{ version: 1, payload }`; loading validates the payload with zod and throws
 * a clear error on any mismatch. Plans and paths are not saved: people re-decide on the first step after a load.
 */
import { z } from 'zod'
import { MOMENT_IDS } from './moments'
import type {
  AnimalAnim,
  AnimalKind,
  CarrySlot,
  Garment,
  HairStyle,
  HeldItem,
  Adornment,
  LifeStageId,
  PersonAnim,
  SaveData,
  SimAnimal,
  SimPerson,
  SkillId,
  TaskKind,
} from '../game/contracts'
import type { ClockEpoch } from '../core/clock'

type Exhaustive<All, Listed> = [Exclude<All, Listed>] extends [never] ? true : false

const PERSON_ANIMS = [
  'idle', 'walk', 'run', 'crouch', 'gather', 'dig', 'knap', 'sit', 'sleep', 'throw', 'aim', 'carry', 'eat', 'talk',
  'dance', 'crawl', 'held', 'scrape', 'grind', 'point', 'mourn', 'tend-fire', 'wave', 'engrave', 'lie-dead',
] as const satisfies readonly PersonAnim[]
const HELD_ITEMS = [
  'none', 'spear', 'digging-stick', 'shell', 'stone', 'firebrand', 'bag', 'ochre', 'meat', 'corm', 'firewood', 'beads',
  'stick',
] as const satisfies readonly HeldItem[]
const SKILLS = [
  'faces', 'shellfish', 'tides', 'corms', 'fire', 'knapping', 'heat', 'hafting', 'tracking', 'spear', 'beads', 'ochre',
  'engraving', 'hides', 'medicine', 'stories',
] as const satisfies readonly SkillId[]
const TASKS = [
  'idle', 'sleep', 'walk-to', 'follow', 'gather-shellfish', 'dig-corms', 'knap', 'tend-fire', 'fetch-wood', 'hunt',
  'track', 'eat', 'socialize', 'play', 'nurse', 'tell-story', 'sing', 'mourn', 'scripted',
] as const satisfies readonly TaskKind[]
const HAIR = ['coils', 'knots', 'cropped', 'shaved', 'locs'] as const satisfies readonly HairStyle[]
const GARMENTS = ['none', 'apron', 'kaross', 'kaross-apron', 'wrap'] as const satisfies readonly Garment[]
const ADORNMENTS = [
  'beads-neck', 'beads-waist', 'beads-hair', 'shell-pendant', 'ochre-face', 'ochre-body', 'ochre-hair',
] as const satisfies readonly Adornment[]
const SLOTS = ['back', 'hip', 'arms'] as const satisfies readonly CarrySlot[]
const ANIMAL_KINDS = ['eland', 'seal', 'gull', 'hyena', 'lion', 'tortoise', 'whale'] as const satisfies readonly AnimalKind[]
const ANIMAL_ANIMS = [
  'idle', 'walk', 'run', 'graze', 'lie', 'alert', 'fly', 'swim', 'fall', 'dead',
] as const satisfies readonly AnimalAnim[]
const STAGES = ['held', 'small', 'youth', 'provider', 'elder'] as const satisfies readonly LifeStageId[]

// every member of each contract union is listed
export const ENUMS_COMPLETE: [
  Exhaustive<PersonAnim, (typeof PERSON_ANIMS)[number]>,
  Exhaustive<HeldItem, (typeof HELD_ITEMS)[number]>,
  Exhaustive<SkillId, (typeof SKILLS)[number]>,
  Exhaustive<TaskKind, (typeof TASKS)[number]>,
  Exhaustive<HairStyle, (typeof HAIR)[number]>,
  Exhaustive<Garment, (typeof GARMENTS)[number]>,
  Exhaustive<Adornment, (typeof ADORNMENTS)[number]>,
  Exhaustive<AnimalKind, (typeof ANIMAL_KINDS)[number]>,
  Exhaustive<AnimalAnim, (typeof ANIMAL_ANIMS)[number]>,
  Exhaustive<LifeStageId, (typeof STAGES)[number]>,
] = [true, true, true, true, true, true, true, true, true, true]

const vec2 = z.object({ x: z.number(), z: z.number() })
const vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() })
const skill = z.enum(SKILLS)

const personSchema = z.object({
  id: z.string(),
  name: z.string(),
  look: z.object({
    seed: z.number(),
    sex: z.enum(['female', 'male']),
    ageYears: z.number(),
    skin: z.number(),
    height: z.number(),
    build: z.number(),
    hair: z.enum(HAIR),
    garment: z.enum(GARMENTS),
    adornments: z.array(z.enum(ADORNMENTS)).readonly(),
  }),
  birthDay: z.number(),
  motherId: z.string().nullable(),
  fatherId: z.string().nullable(),
  partnerId: z.string().nullable(),
  childIds: z.array(z.string()),
  familyId: z.string(),
  alive: z.boolean(),
  isPlayer: z.boolean(),
  position: vec2,
  heading: z.number(),
  speed: z.number(),
  anim: z.enum(PERSON_ANIMS),
  held: z.object({ left: z.enum(HELD_ITEMS), right: z.enum(HELD_ITEMS) }),
  carrying: z.object({ id: z.string(), slot: z.enum(SLOTS) }).nullable(),
  carriedBy: z.string().nullable(),
  lookAt: vec3.nullable(),
  task: z.object({
    kind: z.enum(TASKS),
    targetId: z.string().nullable(),
    target: vec2.nullable(),
    until: z.number().nullable(),
    skill: skill.nullable(),
  }),
  needs: z.object({ fed: z.number(), warmth: z.number(), energy: z.number(), health: z.number() }),
  skills: z.array(skill),
  bond: z.number(),
  known: z.boolean(),
  speech: z.object({ text: z.string(), until: z.number() }).nullable(),
})

const animalSchema = z.object({
  id: z.string(),
  kind: z.enum(ANIMAL_KINDS),
  position: vec2,
  altitude: z.number(),
  heading: z.number(),
  speed: z.number(),
  anim: z.enum(ANIMAL_ANIMS),
  alive: z.boolean(),
  wounded: z.boolean(),
  herdId: z.string().nullable(),
})

const objectiveSchema = z.object({ id: z.string(), text: z.string(), done: z.number().nullable(), total: z.number().nullable() })

const agentSchema = z.object({
  id: z.string(),
  sleepId: z.string(),
  seat: z.number(),
  bed: z.number(),
  mealDay: z.number(),
  breakfastDay: z.number(),
  load: z.object({ shellfish: z.number(), corms: z.number(), meat: z.number(), firewood: z.number(), silcrete: z.number() }),
  learn: z.partialRecord(skill, z.number()),
  gaze: z.number(),
})

export const lifeSchema = z.object({
  beadsGivenTo: z.string().nullable(),
  partnerName: z.string().nullable(),
  partnerSex: z.enum(['female', 'male']).nullable(),
  storyTold: z.string().nullable(),
  taught: z.array(z.object({ name: z.string(), skill })),
  shareChoice: z.string().nullable(),
  pointQuality: z.number().nullable(),
  engraving: z.number().nullable(),
})

/** the director's place in the life: the chapter, the beat, what it counted and remembers */
export const directorSchema = z.object({
  stage: z.enum(STAGES),
  beat: z.number().int(),
  begun: z.boolean(),
  finished: z.boolean(),
  heir: z.boolean(),
  cast: z.record(z.string(), z.string()),
  counters: z.record(z.string(), z.number()),
  life: lifeSchema,
})
export type DirectorSave = z.infer<typeof directorSchema>

export const payloadSchema = z.object({
  seed: z.number(),
  stage: z.enum(STAGES),
  playerName: z.string(),
  epoch: z.object({ dayOfYear: z.number(), hour: z.number(), moonPhase: z.number(), year: z.number() }),
  t: z.number(),
  timeScale: z.number(),
  people: z.array(personSchema),
  animals: z.array(animalSchema),
  fires: z.array(z.object({ id: z.string(), x: z.number(), z: z.number(), intensity: z.number() })),
  fuel: z.record(z.string(), z.object({ fuel: z.number() })),
  hearth: z.object({ shellfish: z.number(), corms: z.number(), meat: z.number(), firewood: z.number() }),
  inventory: z.object({
    shellfish: z.number(),
    corms: z.number(),
    silcrete: z.number(),
    firewood: z.number(),
    ochre: z.number(),
    gum: z.number(),
    beads: z.number(),
    point: z.number(),
    hafted: z.boolean(),
  }),
  notes: z.array(z.string()),
  chapter: z.object({ stage: z.enum(STAGES), beatId: z.string(), objective: objectiveSchema.nullable(), finished: z.boolean() }),
  playerId: z.string(),
  playerControlled: z.boolean(),
  agents: z.array(agentSchema),
  herds: z.array(z.object({ id: z.string(), center: vec2, home: vec2, settleAt: z.number() })),
  nextAnimalId: z.number(),
  /** the director's place in the life; absent in a sandbox sim */
  director: directorSchema.optional(),
  /** a director's free wait still open (S5c): its moment still comes after a load */
  moments: z
    .object({
      window: z
        .object({ from: z.number(), until: z.number(), pick: z.enum(MOMENT_IDS).nullable(), got: z.boolean(), short: z.boolean(), hurry: z.boolean(), doneAt: z.number().optional() })
        .nullable(),
    })
    .optional(),
  /** lines said today and what the band is talking about */
  talk: z
    .object({
      used: z.record(z.string(), z.string()),
      recent: z.partialRecord(z.enum(['whale', 'storm', 'oro-died', 'loss', 'note', 'hunt']), z.number()),
      talkedAt: z.record(z.string(), z.number()),
    })
    .optional(),
})

export type SavePayload = z.infer<typeof payloadSchema>

// the parsed shapes are assignable to the contract types
export const asPerson = (p: SavePayload['people'][number]): SimPerson => p
export const asAnimal = (a: SavePayload['animals'][number]): SimAnimal => a
export const asEpoch = (e: SavePayload['epoch']): ClockEpoch => e

export function encodeSave(payload: SavePayload): SaveData {
  return { version: 1, payload: JSON.parse(JSON.stringify(payload)) }
}

export function decodeSave(save: SaveData): SavePayload {
  if (save.version !== 1) throw new Error(`OCHRE save: unsupported version ${String(save.version)} (expected 1)`)
  const parsed = payloadSchema.safeParse(save.payload)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const where = first ? first.path.join('.') : '?'
    throw new Error(`OCHRE save: the save doesn't match this version of the game (${where}: ${first?.message ?? 'invalid'})`)
  }
  return parsed.data
}
