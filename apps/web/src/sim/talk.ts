/**
 * The band talks: "Talk" on anyone picks the best-fitting line from `lines.ts` that this person hasn't said today,
 * and now and then two people near the player say something to each other. Lines are chosen without the sim's
 * rng (a hash of seed, day, speaker and line), so talking never changes how the day goes.
 */
import { hashString, mix32 } from '../core/rng'
import type { SimPerson } from '../game/contracts'
import { roleOf } from './ai'
import type { SimCtx } from './ctx'
import { addBond } from './life'
import { TALK_CAST, TALK_LINES, type TalkCast, type TalkLine, type TalkRecent, type TalkRole, type TalkWeather, type TalkWhen } from './lines'
import { sunTimes } from './time'

export type TalkState = {
  /** line id → the stage and day it was last said ("small:0") */
  used: Record<string, string>
  /** game time each recent thing happened */
  recent: Partial<Record<TalkRecent, number>>
  /** person id → game time the player last talked to them (bond grows once an hour) */
  talkedAt: Record<string, number>
  /** real seconds this sim has run (chatter and caption timing) */
  realT: number
  /** no chatter until this real time (a director caption or a talk is showing) */
  quietUntil: number
  /** real time of the last chatter line */
  chatterAt: number
  /** hearth meat at the last look, to notice a hunt coming home */
  lastMeat: number
}

export function emptyTalk(): TalkState {
  return { used: {}, recent: {}, talkedAt: {}, realT: 0, quietUntil: 0, chatterAt: -1e9, lastMeat: 0 }
}

/** game seconds a recent thing stays worth talking about */
const RECENT_FOR: Record<TalkRecent, number> = {
  whale: 36 * 3600,
  storm: 18 * 3600,
  'oro-died': 48 * 3600,
  loss: 48 * 3600,
  note: 6 * 3600,
  hunt: 24 * 3600,
}
/** real seconds between chatter lines, at least */
export const CHATTER_EVERY = 40
const CHATTER_RADIUS = 6
const HEARTH_TASKS = new Set(['socialize', 'eat', 'sing', 'tell-story', 'tend-fire'])

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function castOf(p: SimPerson): TalkCast | null {
  return TALK_CAST.find((c) => c === p.id) ?? null
}

function roleKey(p: SimPerson): TalkRole | null {
  const r = roleOf(p)
  if (r === 'infant') return null
  if (r === 'toddler' || r === 'child') return p.look.ageYears >= 3 ? 'child' : null
  if (r === 'teen') return 'teen'
  if (r === 'elder') return 'elder'
  return p.look.sex === 'female' ? 'woman' : 'man'
}

function whenNow(ctx: SimCtx): TalkWhen {
  const h = ctx.state.clock.hour
  const { rise, set } = sunTimes(ctx, ctx.state.clock.dayOfYear)
  if (h < rise - 0.5 || h >= set + 3.5) return 'night'
  if (h < 11) return 'morning'
  if (h < set - 1.5) return 'day'
  return 'evening'
}

function weatherNow(ctx: SimCtx): TalkWeather[] {
  const w = ctx.state.weather
  const out: TalkWeather[] = []
  if (w.storm) out.push('storm')
  if (w.rain > 0.3) out.push('rain')
  if (w.wind > 0.6) out.push('wind')
  if (w.fog > 0.3) out.push('fog')
  if (out.length === 0 && w.cloud < 0.4) out.push('clear')
  return out
}

function dayKey(ctx: SimCtx): string {
  return `${ctx.stage}:${ctx.state.clock.day}`
}

function recentNow(ctx: SimCtx, r: TalkRecent): boolean {
  const at = ctx.talk.recent[r]
  return at !== undefined && ctx.state.clock.t - at <= RECENT_FOR[r]
}

/** how well a line fits this speaker now; null when it doesn't fit at all */
function fit(ctx: SimCtx, l: TalkLine, p: SimPerson, to: 'you' | 'band'): number | null {
  const cast = castOf(p)
  let score = 0
  if (l.who === cast) score += 6
  else if (l.who === roleKey(p)) score += cast ? -3 : 0
  else return null
  if (l.to && l.to !== to) return null
  if (l.stage) {
    if (!l.stage.includes(ctx.stage)) return null
    score += 1
  }
  if (l.when) {
    if (!l.when.includes(whenNow(ctx))) return null
    score += 1
  }
  if (l.task) {
    if (!l.task.includes(p.task.kind)) return null
    score += 2
  }
  if (l.weather) {
    const w = weatherNow(ctx)
    if (!l.weather.some((x) => w.includes(x))) return null
    score += 2
  }
  if (l.tide) {
    const sea = ctx.state.clock.seaLevel
    if (l.tide === 'low' ? sea > -0.5 : sea < 0.6) return null
    score += 1
  }
  if (l.after) {
    if (!recentNow(ctx, l.after)) return null
    score += 4
  }
  return score
}

