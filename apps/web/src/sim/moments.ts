/**
 * Days worth living: small unscripted moments in the free days (a honeyguide, lion eyes at the firelight, a visitor
 * from the lagoon, a seal pup, a rain dash, a full-moon dance, a child's first steps). Each is data: who it needs,
 * when it may happen, and a few steps of captions and orders. At most one every game hour, never while a director
 * beat runs, and chosen by a hash of the seed and the hour, so the same seed lives the same days.
 */
import { hashString, mix32, Rng } from '../core/rng'
import type { LifeStageId, SimPerson, Vec2 } from '../game/contracts'
import { bedPos, createAgent, roleOf, seatPos, setOrder } from './ai'
import { addAnimal, findWalkable, headingTo, removeAnimal } from './animals'
import type { Order, Pose, SimCtx } from './ctx'
import { addBond } from './life'
import { randomLook } from './looks'
import { makeName } from './names'
import { fill, speak } from './talk'
import { sunTimes } from './time'

export type MomentId = 'honeyguide' | 'lion-eyes' | 'visitor' | 'seal-pup' | 'rain-dash' | 'moon-dance' | 'first-steps'
export const MOMENT_IDS: readonly MomentId[] = ['honeyguide', 'lion-eyes', 'visitor', 'seal-pup', 'rain-dash', 'moon-dance', 'first-steps']

/** a running moment: who plays which part, where, and what it has put into the world */
type Run = {
  id: MomentId
  step: number
  /** game time the current step began */
  stepAt: number
  cast: Record<string, string>
  /** extra people in it (the children at the pup, the dancers) */
  crowd: string[]
  spots: Record<string, Vec2>
  anchor: Vec2
  /** people this moment has given orders to, released at the end */
  ordered: string[]
  /** people and animals it added, removed at the end */
  people: string[]
  animals: string[]
  /** a carried child set down for its first steps: who carried it */
  carrier: string | null
  /** started by hand (the lab, tests): runs even inside a director beat */
  forced: boolean
}

export type MomentState = {
  active: Run | null
  /** game time the last moment began */
  lastAt: number
  /** the 10-minute slot last rolled */
  slot: number
  /** moment id → the stage and day it last happened */
  fired: Partial<Record<MomentId, string>>
  /** a passing shower: rain held at least this high until `until` (game time) */
  rain: { level: number; until: number } | null
  /** a log of moments begun, for the lab and run-day */
  log: string[]
}

export function emptyMoments(): MomentState {
  return { active: null, lastAt: -1e9, slot: -1, fired: {}, rain: null, log: [] }
}

type Step = {
  /** game minutes after the previous step, at least */
  after?: number
  /** and wait for this (up to `max` game minutes) */
  until?: (ctx: SimCtx, r: Run) => boolean
  max?: number
  run?: (ctx: SimCtx, r: Run) => void
}

type Moment = {
  id: MomentId
  label: string
  stages: readonly LifeStageId[]
  /** the time, weather and place allow it */
  ok(ctx: SimCtx): boolean
  /** the parts it needs, or null when the band can't play it now */
  cast(ctx: SimCtx): Omit<Run, 'id' | 'step' | 'stepAt' | 'ordered' | 'people' | 'animals' | 'forced'> | null
  steps: readonly Step[]
}

const GAME_HOUR = 3600
const SLOT = 600
/** chance a free 10-minute slot starts a moment */
const ROLL = 0.12
/** a moment happens where the player can see it */
const NEAR_PLAYER = 90

const pose = (task: Pose['task'], anim: Pose['anim'], right: Pose['right'] = 'none'): Pose => ({ task, anim, skill: null, right, left: 'none' })
const SIT = pose('socialize', 'sit')
const CROUCH = pose('scripted', 'crouch')
const STAND = pose('scripted', 'idle')
const DANCE = pose('sing', 'dance')
const TEND = pose('tend-fire', 'tend-fire')

// ─── helpers ────────────────────────────────────────────────────────────────────────────────────────────────

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function hearth(ctx: SimCtx): Vec2 {
  return ctx.world.poi('hearth-main')
}

