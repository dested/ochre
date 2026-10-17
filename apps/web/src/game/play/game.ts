/**
 * One life in progress: the sim, the cast, the player's body or the infant's eyes, interactions, name tags and
 * the bridge feed, drawn through the shared world view and pipeline. The session creates one per life; the
 * lab drives one directly.
 */
import { Mesh, type Object3D, PerspectiveCamera, Scene, Vector3 } from 'three'
import type { Bridge, NameTag, ObjectiveMark, PromptState } from '../bridge'
import type {
  CameraCue,
  ClockState,
  GameAudio,
  Interaction,
  LifeStageId,
  LifeSummary,
  PersonActor,
  PersonAnim,
  RenderPipeline,
  SaveData,
  Sim,
  SimEvent,
  SimPerson,
  Vec2,
  WorldData,
  WorldView,
} from '../contracts'
import { createCast, type Cast, type PlayerPose } from './cast'
import { createController, type ControlSettings, type Controller } from './controller'
import { createFeed, type Feed } from './feed'
import { createHeldCamera, HELD_CONE, type HeldCamera } from './held-camera'
import { createHunt, type Hunt } from './hunt'
import type { Input } from './input'
import type { Modules } from './modules'
import { STAGE_FEEL, shownAge } from './stages'
import { createSteps } from './steps'
import { createTracks } from './tracks'
import { createTriGrid, type TriGrid } from './tri-grid'

export type GameDeps = {
  scene: Scene
  camera: PerspectiveCamera
  pipeline: RenderPipeline
  world: WorldData
  view: WorldView
  modules: Modules
  input: Input
  bridge: Bridge
  audio: GameAudio
  /** viewport in CSS pixels, for name tags */
  viewport(): { width: number; height: number }
  settings(): ControlSettings
  noteTitle(id: string): string | null
  /** chapter ended (next stage or null at the end of a life) */
  onChapterEnd(next: LifeStageId | null): void
}

export type GameOptions = { seed: number; stage: LifeStageId; playerName: string; save?: SaveData }

export type Game = {
  readonly sim: Sim
  readonly cast: Cast
  readonly controller: Controller
  readonly hunt: Hunt
  /** sim and player frozen (chapter card, menus) while the world keeps drawing */
  simPaused: boolean
  update(dt: number, elapsed: number): void
  /** move the player (third person) to a POI or point */
  teleport(x: number, z: number, heading?: number): void
  player(): SimPerson
  /** the last events, compact, newest last (QA reads it) */
  readonly log: readonly string[]
  /** after the summary: the grandchild's life begins behind their own chapter card */
  continueAsHeir(): void
  dispose(): void
}

const LOG_SIZE = 80

/** one line per event for the QA log */
function describe(e: SimEvent): string {
  switch (e.type) {
    case 'caption':
      return `caption ${e.caption.speaker ?? '-'}: ${e.caption.text}`
    case 'objective':
      return `objective ${e.objective ? `${e.objective.text}` : 'none'}`
    case 'learned':
      return `learned ${e.personId} ${e.skill}`
    case 'face-learned':
      return `face ${e.personId}`
    case 'note':
      return `note ${e.noteId}`
    case 'chapter-start':
      return `chapter-start ${e.stage} ${e.title}`
    case 'chapter-end':
      return `chapter-end ${e.stage} -> ${e.next ?? 'none'}`
    case 'minigame':
      return `minigame ${e.game}`
    case 'choice':
      return `choice ${e.choice.id}: ${e.choice.options.map((o) => o.id).join('|')}`
    case 'camera':
      return `camera ${e.cue.kind}`
    case 'teleport':
      return `teleport ${e.position.x.toFixed(1)},${e.position.z.toFixed(1)}`
    case 'sfx':
      return `sfx ${e.name}`
    case 'bond':
      return `bond ${e.personId} ${e.value.toFixed(2)}`
    case 'item':
      return `item ${e.item} ${e.delta}`
    default:
      return e.type
  }
}

const INTERACT_RADIUS = 2.5
const TAG_RANGE = 25
const GAZE_CONE = (6 * Math.PI) / 180
const GAZE_RANGE = 7
/** name tags: screen safe margin, approximate box, how many at once, and the held-face cutoff */
const TAG_MARGIN = 48
const TAG_BOX_W = 120
const TAG_BOX_H = 40
/** the tag draws above its anchor (name, relation, tick): keep the anchor this far below the top margin */
const TAG_TALL = 52
/** samples along the eye→head line for tag occlusion, and how long a person stays hidden before the tag fades */
const OCC_STEPS = 8
const OCC_HIDE = 0.2
/** the held camera hides the carrier's head inside this distance, metres */
const HEAD_HIDE = 0.3
/** fade level past which tags and the prompt hide, and how far a face is made out at night */
const FADE_HIDE = 0.3
/** an interaction this close to the objective's point is the beat's work, metres */
const GOAL_NEAR = 6
const DARK_RANGE = 10
/** the objective mark hides inside this distance, metres */
const MARK_NEAR = 6
/** an off-screen mark sits this far inside the screen edge, css pixels */
const MARK_EDGE = 44
/** the end of a life: the last line holds this long before the slow fade, then the sound, then the summary */
const LAST_LINE = 3.5
const LAST_FADE = 5
const LAST_HUSH = 2.5
/** seconds into a chapter card before the scene behind it clears (the card is opaque by then) */
const CARD_CLEAR = 1.5
const SUMMERS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
]
/** held.faces opens the look cone this far past the farthest face */
const FACES_MARGIN = (15 * Math.PI) / 180
/** an actor's own head bone (people name their bones), not the head of a child it carries */
function headBone(root: Object3D): Object3D | null {
  const stack: Object3D[] = [root]
  while (stack.length > 0) {
    const o = stack.pop()
    if (!o) break
    if (o.name === 'head') return o
    for (const c of o.children) if (c.name !== 'carry-attach') stack.push(c)
  }
  return null
}