/** the best line for this person to say now that they haven't said today; null when there is none */
export function pickLine(ctx: SimCtx, p: SimPerson, to: 'you' | 'band'): TalkLine | null {
  const today = dayKey(ctx)
  let best: TalkLine | null = null
  let bestScore = -Infinity
  for (const l of TALK_LINES) {
    if (ctx.talk.used[l.id] === today) continue
    const f = fit(ctx, l, p, to)
    if (f === null) continue
    // ties (and near ties) break by a hash of the seed and the day: the same seed says the same things
    const jitter = (mix32(ctx.state.seed, hashString(`${today}|${p.id}|${l.id}`)) >>> 0) / 4294967296
    const score = f + jitter * 1.5
    if (score > bestScore) {
      bestScore = score
      best = l
    }
  }
  return best
}

function fill(ctx: SimCtx, text: string): string {
  const pl = ctx.state.people.find((q) => q.id === ctx.state.playerId)
  return text.replace(/\{name\}/g, pl?.name ?? '')
}

function captionSeconds(text: string): number {
  return Math.max(3, Math.min(7, text.split(/\s+/).length * 0.42 + 1.2))
}

/** a line said aloud: a caption with the speaker's name and a bubble over their head */
function say(ctx: SimCtx, p: SimPerson, text: string, id: string): void {
  const s = ctx.state
  const seconds = captionSeconds(text)
  p.speech = { text, until: s.clock.t + seconds * s.timeScale }
  ctx.events.push({ type: 'caption', caption: { id, text, speaker: p.name, kind: 'speech', seconds } })
  ctx.talk.quietUntil = Math.max(ctx.talk.quietUntil, ctx.talk.realT + seconds + 1)
}

/** the player talks to someone: the director's line for this beat if it has one, else the best unused line */
export function talkTo(ctx: SimCtx, q: SimPerson): string {
  const s = ctx.state
  const scripted = ctx.director?.talk(q.id) ?? null
  let text = scripted
  if (text === null) {
    const l = pickLine(ctx, q, 'you')
    if (l) ctx.talk.used[l.id] = dayKey(ctx)
    text = l ? fill(ctx, l.text) : 'Mm.'
  }
  say(ctx, q, text, `talk-${q.id}-${Math.floor(s.clock.t)}`)
  const last = ctx.talk.talkedAt[q.id]
  if (last === undefined || s.clock.t - last > 3600) {
    ctx.talk.talkedAt[q.id] = s.clock.t
    addBond(ctx, q, 0.03)
  }
  return text
}

/** a director caption is on screen for this long: chatter waits */
export function quiet(ctx: SimCtx, seconds: number): void {
  ctx.talk.quietUntil = Math.max(ctx.talk.quietUntil, ctx.talk.realT + seconds + 1)
}

/** after each step: notice what the band will talk about (whale, storm, a death, a note, meat coming home) */
export function noticeRecent(ctx: SimCtx): void {
  const s = ctx.state
  const t = s.clock.t
  const r = ctx.talk.recent
  for (const e of ctx.events) {
    if (e.type === 'note') r.note = t
    if (e.type === 'death') {
      r.loss = t
      if (e.personId === 'oro') r['oro-died'] = t
    }
  }
  if (s.weather.storm) r.storm = t
  if (s.animals.some((a) => a.kind === 'whale')) r.whale = t
  if (s.hearth.meat > ctx.talk.lastMeat + 40) r.hunt = t
  ctx.talk.lastMeat = s.hearth.meat
}

function canChat(ctx: SimCtx, p: SimPerson): boolean {
  const quietNow = !p.speech || p.speech.until <= ctx.state.clock.t
  return p.alive && p.id !== ctx.state.playerId && !p.carriedBy && p.task.kind !== 'sleep' && quietNow && roleKey(p) !== null
}

/** two people near the player at the same work (or both at the hearth): one says something to the other */
export function updateChatter(ctx: SimCtx, realDt: number): void {
  const tk = ctx.talk
  tk.realT += realDt
  if (realDt <= 0 || ctx.fastForward || ctx.sleepSkip) return
  if (tk.realT < tk.quietUntil || tk.realT - tk.chatterAt < CHATTER_EVERY) return
  const s = ctx.state
  const pl = s.people.find((q) => q.id === s.playerId)
  if (!pl) return
  const near = s.people
    .filter((q) => canChat(ctx, q) && dist(q.position, pl.position) <= CHATTER_RADIUS)
    .sort((a, b) => dist(a.position, pl.position) - dist(b.position, pl.position))
  const together = (a: SimPerson, b: SimPerson) =>
    a.task.kind === b.task.kind || (HEARTH_TASKS.has(a.task.kind) && HEARTH_TASKS.has(b.task.kind))
  for (let i = 0; i < near.length; i++) {
    const a = near[i]
    if (!a) continue
    for (let j = i + 1; j < near.length; j++) {
      const b = near[j]
      if (!b || !together(a, b)) continue
      const la = pickLine(ctx, a, 'band')
      const lb = pickLine(ctx, b, 'band')
      const fa = la ? (fit(ctx, la, a, 'band') ?? -Infinity) : -Infinity
      const fb = lb ? (fit(ctx, lb, b, 'band') ?? -Infinity) : -Infinity
      const pick = la && fa >= fb ? { p: a, l: la } : lb ? { p: b, l: lb } : null
      if (!pick) continue
      tk.used[pick.l.id] = dayKey(ctx)
      tk.chatterAt = tk.realT
      say(ctx, pick.p, fill(ctx, pick.l.text), `chat-${pick.p.id}-${Math.floor(s.clock.t)}`)
      return
    }
  }
}