function playerOf(ctx: SimCtx): SimPerson | undefined {
  return ctx.state.people.find((p) => p.id === ctx.state.playerId)
}

function personById(ctx: SimCtx, id: string | undefined): SimPerson | undefined {
  return id ? ctx.state.people.find((p) => p.id === id) : undefined
}

/** awake, free and able: nobody the director or another moment holds */
function free(ctx: SimCtx, p: SimPerson): boolean {
  if (!p.alive || p.isPlayer || p.carriedBy || p.task.kind === 'sleep') return false
  return !ctx.agents.get(p.id)?.order
}

function hourNow(ctx: SimCtx): number {
  return ctx.state.clock.hour
}

function sun(ctx: SimCtx): { rise: number; set: number } {
  return sunTimes(ctx, ctx.state.clock.dayOfYear)
}

function isDay(ctx: SimCtx, from = 9, beforeSet = 2.5): boolean {
  const h = hourNow(ctx)
  return h >= from && h < sun(ctx).set - beforeSet
}

function wet(ctx: SimCtx): boolean {
  return ctx.state.weather.storm || ctx.state.weather.rain > 0.3
}

function atHearth(ctx: SimCtx, p: SimPerson): boolean {
  return dist(p.position, hearth(ctx)) < 9
}

/** a dry, walkable spot `r` metres from `from` toward `to` (or the nearest one) */
function toward(ctx: SimCtx, from: Vec2, to: Vec2, r: number): Vec2 {
  const d = dist(from, to) || 1
  const q = { x: from.x + ((to.x - from.x) / d) * r, z: from.z + ((to.z - from.z) / d) * r }
  return findWalkable(ctx, q, 16)
}

function ring(c: Vec2, r: number, i: number, n: number): Vec2 {
  const a = (i / Math.max(1, n)) * Math.PI * 2
  return { x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r }
}

function order(ctx: SimCtx, r: Run, id: string | undefined, o: Partial<Order> & { kind: Order['kind'] }): void {
  if (!id) return
  setOrder(ctx, id, o)
  if (!r.ordered.includes(id)) r.ordered.push(id)
}

function arrived(ctx: SimCtx, ids: readonly (string | undefined)[]): boolean {
  return ids.every((id) => !id || ctx.agents.get(id)?.order?.arrived !== false)
}

/** speech is shown when the speaker is near the player, narration when the moment is */
function say(ctx: SimCtx, r: Run, who: string | null, text: string): void {
  const pl = playerOf(ctx)
  const p = who ? personById(ctx, who) : undefined
  const from = p ? p.position : r.anchor
  if (pl && dist(pl.position, from) > (p ? 30 : NEAR_PLAYER)) return
  speak(ctx, p ?? null, fill(ctx, text), `moment-${r.id}-${r.step}-${Math.floor(ctx.state.clock.t)}`)
}

/** a deterministic pick from a list for this moment and slot */
function pickOf<T>(ctx: SimCtx, list: readonly T[], salt: string): T | undefined {
  if (list.length === 0) return undefined
  const h = mix32(ctx.state.seed, hashString(`${salt}|${ctx.stage}|${Math.floor(ctx.state.clock.t / SLOT)}`)) >>> 0
  return list[h % list.length]
}

function men(ctx: SimCtx): SimPerson[] {
  return ctx.state.people.filter((p) => free(ctx, p) && p.look.sex === 'male' && roleOf(p) === 'adult')
}

function children(ctx: SimCtx): SimPerson[] {
  return ctx.state.people.filter((p) => free(ctx, p) && (roleOf(p) === 'child' || (roleOf(p) === 'toddler' && p.look.ageYears >= 3)))
}

function grownUps(ctx: SimCtx): SimPerson[] {
  return ctx.state.people.filter((p) => free(ctx, p) && (roleOf(p) === 'adult' || roleOf(p) === 'elder'))
}

