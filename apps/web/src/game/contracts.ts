/**
 * OCHRE cross-module contracts. Every type that crosses a module boundary, and every factory signature, lives
 * here. Owned by the lead: agents send the exact lines they need changed, never edit this file themselves.
 * Design: plans/2026-10-17-ochre-design.md
 *
 * World axes: metres, +Y up, +X east, +Z south (the sea lies to the south). Heading 0 faces +Z; heading grows
 * toward +X (heading π/2 faces +X). Characters face +Z with their feet at y = 0 in their own space.
 */
import type { Camera, MeshStandardMaterial, Object3D, Scene, Vector3, WebGLRenderer } from 'three'

// ─── Basics ──────────────────────────────────────────────────────────────────────────────────────────────────

export type Vec2 = { x: number; z: number }
export type Vec3 = { x: number; y: number; z: number }

// ─── Time and weather (the sim owns them; everyone reads) ────────────────────────────────────────────────────

export type Season = 'summer' | 'autumn' | 'winter' | 'spring'

export type ClockState = {
  /** game seconds since the life began */
  t: number
  /** whole days since the life began */
  day: number
  /** 0..24 */
  hour: number
  /** 0..364; 0 = 1 January equivalent. Southern hemisphere: winter is days ~150..240 */
  dayOfYear: number
  /** whole years since the band's epoch */
  year: number
  season: Season
  /** 0..1; 0 = new moon, 0.5 = full moon */
  moonPhase: number
  /** −1 low .. +1 high (semi-diurnal, two highs a day, ~50 min later each day) */
  tide: number
  /** 0 neap .. 1 spring; peaks near new and full moon */
  tideRange: number
  /** metres relative to mean sea level; seaLevel = tide × (0.5 + 0.9 × tideRange) */
  seaLevel: number
  /** 0 night .. 1 full day, smooth through dawn and dusk */
  daylight: number
  /** unit vector toward the sun (latitude 34° S) */
  sunDir: Vec3
  /** unit vector toward the moon */
  moonDir: Vec3
}

export type WeatherState = {
  /** 0..1 */
  cloud: number
  /** 0..1 */
  rain: number
  /** 0..1 (1 = gale) */
  wind: number
  /** radians, the direction the wind blows TOWARD, same convention as heading */
  windDir: number
  /** 0..1 */
  fog: number
  storm: boolean
}

// ─── World data (world-gen, three-free) ──────────────────────────────────────────────────────────────────────

export type Surface =
  | 'deep-sea'
  | 'shallows'
  | 'surf'
  | 'wet-rock'
  | 'rock'
  | 'sand'
  | 'wet-sand'
  | 'dune'
  | 'fynbos'
  | 'grass'
  | 'cliff'
  | 'cave'
  | 'path'
  | 'lagoon'
  | 'river'

export type PoiKind =
  | 'cave-mouth'
  | 'hearth'
  | 'sleep-spot'
  | 'shellfish-bed'
  | 'corm-patch'
  | 'silcrete-outcrop'
  | 'ochre-source'
  | 'firewood'
  | 'lookout'
  | 'safe-sand'
  | 'play-ground'
  | 'adder-spot'
  | 'eland-range'
  | 'lagoon-camp'
  | 'whale-beach'
  | 'seal-rocks'
  | 'spring'
  | 'path-node'

export type Poi = {
  id: string
  kind: PoiKind
  x: number
  z: number
  radius: number
  /** short human label, e.g. "The mussel rocks" */
  label: string
  /** usable only while seaLevel is below this (shellfish beds) */
  tideMax?: number
}

