/**
 * The director's machinery: chapters are lists of beats, beats are lists of steps (do something, wait, wait
 * until, a minigame, a choice). The runner walks them one step at a time on the player's clock, keeps the
 * objective line current, and hands the life from one chapter to the next in place.
 */
import { DEFAULT_TIME_SCALE } from '../../core/clock'
import type {
  CameraCue,
  Caption,
  Choice,
  FieldNoteId,
  Interaction,
  LifeStageId,
  MinigameId,
  Objective,
  Poi,
  SimEvent,
  SimPerson,
  SkillId,
  Vec2,
  Verb,
} from '../../game/contracts'
import { setOrder } from '../ai'
import { findWalkable, headingTo } from '../animals'
import type { Order, SimCtx } from '../ctx'
import { learn } from '../life'
import type { DirectorSave } from '../save'
import { sunTimes } from '../time'
import type { LifeRecord } from './history'

/** the parts of the sim the director drives directly */
export type DirectorHost = {
  ctx: SimCtx
  /** run the world forward this many game seconds at once (a time skip) */
  advance(gameSeconds: number): void
  playerName: string
}

/** an interaction the director adds, with what it does */
export type Extra = { i: Interaction; act: (d: D) => void }

export type Step =
  | { k: 'do'; fn: (d: D) => void }
  | { k: 'wait'; s: number }
  | { k: 'until'; test: (d: D) => boolean; tick?: (d: D) => void; max?: number }
  | { k: 'minigame'; game: MinigameId; then: (d: D, quality: number) => void }
  | { k: 'choice'; make: (d: D) => Choice; then: (d: D, optionId: string) => void }
  /** skip the next n steps unless test passes */
  | { k: 'unless'; test: (d: D) => boolean; n: number }

export type Beat = {
  id: string
  steps: Step[]
  /** game seconds per real second while this beat runs */
  scale?: number
  extras?: (d: D) => Extra[]
  allows?: (d: D, i: Interaction) => boolean
  talk?: (d: D, personId: string) => string | null
}

export type Chapter = {
  stage: LifeStageId
  title: string
  subtitle: string
  next: LifeStageId | null
  beats: Beat[]
}

/** the cast's parts in a life: who is Mother, Father, Grandmother… (the fixed cast, or an heir's family) */
export type Role = 'mother' | 'father' | 'grandmother' | 'sister' | 'widow' | 'partner' | 'child'

/** the director's live context, handed to every step */
export type D = {
  ctx: SimCtx
  host: DirectorHost
  st: DirectorSave
  /** real seconds since the current step began */
  stepT: number
  /** a minigame result or a choice, waiting for its step */
  answer: { game: MinigameId; quality: number } | { choiceId: string; optionId: string } | null
  forced: boolean
  objective: { id: string; text: (d: D) => string; total: number | null; done: ((d: D) => number) | null } | null
  objectiveKey: string
  captionN: number
  beatId: string
  life: LifeRecord
  /** the animal the player's spear last hit */
  lastHit: string | null
}

// ─── lookups ────────────────────────────────────────────────────────────────────────────────────────────────

export function player(d: D): SimPerson {
  const p = d.ctx.state.people.find((q) => q.id === d.ctx.state.playerId)
  if (!p) throw new Error('the director has no player')
  return p
}

export function person(d: D, who: Role | string): SimPerson | undefined {
  const id = d.st.cast[who] ?? who
  return d.ctx.state.people.find((q) => q.id === id && q.alive)
}

export function nameOf(d: D, who: Role | string, fallback = ''): string {
  return person(d, who)?.name ?? fallback
}

