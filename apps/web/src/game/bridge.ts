/**
 * The game ⇄ UI bridge. The play session writes state with `bridge.set`; the React UI reads it with
 * `useBridge(selector)` and calls `bridge.actions.*`, which the play session provides with `bridge.provide`.
 * Owned by the lead. SSR-safe: no DOM access at import time.
 */
import { useSyncExternalStore } from 'react'
import type {
  Caption,
  ClockState,
  Inventory,
  LifeStageId,
  LifeSummary,
  MinigameId,
  Needs,
  Objective,
  Quality,
  SkillId,
} from './contracts'

export type Screen =
  | 'title' // painted title: Begin a life, Chapters, Field Notes
  | 'intro' // the four painted intro cards
  | 'loading' // building the world
  | 'playing'
  | 'chapter-card' // a stage title card between chapters
  | 'paused' // pause menu over the frozen game
  | 'notes' // Field Notes codex
  | 'lineage' // family and bonds
  | 'summary' // end-of-life summary

export type PromptState = {
  label: string
  key: 'E' | 'LMB' | 'RMB' | 'Space'
  holdSeconds: number
  /** 0..1 while holding */
  holdProgress: number
  enabled: boolean
  reason: string | null
}

export type Toast = {
  id: string
  kind: 'learned' | 'note' | 'face' | 'bond' | 'item' | 'event'
  title: string
  body: string | null
  noteId: string | null
}

/** a person label projected to screen pixels by the play session (throttled to ~15 Hz) */
export type NameTag = {
  id: string
  name: string
  relation: string | null
  x: number
  y: number
  /** 0..1 */
  bond: number
  /** 0..1, fades with distance */
  opacity: number
  speaking: string | null
}

export type HudState = {
  visible: boolean
  name: string
  ageYears: number
  stage: LifeStageId
  needs: Needs | null
  clock: ClockState | null
  inventory: Inventory | null
  watching: { name: string; skill: SkillId; progress: number } | null
  /** radians in screen space (0 = up), 0..1 strength; null hides the wind mark */
  wind: { dir: number; strength: number } | null
  /** spear aim mode: show the reticle */
  aiming: boolean
}

/** the objective's target projected by the play session (~15 Hz); ui draws a mark on it, or an edge arrow when off screen */
export type ObjectiveMark = {
  /** css pixels; clamped to the screen edge when off screen */
  x: number
  y: number
  onScreen: boolean
  /** radians in screen space toward the target (0 = up), for the edge arrow */
  angle: number
  /** metres from the player */
  distance: number
}

export type ChoiceState = {
  id: string
  prompt: string
  options: { id: string; label: string; detail: string | null; personId: string | null }[]
}

export type LineageEntry = {
  id: string
  name: string
  relation: string
  ageYears: number
  alive: boolean
  bond: number
  skills: SkillId[]
  /** links within the band (null when unknown or outside the band); the family tree draws from these */
  motherId: string | null
  fatherId: string | null
  partnerId: string | null
  /** relative to the player: 0 the player's generation, −1 parents, −2 grandparents, +1 children */
  generation: number
  isPlayer: boolean
}

export type Settings = {
  master: number
  music: number
  quality: Quality
  largeCaptions: boolean
  invertY: boolean
  sensitivity: number
}

export type ChapterCard = { stage: LifeStageId; title: string; subtitle: string; ageYears: number }

export type BridgeState = {
  screen: Screen
  /** true once a life exists (title shows Continue) */
  hasLife: boolean
  /** the saved life the title's Continue card shows; play writes it on mount and after every save */
  saved: { name: string; stage: LifeStageId; ageYears: number } | null
  loadingProgress: number
  chapter: ChapterCard | null
  hud: HudState
  /** captions currently on screen, oldest first (the session expires them) */
  captions: Caption[]
  objective: Objective | null
  /** null when the objective has no target, the target is within 6 m, or during held/cinematic beats */
  objectiveMark: ObjectiveMark | null
  prompt: PromptState | null
  toasts: Toast[]
  nameTags: NameTag[]
  choice: ChoiceState | null
  minigame: MinigameId | null
  notesUnlocked: string[]
  /** unlocked but not yet opened in the codex */
  notesNew: string[]
  lineage: LineageEntry[]
  summary: LifeSummary | null
  settings: Settings
}

export type BridgeActions = {
  newLife(playerName: string): void
  continueLife(): void
  chooseChapter(stage: LifeStageId): void
  introDone(): void
  chapterCardDone(): void
  pause(): void
  resume(): void
  openNotes(): void
  openLineage(): void
  /** close notes / lineage back to wherever they were opened from */
  closeOverlay(): void
  markNoteRead(noteId: string): void
  quitToTitle(): void
  choose(choiceId: string, optionId: string): void
  minigameDone(game: MinigameId, quality: number): void
  summaryContinue(asHeir: boolean): void
  setSettings(patch: Partial<Settings>): void
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.6,
  quality: 'high',
  largeCaptions: false,
  invertY: false,
  sensitivity: 1,
}