/** POI ids the director and the sim rely on. world-gen must provide every one. */
export const REQUIRED_POIS = [
  'cave-mouth', // the cave entrance, facing the sea
  'hearth-main', // the band's main hearth just inside the mouth
  'hearth-2', // a second family hearth in the cave
  'sleep-1', 'sleep-2', 'sleep-3', 'sleep-4', 'sleep-5', 'sleep-6', // sleeping hollows in the cave
  'shore-mussels', // the main shellfish bed on the intertidal shelf (tideMax ≈ −0.3)
  'shore-limpets', // a second bed (tideMax ≈ 0)
  'safe-sand', // dry sand above the high-tide line on the cove, reachable from the shelf
  'cove-beach', // the open sandy cove
  'whale-beach', // where the whale strands in Provider day 2
  'seal-rocks', // offshore-ish rocks where seals haul out
  'corm-slope', // the fynbos slope with corms, near the cave
  'adder-rock', // a sun-warmed rock 6–10 m from corm-slope, where the puff adder lies
  'play-dunes', // open dune ground for the children's game
  'silcrete-ridge', // a silcrete outcrop on the plateau edge, 250–450 m from the cave
  'ochre-seam', // a red-ochre exposure in a gully
  'firewood-gully', // milkwood scrub with deadwood, 100–200 m from the cave
  'lookout-point', // a cliff-top lookout above the cave
  'eland-plateau', // open grassy plateau 500–800 m inland where eland graze
  'lagoon-camp', // the neighbouring band's camp at the river-mouth lagoon, 400–700 m east
  'spring', // fresh water seep
  'shore-path-top', // top of the cliff path down from the cave to the shore
  'shore-path-bottom', // bottom of that path, on the shelf
  'plateau-path-top', // where the path from the cave reaches the plateau
] as const
export type RequiredPoiId = (typeof REQUIRED_POIS)[number]

export type WorldData = {
  seed: number
  /** metres; the playable world spans [−size/2, size/2] on X and Z */
  size: number
  /** ground height in metres (sea floor is below 0 under the sea) */
  heightAt(x: number, z: number): number
  normalAt(x: number, z: number): Vec3
  surfaceAt(x: number, z: number, seaLevel: number): Surface
  /** false for water deeper than 0.9 m, slopes steeper than the walk limit (except 'path'), out of bounds */
  walkable(x: number, z: number, seaLevel: number): boolean
  /** water depth above ground at this point for the given sea level (sea, lagoon or river), 0 if dry */
  waterDepth(x: number, z: number, seaLevel: number): number
  /** distance in metres from this point to the waterline at the given sea level (0 in the water) */
  shoreDistance(x: number, z: number, seaLevel: number): number
  /** true inside the cave's footprint (for audio, light and camera) */
  inCave(x: number, z: number): boolean
  pois: readonly Poi[]
  /** throws on an unknown id */
  poi(id: string): Poi
  poisOf(kind: PoiKind): readonly Poi[]
}

export type CreateWorldData = (seed: number) => WorldData

// ─── Rendering (world agent) ─────────────────────────────────────────────────────────────────────────────────

export type Quality = 'low' | 'medium' | 'high'

export type RenderPipeline = {
  /** draws scene through the post chain to the canvas */
  render(scene: Scene, camera: Camera, dt: number): void
  setSize(width: number, height: number, dpr: number): void
  setQuality(q: Quality): void
  /** 0 normal .. 1 the infant's dream-blur (stage 1) */
  setDream(amount: number): void
  /** 0 clear .. 1 black */
  setFade(amount: number): void
  dispose(): void
}
export type CreateRenderPipeline = (renderer: WebGLRenderer) => RenderPipeline

export type FireState = {
  /** a hearth POI id, or a free id for a moved fire */
  id: string
  x: number
  z: number
  /** 0 out .. 1 roaring */
  intensity: number
}

export type WorldFrame = {
  dt: number
  clock: ClockState
  weather: WeatherState
  camera: Camera
  fires: readonly FireState[]
  /** where detail is centred (the player): grass, shadows, foliage LOD */
  focus: Vec3
}

export type WorldView = {
  /** add to the scene; owns its sun, sky, hemisphere and fire lights */
  readonly root: Object3D
  update(frame: WorldFrame): void
  dispose(): void
}
export type CreateWorldView = (data: WorldData, pipeline: RenderPipeline) => WorldView

