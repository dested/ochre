/**
 * One life in progress: the sim, the cast, the player's body or the infant's eyes, interactions, name tags and
 * the bridge feed, drawn through the shared world view and pipeline. The session creates one per life; the
 * lab drives one directly.
 */
import { PerspectiveCamera, Scene, Vector3 } from 'three'
import type { Bridge, NameTag, PromptState } from '../bridge'
import type {
  CameraCue,
  ClockState,
  Interaction,
  LifeStageId,
  RenderPipeline,
  SaveData,
  Sim,
  SimEvent,
  SimPerson,
  WorldData,
  WorldView,
} from '../contracts'
import { createCast, type Cast, type PlayerPose } from './cast'
import { createController, type ControlSettings, type Controller } from './controller'
import { createFeed, type Feed } from './feed'
import { createHeldCamera, type HeldCamera } from './held-camera'
import type { Input } from './input'
import type { Modules } from './modules'
import { STAGE_FEEL } from './stages'

export type GameDeps = {
  scene: Scene
  camera: PerspectiveCamera
  pipeline: RenderPipeline
  world: WorldData
  view: WorldView
  modules: Modules
  input: Input
  bridge: Bridge
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
  /** sim and player frozen (chapter card, menus) while the world keeps drawing */
  simPaused: boolean
  update(dt: number, elapsed: number): void
  /** move the player (third person) to a POI or point */
  teleport(x: number, z: number, heading?: number): void
  player(): SimPerson
  dispose(): void
}