export const INITIAL_BRIDGE_STATE: BridgeState = {
  screen: 'title',
  hasLife: false,
  saved: null,
  loadingProgress: 0,
  chapter: null,
  hud: {
    visible: false,
    name: 'Teni',
    ageYears: 0,
    stage: 'held',
    needs: null,
    clock: null,
    inventory: null,
    watching: null,
    wind: null,
    aiming: false,
  },
  captions: [],
  objective: null,
  objectiveMark: null,
  prompt: null,
  toasts: [],
  nameTags: [],
  choice: null,
  minigame: null,
  notesUnlocked: [],
  notesNew: [],
  lineage: [],
  summary: null,
  settings: DEFAULT_SETTINGS,
}

function noop(): void {}

const NOOP_ACTIONS: BridgeActions = {
  newLife: noop,
  continueLife: noop,
  chooseChapter: noop,
  introDone: noop,
  chapterCardDone: noop,
  pause: noop,
  resume: noop,
  openNotes: noop,
  openLineage: noop,
  closeOverlay: noop,
  markNoteRead: noop,
  quitToTitle: noop,
  choose: noop,
  minigameDone: noop,
  summaryContinue: noop,
  setSettings: noop,
}

type Listener = () => void

export type Bridge = {
  get(): BridgeState
  /** shallow-merge a patch into the state and notify (skips if nothing changed by identity) */
  set(patch: Partial<BridgeState>): void
  /** shallow-merge into hud */
  setHud(patch: Partial<HudState>): void
  subscribe(listener: Listener): () => void
  /** the live action set; the UI always calls through this */
  readonly actions: BridgeActions
  /** the play session (or a lab mock) installs its handlers; returns an uninstall */
  provide(actions: Partial<BridgeActions>): () => void
  /** back to INITIAL_BRIDGE_STATE (keeps settings) */
  reset(): void
}

export function createBridge(initial: BridgeState = INITIAL_BRIDGE_STATE): Bridge {
  let state = initial
  const listeners = new Set<Listener>()
  let handlers: BridgeActions = NOOP_ACTIONS

  const notify = () => {
    for (const l of listeners) l()
  }

  // A stable object whose methods always forward to the current handlers.
  const actions: BridgeActions = {
    newLife: (n) => handlers.newLife(n),
    continueLife: () => handlers.continueLife(),
    chooseChapter: (s) => handlers.chooseChapter(s),
    introDone: () => handlers.introDone(),
    chapterCardDone: () => handlers.chapterCardDone(),
    pause: () => handlers.pause(),
    resume: () => handlers.resume(),
    openNotes: () => handlers.openNotes(),
    openLineage: () => handlers.openLineage(),
    closeOverlay: () => handlers.closeOverlay(),
    markNoteRead: (id) => handlers.markNoteRead(id),
    quitToTitle: () => handlers.quitToTitle(),
    choose: (c, o) => handlers.choose(c, o),
    minigameDone: (g, q) => handlers.minigameDone(g, q),
    summaryContinue: (h) => handlers.summaryContinue(h),
    setSettings: (p) => handlers.setSettings(p),
  }

  return {
    get: () => state,
    set(patch) {
      let changed = false
      for (const key of Object.keys(patch) as (keyof BridgeState)[]) {
        if (patch[key] !== state[key]) {
          changed = true
          break
        }
      }
      if (!changed) return
      state = { ...state, ...patch }
      notify()
    },
    setHud(patch) {
      let changed = false
      for (const key of Object.keys(patch) as (keyof HudState)[]) {
        if (patch[key] !== state.hud[key]) {
          changed = true
          break
        }
      }
      if (!changed) return
      state = { ...state, hud: { ...state.hud, ...patch } }
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    actions,
    provide(partial) {
      const previous = handlers
      handlers = { ...NOOP_ACTIONS, ...partial }
      return () => {
        handlers = previous
      }
    },
    reset() {
      state = { ...INITIAL_BRIDGE_STATE, settings: state.settings }
      notify()
    },
  }
}

/** the page-wide bridge */
export const bridge = createBridge()

/** subscribe a component to a slice; keep selectors returning stable references (state fields, not new objects) */
export function useBridge<T>(selector: (s: BridgeState) => T, source: Bridge = bridge): T {
  return useSyncExternalStore(
    source.subscribe,
    () => selector(source.get()),
    () => selector(source.get()),
  )
}