export type PaintOptions = {
  /** 0..1 strength of the world-space brush variation (default 0.5) */
  brush?: number
  /** 0..1 warm rim light (default 0.3; skin 0.45) */
  rim?: number
  /** subsurface warmth for skin */
  skin?: boolean
}
/** Patches a MeshStandardMaterial into the painted-light look, in place. Lives in game/render/paint.ts. */
export type PaintMaterial = (material: MeshStandardMaterial, opts?: PaintOptions) => MeshStandardMaterial

// ─── Actors (people agent) ───────────────────────────────────────────────────────────────────────────────────

export type Sex = 'female' | 'male'
export type HairStyle = 'coils' | 'knots' | 'cropped' | 'shaved' | 'locs'
export type Garment = 'none' | 'apron' | 'kaross' | 'kaross-apron' | 'wrap'
export type Adornment =
  | 'beads-neck'
  | 'beads-waist'
  | 'beads-hair'
  | 'shell-pendant'
  | 'ochre-face'
  | 'ochre-body'
  | 'ochre-hair'

export type PersonLook = {
  seed: number
  sex: Sex
  /** 0..80; drives proportions (infant, child, teen, adult, elder) and greying */
  ageYears: number
  /** 0..1 within the population's range: 0 medium brown .. 1 very dark brown */
  skin: number
  /** multiplier on the age-typical height, 0.92..1.08 */
  height: number
  /** 0 slight .. 1 heavy */
  build: number
  hair: HairStyle
  garment: Garment
  adornments: readonly Adornment[]
}

export type PersonAnim =
  | 'idle'
  | 'walk'
  | 'run'
  | 'crouch'
  | 'gather'
  | 'dig'
  | 'knap'
  | 'sit'
  | 'sleep'
  | 'throw'
  | 'aim'
  | 'carry'
  | 'eat'
  | 'talk'
  | 'dance'
  | 'crawl'
  | 'held'
  | 'scrape'
  | 'grind'
  | 'point'
  | 'mourn'
  | 'tend-fire'
  | 'wave'
  | 'engrave'
  | 'lie-dead'

export type HeldItem =
  | 'none'
  | 'spear'
  | 'digging-stick'
  | 'shell'
  | 'stone'
  | 'firebrand'
  | 'bag'
  | 'ochre'
  | 'meat'
  | 'corm'
  | 'firewood'
  | 'beads'
  | 'stick'

export type Hand = 'left' | 'right'
export type CarrySlot = 'back' | 'hip' | 'arms'

export type PersonActor = {
  /** feet at the origin, facing +Z. The caller sets position (on the ground) and rotation.y (= heading) */
  readonly object: Object3D
  readonly look: PersonLook
  setAnim(anim: PersonAnim, fadeSeconds?: number): void
  /** ground speed in m/s; drives the walk/run cadence so feet don't skate */
  setSpeed(mps: number): void
  /** head and eyes turn toward a world point (clamped to a natural range), null to relax */
  setLookAt(target: Vec3 | null): void
  setHeld(hand: Hand, item: HeldItem): void
  /** carry another actor (an infant or toddler) in a sling or the arms; null to put down */
  carry(child: PersonActor | null, slot?: CarrySlot): void
  setAge(ageYears: number): void
  /** a quiet "speaking" mouth/gesture layer on top of the current anim */
  setTalking(on: boolean): void
  update(dt: number): void
  /** world-space point between the eyes (infant camera, name tags) */
  headPosition(out: Vector3): Vector3
  /** world-space grip point of a hand (spear release) */
  handPosition(hand: Hand, out: Vector3): Vector3
  dispose(): void
}
export type CreatePerson = (look: PersonLook) => PersonActor

export type AnimalKind = 'eland' | 'seal' | 'gull' | 'hyena' | 'lion' | 'tortoise' | 'whale'
export type AnimalAnim = 'idle' | 'walk' | 'run' | 'graze' | 'lie' | 'alert' | 'fly' | 'swim' | 'fall' | 'dead'

