/**
 * The game route's session: the title → intro → loading → playing flow, every bridge action, pause, saving and
 * continuing, over one shared runtime. `mount(el)` is loaded by app/play.tsx through ClientMount.
 */
import { z } from 'zod'
import type { Screen } from '../bridge'
import { LIFE_STAGES, type LifeStageId, type SaveData } from '../contracts'
import { createRuntime, type Runtime } from './runtime'

export const SAVE_KEY = 'ochre.save.v1'
const SEED = 80_000
const SAVE_EVERY = 30

const stageSchema = z.enum(['held', 'small', 'youth', 'provider', 'elder'])
const saveSchema = z.object({
  v: z.literal(1),
  name: z.string(),
  stage: stageSchema,
  seed: z.number(),
  save: z.object({ version: z.literal(1), payload: z.unknown() }),
})
type SaveFile = z.infer<typeof saveSchema>

function readSave(): SaveFile | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = saveSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function writeSave(file: SaveFile): void {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(file))
  } catch {
    // storage full or blocked: the life goes on unsaved
  }
}

export type QaHandles = {
  qaState(): unknown
  qaTeleport(poiId: string): void
  qaStage(stage: LifeStageId): void
  qaSkipBeat(): void
  runtime: Runtime
}

declare global {
  interface Window {
    __game?: QaHandles
  }
}