/** someone from the lagoon band walks over: a whole person, added to the band for the visit */
function makeVisitor(ctx: SimCtx, at: Vec2): SimPerson {
  const n = ctx.state.people.filter((p) => p.id.startsWith('visitor-')).length + 1
  const id = `visitor-${n}`
  const rng = new Rng(mix32(ctx.state.seed, hashString(`${id}|${ctx.stage}|${ctx.state.clock.day}`)))
  const sex = rng.chance(0.5) ? 'female' : 'male'
  const age = rng.range(24, 44)
  const p: SimPerson = {
    id,
    name: makeName(rng, new Set(ctx.state.people.map((q) => q.name))),
    look: randomLook(mix32(ctx.state.seed, hashString(id)), sex, age),
    birthDay: ctx.state.clock.day - Math.round(age * 365),
    motherId: null,
    fatherId: null,
    partnerId: null,
    childIds: [],
    familyId: 'lagoon-visit',
    alive: true,
    isPlayer: false,
    position: { x: at.x, z: at.z },
    heading: headingTo(at, hearth(ctx)),
    speed: 0,
    anim: 'idle',
    held: { left: 'none', right: 'none' },
    carrying: null,
    carriedBy: null,
    lookAt: null,
    task: { kind: 'scripted', targetId: null, target: null, until: null, skill: null },
    needs: { fed: 0.8, warmth: 0.8, energy: 0.9, health: 1 },
    skills: ['faces', 'shellfish', 'corms', 'tides'],
    bond: 0.25,
    known: false,
    speech: null,
  }
  ctx.state.people.push(p)
  ctx.agents.set(id, createAgent(id, 'sleep-6', 60 + n, 0))
  return p
}

function removePerson(ctx: SimCtx, id: string): void {
  const i = ctx.state.people.findIndex((p) => p.id === id)
  if (i >= 0) ctx.state.people.splice(i, 1)
  ctx.agents.delete(id)
}

// ─── the moments ────────────────────────────────────────────────────────────────────────────────────────────