export type AnimalActor = {
  readonly object: Object3D
  readonly kind: AnimalKind
  setAnim(anim: AnimalAnim, fadeSeconds?: number): void
  setSpeed(mps: number): void
  update(dt: number): void
  dispose(): void
}
export type CreateAnimal = (kind: AnimalKind, seed: number) => AnimalActor

// ─── Simulation (sim agent, three-free) ──────────────────────────────────────────────────────────────────────

export type LifeStageId = 'held' | 'small' | 'youth' | 'provider' | 'elder'
export const LIFE_STAGES: readonly LifeStageId[] = ['held', 'small', 'youth', 'provider', 'elder']

export type SkillId =
  | 'faces'
  | 'shellfish'
  | 'tides'
  | 'corms'
  | 'fire'
  | 'knapping'
  | 'heat'
  | 'hafting'
  | 'tracking'
  | 'spear'
  | 'beads'
  | 'ochre'
  | 'engraving'
  | 'hides'
  | 'medicine'
  | 'stories'

/** all 0..1, where 1 is good (fed, warm, rested, healthy) */
export type Needs = { fed: number; warmth: number; energy: number; health: number }

export type Inventory = {
  shellfish: number
  corms: number
  silcrete: number
  firewood: number
  ochre: number
  gum: number
  beads: number
  /** 0 = none, else the quality 0..1 of the point you made */
  point: number
  hafted: boolean
}

export type TaskKind =
  | 'idle'
  | 'sleep'
  | 'walk-to'
  | 'follow'
  | 'gather-shellfish'
  | 'dig-corms'
  | 'knap'
  | 'tend-fire'
  | 'fetch-wood'
  | 'hunt'
  | 'track'
  | 'eat'
  | 'socialize'
  | 'play'
  | 'nurse'
  | 'tell-story'
  | 'sing'
  | 'mourn'
  | 'scripted'

export type SimTask = {
  kind: TaskKind
  /** a POI, person or animal id */
  targetId: string | null
  target: Vec2 | null
  /** game time (ClockState.t) the task ends, if timed */
  until: number | null
  /** the skill this task demonstrates; watchers within 6 m learn it */
  skill: SkillId | null
}

export type SimPerson = {
  id: string
  name: string
  /** ageYears kept current by the sim */
  look: PersonLook
  /** absolute sim day of birth (negative for people born before the life began) */
  birthDay: number
  motherId: string | null
  fatherId: string | null
  partnerId: string | null
  childIds: string[]
  familyId: string
  alive: boolean
  isPlayer: boolean
  position: Vec2
  heading: number
  speed: number
  anim: PersonAnim
  held: { left: HeldItem; right: HeldItem }
  /** id of the child this person carries, and where */
  carrying: { id: string; slot: CarrySlot } | null
  carriedBy: string | null
  /** where the head is turned, or null */
  lookAt: Vec3 | null
  task: SimTask
  needs: Needs
  skills: SkillId[]
  /** bond with the player 0..1 */
  bond: number
  /** the player has learned this face (stage 1) */
  known: boolean
  /** current line being spoken, shown as a subtitle near them */
  speech: { text: string; until: number } | null
}

export type SimAnimal = {
  id: string
  kind: AnimalKind
  position: Vec2
  /** metres above the ground (gulls) */
  altitude: number
  heading: number
  speed: number
  anim: AnimalAnim
  alive: boolean
  wounded: boolean
  herdId: string | null
}

export type Verb =
  | 'gather'
  | 'dig'
  | 'collect'
  | 'give'
  | 'talk'
  | 'eat'
  | 'sleep'
  | 'sit'
  | 'bury-stones'
  | 'knap'
  | 'haft'
  | 'fetch-wood'
  | 'add-wood'
  | 'pierce-beads'
  | 'give-beads'
  | 'engrave'
  | 'tell-story'
  | 'tag'
  | 'reach'