export function mount(el: HTMLElement): () => void {
  const rt = createRuntime(el)
  const { bridge, host, input } = rt
  let playerName = 'Teni'
  let overlayReturn: Screen = 'paused'
  let saveTimer = 0
  let loadTimer: ReturnType<typeof setTimeout> | null = null

  bridge.set({ screen: 'title', hasLife: readSave() !== null })
  rt.audio.music('title')

  const save = () => {
    const g = rt.game
    if (!g) return
    writeSave({ v: 1, name: playerName, stage: g.sim.state.stage, seed: SEED, save: g.sim.serialize() })
  }

  // every entry into a life comes from a click: the gesture that lets WebAudio start
  const wakeAudio = () => {
    void rt.audio.resume().catch(() => {})
  }

  const begin = (stage: LifeStageId, saved?: SaveData) => {
    wakeAudio()
    host.setPaused(false)
    bridge.set({ screen: 'loading', loadingProgress: 0.15, summary: null, chapter: null })
    if (loadTimer) clearTimeout(loadTimer)
    // two frames so the loading screen paints before the world build blocks the thread
    loadTimer = setTimeout(() => {
      loadTimer = null
      try {
        rt.startLife({ seed: SEED, stage, playerName, ...(saved ? { save: saved } : {}) })
      } catch (err) {
        console.error('[session] could not start the life', err)
        if (saved) {
          // a stale save from an older sim: start the stage fresh instead
          rt.startLife({ seed: SEED, stage, playerName })
        } else throw err
      }
      saveTimer = 0
      // a chapter-start from the sim's first step will switch to the chapter card
      bridge.set({ screen: 'playing', loadingProgress: 1, hasLife: true })
    }, 60)
  }

  rt.onChapterEnd = () => save()

  const offFrame = host.onFrame((dt) => {
    if (!rt.game || bridge.get().screen !== 'playing') return
    saveTimer += dt
    if (saveTimer >= SAVE_EVERY) {
      saveTimer = 0
      save()
    }
  })

  const pause = () => {
    if (bridge.get().screen !== 'playing' || !rt.game) return
    input.releaseLock()
    bridge.set({ screen: 'paused', prompt: null })
    host.setPaused(true)
  }
  const resume = () => {
    if (bridge.get().screen !== 'paused') return
    bridge.set({ screen: 'playing' })
    host.setPaused(false)
  }

  const uninstall = bridge.provide({
    newLife(name) {
      wakeAudio()
      playerName = name.trim() || 'Teni'
      bridge.set({ screen: 'intro', notesUnlocked: [], notesNew: [] })
    },
    introDone() {
      begin('held')
    },
    chooseChapter(stage) {
      begin(stage)
    },
    continueLife() {
      const file = readSave()
      if (!file) return
      playerName = file.name
      begin(file.stage, file.save)
    },
    chapterCardDone() {
      if (bridge.get().screen === 'chapter-card') bridge.set({ screen: 'playing', chapter: null })
    },
    pause,
    resume,
    openNotes() {
      const s = bridge.get().screen
      if (s !== 'notes' && s !== 'lineage') overlayReturn = s
      bridge.set({ screen: 'notes' })
    },
    openLineage() {
      const s = bridge.get().screen
      if (s !== 'notes' && s !== 'lineage') overlayReturn = s
      const g = rt.game
      if (g) {
        const st = g.sim.state
        bridge.set({
          lineage: st.people.map((p) => ({
            id: p.id,
            name: p.name,
            relation: p.isPlayer ? 'You' : g.sim.relationOf(p.id) ?? 'Of the band',
            ageYears: Math.floor(p.look.ageYears),
            alive: p.alive,
            bond: p.bond,
            skills: [...p.skills],
          })),
        })
      }
      bridge.set({ screen: 'lineage' })
    },
    closeOverlay() {
      bridge.set({ screen: overlayReturn })
    },
    markNoteRead(id) {
      const s = bridge.get()
      if (s.notesNew.includes(id)) bridge.set({ notesNew: s.notesNew.filter((n) => n !== id) })
    },
    quitToTitle() {
      save()
      rt.endLife()
      host.setPaused(false)
      input.releaseLock()
      rt.audio.music('title')
      bridge.set({ screen: 'title', hasLife: readSave() !== null, summary: null, chapter: null })
    },
    choose(choiceId, optionId) {
      rt.game?.sim.command({ type: 'choose', choiceId, optionId })
      bridge.set({ choice: null })
    },
    minigameDone(game, quality) {
      rt.game?.sim.command({ type: 'minigame-result', game, quality })
      bridge.set({ minigame: null })
    },
    summaryContinue(asHeir) {
      const g = rt.game
      if (asHeir && g) {
        g.sim.command({ type: 'continue-as-heir' })
        bridge.set({ screen: 'playing', summary: null })
        save()
      } else {
        rt.endLife()
        bridge.set({ screen: 'title', summary: null, hasLife: readSave() !== null })
      }
    },
    setSettings(patch) {
      const next = { ...bridge.get().settings, ...patch }
      bridge.set({ settings: next })
      if (patch.quality) rt.pipeline.setQuality(patch.quality)
      if (patch.master !== undefined || patch.music !== undefined) rt.audio.setVolume(next.master, next.music)
    },
  })

  const offLock = input.onLockLost(() => {
    // the browser's Esc ends pointer lock before any keydown reaches us
    if (bridge.get().screen === 'playing' && !bridge.get().choice && !bridge.get().minigame) pause()
  })
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Escape') return
    // only pausing is ours: the UI's pause, notes and lineage screens handle their own Esc (settings, detail views)
    if (bridge.get().screen === 'playing' && !bridge.get().choice && !bridge.get().minigame) pause()
  }
  window.addEventListener('keydown', onKey)
  const onHide = () => save()
  window.addEventListener('pagehide', onHide)

  if (import.meta.env.DEV) {
    window.__game = {
      runtime: rt,
      qaState: () => {
        const g = rt.game
        if (!g) return { screen: bridge.get().screen, game: null }
        const st = g.sim.state
        const p = g.player()
        return {
          screen: bridge.get().screen,
          stage: st.stage,
          beat: st.chapter.beatId,
          objective: st.chapter.objective,
          clock: { day: st.clock.day, hour: Number(st.clock.hour.toFixed(2)), seaLevel: Number(st.clock.seaLevel.toFixed(2)) },
          player: { x: Number(p.position.x.toFixed(1)), z: Number(p.position.z.toFixed(1)), carriedBy: p.carriedBy, skills: p.skills, needs: p.needs },
          watching: st.watching,
          inventory: st.inventory,
          prompt: bridge.get().prompt,
          notes: st.notes,
        }
      },
      qaTeleport: (poiId) => {
        const g = rt.game
        const w = rt.world
        if (!g || !w) return
        const poi = w.poi(poiId)
        g.teleport(poi.x, poi.z + poi.radius * 0.5, 0)
      },
      qaStage: (stage) => {
        if (!LIFE_STAGES.includes(stage)) throw new Error(`unknown stage ${stage}`)
        begin(stage)
      },
      qaSkipBeat: () => {
        console.warn('[qa] skip beat needs the director (S2)')
      },
    }
  }

  return () => {
    save()
    if (loadTimer) clearTimeout(loadTimer)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('pagehide', onHide)
    offLock()
    offFrame()
    uninstall()
    rt.dispose()
    bridge.reset()
    if (window.__game?.runtime === rt) delete window.__game
  }
}