const MOMENTS: readonly Moment[] = [
  {
    id: 'honeyguide',
    label: 'A honeyguide leads the men to honey',
    stages: ['small', 'provider', 'elder'],
    ok: (ctx) => isDay(ctx, 9, 3) && !wet(ctx),
    cast(ctx) {
      const m = men(ctx).sort((a, b) => dist(a.position, hearth(ctx)) - dist(b.position, hearth(ctx)))
      const lead = m.find((p) => p.id === 'tuk') ?? m[0]
      const second = m.find((p) => p !== lead)
      if (!lead || !second) return null
      const bees = findWalkable(ctx, ctx.world.poi('firewood-gully'), 16)
      return { cast: { lead: lead.id, second: second.id }, crowd: [], spots: { bees }, anchor: lead.position, carrier: null }
    },
    steps: [
      {
        run(ctx, r) {
          say(ctx, r, null, 'A small brown bird chatters at the men and flits from bush to bush.')
          say(ctx, r, r.cast.lead ?? null, 'A honeyguide. Come. It knows where the bees are.')
          const bees = r.spots.bees ?? hearth(ctx)
          order(ctx, r, r.cast.lead, { kind: 'goto', dest: bees, near: 1.2, speed: 1.4, pose: CROUCH, face: bees })
          order(ctx, r, r.cast.second, { kind: 'goto', dest: { x: bees.x + 1.6, z: bees.z + 0.8 }, near: 1.2, speed: 1.4, pose: CROUCH, face: bees })
        },
      },
      {
        until: (ctx, r) => arrived(ctx, [r.cast.lead, r.cast.second]),
        max: 50,
        run(ctx, r) {
          r.anchor = r.spots.bees ?? r.anchor
          say(ctx, r, r.cast.second ?? null, 'Smoke them out. Slowly, or they will have us.')
        },
      },
      {
        after: 15,
        run(ctx, r) {
          say(ctx, r, null, 'They leave a piece of the comb on a branch for the bird.')
          for (const id of [r.cast.lead, r.cast.second]) {
            const ag = id ? ctx.agents.get(id) : undefined
            if (ag) order(ctx, r, id, { kind: 'goto', dest: seatPos(ctx, ag), near: 0.8, pose: SIT, face: hearth(ctx) })
          }
        },
      },
      {
        until: (ctx, r) => arrived(ctx, [r.cast.lead, r.cast.second]),
        max: 50,
        run(ctx, r) {
          r.anchor = hearth(ctx)
          say(ctx, r, r.cast.lead ?? null, 'Honey. One piece each, and the little ones first.')
          say(ctx, r, null, 'Sweet and smoky, passed from hand to hand.')
          for (const p of ctx.state.people) {
            if (!p.alive || dist(p.position, hearth(ctx)) > 12) continue
            p.needs.fed = Math.min(1, p.needs.fed + 0.05)
            if (!p.isPlayer && (p.id === r.cast.lead || p.id === r.cast.second)) addBond(ctx, p, 0.02)
          }
        },
      },
      { after: 4 },
    ],
  },
  {
    id: 'lion-eyes',
    label: "A lion's eyes at the edge of the firelight",
    stages: ['small', 'provider', 'elder'],
    ok(ctx) {
      const h = hourNow(ctx)
      const { set } = sun(ctx)
      return h > set + 0.8 && h < 23 && !ctx.state.weather.storm
    },
    cast(ctx) {
      const near = ctx.state.people.filter((p) => free(ctx, p) && atHearth(ctx, p))
      if (near.length < 4) return null
      const keeper = near.find((p) => p.id === 'tuk') ?? near.find((p) => p.look.sex === 'male' && roleOf(p) !== 'child') ?? near[0]
      if (!keeper) return null
      const h = hearth(ctx)
      const eyes = toward(ctx, h, ctx.world.poi('shore-path-top'), 17)
      return { cast: { keeper: keeper.id }, crowd: near.filter((p) => p !== keeper).map((p) => p.id), spots: { eyes }, anchor: h, carrier: null }
    },
    steps: [
      {
        run(ctx, r) {
          const eyes = r.spots.eyes ?? hearth(ctx)
          const lion = addAnimal(ctx, 'lion', eyes, null)
          lion.heading = headingTo(eyes, hearth(ctx))
          lion.anim = 'idle'
          r.animals.push(lion.id)
          say(ctx, r, null, 'Two eyes shine at the edge of the firelight.')
          // everyone draws in close to the fire
          r.crowd.forEach((id) => {
            const ag = ctx.agents.get(id)
            if (ag) order(ctx, r, id, { kind: 'goto', dest: seatPos(ctx, ag, 0.75), near: 0.5, speed: 1.6, pose: SIT, face: eyes })
          })
          order(ctx, r, r.cast.keeper, { kind: 'goto', dest: toward(ctx, hearth(ctx), eyes, 1.3), near: 0.5, speed: 1.6, pose: TEND, face: hearth(ctx) })
        },
      },
      {
        after: 2,
        run(ctx, r) {
          say(ctx, r, r.cast.keeper ?? null, 'More wood. It hates the light.')
          const fu = ctx.fuel['hearth-main']
          if (fu) fu.fuel = Math.min(1.5, fu.fuel + 0.5)
          ctx.state.hearth.firewood = Math.max(0, ctx.state.hearth.firewood - 2)
          ctx.events.push({ type: 'sfx', name: 'fire-flare', at: hearth(ctx) })
        },
      },
      {
        after: 4,
        run(ctx, r) {
          const elder = r.crowd.map((id) => personById(ctx, id)).find((p) => p && roleOf(p) === 'elder')
          say(ctx, r, elder?.id ?? null, elder ? 'Do not look at it. Look at the fire.' : 'Nobody moves. The fire crackles.')
        },
      },
      {
        after: 6,
        run(ctx, r) {
          say(ctx, r, null, 'The eyes go out, one and then the other.')
          for (const id of r.animals) removeAnimal(ctx, id)
          r.animals = []
        },
      },
      { after: 4 },
    ],
  },
  {
    id: 'visitor',
    label: 'A visitor from the lagoon band',
    stages: ['small', 'provider', 'elder'],
    ok: (ctx) => isDay(ctx, 9.5, 3) && !wet(ctx) && !ctx.state.people.some((p) => p.familyId === 'lagoon'),
    cast(ctx) {
      const h = hearth(ctx)
      const host = grownUps(ctx).filter((p) => atHearth(ctx, p))[0]
      const start = toward(ctx, h, ctx.world.poi('lagoon-camp'), 70)
      const cast: Record<string, string> = host ? { host: host.id } : {}
      return { cast, crowd: [], spots: { start }, anchor: h, carrier: null }
    },
    steps: [
      {
        run(ctx, r) {
          const v = makeVisitor(ctx, r.spots.start ?? hearth(ctx))
          r.people.push(v.id)
          r.cast.visitor = v.id
          const ag = ctx.agents.get(v.id)
          const seat = ag ? seatPos(ctx, ag, 1.15) : hearth(ctx)
          order(ctx, r, v.id, { kind: 'goto', dest: seat, near: 0.8, speed: 1.2, pose: SIT, face: hearth(ctx) })
          say(ctx, r, null, 'Someone is coming up from the lagoon side, waving.')
        },
      },
      {
        until: (ctx, r) => arrived(ctx, [r.cast.visitor]),
        max: 60,
        run(ctx, r) {
          say(ctx, r, r.cast.visitor ?? null, 'The mullet are thick in the lagoon this moon. Come and fish with us.')
        },
      },
      {
        after: 2,
        run(ctx, r) {
          say(ctx, r, r.cast.visitor ?? null, 'And this is for your hearth. Corms from the river flats.')
          ctx.state.hearth.corms += 20
          if (r.cast.host) say(ctx, r, r.cast.host, 'Sit, eat. Tell us who has been born over there.')
        },
      },
      {
        after: 40,
        run(ctx, r) {
          say(ctx, r, r.cast.visitor ?? null, 'Come to the lagoon before the cold. There will be dancing.')
          order(ctx, r, r.cast.visitor, { kind: 'goto', dest: r.spots.start ?? hearth(ctx), near: 2, speed: 1.2 })
        },
      },
      { until: (ctx, r) => arrived(ctx, [r.cast.visitor]), max: 60 },
    ],
  },
  {
    id: 'seal-pup',
    label: 'A seal pup on the rocks',
    stages: ['small', 'provider', 'elder'],
    ok: (ctx) => isDay(ctx, 8, 2) && !ctx.state.weather.storm,
    cast(ctx) {
      const pl = playerOf(ctx)
      const bottom = ctx.world.poi('shore-path-bottom')
      const pup = toward(ctx, bottom, ctx.world.poi('shore-limpets'), Math.max(4, dist(bottom, ctx.world.poi('shore-limpets')) * 0.6))
      const kids = children(ctx)
        .filter((p) => dist(p.position, pup) < 160)
        .sort((a, b) => dist(a.position, pup) - dist(b.position, pup))
        .slice(0, 3)
      if (kids.length === 0) return null
      if (pl && dist(pl.position, pup) > NEAR_PLAYER * 1.5) return null
      const warn = grownUps(ctx).sort((a, b) => dist(a.position, pup) - dist(b.position, pup))[0]
      const cast: Record<string, string> = warn ? { warn: warn.id } : {}
      return { cast, crowd: kids.map((k) => k.id), spots: { pup }, anchor: pup, carrier: null }
    },
    steps: [
      {
        run(ctx, r) {
          const at = r.spots.pup ?? r.anchor
          const pup = addAnimal(ctx, 'seal', at, null, { mode: 'calm', target: { ...at }, until: ctx.state.clock.t + 6 * GAME_HOUR })
          pup.anim = 'lie'
          r.animals.push(pup.id)
          say(ctx, r, null, 'A seal pup lies on the rocks, round and grey, blinking at the sky.')
          r.crowd.forEach((id, i) => {
            const spot = findWalkable(ctx, ring(at, 3.2, i, Math.max(3, r.crowd.length)), 6)
            order(ctx, r, id, { kind: 'goto', dest: spot, near: 0.6, speed: 1.5, pose: CROUCH, face: at })
          })
        },
      },
      {
        until: (ctx, r) => arrived(ctx, r.crowd),
        max: 40,
        run(ctx, r) {
          say(ctx, r, r.crowd[0] ?? null, 'It has eyes like a person.')
        },
      },
      {
        after: 3,
        run(ctx, r) {
          if (r.cast.warn) say(ctx, r, r.cast.warn, 'Leave it be. Its mother is out in the water, watching you.')
          if (r.crowd[1]) say(ctx, r, r.crowd[1], 'We are only looking.')
        },
      },
      {
        after: 14,
        run(ctx, r) {
          say(ctx, r, null, 'The pup humps down to the water and is gone.')
          for (const id of r.animals) removeAnimal(ctx, id)
          r.animals = []
        },
      },
      { after: 2 },
    ],
  },
  {
    id: 'rain-dash',
    label: 'A sudden shower sends everyone running for the cave',
    stages: ['small', 'provider', 'elder'],
    ok: (ctx) => isDay(ctx, 10, 2) && !wet(ctx),
    cast(ctx) {
      const pl = playerOf(ctx)
      const out = ctx.state.people.filter((p) => free(ctx, p) && !ctx.world.inCave(p.position.x, p.position.z) && dist(p.position, hearth(ctx)) < 140)
      if (out.length < 5) return null
      if (pl && dist(pl.position, hearth(ctx)) > 140) return null
      const kid = out.find((p) => roleOf(p) === 'child')
      const grown = out.find((p) => roleOf(p) === 'adult')
      return { cast: { kid: kid?.id ?? '', grown: grown?.id ?? '' }, crowd: out.map((p) => p.id), spots: {}, anchor: hearth(ctx), carrier: null }
    },
    steps: [
      {
        run(ctx, r) {
          ctx.moments.rain = { level: 0.85, until: ctx.state.clock.t + 22 * 60 }
          say(ctx, r, null, 'Rain, all at once, cold and loud.')
          const mouth = ctx.world.poi('cave-mouth')
          for (const id of r.crowd) {
            const ag = ctx.agents.get(id)
            if (ag) order(ctx, r, id, { kind: 'goto', dest: bedPos(ctx, ag), near: 1, speed: 2.6, pose: SIT, face: mouth })
          }
        },
      },
      {
        after: 1.5,
        run(ctx, r) {
          if (r.cast.kid) say(ctx, r, r.cast.kid, 'We are fish now. Look at me, I am a fish.')
          if (r.cast.grown) say(ctx, r, r.cast.grown, 'Run. Your feet are slower than your mouth.')
        },
      },
      {
        after: 18,
        run(ctx, r) {
          say(ctx, r, null, 'The shower passes as fast as it came. Steam lifts off the rocks.')
          ctx.moments.rain = null
        },
      },
      { after: 2 },
    ],
  },
  {
    id: 'moon-dance',
    label: 'A full-moon dance at the hearth',
    stages: ['small', 'provider', 'elder'],
    ok(ctx) {
      const h = hourNow(ctx)
      const { set } = sun(ctx)
      const phase = ctx.state.clock.moonPhase
      return h > set + 0.4 && h < set + 3 && Math.abs(phase - 0.5) < 0.06 && !wet(ctx)
    },
    cast(ctx) {
      const near = ctx.state.people.filter((p) => free(ctx, p) && atHearth(ctx, p))
      if (near.length < 8) return null
      const elder = near.find((p) => p.id === 'oro') ?? near.find((p) => roleOf(p) === 'elder')
      const dancers = near.filter((p) => p !== elder && roleOf(p) !== 'elder' && roleOf(p) !== 'toddler').slice(0, 12)
      const kid = dancers.find((p) => roleOf(p) === 'child')
      return { cast: { elder: elder?.id ?? '', kid: kid?.id ?? '' }, crowd: dancers.map((p) => p.id), spots: {}, anchor: hearth(ctx), carrier: null }
    },
    steps: [
      {
        run(ctx, r) {
          say(ctx, r, null, 'The moon comes up round and white over the sea. Someone starts to clap.')
          if (r.cast.elder) say(ctx, r, r.cast.elder, 'Dance, then. My feet will watch.')
          const h = hearth(ctx)
          r.crowd.forEach((id, i) => {
            const at = findWalkable(ctx, ring(h, 4.4, i, r.crowd.length), 6)
            order(ctx, r, id, { kind: 'goto', dest: at, near: 0.6, pose: DANCE, face: h })
          })
        },
      },
      {
        after: 20,
        run(ctx, r) {
          if (r.cast.kid) say(ctx, r, r.cast.kid, 'Again. Once more, once more.')
        },
      },
      {
        after: 15,
        run(ctx, r) {
          say(ctx, r, null, 'The fire burns down to red. The dancers sit, breathing hard and laughing.')
          for (const id of r.crowd) {
            const ag = ctx.agents.get(id)
            if (ag) order(ctx, r, id, { kind: 'goto', dest: seatPos(ctx, ag), near: 0.6, pose: SIT, face: hearth(ctx) })
          }
        },
      },
      { after: 5 },
    ],
  },
  {
    id: 'first-steps',
    label: "The child's first steps toward the player",
    stages: ['provider', 'elder'],
    ok: (ctx) => {
      const h = hourNow(ctx)
      return h >= 8 && h < sun(ctx).set + 1.5
    },
    cast(ctx) {
      const pl = playerOf(ctx)
      if (!pl || pl.carriedBy) return null
      const kin = new Set(pl.childIds)
      for (const p of ctx.state.people) if (p.childIds.some((c) => kin.has(c)) || kin.has(p.id)) for (const c of p.childIds) kin.add(c)
      const child = ctx.state.people
        .filter((p) => p.alive && kin.has(p.id) && p.look.ageYears >= 0.8 && p.look.ageYears <= 2.2 && !ctx.agents.get(p.id)?.order)
        .filter((p) => dist(p.position, pl.position) < 40)
        .sort((a, b) => a.look.ageYears - b.look.ageYears)[0]
      if (!child) return null
      return { cast: { child: child.id }, crowd: [], spots: {}, anchor: pl.position, carrier: child.carriedBy }
    },
    steps: [
      {
        run(ctx, r) {
          const pl = playerOf(ctx)
          const child = personById(ctx, r.cast.child)
          if (!pl || !child) return
          // set the child down a few steps in front of the player
          const carrier = personById(ctx, child.carriedBy ?? undefined)
          if (carrier) carrier.carrying = null
          child.carriedBy = null
          const at = findWalkable(ctx, { x: pl.position.x + Math.sin(pl.heading) * 3.2, z: pl.position.z + Math.cos(pl.heading) * 3.2 }, 6)
          child.position = { x: at.x, z: at.z }
          order(ctx, r, child.id, { kind: 'hold', pose: STAND, face: pl.position })
          const mum = personById(ctx, child.motherId ?? undefined)
          const voice = carrier && !carrier.isPlayer ? carrier : mum && !mum.isPlayer ? mum : null
          say(ctx, r, voice?.id ?? null, voice ? `${child.name}, look. Look who is there.` : `${child.name} stands, swaying, and looks at you.`)
        },
      },
      {
        after: 1,
        run(ctx, r) {
          const pl = playerOf(ctx)
          if (!pl) return
          order(ctx, r, r.cast.child, { kind: 'follow', targetId: pl.id, near: 0.7, speed: 0.45 })
          say(ctx, r, null, 'One step. Two. A wobble, and three.')
        },
      },
      {
        until(ctx, r) {
          const pl = playerOf(ctx)
          const child = personById(ctx, r.cast.child)
          return !pl || !child || dist(pl.position, child.position) < 1
        },
        max: 14,
        run(ctx, r) {
          const child = personById(ctx, r.cast.child)
          say(ctx, r, null, 'Into your arms.')
          if (child) addBond(ctx, child, 0.1)
        },
      },
      { after: 1 },
    ],
  },
]