export type Interaction = {
  id: string
  verb: Verb
  /** the prompt text, e.g. "Gather mussels" */
  label: string
  targetKind: 'poi' | 'person' | 'animal' | 'item'
  targetId: string
  position: Vec2
  /** 0 = press, else hold this many seconds */
  holdSeconds: number
  enabled: boolean
  /** shown when disabled, e.g. "You don't know how yet. Watch someone." */
  reason: string | null
}

export type CameraCue =
  | { kind: 'focus'; targetId: string; seconds: number }
  | { kind: 'fade'; to: 'black' | 'clear'; seconds: number }
  | { kind: 'shake'; strength: number; seconds: number }
  | { kind: 'release' }

export type Caption = {
  id: string
  text: string
  /** person name for speech, null for narration */
  speaker: string | null
  kind: 'narration' | 'speech' | 'song'
  seconds: number
}

export type Objective = { id: string; text: string; done: number | null; total: number | null }

export type Choice = {
  id: string
  prompt: string
  options: readonly { id: string; label: string; detail: string | null; personId: string | null }[]
}

export type MinigameId = 'knapping' | 'engraving' | 'beads'

/** every Field Note; the director unlocks them, content/field-notes.ts writes them (one entry per id) */
export const FIELD_NOTE_IDS = [
  'coastal-life', // living on the coast: Blombos, Pinnacle Point
  'shell-beads', // Nassarius kraussianus beads, Blombos ~75 ka
  'spring-tides', // the moon, spring tides and timing shellfish collection
  'shellfish', // brown mussels, limpets, turban shells: a reliable protein
  'play', // play as practice in forager childhoods
  'corms', // geophytes of the fynbos: underground carbohydrate
  'danger', // predators, snakes, surf: the risks of daily life
  'sharing', // demand sharing and the communal hearth
  'fire', // fire for warmth, cooking, light, protection
  'faces', // infants, faces, attachment (universal human development)
  'silcrete', // silcrete as toolstone
  'heat-treatment', // heat-treated silcrete, Pinnacle Point ~164 ka
  'still-bay', // Still Bay bifacial points, ~77–72 ka
  'adhesives', // compound adhesives: ochre + gum hafting, multi-step thinking
  'tracking', // reading spoor: knowledge as a tool
  'hunting', // eland and the hunt
  'reciprocity', // meat distribution and who eats first
  'networks', // gift exchange between bands, marriage networks
  'cumulative-culture', // teaching and learning across generations
  'whale', // stranded whales as a coastal bonanza
  'burial', // Panga ya Saidi, the oldest known burial in Africa, ~78 ka
  'engraved-ochre', // the cross-hatched ochre of Blombos, ~75–100 ka
  'ochre', // ochre's many uses: paint, sunscreen, tanning, glue
  'stories', // knowledge living in people: oral tradition
] as const
export type FieldNoteId = (typeof FIELD_NOTE_IDS)[number]

export type LifeSummary = {
  name: string
  years: number
  children: readonly string[]
  taught: readonly { name: string; skill: SkillId }[]
  storyTold: string | null
  beadsGivenTo: string | null
  notesFound: number
  /** the child you continue as, if any */
  heirId: string | null
  heirName: string | null
}

export type SfxName =
  | 'step-sand'
  | 'step-rock'
  | 'step-grass'
  | 'gather'
  | 'dig'
  | 'knap'
  | 'throw'
  | 'hit'
  | 'learn'
  | 'note'
  | 'fire-flare'
  | 'wave-crash'
  | 'gull'
  | 'hyena'
  | 'eland-snort'
  | 'heartbeat'
  | 'ui-click'
  | 'ui-open'
  | 'chapter'

