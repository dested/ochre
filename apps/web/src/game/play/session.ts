/**
 * The game route's session: the title → intro → loading → playing flow, every bridge action, pause, saving and
 * continuing, over one shared runtime. `mount(el)` is loaded by app/play.tsx through ClientMount.
 */
import { z } from 'zod'
import type { LineageEntry, Screen } from '../bridge'
import { LIFE_STAGES, type LifeStageId, type SaveData, type Sim } from '../contracts'
import { createRuntime, type Runtime } from './runtime'
import { debugDirector } from '../../sim'

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

/** the band as the family tree sees it: links, and each person's generation relative to the player */
function buildLineage(sim: Sim): LineageEntry[] {
  const st = sim.state
  const byId = new Map(st.people.map((p) => [p.id, p]))
  const inBand = (id: string | null) => (id && byId.has(id) ? id : null)
  const gen = new Map<string, number>([[st.playerId, 0]])
  const queue = [st.playerId]
  while (queue.length > 0) {
    const id = queue.shift()
    const p = id ? byId.get(id) : undefined
    const g = id ? gen.get(id) : undefined
    if (!p || g === undefined) continue
    const links: [string | null, number][] = [
      [p.motherId, g - 1],
      [p.fatherId, g - 1],
      [p.partnerId, g],
      ...p.childIds.map((c): [string, number] => [c, g + 1]),
    ]
    for (const [lid, lg] of links) {
      const l = inBand(lid)
      if (l && !gen.has(l)) {
        gen.set(l, lg)
        queue.push(l)
      }
    }
  }
  const player = byId.get(st.playerId)
  const playerAge = player?.look.ageYears ?? 0
  return st.people.map((p) => ({
    id: p.id,
    name: p.name,
    relation: p.isPlayer ? 'You' : (sim.relationOf(p.id) ?? 'Of the band'),
    ageYears: Math.floor(p.look.ageYears),
    alive: p.alive,
    bond: p.bond,
    skills: [...p.skills],
    motherId: inBand(p.motherId),
    fatherId: inBand(p.fatherId),
    partnerId: inBand(p.partnerId),
    // outside the family, guess the generation from the age gap
    generation:
      gen.get(p.id) ?? Math.max(-2, Math.min(2, Math.round((p.look.ageYears - playerAge) / -25))),
    isPlayer: p.isPlayer,
  }))
}

