/**
 * The shared runtime under the game route and the play lab: one host, one pipeline, one scene and camera,
 * the world built once, input, and the current Game. Swappable lives on top of a world that stays.
 */
import { PerspectiveCamera, Scene } from 'three'
import { FIELD_NOTES } from '~/content/field-notes'
import { bridge as pageBridge, type Bridge } from '../bridge'
import { FIELD_NOTE_IDS, type GameAudio, type LifeStageId, type SaveData, type WorldData, type WorldView, type RenderPipeline } from '../contracts'
import { createHost, type GameHost } from '../engine/host'
import { createGame, type Game } from './game'
import { createInput, type Input } from './input'
import { modules } from './modules'

export type Runtime = {
  readonly host: GameHost
  readonly input: Input
  readonly bridge: Bridge
  readonly camera: PerspectiveCamera
  readonly scene: Scene
  readonly pipeline: RenderPipeline
  readonly audio: GameAudio
  world: WorldData | null
  view: WorldView | null
  game: Game | null
  /** build the world if needed (blocking, ~1 s) */
  ensureWorld(seed: number): WorldData
  startLife(opts: { seed: number; stage: LifeStageId; playerName: string; save?: SaveData }): Game
  endLife(): void
  onChapterEnd: (next: LifeStageId | null) => void
  noteTitle: (id: string) => string | null
  dispose(): void
}

export function createRuntime(el: HTMLElement, opts: { bridge?: Bridge; wrapAudio?: (a: GameAudio) => GameAudio } = {}): Runtime {
  const bridge = opts.bridge ?? pageBridge
  const host = createHost(el)
  const pipeline = modules.createRenderPipeline(host.renderer)
  const scene = new Scene()
  const camera = new PerspectiveCamera(60, 1, 0.05, 4000)
  const input = createInput(host.canvas)
  const base = modules.createAudio()
  const audio = opts.wrapAudio ? opts.wrapAudio(base) : base
  const applyVolume = () => {
    const s = bridge.get().settings
    audio.setVolume(s.master, s.music)
  }
  applyVolume()

  const offResize = host.onResize((s) => {
    camera.aspect = s.width / s.height
    camera.updateProjectionMatrix()
    pipeline.setSize(s.width, s.height, s.dpr)
  })

  const rt: Runtime = {
    host,
    input,
    bridge,
    camera,
    scene,
    pipeline,
    audio,
    world: null,
    view: null,
    game: null,
    onChapterEnd: () => {},
    noteTitle: (id) => {
      const ids: readonly string[] = FIELD_NOTE_IDS
      if (!ids.includes(id)) return null
      return Object.values(FIELD_NOTES).find((n) => n.id === id)?.title ?? null
    },
    ensureWorld(seed) {
      if (rt.world && rt.world.seed === seed && rt.view) return rt.world
      if (rt.view) {
        rt.view.root.removeFromParent()
        rt.view.dispose()
      }
      const world = modules.createWorldData(seed)
      const view = modules.createWorldView(world, pipeline)
      scene.add(view.root)
      rt.world = world
      rt.view = view
      return world
    },
    startLife(o) {
      rt.endLife()
      const world = rt.ensureWorld(o.seed)
      const view = rt.view
      if (!view) throw new Error('world view missing')
      const game = createGame(
        {
          scene,
          camera,
          pipeline,
          world,
          view,
          modules,
          input,
          bridge,
          audio,
          viewport: () => ({ width: host.size.width, height: host.size.height }),
          settings: () => {
            const s = bridge.get().settings
            return { sensitivity: s.sensitivity, invertY: s.invertY }
          },
          noteTitle: (id) => rt.noteTitle(id),
          onChapterEnd: (next) => rt.onChapterEnd(next),
        },
        o,
      )
      rt.game = game
      return game
    },
    endLife() {
      rt.game?.dispose()
      rt.game = null
    },
    dispose() {
      rt.endLife()
      offResize()
      input.dispose()
      audio.dispose()
      if (rt.view) {
        rt.view.root.removeFromParent()
        rt.view.dispose()
      }
      pipeline.dispose()
      host.dispose()
    },
  }

  host.onFrame((dt, elapsed) => {
    if (rt.game) rt.game.update(dt, elapsed)
  })
  return rt
}