function momentOf(id: MomentId): Moment {
  const m = MOMENTS.find((x) => x.id === id)
  if (!m) throw new Error(`OCHRE sim: no moment ${id}`)
  return m
}

export function momentLabel(id: MomentId): string {
  return momentOf(id).label
}

// ─── the runner ─────────────────────────────────────────────────────────────────────────────────────────────

function dayKey(ctx: SimCtx): string {
  return `${ctx.stage}:${ctx.state.clock.day}`
}

function begin(ctx: SimCtx, m: Moment, parts: NonNullable<ReturnType<Moment['cast']>>, forced: boolean): void {
  const st = ctx.moments
  st.active = { id: m.id, step: 0, stepAt: ctx.state.clock.t, ordered: [], people: [], animals: [], forced, ...parts }
  st.lastAt = ctx.state.clock.t
  st.fired[m.id] = dayKey(ctx)
  const h = Math.floor(ctx.state.clock.hour)
  const mm = Math.floor((ctx.state.clock.hour - h) * 60)
  st.log.push(`D${ctx.state.clock.day} ${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${m.label}`)
}

/** release everyone, take away what the moment added, put a set-down child back where it was carried */
function finish(ctx: SimCtx): void {
  const r = ctx.moments.active
  if (!r) return
  for (const id of r.ordered) setOrder(ctx, id, null)
  for (const id of r.people) removePerson(ctx, id)
  for (const id of r.animals) removeAnimal(ctx, id)
  if (r.id === 'rain-dash') ctx.moments.rain = null
  const child = personById(ctx, r.cast.child)
  const carrier = personById(ctx, r.carrier ?? undefined)
  if (r.id === 'first-steps' && child && carrier && !carrier.carrying && child.alive) {
    carrier.carrying = { id: child.id, slot: 'back' }
    child.carriedBy = carrier.id
  }
  ctx.moments.active = null
}