const INTERACT_RADIUS = 2.5
const TAG_RANGE = 25
const GAZE_CONE = (6 * Math.PI) / 180
const GAZE_RANGE = 7

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function createGame(deps: GameDeps, opts: GameOptions): Game {
  const { scene, camera, pipeline, world, view, modules, input, bridge } = deps
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
    sfx: () => {},
    modal: () => input.releaseLock(),
    chapterEnd: (e) => {
      relationCache.clear()
      deps.onChapterEnd(e.next)
    },
    noteTitle: deps.noteTitle,
  })

  function cameraCue(cue: CameraCue): void {
    if (cue.kind === 'fade') fade = { from: fadeValue, to: cue.to === 'black' ? 1 : 0, t: 0, seconds: Math.max(0.01, cue.seconds) }
    else if (cue.kind === 'shake') shake = { strength: cue.strength, t: 0, seconds: cue.seconds }
    else if (cue.kind === 'focus') focus = { targetId: cue.targetId, until: now + cue.seconds }
    else focus = null
  }

  const setPrompt = (p: PromptState | null) => {
    const l = lastPrompt
    if (
      p === l ||
      (p && l && p.label === l.label && p.enabled === l.enabled && p.reason === l.reason && Math.abs(p.holdProgress - l.holdProgress) < 0.01 && p.key === l.key)
    )
      return
    lastPrompt = p
    bridge.set({ prompt: p })
  }

  const route = (events: SimEvent[]) => {
    for (const e of events) feed.event(e, sim.state, relationOf)
  }

  const focusPoint = (id: string): { x: number; z: number } | null => {
    const p = sim.state.people.find((q) => q.id === id)
    if (p) return p.position
    const a = sim.state.animals.find((q) => q.id === id)
    if (a) return a.position
    const poi = world.pois.find((q) => q.id === id)
    return poi ? { x: poi.x, z: poi.z } : null
  }

  const updateHeld = (dt: number, player: SimPerson, settings: ControlSettings) => {
    const carrier = player.carriedBy ? sim.state.people.find((q) => q.id === player.carriedBy) : undefined
    const actor = cast.person(player.id)
    if (!actor || !carrier) return
    actor.headPosition(tmp)
    // the camera sits inside the infant's head: don't draw the infant
    actor.object.visible = false
    const carrierActor = cast.person(carrier.id)
    const face = carrierActor ? carrierActor.headPosition(tmp2) : null
    held.update(dt, input, camera, tmp, carrier.heading, carrier.speed, settings, carrier.carrying?.slot ?? 'back', face)
    camera.updateMatrixWorld()

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
    if (reach) {
      const y = world.heightAt(reach.position.x, reach.position.z) + 0.8
      tmp2.set(reach.position.x, y, reach.position.z).sub(camera.position)
      const looking = fwd.angleTo(tmp2) < 0.45
      setPrompt({ label: looking ? 'Reach' : 'Look at what she offers', key: 'LMB', holdSeconds: 0, holdProgress: 0, enabled: looking, reason: null })
      if (looking && input.mouse.lmbPressed) sim.command({ type: 'interact', interactionId: reach.id })
    } else setPrompt(null)
  }

  const updateInteract = (dt: number, player: SimPerson) => {
    const list = sim.interactionsNear(player.position, INTERACT_RADIUS)
    const it = list[0] ?? null
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

  const updateTags = (player: SimPerson) => {
    const { width, height } = deps.viewport()
    const tags: NameTag[] = []
    const heldStage = player.carriedBy !== null
    for (const q of sim.state.people) {
      if (q.isPlayer || q.carriedBy || !q.alive) continue
      if (heldStage && !q.known) continue
      const a = cast.person(q.id)
      if (!a) continue
      a.headPosition(tmp)
      const d = tmp.distanceTo(camera.position)
      if (d > TAG_RANGE) continue
      tmp.y += heldStage ? 0.22 : 0.32
      tmp.project(camera)
      if (tmp.z > 1 || tmp.z < -1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) continue
      const speaking = q.speech && q.speech.until > sim.state.clock.t ? q.speech.text : null
      tags.push({
        id: q.id,
        name: q.name,
        relation: relationOf(q.id),
        x: ((tmp.x + 1) / 2) * width,
        y: ((1 - tmp.y) / 2) * height,
        bond: q.bond,
        opacity: 1 - smooth(heldStage ? 3 : 12, heldStage ? 7 : TAG_RANGE, d),
        speaking,
      })
    }
    const prev = bridge.get().nameTags
    if (tags.length === 0 && prev.length === 0) return
    bridge.set({ nameTags: tags })
  }

  const updateHud = (player: SimPerson) => {
    const s = sim.state
    const w = s.weather
    const clock: ClockState = { ...s.clock }
    bridge.setHud({
      visible: true,
      name: player.name,
      ageYears: player.look.ageYears,
      stage: s.stage,
      needs: s.stage === 'held' ? null : { ...player.needs },
      clock,
      inventory: { ...s.inventory },
      // screen-space wind: 0 = blowing away from the camera (up the screen)
      wind: s.stage === 'held' ? null : { dir: controller.yaw - w.windDir, strength: w.wind },
    })
  }

  let watchKey = ''
  const updateWatching = () => {
    const w = sim.state.watching
    const key = w ? `${w.personId}:${w.skill}:${w.progress.toFixed(2)}` : ''
    if (key === watchKey) return
    watchKey = key
    const name = w ? sim.state.people.find((p) => p.id === w.personId)?.name ?? w.personId : ''
    bridge.setHud({ watching: w ? { name, skill: w.skill, progress: w.progress } : null })
  }

  const game: Game = {
    sim,
    cast,
    controller,
    simPaused: false,
    update(dt, elapsed) {
      now = elapsed
      const settings = deps.settings()
      const screen = bridge.get().screen
      const modal = bridge.get().choice !== null || bridge.get().minigame !== null
      const live = screen === 'playing' && !game.simPaused && !modal
      input.enabled = live
      input.wantLock = live

      let player = findPlayer()
      const nextMode = player.carriedBy ? 'held' : 'third'
      if (nextMode !== mode) {
        mode = nextMode
        const self = cast.person(player.id)
        if (self) self.object.visible = true
        if (mode === 'third') controller.teleport(player.position.x, player.position.z, player.heading)
        else held.reset()
      }

      const feel = STAGE_FEEL[sim.state.stage]
      let pose: PlayerPose | null = null
      if (mode === 'third') {
        const out = controller.update(dt, input, feel, sim.state.clock.seaLevel, settings, !live)
        pose = { x: out.position.x, z: out.position.z, heading: out.heading, speed: out.speed, anim: out.anim }
        if (live) sim.command({ type: 'move', position: out.position, heading: out.heading, speed: out.speed, anim: out.anim })
      }

      if (screen === 'playing' && !game.simPaused && !modal) route(sim.step(dt))
      player = findPlayer()
      cast.sync(sim.state, dt, pose)

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
        controller.updateCamera(dt, camera, feel, 0)
        if (live) updateInteract(dt, player)
        else setPrompt(null)
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
        updateWatching()
      }
      hudTimer += dt
      if (hudTimer >= 0.25) {
        hudTimer = 0
        updateHud(player)
      }
      feed.frame(now)

      const focusPos = mode === 'held' ? camera.position : tmp.set(controller.position.x, world.heightAt(controller.position.x, controller.position.z), controller.position.z)
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
      sim.command({ type: 'move', position: { x, z }, heading: heading ?? controller.heading, speed: 0, anim: 'idle' })
    },
    player: findPlayer,
    dispose() {
      feed.reset()
      cast.dispose()
      pipeline.setDream(0)
      pipeline.setFade(0)
      bridge.setHud({ visible: false, watching: null })
    },
  }
  return game
}