/** poses that sit the body down (the camera pivot sinks with it) */
const SEATED: ReadonlySet<PersonAnim> = new Set<PersonAnim>([
  'sit',
  'sleep',
  'engrave',
  'knap',
  'grind',
  'lie-dead',
])
/** poses the sim puts the player in (a hearth seat, a task); they hold while the player stands still */
const SIM_POSES: ReadonlySet<PersonAnim> = new Set<PersonAnim>([
  'sit',
  'sleep',
  'eat',
  'gather',
  'dig',
  'knap',
  'scrape',
  'grind',
  'tend-fire',
  'engrave',
  'mourn',
  'dance',
  'point',
  'wave',
  'lie-dead',
])
const MAX_TAGS = 6
const HELD_FACE_RANGE = 1.2

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function createGame(deps: GameDeps, opts: GameOptions): Game {
  const { scene, camera, pipeline, world, view, modules, input, bridge, audio } = deps
  const sim = modules.createSim({
    seed: opts.seed,
    world,
    stage: opts.stage,
    playerName: opts.playerName,
    ...(opts.save ? { save: opts.save } : {}),
  })
  const cast = createCast(world, modules)
  scene.add(cast.root)
  const controller = createController(world)
  const held: HeldCamera = createHeldCamera()
  const hunt = createHunt({ world, scene, modules, sim, camera, cast, bridge, audio })
  const spoor = modules.createSpoor(world)
  scene.add(spoor.root)
  const tracks = createTracks(sim, spoor)
  const steps = createSteps()
  let surfCooldown = 0
  let lastStage: LifeStageId | null = null
  const lastPos = { x: 0, z: 0 }
  const sfxAt = new Vector3()

  let now = 0
  let mode: 'held' | 'third' | null = null
  let fade = { from: 0, to: 0, t: 1, seconds: 1 }
  let fadeValue = 0
  let shake = { strength: 0, t: 0, seconds: 0 }
  let focus: { targetId: string; until: number } | null = null
  let holdT = 0
  let holdLatch = false
  let currentInteraction: Interaction | null = null
  let tagTimer = 0
  let hudTimer = 0
  let lastPrompt: PromptState | null = null
  const relationCache = new Map<string, string | null>()
  const tmp = new Vector3()
  const tmp2 = new Vector3()
  const fwd = new Vector3()

  const relationOf = (id: string): string | null => {
    if (!relationCache.has(id)) relationCache.set(id, sim.relationOf(id))
    return relationCache.get(id) ?? null
  }

  const findPlayer = (): SimPerson => {
    const p = sim.state.people.find((q) => q.id === sim.state.playerId)
    if (!p) throw new Error('the sim has no player')
    return p
  }

  const feed: Feed = createFeed(bridge, {
    camera: (cue) => cameraCue(cue),
    sfx: (e) => {
      if (e.at) audio.sfx(e.name, sfxAt.set(e.at.x, world.heightAt(e.at.x, e.at.z) + 0.5, e.at.z))
      else audio.sfx(e.name)
    },
    modal: () => input.releaseLock(),
    chapterEnd: (e) => {
      relationCache.clear()
      deps.onChapterEnd(e.next)
    },
    noteTitle: deps.noteTitle,
  })

  function cameraCue(cue: CameraCue): void {
    if (cue.kind === 'fade')
      fade = {
        from: fadeValue,
        to: cue.to === 'black' ? 1 : 0,
        t: 0,
        seconds: Math.max(0.01, cue.seconds),
      }
    else if (cue.kind === 'shake') shake = { strength: cue.strength, t: 0, seconds: cue.seconds }
    else if (cue.kind === 'focus') focus = { targetId: cue.targetId, until: now + cue.seconds }
    else focus = null
  }

  const setPrompt = (want: PromptState | null) => {
    const p = fadeValue > FADE_HIDE ? null : want
    const l = lastPrompt
    if (
      p === l ||
      (p &&
        l &&
        p.label === l.label &&
        p.enabled === l.enabled &&
        p.reason === l.reason &&
        Math.abs(p.holdProgress - l.holdProgress) < 0.01 &&
        p.key === l.key)
    )
      return
    lastPrompt = p
    bridge.set({ prompt: p })
  }

  const log: string[] = []
  /** what a chapter's opening step said after its chapter-start: held until the card closes */
  let afterCard: SimEvent[] = []
  /** the life-summary held back while the death plays out */
  let closing: { event: SimEvent; t: number; sounded: boolean } | null = null
  let lastSummary: LifeSummary | null = null
  let lastWords = false
  let walkSet = false
  /** the old player's name while their heir's first chapter card is on its way */
  let heirOf: string | null = null
  let cardT = 0
  /** the chapter's opening asks for black after its card (its last queued fade is to black) */
  const opensBlack = () => {
    let black = false
    for (const e of afterCard)
      if (e.type === 'camera' && e.cue.kind === 'fade') black = e.cue.to === 'black'
    return black
  }
  const route = (events: SimEvent[]) => {
    let carded = false
    for (let e of events) {
      if (carded && e.type !== 'teleport') {
        afterCard.push(e)
        continue
      }
      if (e.type === 'chapter-start') carded = true
      // the end of a life plays out (last line, slow fade, sound) before the summary
      if (e.type === 'life-summary' && !closing) {
        closing = { event: e, t: 0, sounded: false }
        lastSummary = e.summary
        log.push(`${sim.state.chapter.beatId} | ${describe(e)}`)
        continue
      }
      // the grandchild's first card is theirs: their name, whose grandchild, how many summers
      if (e.type === 'chapter-start' && heirOf) {
        const years = Math.floor(e.ageYears)
        e = {
          ...e,
          title: findPlayer().name,
          subtitle: `${heirOf}'s grandchild · ${SUMMERS[years] ?? years} summers`,
        }
        heirOf = null
      }
      if (e.type !== 'bond' && e.type !== 'sfx') {
        log.push(`${sim.state.chapter.beatId} | ${describe(e)}`)
        if (log.length > LOG_SIZE) log.shift()
      }
      // UI moments the sim has no position for
      if (
        (e.type === 'learned' &&
          (e.personId === sim.state.playerId || e.fromId === sim.state.playerId)) ||
        e.type === 'face-learned'
      )
        audio.sfx('learn')
      else if (e.type === 'note' && !bridge.get().notesUnlocked.includes(e.noteId))
        audio.sfx('note')
      else if (e.type === 'chapter-start') audio.sfx('chapter')
      else if (e.type === 'life-summary') audio.music('summary')
      else if (e.type === 'teleport') controller.teleport(e.position.x, e.position.z, e.heading)
      feed.event(e, sim.state, relationOf)
    }
  }

  /** stage 2: breaking surf deeper than 0.3 m knocks the child back up the shore */
  const surfPush = (dt: number, player: SimPerson) => {
    surfCooldown = Math.max(0, surfCooldown - dt)
    if (sim.state.stage !== 'small' || surfCooldown > 0) return
    const { x, z } = controller.position
    const sea = sim.state.clock.seaLevel
    // surf or anything deeper: a six-year-old doesn't wade out past the breakers
    const surface = world.surfaceAt(x, z, sea)
    if (
      (surface !== 'surf' && surface !== 'shallows' && surface !== 'deep-sea') ||
      world.waterDepth(x, z, sea) <= 0.3
    )
      return
    // uphill is against the ground normal's horizontal part
    const n = world.normalAt(x, z)
    let ux = -n.x
    let uz = -n.z
    const len = Math.hypot(ux, uz)
    if (len < 1e-3) {
      ux = 0
      uz = -1
    } else {
      ux /= len
      uz /= len
    }
    controller.push(ux * 4.8, uz * 4.8)
    cameraCue({ kind: 'shake', strength: 0.7, seconds: 0.45 })
    audio.sfx('wave-crash', sfxAt.set(x, sea, z))
    surfCooldown = 2.5
    const mother = player.motherId
      ? sim.state.people.find((p) => p.id === player.motherId)
      : undefined
    const caller = mother?.alive ? mother.name : 'Ama'
    feed.caption({
      id: 'surf-call',
      text: 'Not so far!',
      speaker: caller,
      kind: 'speech',
      seconds: 2.5,
    })
  }

  const updateAudio = (player: SimPerson) => {
    const st = sim.state
    const p = mode === 'held' ? { x: camera.position.x, z: camera.position.z } : controller.position
    let fireDistance = Infinity
    for (const f of st.fires) {
      if (f.intensity < 0.05) continue
      fireDistance = Math.min(fireDistance, Math.hypot(f.x - p.x, f.z - p.z))
    }
    audio.update({
      listener: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      heading: mode === 'held' ? player.heading : controller.yaw,
      seaDistance: world.shoreDistance(p.x, p.z, st.clock.seaLevel),
      surf: Math.min(1, 0.35 + st.weather.wind * 0.5 + (st.weather.storm ? 0.3 : 0)),
      fireDistance,
      inCave: world.inCave(p.x, p.z),
      daylight: st.clock.daylight,
      wind: st.weather.wind,
      rain: st.weather.rain,
      muffle: mode === 'held' ? 0.7 : 0,
    })
  }

  const focusPoint = (id: string): { x: number; z: number } | null => {
    const p = sim.state.people.find((q) => q.id === id)
    if (p) return p.position
    const a = sim.state.animals.find((q) => q.id === id)
    if (a) return a.position
    const poi = world.pois.find((q) => q.id === id)
    return poi ? { x: poi.x, z: poi.z } : null
  }

  /** the carrier whose head is hidden, and that head's bone */
  let coneBeat: string | null = null
  let hiddenHead: { actor: PersonActor; bone: Object3D } | null = null
  const hideHead = (actor: PersonActor | null, hide: boolean) => {
    if (hiddenHead && (!hide || hiddenHead.actor !== actor)) {
      hiddenHead.bone.scale.setScalar(1)
      hiddenHead = null
    }
    if (!hide || !actor || hiddenHead) return
    const bone = headBone(actor.object)
    if (!bone) return
    bone.scale.setScalar(0.001)
    hiddenHead = { actor, bone }
  }

  const updateHeld = (dt: number, player: SimPerson, settings: ControlSettings) => {
    const carrier = player.carriedBy
      ? sim.state.people.find((q) => q.id === player.carriedBy)
      : undefined
    const actor = cast.person(player.id)
    if (!actor || !carrier) return
    actor.headPosition(tmp)
    // the camera sits inside the infant's head: don't draw the infant
    actor.object.visible = false
    const carrierActor = cast.person(carrier.id)
    const face = carrierActor ? carrierActor.headPosition(tmp2) : null
    // held.faces: every face around must be reachable, so the cone opens to the farthest bearing (+15°) at its start
    const beatId = sim.state.chapter.beatId
    if (beatId !== coneBeat) {
      coneBeat = beatId
      held.cone = HELD_CONE
      if (beatId === 'held.faces') {
        const facing = carrier.heading + (carrier.carrying?.slot === 'arms' ? Math.PI : 0)
        for (const q of sim.state.people) {
          if (q.isPlayer || q.carriedBy || !q.alive) continue
          const dx = q.position.x - player.position.x
          const dz = q.position.z - player.position.z
          if (Math.hypot(dx, dz) > GAZE_RANGE) continue
          let rel = Math.atan2(dx, dz) - facing
          rel = Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel)))
          held.cone = Math.min(Math.PI * 0.95, Math.max(held.cone, rel + FACES_MARGIN))
        }
      }
    }
    held.update(
      dt,
      input,
      camera,
      tmp,
      carrier.heading,
      carrier.speed,
      settings,
      carrier.carrying?.slot ?? 'back',
      face
    )
    camera.updateMatrixWorld()
    // on the back the view sits right beside her head: hide it (and its hair) while the camera is that close
    hideHead(
      carrierActor,
      carrier.carrying?.slot !== 'arms' &&
        face !== null &&
        camera.position.distanceTo(face) < HEAD_HIDE
    )

    // gaze: the face nearest the screen centre within 6°
    camera.getWorldDirection(fwd)
    let best: { id: string; angle: number } | null = null
    for (const q of sim.state.people) {
      if (q.isPlayer || q.carriedBy || !q.alive) continue
      const a = cast.person(q.id)
      if (!a) continue
      a.headPosition(tmp2)
      const d = tmp2.distanceTo(camera.position)
      if (d > GAZE_RANGE || d < 0.05) continue
      const angle = fwd.angleTo(tmp2.sub(camera.position))
      if (angle < GAZE_CONE && (!best || angle < best.angle)) best = { id: q.id, angle }
    }
    sim.command({ type: 'gaze', personId: best?.id ?? null, dt })

    // reach: LMB while looking roughly at what she offers
    const list = sim.interactionsNear(player.position, INTERACT_RADIUS)
    const reach = list.find((i) => i.verb === 'reach' && i.enabled)
    held.attract = reach
      ? reachAt.set(
          reach.position.x,
          world.heightAt(reach.position.x, reach.position.z) + 0.8,
          reach.position.z
        )
      : null
    if (reach) {
      tmp2.copy(reachAt).sub(camera.position)
      const looking = fwd.angleTo(tmp2) < 0.5
      setPrompt({
        label: looking ? 'Reach' : 'Look at what she offers',
        key: 'LMB',
        holdSeconds: 0,
        holdProgress: 0,
        enabled: looking,
        reason: null,
      })
      if (looking && input.mouse.lmbPressed)
        sim.command({ type: 'interact', interactionId: reach.id })
    } else setPrompt(null)
  }

  const updateInteract = (dt: number, player: SimPerson) => {
    const list = sim.interactionsNear(player.position, INTERACT_RADIUS)
    // the beat wins: its own verb (dir:*), its objective's person, the work at its objective's place.
    // Talking to whoever walks beside you comes after work; Eat only when hungry or nothing else works
    const target = sim.state.chapter.objective?.target
    const goal = target?.kind === 'person' ? target.id : null
    const place = target?.kind === 'point' ? target.at : null
    const atPlace = (i: Interaction) =>
      place !== null &&
      i.verb !== 'talk' &&
      Math.hypot(i.position.x - place.x, i.position.z - place.z) < GOAL_NEAR
    const hungry = player.needs.fed < 0.5
    const it =
      list.find((i) => i.enabled && i.id.startsWith('dir:')) ??
      list.find((i) => i.enabled && i.targetKind === 'person' && i.targetId === goal) ??
      list.find((i) => i.enabled && atPlace(i)) ??
      (hungry ? list.find((i) => i.enabled && i.verb === 'eat') : undefined) ??
      list.find((i) => i.enabled && i.verb !== 'eat' && i.verb !== 'talk') ??
      list.find((i) => i.enabled && i.verb !== 'eat') ??
      list.find((i) => i.enabled) ??
      list[0] ??
      null
    if (!it) {
      currentInteraction = null
      holdT = 0
      setPrompt(null)
      return
    }
    if (!currentInteraction || currentInteraction.id !== it.id) {
      holdT = 0
      holdLatch = input.down('KeyE')
    }
    currentInteraction = it
    if (!input.down('KeyE')) holdLatch = false
    if (it.enabled && !holdLatch) {
      if (it.holdSeconds <= 0) {
        if (input.pressed('KeyE')) {
          sim.command({ type: 'interact', interactionId: it.id })
          holdLatch = true
        }
      } else if (input.down('KeyE')) {
        holdT += dt
        if (holdT >= it.holdSeconds) {
          sim.command({ type: 'interact', interactionId: it.id })
          holdT = 0
          holdLatch = true
        }
      } else holdT = Math.max(0, holdT - dt * 2)
    }
    setPrompt({
      label: it.label,
      key: 'E',
      holdSeconds: it.holdSeconds,
      holdProgress: it.holdSeconds > 0 ? Math.min(1, holdT / it.holdSeconds) : 0,
      enabled: it.enabled,
      reason: it.enabled ? null : it.reason,
    })
  }

  const caveMouth = world.pois.find((p) => p.id === 'cave-mouth') ?? null
  let caveRock: TriGrid | null = null
  const findCaveRock = (): TriGrid | null => {
    const o = view.root.getObjectByName('cave-rock')
    return o instanceof Mesh ? createTriGrid(o) : null
  }
  const head = new Vector3()
  /** terrain, the cave's rock (crossing its footprint anywhere but the mouth) and lit flames block the line */
  const occluded = (from: Vector3, to: Vector3, body: Vector3 | null): boolean => {
    // the player's own body (a vertical post up to the head), seen from behind
    if (body) {
      const dx = to.x - from.x
      const dz = to.z - from.z
      const len2 = dx * dx + dz * dz
      const t = len2 > 1e-6 ? ((body.x - from.x) * dx + (body.z - from.z) * dz) / len2 : -1
      if (t > 0 && t < 1) {
        const off = Math.hypot(from.x + dx * t - body.x, from.z + dz * t - body.z)
        if (off < 0.22 && from.y + (to.y - from.y) * t < body.y + 0.1) return true
      }
    }
    // the cave's rock (its overhang and side walls aren't in the height field)
    caveRock ??= findCaveRock()
    if (caveRock?.blocked(from, to)) return true
    let wasIn = world.inCave(from.x, from.z)
    for (let i = 1; i < OCC_STEPS; i++) {
      const t = i / OCC_STEPS
      const x = from.x + (to.x - from.x) * t
      const y = from.y + (to.y - from.y) * t
      const z = from.z + (to.z - from.z) * t
      const ground = world.heightAt(x, z)
      if (ground > y) return true
      const isIn = world.inCave(x, z)
      if (!caveRock && isIn !== wasIn) {
        if (!caveMouth || Math.hypot(x - caveMouth.x, z - caveMouth.z) > caveMouth.radius * 1.2 + 4)
          return true
        wasIn = isIn
      }
      for (const f of sim.state.fires) {
        if (
          f.intensity > 0.3 &&
          Math.hypot(x - f.x, z - f.z) < 0.45 &&
          y < ground + 1.3 * f.intensity
        )
          return true
      }
    }
    return false
  }
  const hiddenFor = new Map<string, number>()
  const reachAt = new Vector3()
  const selfHead = new Vector3()
  const litFires: Vec2[] = []
  let lastTagsAt = 0

  /** beyond DARK_RANGE at night a face can't be made out unless a fire lights it */
  const inTheDark = (p: Vec2, d: number): boolean => {
    if (d <= DARK_RANGE || sim.state.clock.daylight > 0.25) return false
    for (const f of sim.state.fires)
      if (f.intensity > 0.3 && Math.hypot(p.x - f.x, p.z - f.z) < 3 + f.intensity * 3) return false
    return true
  }

  const updateTags = (player: SimPerson) => {
    const { width, height } = deps.viewport()
    // a fade to black takes the tags with it
    if (fadeValue > FADE_HIDE) {
      if (bridge.get().nameTags.length > 0) bridge.set({ nameTags: [] })
      return
    }
    const tagDt = Math.min(0.25, now - lastTagsAt)
    lastTagsAt = now
    const fading: NameTag[] = []
    const heldStage = player.carriedBy !== null
    const self = heldStage ? undefined : cast.person(player.id)
    const playerHead = self ? self.headPosition(selfHead) : null
    type Candidate = { tag: NameTag; d: number }
    const cands: Candidate[] = []
    for (const q of sim.state.people) {
      if (q.isPlayer || q.carriedBy || !q.alive) continue
      if (heldStage && !q.known) continue
      const a = cast.person(q.id)
      if (!a) continue
      a.headPosition(tmp)
      const d = tmp.distanceTo(camera.position)
      // the face filling an infant's view gets no tag: the face toast carries that moment
      if (d > TAG_RANGE || (heldStage && d < HELD_FACE_RANGE)) continue
      head.copy(tmp)
      head.y += 0.1
      tmp.y += heldStage ? 0.22 : 0.32
      tmp.project(camera)
      if (tmp.z > 1 || tmp.z < -1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) continue
      // a person out of sight loses their tag after OCC_HIDE (faded by the UI, then dropped)
      const hidden =
        occluded(camera.position, head, playerHead) || inTheDark(q.position, d)
          ? (hiddenFor.get(q.id) ?? 0) + tagDt
          : 0
      hiddenFor.set(q.id, hidden)
      if (hidden > OCC_HIDE + 0.6) continue
      const speaking = q.speech && q.speech.until > sim.state.clock.t ? q.speech.text : null
      const tag: NameTag = {
        id: q.id,
        name: q.name,
        relation: relationOf(q.id),
        x: Math.min(width - TAG_MARGIN, Math.max(TAG_MARGIN, ((tmp.x + 1) / 2) * width)),
        y: Math.min(
          height - TAG_MARGIN,
          Math.max(TAG_MARGIN + TAG_TALL, ((1 - tmp.y) / 2) * height)
        ),
        bond: q.bond,
        opacity: 1 - smooth(heldStage ? 3 : 12, heldStage ? 7 : TAG_RANGE, d),
        speaking,
      }
      if (hidden > OCC_HIDE) fading.push({ ...tag, opacity: 0 })
      else cands.push({ d, tag })
    }
    // declutter: nearest first, at most MAX_TAGS plus anyone speaking; an overlapping farther tag nudges up a
    // line when both are close, otherwise it drops out
    cands.sort((a, b) => a.d - b.d)
    const placed: Candidate[] = []
    const overlaps = (t: NameTag) =>
      placed.some((p) => Math.abs(p.tag.x - t.x) < TAG_BOX_W && Math.abs(p.tag.y - t.y) < TAG_BOX_H)
    let quiet = 0
    for (const c of cands) {
      if (!c.tag.speaking && quiet >= MAX_TAGS) continue
      if (overlaps(c.tag)) {
        const near = c.d < 8 && placed.some((p) => p.d < 8)
        const up = { ...c.tag, y: Math.max(TAG_MARGIN + TAG_TALL, c.tag.y - TAG_BOX_H) }
        if (!near || overlaps(up)) continue
        c.tag = up
      }
      placed.push(c)
      if (!c.tag.speaking) quiet++
    }
    const tags = placed.map((c) => c.tag)
    // keep fading tags only if they were showing, so the UI can ease them out
    const prevIds = new Set(bridge.get().nameTags.map((t) => t.id))
    for (const f of fading) if (prevIds.has(f.id)) tags.push(f)
    const prev = bridge.get().nameTags
    if (tags.length === 0 && prev.length === 0) return
    bridge.set({ nameTags: tags })
  }

  const updateHud = (player: SimPerson) => {
    const s = sim.state
    const w = s.weather
    const clock: ClockState = { ...s.clock }
    const lastWalk = s.chapter.beatId === 'elder.walk'
    bridge.setHud({
      visible: true,
      name: player.name,
      // whole years from one, tenths for an infant
      ageYears: shownAge(player.look.ageYears),
      stage: s.stage,
      // the last walk to the sea keeps only its objective
      needs: s.stage === 'held' || lastWalk ? null : { ...player.needs },
      clock,
      inventory: lastWalk ? null : { ...s.inventory },
      // screen-space wind: 0 = blowing away from the camera (up the screen)
      wind:
        s.stage === 'held' || lastWalk
          ? null
          : { dir: controller.yaw - w.windDir, strength: w.wind },
    })
  }

  const sayLastWords = (player: SimPerson) => {
    lastWords = true
    feed.caption({
      id: `last-words-${player.id}`,
      text: `${player.name} sits where the sand is dry and watches the sea come in, the way it always has.`,
      speaker: null,
      kind: 'narration',
      seconds: LAST_LINE + LAST_FADE,
    })
  }

  /** last line, slow fade to black, the sea, then the summary; whether the walk ran or was skipped */
  const updateClosing = (dt: number) => {
    const c = closing
    if (!c) return
    if (c.t === 0 && !lastWords) sayLastWords(findPlayer())
    c.t += dt
    if (c.t >= LAST_LINE && fade.to < 1)
      cameraCue({ kind: 'fade', to: 'black', seconds: LAST_FADE })
    if (fadeValue < 0.99) return
    if (!c.sounded) {
      c.sounded = true
      c.t = Math.max(c.t, LAST_LINE + LAST_FADE)
      audio.sfx('wave-crash')
    }
    if (c.t < LAST_LINE + LAST_FADE + LAST_HUSH) return
    closing = null
    route([c.event])
  }

  const markAt = new Vector3()
  const updateMark = (player: SimPerson) => {
    const mark = objectiveMarkNow(player)
    const l = bridge.get().objectiveMark
    if (
      mark === l ||
      (mark &&
        l &&
        mark.onScreen === l.onScreen &&
        Math.abs(mark.x - l.x) < 1 &&
        Math.abs(mark.y - l.y) < 1 &&
        Math.abs(mark.distance - l.distance) < 0.5)
    )
      return
    bridge.set({ objectiveMark: mark })
  }

  /** the objective's target on screen, or clamped to the edge toward it; null in held, cinematics and fades */
  const objectiveMarkNow = (player: SimPerson): ObjectiveMark | null => {
    const t = sim.state.chapter.objective?.target
    if (!t || mode !== 'third' || sim.state.stage === 'held') return null
    if (fadeValue > FADE_HIDE || closing || (focus && now < focus.until)) return null
    if (bridge.get().screen !== 'playing') return null
    if (t.kind === 'person') {
      const q = sim.state.people.find((p) => p.id === t.id)
      if (!q || !q.alive) return null
      const carrier = q.carriedBy ? sim.state.people.find((p) => p.id === q.carriedBy) : undefined
      const at = (carrier ?? q).position
      markAt.set(at.x, world.heightAt(at.x, at.z) + 1.7, at.z)
    } else markAt.set(t.at.x, world.heightAt(t.at.x, t.at.z) + 1, t.at.z)
    const distance = Math.hypot(markAt.x - player.position.x, markAt.z - player.position.z)
    if (distance < MARK_NEAR) return null
    const { width, height } = deps.viewport()
    // camera space: x right, y up, looking down −z; (x, −y) is the screen direction in front and behind alike
    tmp.copy(markAt).applyMatrix4(camera.matrixWorldInverse)
    const behind = tmp.z > -0.1
    const dx = tmp.x
    const dy = -tmp.y
    tmp.copy(markAt).project(camera)
    const sx = ((tmp.x + 1) / 2) * width
    const sy = ((1 - tmp.y) / 2) * height
    const onScreen =
      !behind &&
      sx >= MARK_EDGE &&
      sx <= width - MARK_EDGE &&
      sy >= MARK_EDGE &&
      sy <= height - MARK_EDGE
    const angle = Math.atan2(dx, -dy)
    if (onScreen) return { x: sx, y: sy, onScreen, angle, distance }
    // off screen: from the centre along the target's direction to the inset edge (straight behind points down)
    const ex = Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4 ? 0 : dx
    const ey = ex === 0 && Math.abs(dy) < 1e-4 ? 1 : dy
    const hw = width / 2 - MARK_EDGE
    const hh = height / 2 - MARK_EDGE
    const k = Math.min(
      Math.abs(ex) > 1e-6 ? hw / Math.abs(ex) : Infinity,
      Math.abs(ey) > 1e-6 ? hh / Math.abs(ey) : Infinity
    )
    return {
      x: width / 2 + ex * k,
      y: height / 2 + ey * k,
      onScreen: false,
      angle: Math.atan2(ex, -ey),
      distance,
    }
  }

  let watchKey = ''
  const updateWatching = () => {
    const w = sim.state.watching
    const key = w ? `${w.personId}:${w.skill}:${w.progress.toFixed(2)}` : ''
    if (key === watchKey) return
    watchKey = key
    const name = w ? (sim.state.people.find((p) => p.id === w.personId)?.name ?? w.personId) : ''
    bridge.setHud({ watching: w ? { name, skill: w.skill, progress: w.progress } : null })
  }

  const game: Game = {
    sim,
    cast,
    controller,
    hunt,
    simPaused: false,
    update(dt, elapsed) {
      now = elapsed
      const settings = deps.settings()
      const screen = bridge.get().screen
      const modal = bridge.get().choice !== null || bridge.get().minigame !== null
      const live = screen === 'playing' && !game.simPaused && !modal && closing === null
      input.enabled = live
      input.wantLock = live

      let player = findPlayer()
      const nextMode = player.carriedBy ? 'held' : 'third'
      if (nextMode !== mode) {
        mode = nextMode
        const self = cast.person(player.id)
        if (self) self.object.visible = true
        if (mode === 'third') {
          hideHead(null, false)
          controller.teleport(player.position.x, player.position.z, player.heading)
        } else held.reset()
      }

      const feel = STAGE_FEEL[sim.state.stage]
      let pose: PlayerPose | null = null
      if (mode === 'third') {
        const out = controller.update(
          dt,
          input,
          feel,
          sim.state.clock.seaLevel,
          settings,
          !live,
          hunt.aim
        )
        const still = out.speed < 0.05 && out.anim === 'idle'
        const anim = hunt.throwing
          ? 'throw'
          : still && SIM_POSES.has(player.anim)
            ? player.anim
            : out.anim
        pose = {
          x: out.position.x,
          z: out.position.z,
          heading: out.heading,
          speed: out.speed,
          anim,
          right: hunt.rightHand(),
        }
        if (live) {
          sim.command({
            type: 'move',
            position: out.position,
            heading: out.heading,
            speed: out.speed,
            anim,
          })
          surfPush(dt, player)
          const moved = Math.hypot(out.position.x - lastPos.x, out.position.z - lastPos.z)
          const stride = 0.55 + player.look.ageYears * 0.012
          const step = steps.advance(
            Math.min(moved, 1),
            Math.min(0.85, stride),
            world.surfaceAt(out.position.x, out.position.z, sim.state.clock.seaLevel)
          )
          if (step)
            audio.sfx(
              step,
              sfxAt.set(
                out.position.x,
                world.heightAt(out.position.x, out.position.z),
                out.position.z
              )
            )
        }
        lastPos.x = out.position.x
        lastPos.z = out.position.z
      }
      if (sim.state.stage !== lastStage) {
        lastStage = sim.state.stage
        audio.music(lastStage)
      }

      // behind the chapter card the scene comes up from black, so the card lifts onto the world, not onto black
      if (screen === 'chapter-card') {
        cardT += dt
        if (cardT > CARD_CLEAR && fade.to > 0 && !opensBlack())
          cameraCue({ kind: 'fade', to: 'clear', seconds: 0.6 })
      } else cardT = 0
      if (screen === 'playing' && !game.simPaused && !modal) {
        if (closing) updateClosing(dt)
        if (afterCard.length > 0) {
          const queued = afterCard
          afterCard = []
          route(queued)
        }
        route(sim.step(dt))
      }
      player = findPlayer()
      cast.sync(sim.state, dt, pose)
      // the elder sits by the sea (the walk's objective is met): the life's last line
      if (sim.state.chapter.beatId === 'elder.walk' && !lastWords) {
        if (sim.state.chapter.objective) walkSet = true
        else if (walkSet) sayLastWords(player)
      }

      if (mode === 'held') updateHeld(dt, player, settings)
      else {
        if (focus && now < focus.until) {
          const p = focusPoint(focus.targetId)
          if (p) {
            const want = Math.atan2(p.x - controller.position.x, p.z - controller.position.z)
            let d = want - controller.yaw
            d = Math.atan2(Math.sin(d), Math.cos(d))
            controller.yaw += d * Math.min(1, dt * 2.5)
          }
        } else focus = null
        litFires.length = 0
        for (const f of sim.state.fires) if (f.intensity > 0.1) litFires.push(f)
        controller.updateCamera(
          dt,
          camera,
          feel,
          hunt.aim,
          litFires,
          pose && SEATED.has(pose.anim) ? 1 : 0
        )
        const huntPrompt = hunt.update(dt, input, player, live)
        if (huntPrompt) setPrompt(huntPrompt)
        else if (live) updateInteract(dt, player)
        else setPrompt(null)
        tracks.update(dt, controller.position)
      }

      if (shake.t < shake.seconds) {
        shake.t += dt
        const k = shake.strength * (1 - shake.t / shake.seconds)
        camera.position.x += (Math.sin(now * 53) + Math.sin(now * 31)) * 0.04 * k
        camera.position.y += Math.sin(now * 47) * 0.05 * k
      }
      if (fade.t < 1) {
        fade.t = Math.min(1, fade.t + dt / fade.seconds)
        fadeValue = fade.from + (fade.to - fade.from) * fade.t
        pipeline.setFade(fadeValue)
      }
      pipeline.setDream(mode === 'held' ? 0.6 : 0)

      tagTimer += dt
      if (tagTimer >= 1 / 15) {
        tagTimer = 0
        updateTags(player)
        updateMark(player)
        updateWatching()
      }
      hudTimer += dt
      if (hudTimer >= 0.25) {
        hudTimer = 0
        updateHud(player)
      }
      feed.frame(now)
      updateAudio(player)

      const focusPos =
        mode === 'held'
          ? camera.position
          : tmp.set(
              controller.position.x,
              world.heightAt(controller.position.x, controller.position.z),
              controller.position.z
            )
      view.update({
        dt,
        clock: sim.state.clock,
        weather: sim.state.weather,
        camera,
        fires: sim.state.fires,
        focus: { x: focusPos.x, y: focusPos.y, z: focusPos.z },
      })
      pipeline.render(scene, camera, dt)
      input.endFrame()
    },
    teleport(x, z, heading) {
      controller.teleport(x, z, heading ?? controller.heading)
      sim.command({
        type: 'move',
        position: { x, z },
        heading: heading ?? controller.heading,
        speed: 0,
        anim: 'idle',
      })
    },
    player: findPlayer,
    log,
    continueAsHeir() {
      heirOf = lastSummary?.name ?? null
      sim.command({ type: 'continue-as-heir' })
      // the chapter card comes up in this same call, so no frame of the old black under the HUD
      route(sim.step(0))
    },
    dispose() {
      hideHead(null, false)
      feed.reset()
      hunt.dispose()
      tracks.dispose()
      spoor.dispose()
      cast.dispose()
      pipeline.setDream(0)
      pipeline.setFade(0)
      bridge.setHud({ visible: false, watching: null })
    },
  }
  return game
}