function allowed(ctx: SimCtx): boolean {
  if (ctx.fastForward || ctx.sleepSkip) return false
  return ctx.director ? ctx.director.free() : true
}

/** start a moment now if its people are there (the lab's button and the tests); false if it can't */
export function triggerMoment(ctx: SimCtx, id: MomentId): boolean {
  finish(ctx)
  const m = momentOf(id)
  const parts = m.cast(ctx)
  if (!parts) return false
  begin(ctx, m, parts, true)
  return true
}

/** the moment running now, if any */
export function activeMoment(ctx: SimCtx): MomentId | null {
  return ctx.moments.active?.id ?? null
}

/** after each step: run the moment in progress, or perhaps begin one */
export function updateMoments(ctx: SimCtx): void {
  const st = ctx.moments
  const t = ctx.state.clock.t
  if (st.rain && t > st.rain.until) st.rain = null
  const r = st.active
  if (r) {
    // a director beat taking over ends a free-day moment (the lab's triggered ones run in a sandbox)
    if (!r.forced && ctx.director && !ctx.director.free()) {
      finish(ctx)
      return
    }
    const m = momentOf(r.id)
    for (let guard = 0; guard < 8; guard++) {
      const step = m.steps[r.step]
      if (!step) {
        finish(ctx)
        return
      }
      const elapsed = (t - r.stepAt) / 60
      if (elapsed < (step.after ?? 0)) return
      const waited = step.until ? step.until(ctx, r) || elapsed >= (step.after ?? 0) + (step.max ?? 30) : true
      if (!waited) return
      step.run?.(ctx, r)
      r.step++
      r.stepAt = t
    }
    return
  }
  const slot = Math.floor(t / SLOT)
  if (slot === st.slot) return
  st.slot = slot
  if (!allowed(ctx) || t - st.lastAt < GAME_HOUR) return
  const roll = (mix32(ctx.state.seed, hashString(`moment|${ctx.stage}|${slot}`)) >>> 0) / 4294967296
  if (roll >= ROLL) return
  const today = dayKey(ctx)
  const pl = playerOf(ctx)
  const ready: Array<{ m: Moment; parts: NonNullable<ReturnType<Moment['cast']>> }> = []
  for (const m of MOMENTS) {
    if (!m.stages.includes(ctx.stage) || st.fired[m.id] === today || !m.ok(ctx)) continue
    const parts = m.cast(ctx)
    if (!parts) continue
    if (pl && dist(pl.position, parts.anchor) > NEAR_PLAYER * 1.5) continue
    ready.push({ m, parts })
  }
  const pick = pickOf(ctx, ready, 'moment-pick')
  if (pick) begin(ctx, pick.m, pick.parts, false)
}

/** the weather with any passing shower laid over it */
export function showerOver(ctx: SimCtx): void {
  const rain = ctx.moments.rain
  if (!rain) return
  const w = ctx.state.weather
  ctx.state.weather = { ...w, rain: Math.max(w.rain, rain.level), cloud: Math.max(w.cloud, 0.9) }
}
