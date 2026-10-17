/**
 * Turns SimEvents into what the player sees and hears: captions and toasts with expiry, the objective, notes,
 * chapter cards, choices and minigames on the bridge, plus camera cues handed back to the game.
 */
import type { Bridge, Toast } from '../bridge'
import { SKILL_LABELS } from '~/content/skills'
import type { CameraCue, Caption, SimEvent, SimState, SkillId } from '../contracts'

export function skillName(s: SkillId): string {
  return SKILL_LABELS[s]
}

/** a readable fallback until content/field-notes lands: "heat-treatment" → "Heat treatment" */
function fallbackTitle(id: string): string {
  const s = id.replace(/-/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export type FeedHooks = {
  camera(cue: CameraCue): void
  sfx(e: Extract<SimEvent, { type: 'sfx' }>): void
  /** a chapter card is up, a choice or minigame opened: the game should release the mouse */
  modal(): void
  chapterEnd(e: Extract<SimEvent, { type: 'chapter-end' }>): void
  noteTitle(id: string): string | null
}

export type Feed = {
  event(e: SimEvent, state: SimState, relationOf: (id: string) => string | null): void
  toast(t: Omit<Toast, 'id'>): void
  caption(c: Caption): void
  /** expire captions and toasts; now is real seconds */
  frame(now: number): void
  reset(): void
}

const TOAST_SECONDS = 4.5
const MAX_TOASTS = 4

export function createFeed(bridge: Bridge, hooks: FeedHooks): Feed {
  let now = 0
  let serial = 0
  const captionExpiry = new Map<string, number>()
  const toastExpiry = new Map<string, number>()

  const feed: Feed = {
    caption(c) {
      const id = `${c.id}#${serial++}`
      captionExpiry.set(id, now + Math.max(1.5, c.seconds))
      // one caption per speaker at a time; narration replaces narration
      const keep = bridge.get().captions.filter((x) => !(x.speaker === c.speaker && x.kind === c.kind)).slice(-2)
      bridge.set({ captions: [...keep, { ...c, id }] })
    },
    toast(t) {
      const id = `t${serial++}`
      toastExpiry.set(id, now + TOAST_SECONDS)
      bridge.set({ toasts: [...bridge.get().toasts, { ...t, id }].slice(-MAX_TOASTS) })
    },
    event(e, state, relationOf) {
      const nameOf = (id: string) => state.people.find((p) => p.id === id)?.name ?? id
      switch (e.type) {
        case 'caption':
          feed.caption(e.caption)
          break
        case 'objective':
          bridge.set({ objective: e.objective })
          break
        case 'learned':
          if (e.personId === state.playerId) {
            feed.toast({ kind: 'learned', title: `You learned ${skillName(e.skill)}`, body: e.fromId ? `From watching ${nameOf(e.fromId)}` : null, noteId: null })
          } else if (e.fromId === state.playerId) {
            feed.toast({ kind: 'learned', title: `${nameOf(e.personId)} learned ${skillName(e.skill)}`, body: 'From watching you', noteId: null })
          }
          break
        case 'face-learned': {
          const rel = relationOf(e.personId)
          const name = nameOf(e.personId)
          feed.toast({ kind: 'face', title: rel ? `${rel} · ${name}` : name, body: null, noteId: null })
          break
        }
        case 'note': {
          const s = bridge.get()
          if (s.notesUnlocked.includes(e.noteId)) break
          bridge.set({ notesUnlocked: [...s.notesUnlocked, e.noteId], notesNew: [...s.notesNew, e.noteId] })
          feed.toast({ kind: 'note', title: 'New Field Note', body: hooks.noteTitle(e.noteId) ?? fallbackTitle(e.noteId), noteId: e.noteId })
          break
        }
        case 'chapter-start':
          bridge.set({
            chapter: { stage: e.stage, title: e.title, subtitle: e.subtitle, ageYears: e.ageYears },
            screen: 'chapter-card',
          })
          hooks.modal()
          break
        case 'chapter-end':
          hooks.chapterEnd(e)
          break
        case 'minigame':
          bridge.set({ minigame: e.game })
          hooks.modal()
          break
        case 'choice':
          bridge.set({ choice: { id: e.choice.id, prompt: e.choice.prompt, options: e.choice.options.map((o) => ({ ...o })) } })
          hooks.modal()
          break
        case 'camera':
          hooks.camera(e.cue)
          break
        case 'death': {
          if (e.personId === state.playerId) break
          const rel = relationOf(e.personId)
          feed.toast({ kind: 'event', title: `${rel ?? nameOf(e.personId)} has died`, body: null, noteId: null })
          break
        }
        case 'life-summary':
          bridge.set({ summary: e.summary, screen: 'summary' })
          hooks.modal()
          break
        case 'sfx':
          hooks.sfx(e)
          break
        case 'bond':
        case 'item':
        case 'teleport':
          break
      }
    },
    frame(t) {
      now = t
      const s = bridge.get()
      if (s.captions.some((c) => (captionExpiry.get(c.id) ?? 0) <= now)) {
        bridge.set({ captions: s.captions.filter((c) => (captionExpiry.get(c.id) ?? 0) > now) })
      }
      if (s.toasts.some((x) => (toastExpiry.get(x.id) ?? 0) <= now)) {
        bridge.set({ toasts: s.toasts.filter((x) => (toastExpiry.get(x.id) ?? 0) > now) })
      }
    },
    reset() {
      captionExpiry.clear()
      toastExpiry.clear()
      bridge.set({ captions: [], toasts: [], objective: null, prompt: null, nameTags: [], choice: null, minigame: null })
    },
  }
  return feed
}