export function poi(d: D, id: string): Poi {
  return d.ctx.world.poi(id)
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function counter(d: D, key: string): number {
  return d.st.counters[key] ?? 0
}

export function bump(d: D, key: string, by = 1): void {
  d.st.counters[key] = counter(d, key) + by
}

export function emit(d: D, e: SimEvent): void {
  d.ctx.events.push(e)
}

/** a walkable spot near p (at the current tide) */
export function spot(d: D, p: Vec2, radius = 12): Vec2 {
  return findWalkable(d.ctx, p, radius)
}

/** a point `r` metres from c toward `toward` (or at an angle), on walkable ground */
export function around(d: D, c: Vec2, r: number, angle: number): Vec2 {
  return spot(d, { x: c.x + Math.sin(angle) * r, z: c.z + Math.cos(angle) * r }, 8)
}

/** the last dry point on the way from `from` to `to` at the current sea level */
export function dryToward(d: D, from: Vec2, to: Vec2, keep = 1.5): Vec2 {
  const n = Math.max(2, Math.ceil(dist(from, to) / 1.5))
  let last = { x: from.x, z: from.z }
  const sea = d.ctx.state.clock.seaLevel
  for (let i = 1; i <= n; i++) {
    const k = i / n
    const q = { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k }
    if (!d.ctx.paths.passableAt(q.x, q.z, sea) || d.ctx.world.heightAt(q.x, q.z) < sea + 0.25) break
    last = q
  }
  const back = dist(from, last)
  if (back <= keep) return last
  const k = (back - keep) / back
  return { x: from.x + (last.x - from.x) * k, z: from.z + (last.z - from.z) * k }
}

export function hourNow(d: D): number {
  return d.ctx.state.clock.hour
}

export function sun(d: D): { rise: number; set: number } {
  return sunTimes(d.ctx, d.ctx.state.clock.dayOfYear)
}

// ─── doing ──────────────────────────────────────────────────────────────────────────────────────────────────

export function order(d: D, who: Role | string, o: (Partial<Order> & { kind: Order['kind'] }) | null): void {
  const p = person(d, who)
  if (p) setOrder(d.ctx, p.id, o)
}

/** set someone down somewhere (behind a fade, or before the scene opens) */
export function place(d: D, who: Role | string, at: Vec2, heading?: number): void {
  const p = person(d, who)
  if (!p) return
  const q = spot(d, at, 10)
  p.position = { x: q.x, z: q.z }
  if (heading !== undefined) p.heading = heading
  p.speed = 0
  const ag = d.ctx.agents.get(p.id)
  if (ag) {
    if (ag.pathReq) d.ctx.paths.cancel(ag.pathReq)
    ag.pathReq = null
    ag.path = []
    if (ag.order) ag.order.arrived = false
  }
}

/** move the player (or whoever carries them) and tell play to snap there */
export function teleport(d: D, at: Vec2, heading: number): void {
  const pl = player(d)
  const carrier = pl.carriedBy ? d.ctx.state.people.find((q) => q.id === pl.carriedBy) : undefined
  const q = spot(d, at, 10)
  const who = carrier ?? pl
  who.position = { x: q.x, z: q.z }
  who.heading = heading
  who.speed = 0
  if (carrier) {
    pl.position = { x: q.x, z: q.z }
    pl.heading = heading
  }
  emit(d, { type: 'teleport', position: { x: q.x, z: q.z }, heading })
}

export function face(from: Vec2, to: Vec2): number {
  return headingTo(from, to)
}

export function caption(d: D, text: string, who: Role | string | null, kind?: Caption['kind'], seconds?: number): void {
  const p = who ? person(d, who) : undefined
  const secs = seconds ?? Math.max(3, Math.min(9, text.split(/\s+/).length * 0.42 + 1.2))
  const k: Caption['kind'] = kind ?? (p ? 'speech' : 'narration')
  emit(d, { type: 'caption', caption: { id: `${d.beatId}:${d.captionN++}`, text, speaker: p ? p.name : null, kind: k, seconds: secs } })
  if (p) p.speech = { text, until: d.ctx.state.clock.t + secs * d.ctx.state.timeScale }
}

export function unlockNote(d: D, id: FieldNoteId): void {
  const notes = d.ctx.state.notes
  if (notes.includes(id)) return
  notes.push(id)
  emit(d, { type: 'note', noteId: id })
}

export function learnSkill(d: D, who: SimPerson, skill: SkillId, fromId: string | null): void {
  learn(d.ctx, who, skill, fromId)
}

/** jump the clock to the next `hour` (at least `minAhead` hours from now), the world living through it */
export function skipTo(d: D, hour: number, minAhead = 0): void {
  const now = hourNow(d)
  let ahead = (((hour - now) % 24) + 24) % 24
  // just past the hour already: no need to go round the clock
  if (minAhead === 0 && ahead > 23.5) return
  while (ahead < minAhead) ahead += 24
  if (ahead <= 0) return
  const crossesNight = ahead > 6 || (now < 24 && now + ahead > 24) || (now < 5 && now + ahead > 5)
  d.host.advance(ahead * 3600)
  const pl = player(d)
  // the player lived through those hours with the band: they ate, and slept if it was night
  pl.needs.fed = Math.max(pl.needs.fed, 0.7)
  pl.needs.warmth = Math.max(pl.needs.warmth, 0.65)
  if (crossesNight) pl.needs.energy = Math.max(pl.needs.energy, 0.9)
}

/** an interaction offered by the director */
export function extra(
  id: string,
  verb: Verb,
  label: string,
  at: Vec2,
  act: (d: D) => void,
  opts: { targetKind?: Interaction['targetKind']; targetId?: string; hold?: number; reason?: string | null } = {},
): Extra {
  const reason = opts.reason ?? null
  return {
    i: {
      id: `dir:${id}`,
      verb,
      label,
      targetKind: opts.targetKind ?? 'poi',
      targetId: opts.targetId ?? id,
      position: { x: at.x, z: at.z },
      holdSeconds: opts.hold ?? 0,
      enabled: reason === null,
      reason,
    },
    act,
  }
}

// ─── step builders ──────────────────────────────────────────────────────────────────────────────────────────

type Text = string | ((d: D) => string)

const textOf = (d: D, t: Text): string => (typeof t === 'string' ? t : t(d))

export const run = (fn: (d: D) => void): Step => ({ k: 'do', fn })
export const wait = (s: number): Step => ({ k: 'wait', s })
export const until = (test: (d: D) => boolean, opts: { tick?: (d: D) => void; max?: number } = {}): Step => ({ k: 'until', test, ...opts })
export const say = (text: Text, who: Role | string | null = null, seconds?: number): Step =>
  run((d) => caption(d, textOf(d, text), who, undefined, seconds))
export const song = (text: Text, seconds?: number): Step => run((d) => caption(d, textOf(d, text), null, 'song', seconds))
export const note = (id: FieldNoteId): Step => run((d) => unlockNote(d, id))
export const cam = (cue: CameraCue): Step => run((d) => emit(d, { type: 'camera', cue }))
export const fadeOut = (s = 1.4): Step[] => [cam({ kind: 'fade', to: 'black', seconds: s }), wait(s + 0.15)]
export const fadeIn = (s = 1.6): Step[] => [cam({ kind: 'fade', to: 'clear', seconds: s })]
export const minigame = (game: MinigameId, then: (d: D, quality: number) => void): Step => ({ k: 'minigame', game, then })
export const choice = (make: (d: D) => Choice, then: (d: D, optionId: string) => void): Step => ({ k: 'choice', make, then })
export const when = (test: (d: D) => boolean, ...steps: Step[]): Step[] => [{ k: 'unless', test, n: steps.length }, ...steps]

/** set the objective line; with a total, `done` counts toward it and "(n/total)" in the text follows */
export const obj = (text: Text, total: number | null = null, done: ((d: D) => number) | null = null): Step =>
  run((d) => {
    d.objective = { id: `${d.beatId}:${d.captionN++}`, text: (dd) => textOf(dd, text), total, done }
  })
export const clearObj = (): Step =>
  run((d) => {
    d.objective = null
  })

/** the objective as play sees it */
export function objectiveNow(d: D): Objective | null {
  const o = d.objective
  if (!o) return null
  const done = o.done ? Math.min(o.total ?? Infinity, Math.max(0, Math.floor(o.done(d)))) : null
  let text = o.text(d)
  if (o.total !== null && done !== null) text = text.replace(/\(\d+\/\d+\)\s*$/, `(${done}/${o.total})`)
  return { id: o.id, text, done, total: o.total }
}

export function restoreScale(d: D): void {
  d.ctx.state.timeScale = DEFAULT_TIME_SCALE
}