export type QaHandles = {
  qaState(): unknown
  qaTeleport(poiId: string): void
  qaStage(stage: LifeStageId): void
  qaSkipBeat(): void
  /** what the player could do here now */
  qaInteractions(): unknown
  /** do an interaction (the nearest when no id) as if E were pressed or held */
  qaInteract(id?: string): string | null
  qaLog(n?: number): readonly string[]
  /** answer the open choice by option index */
  qaChoose(index: number): void
  /** finish the open minigame with a quality */
  qaMinigame(quality: number): void
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
    writeSave({
      v: 1,
      name: playerName,
      stage: g.sim.state.stage,
      seed: SEED,
      save: g.sim.serialize(),
    })
  }

  // every entry into a life comes from a click: the gesture that lets WebAudio start
  const wakeAudio = () => {
    void rt.audio.resume().catch(() => {})
  }
  const click = () => rt.audio.sfx('ui-click')
  const open = () => rt.audio.sfx('ui-open')

  const begin = (stage: LifeStageId, saved?: SaveData) => {
    pendingStage = null
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

  // if the sim doesn't move itself to the next stage within a moment of chapter-end, start that stage fresh
  let pendingStage: { next: LifeStageId; wait: number } | null = null
  rt.onChapterEnd = (next) => {
    save()
    pendingStage = next ? { next, wait: 2 } : null
  }

  const offFrame = host.onFrame((dt) => {
    if (pendingStage && rt.game) {
      if (rt.game.sim.state.stage === pendingStage.next) pendingStage = null
      else if (bridge.get().screen === 'playing' || bridge.get().screen === 'chapter-card') {
        pendingStage.wait -= dt
        if (pendingStage.wait <= 0) {
          const next = pendingStage.next
          pendingStage = null
          begin(next)
        }
      }
    }
    if (!rt.game || bridge.get().screen !== 'playing') return
    saveTimer += dt
    if (saveTimer >= SAVE_EVERY) {
      saveTimer = 0
      save()
    }
  })

  const pause = () => {
    if (bridge.get().screen !== 'playing' || !rt.game) return
    open()
    input.releaseLock()
    bridge.set({ screen: 'paused', prompt: null })
    host.setPaused(true)
  }
  const resume = () => {
    if (bridge.get().screen !== 'paused') return
    click()
    bridge.set({ screen: 'playing' })
    host.setPaused(false)
  }

  const uninstall = bridge.provide({
    newLife(name) {
      wakeAudio()
      click()
      playerName = name.trim() || 'Teni'
      bridge.set({ screen: 'intro', notesUnlocked: [], notesNew: [] })
    },
    introDone() {
      click()
      begin('held')
    },
    chooseChapter(stage) {
      click()
      begin(stage)
    },
    continueLife() {
      const file = readSave()
      if (!file) return
      click()
      playerName = file.name
      begin(file.stage, file.save)
    },
    chapterCardDone() {
      if (bridge.get().screen !== 'chapter-card') return
      click()
      bridge.set({ screen: 'playing', chapter: null })
    },
    pause,
    resume,
    openNotes() {
      const s = bridge.get().screen
      if (s !== 'notes' && s !== 'lineage') overlayReturn = s
      open()
      bridge.set({ screen: 'notes' })
    },
    openLineage() {
      const s = bridge.get().screen
      if (s !== 'notes' && s !== 'lineage') overlayReturn = s
      const g = rt.game
      if (g) bridge.set({ lineage: buildLineage(g.sim) })
      open()
      bridge.set({ screen: 'lineage' })
    },
    closeOverlay() {
      click()
      bridge.set({ screen: overlayReturn })
    },
    markNoteRead(id) {
      const s = bridge.get()
      if (s.notesNew.includes(id)) bridge.set({ notesNew: s.notesNew.filter((n) => n !== id) })
    },
    quitToTitle() {
      click()
      save()
      rt.endLife()
      host.setPaused(false)
      input.releaseLock()
      rt.audio.music('title')
      bridge.set({ screen: 'title', hasLife: readSave() !== null, summary: null, chapter: null })
    },
    choose(choiceId, optionId) {
      click()
      rt.game?.sim.command({ type: 'choose', choiceId, optionId })
      bridge.set({ choice: null })
    },
    minigameDone(game, quality) {
      rt.game?.sim.command({ type: 'minigame-result', game, quality })
      bridge.set({ minigame: null })
    },
    summaryContinue(asHeir) {
      click()
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
      if (patch.master !== undefined || patch.music !== undefined)
        rt.audio.setVolume(next.master, next.music)
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
  // any first gesture (even on the title) lets WebAudio start, so the title music plays
  window.addEventListener('pointerdown', wakeAudio, true)
  window.addEventListener('keydown', wakeAudio, true)
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
          clock: {
            day: st.clock.day,
            hour: Number(st.clock.hour.toFixed(2)),
            seaLevel: Number(st.clock.seaLevel.toFixed(2)),
          },
          player: {
            x: Number(p.position.x.toFixed(1)),
            z: Number(p.position.z.toFixed(1)),
            carriedBy: p.carriedBy,
            skills: p.skills,
            needs: p.needs,
          },
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
        const g = rt.game
        if (g) debugDirector(g.sim)?.completeBeat()
      },
      qaInteractions: () => {
        const g = rt.game
        if (!g) return []
        return g.sim
          .interactionsNear(g.player().position, 2.5)
          .map((i) => ({ id: i.id, label: i.label, enabled: i.enabled, reason: i.reason }))
      },
      qaInteract: (id) => {
        const g = rt.game
        if (!g) return null
        const all = g.sim.interactionsNear(g.player().position, 2.5)
        const i = id ? all.find((x) => x.id === id) : all.find((x) => x.enabled)
        if (!i) return null
        g.sim.command({ type: 'interact', interactionId: i.id })
        return i.id
      },
      qaLog: (n = 20) => rt.game?.log.slice(-n) ?? [],
      qaChoose: (index) => {
        const c = bridge.get().choice
        const o = c?.options[index]
        if (c && o) bridge.actions.choose(c.id, o.id)
      },
      qaMinigame: (quality) => {
        const m = bridge.get().minigame
        if (m) bridge.actions.minigameDone(m, quality)
      },
    }
  }

  return () => {
    save()
    if (loadTimer) clearTimeout(loadTimer)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('pointerdown', wakeAudio, true)
    window.removeEventListener('keydown', wakeAudio, true)
    window.removeEventListener('pagehide', onHide)
    offLock()
    offFrame()
    uninstall()
    rt.dispose()
    bridge.reset()
    if (window.__game?.runtime === rt) delete window.__game
  }
}