export type SimEvent =
  | { type: 'caption'; caption: Caption }
  | { type: 'objective'; objective: Objective | null }
  | { type: 'learned'; personId: string; skill: SkillId; fromId: string | null }
  | { type: 'face-learned'; personId: string }
  | { type: 'note'; noteId: string }
  | { type: 'bond'; personId: string; value: number }
  | { type: 'item'; item: keyof Inventory; delta: number }
  | { type: 'chapter-start'; stage: LifeStageId; title: string; subtitle: string; ageYears: number }
  | { type: 'chapter-end'; stage: LifeStageId; next: LifeStageId | null }
  | { type: 'minigame'; game: MinigameId }
  | { type: 'choice'; choice: Choice }
  | { type: 'camera'; cue: CameraCue }
  | { type: 'death'; personId: string }
  | { type: 'life-summary'; summary: LifeSummary }
  | { type: 'sfx'; name: SfxName; at: Vec2 | null }

export type PlayerCommand =
  /** play integrates the player's movement each frame and reports it */
  | { type: 'move'; position: Vec2; heading: number; speed: number; anim: PersonAnim }
  /** press or completed hold on an Interaction from interactionsNear */
  | { type: 'interact'; interactionId: string }
  /** stage 1: the player is looking at this person's face this frame */
  | { type: 'gaze'; personId: string | null; dt: number }
  | { type: 'spear-hit'; animalId: string; quality: number }
  | { type: 'spear-miss' }
  | { type: 'minigame-result'; game: MinigameId; quality: number }
  | { type: 'choose'; choiceId: string; optionId: string }
  | { type: 'set-time-scale'; scale: number }
  | { type: 'continue-as-heir' }

/** sim-owned save blob; the sim validates it with zod on load */
export type SaveData = { version: 1; payload: unknown }

export type ChapterRuntime = {
  stage: LifeStageId
  /** id of the current beat, e.g. "small.gather" */
  beatId: string
  objective: Objective | null
  finished: boolean
}

export type SimState = {
  seed: number
  clock: ClockState
  weather: WeatherState
  people: SimPerson[]
  animals: SimAnimal[]
  fires: FireState[]
  hearth: { shellfish: number; corms: number; meat: number; firewood: number }
  playerId: string
  stage: LifeStageId
  chapter: ChapterRuntime
  /** the player's current watch-to-learn ring, if any */
  watching: { personId: string; skill: SkillId; progress: number } | null
  inventory: Inventory
  /** unlocked Field Note ids */
  notes: string[]
  /** game seconds per real second (default 72 = one day per 20 minutes) */
  timeScale: number
}

export type SimOptions = {
  seed: number
  world: WorldData
  stage: LifeStageId
  playerName: string
  save?: SaveData
}

export type Sim = {
  /** live state, mutated in place by step(); treat as read-only outside the sim */
  readonly state: SimState
  /** dt in real seconds; returns the events produced during this step */
  step(dt: number): SimEvent[]
  command(cmd: PlayerCommand): void
  /** what the player could do here right now, nearest first */
  interactionsNear(p: Vec2, radius: number): Interaction[]
  /** the person's relation to the player ("Mother", "Grandmother", "Tuk's son") or null */
  relationOf(personId: string): string | null
  serialize(): SaveData
}
export type CreateSim = (opts: SimOptions) => Sim

// ─── Audio (procedural WebAudio) ─────────────────────────────────────────────────────────────────────────────

export type MusicCue = 'title' | LifeStageId | 'summary' | null

export type AudioFrame = {
  listener: Vec3
  heading: number
  /** metres to the waterline */
  seaDistance: number
  /** 0..1 how big the surf is */
  surf: number
  /** metres to the nearest lit fire, Infinity if none */
  fireDistance: number
  inCave: boolean
  daylight: number
  wind: number
  rain: number
  /** 0..1 underwater/womb-like muffling (stage 1) */
  muffle: number
}

export type GameAudio = {
  /** must be called from a user gesture before sound plays */
  resume(): Promise<void>
  update(frame: AudioFrame): void
  sfx(name: SfxName, at?: Vec3): void
  music(cue: MusicCue): void
  setVolume(master: number, music: number): void
  dispose(): void
}
export type CreateAudio = () => GameAudio
