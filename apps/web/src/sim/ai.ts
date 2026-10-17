/**
 * The band's days. A utility AI picks each person's plan from the hour, the tide, their age, sex and skills, and
 * their needs; plans walk A* paths and then work (gather, dig, knap, hunt, play, eat, tell stories, sleep).
 * Sleep in the cave at night, wake at dawn, women and children to the shore at the low tide, men to the plateau
 * or the silcrete ridge, elders digging corms and keeping the fire, everyone home by dusk to eat together.
 */
import { Rng, mix32 } from '../core/rng'
import type { HeldItem, PersonAnim, SimPerson, SkillId, TaskKind, Vec2 } from '../game/contracts'
import { findWalkable, headingTo, removeAnimal, startleHerd, windVector, woundAnimal } from './animals'
import {
  ELAND_MEAT,
  FOOD_VALUE,
  type Agent,
  type HuntStage,
  type Plan,
  type PlanKind,
  type SimCtx,
} from './ctx'
import { bedOut, bedWorthGoing, eveningHour, sunTimes } from './time'

const THINK_EVERY = 120
const CAMP_RADIUS = 14

type Role = 'infant' | 'toddler' | 'child' | 'teen' | 'adult' | 'elder'

export function roleOf(p: SimPerson): Role {
  const a = p.look.ageYears
  if (a < 2) return 'infant'
  if (a < 5) return 'toddler'
  if (a < 13) return 'child'
  if (a < 18) return 'teen'
  if (a < 55) return 'adult'
  return 'elder'
}

export function walkSpeed(p: SimPerson): number {
  const a = p.look.ageYears
  if (a < 13) return 1.1
  if (a >= 55) return 0.9
  return 1.3
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function has(p: SimPerson, s: SkillId): boolean {
  return p.skills.includes(s)
}

function loadTotal(ag: Agent): number {
  const l = ag.load
  return l.shellfish + l.corms + l.meat + l.firewood + l.silcrete
}

export function createAgent(id: string, sleepId: string, seat: number, bed: number): Agent {
  return {
    id,
    sleepId,
    seat,
    bed,
    plan: null,
    path: [],
    pathReq: null,
    nextThink: 0,
    mealDay: -1,
    breakfastDay: -1,
    dayChoice: null,
    load: { shellfish: 0, corms: 0, meat: 0, firewood: 0, silcrete: 0 },
    learn: {},
    gaze: 0,
  }
}

// ─── places ─────────────────────────────────────────────────────────────────────────────────────────────────

function hearth(ctx: SimCtx): Vec2 {
  return ctx.world.poi('hearth-main')
}

function inCamp(ctx: SimCtx, p: SimPerson): boolean {
  return dist(p.position, hearth(ctx)) < CAMP_RADIUS || ctx.world.inCave(p.position.x, p.position.z)
}

/** a seat in the ring around the hearth */
function seatPos(ctx: SimCtx, ag: Agent, ring = 1): Vec2 {
  const h = hearth(ctx)
  const ang = ag.seat * 2.39996 // golden angle spreads the seats
  const r = (2.4 + (ag.seat % 3) * 0.9) * ring
  return findWalkable(ctx, { x: h.x + Math.sin(ang) * r, z: h.z + Math.cos(ang) * r }, 8)
}

function bedPos(ctx: SimCtx, ag: Agent): Vec2 {
  const spot = ctx.world.poi(ag.sleepId)
  const ang = ag.bed * 1.7
  const r = ag.bed === 0 ? 0 : 0.9 + ag.bed * 0.25
  return findWalkable(ctx, { x: spot.x + Math.sin(ang) * r, z: spot.z + Math.cos(ang) * r }, 6)
}

function scatter(ctx: SimCtx, c: Vec2, radius: number): Vec2 {
  const a = ctx.rng.range(0, Math.PI * 2)
  const r = Math.sqrt(ctx.rng.next()) * radius
  return findWalkable(ctx, { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }, Math.max(8, radius))
}

// ─── the day's clock for one person ─────────────────────────────────────────────────────────────────────────

type Period = 'night' | 'morning' | 'day' | 'evening'

function storytellerId(ctx: SimCtx): string | null {
  let best: SimPerson | null = null
  for (const p of ctx.state.people) {
    if (!p.alive || p.isPlayer || !has(p, 'stories') || roleOf(p) !== 'elder') continue
    if (!best || p.look.ageYears > best.look.ageYears) best = p
  }
  return best?.id ?? null
}

function bedtime(ctx: SimCtx, p: SimPerson, set: number): number {
  const r = roleOf(p)
  if (r === 'infant' || r === 'toddler') return set + 1.25
  if (r === 'child') return set + 1.75
  if (p.id === storytellerId(ctx)) return Math.min(23.5, set + 3.25)
  if (r === 'elder') return set + 2.5
  return Math.min(23.25, set + 2.75)
}

function wakeHour(p: SimPerson, rise: number): number {
  const r = roleOf(p)
  return r === 'adult' || r === 'elder' ? rise - 0.3 : rise + 0.15
}

export function periodOf(ctx: SimCtx, p: SimPerson): Period {
  const { hour, dayOfYear } = ctx.state.clock
  const { rise, set } = sunTimes(ctx, dayOfYear)
  if (hour < 12) {
    if (hour < wakeHour(p, rise)) return 'night'
    return hour < rise + 0.6 ? 'morning' : 'day'
  }
  const eh = eveningHour(hour)
  if (eh >= bedtime(ctx, p, set)) return 'night'
  if (eh >= set - 0.6) return 'evening'
  return 'day'
}

/** the minute the band starts eating together */
function mealTime(ctx: SimCtx): number {
  return sunTimes(ctx, ctx.state.clock.dayOfYear).set - 0.2
}

// ─── plans ──────────────────────────────────────────────────────────────────────────────────────────────────

const SPEECH: Partial<Record<PlanKind, readonly string[]>> = {
  shore: ['Come. The sea is sleeping.', 'Watch the waves, not the shells.', 'The mussels are fat after the full moon.'],
  corms: ['Dig beside the root, not on it.', 'This one is a good one.', 'The ground is soft after the rain.'],
  hunt: ['The wind is in our faces. Good.', 'Quiet now.', 'Their tracks are fresh.'],
  wood: ['Dry wood from under the milkwoods.', 'Enough for tonight.'],
  play: ['You be the eland!', 'Catch me!', 'I am the lion!'],
  eat: ['Eat. There is enough.', 'The corms are sweet tonight.'],
  story: ['Listen. This happened long ago.', 'When my grandmother was small…'],
  sleep: ['Sleep now.', 'Close your eyes.'],
  knap: ['Hear how it rings? That is good stone.', 'Slowly. Let the stone tell you.'],
  stone: ['The red stone is up on the ridge.'],
}

function say(ctx: SimCtx, p: SimPerson, kind: PlanKind): void {
  const lines = SPEECH[kind]
  if (!lines || !ctx.rng.chance(kind === 'eat' || kind === 'sleep' ? 0.08 : 0.3)) return
  p.speech = { text: ctx.rng.pick(lines), until: ctx.state.clock.t + 5 * ctx.state.timeScale }
}

function setPlan(
  ctx: SimCtx,
  p: SimPerson,
  ag: Agent,
  kind: PlanKind,
  dest: Vec2,
  opts: { targetId?: string | null; until?: number | null; hunt?: Plan['hunt'] } = {},
): void {
  if (ag.pathReq) ctx.paths.cancel(ag.pathReq)
  ag.pathReq = null
  ag.path = []
  ag.plan = {
    kind,
    phase: 'go',
    dest: { x: dest.x, z: dest.z },
    targetId: opts.targetId ?? null,
    until: opts.until ?? null,
    tick: 0,
    hunt: opts.hunt ?? null,
    shuffle: null,
  }
  say(ctx, p, kind)
}

function hours(h: number): number {
  return h * 3600
}

/** did the band decide to hunt today? */
function huntDay(ctx: SimCtx, day: number): boolean {
  return new Rng(mix32(ctx.state.seed ^ 0x4c7, day)).chance(0.5)
}

function chooseManDay(ctx: SimCtx, p: SimPerson, ag: Agent): Agent['dayChoice'] {
  const day = ctx.state.clock.day
  if (ag.dayChoice && ag.dayChoice.day === day) return ag.dayChoice
  const rng = new Rng(mix32(ctx.state.seed ^ 0x3a9, day * 131 + (ag.seat + 1) * 17))
  let kind: NonNullable<Agent['dayChoice']>['kind']
  if (huntDay(ctx, day) && has(p, 'spear') && ctx.herds.length > 0) kind = 'hunt'
  else {
    const r = rng.next()
    kind = r < 0.25 && has(p, 'knapping') ? 'stone' : r < 0.55 && has(p, 'knapping') ? 'knap' : r < 0.75 ? 'wood' : 'corms'
  }
  ag.dayChoice = { day, kind }
  return ag.dayChoice
}

function shoreBed(ctx: SimCtx): string | null {
  for (const id of ['shore-mussels', 'shore-limpets']) {
    if (bedWorthGoing(ctx, ctx.world.poi(id), 1.1, 0.6)) return id
  }
  return null
}

/** days the hearth store would feed the band */
export function stockDays(ctx: SimCtx): number {
  const h = ctx.state.hearth
  const value = h.meat * FOOD_VALUE.meat + h.corms * FOOD_VALUE.corms + h.shellfish * FOOD_VALUE.shellfish
  const mouths = ctx.state.people.filter((p) => p.alive && !p.carriedBy).length
  return value / Math.max(1, mouths * 0.5)
}

function firewoodLow(ctx: SimCtx): boolean {
  return ctx.state.hearth.firewood < 14
}

function someoneDoing(ctx: SimCtx, kind: PlanKind, except: string): boolean {
  for (const ag of ctx.agents.values()) if (ag.id !== except && ag.plan?.kind === kind) return true
  return false
}

function motherOf(ctx: SimCtx, p: SimPerson): SimPerson | null {
  const id = p.motherId
  const m = id ? ctx.state.people.find((q) => q.id === id) : undefined
  return m && m.alive ? m : null
}

/** pick a day plan for a person who has none */
function chooseDay(ctx: SimCtx, p: SimPerson, ag: Agent): void {
  const { set } = sunTimes(ctx, ctx.state.clock.dayOfYear)
  const late = ctx.state.clock.hour > set - 1.6
  const r = roleOf(p)
  const t = ctx.state.clock.t
  const rng = ctx.rng
  const female = p.look.sex === 'female'

  if (r === 'toddler' || r === 'child') {
    const m = motherOf(ctx, p)
    const mPlan = m ? ctx.agents.get(m.id)?.plan : null
    if (m && mPlan && (mPlan.kind === 'shore' || (r === 'toddler' && !inCamp(ctx, m)))) {
      setPlan(ctx, p, ag, 'follow', m.position, { targetId: m.id })
      return
    }
    if (r === 'child' && !late && rng.chance(0.75)) {
      setPlan(ctx, p, ag, 'play', scatter(ctx, ctx.world.poi('play-dunes'), 18), { until: t + hours(rng.range(1, 2)) })
      return
    }
    setPlan(ctx, p, ag, 'hearth', seatPos(ctx, ag, 1.6), { until: t + hours(0.5) })
    return
  }

  if (late) {
    setPlan(ctx, p, ag, 'hearth', seatPos(ctx, ag), { until: t + hours(0.4) })
    return
  }

  const forager = female || (r === 'teen' && p.look.ageYears < 15)
  // a full hearth means an easier day
  const plenty = stockDays(ctx) > 2.5
  if (r === 'elder') {
    if (ctx.state.clock.hour < 11.5 && has(p, 'corms') && rng.chance(plenty ? 0.3 : 0.7)) {
      setPlan(ctx, p, ag, 'corms', scatter(ctx, ctx.world.poi('corm-slope'), 10), { until: t + hours(rng.range(1.5, 2.5)) })
    } else if (has(p, 'hides') && rng.chance(0.4)) {
      setPlan(ctx, p, ag, 'hides', seatPos(ctx, ag), { until: t + hours(rng.range(1, 2)) })
    } else {
      setPlan(ctx, p, ag, 'hearth', seatPos(ctx, ag), { until: t + hours(rng.range(0.5, 1)) })
    }
    return
  }

  if (forager) {
    const bed = has(p, 'shellfish') && (!plenty || rng.chance(0.35)) ? shoreBed(ctx) : null
    if (bed) {
      setPlan(ctx, p, ag, 'shore', scatter(ctx, ctx.world.poi(bed), ctx.world.poi(bed).radius * 0.7), { targetId: bed })
      return
    }
    if (firewoodLow(ctx) && !someoneDoing(ctx, 'wood', p.id) && !p.carrying) {
      setPlan(ctx, p, ag, 'wood', scatter(ctx, ctx.world.poi('firewood-gully'), 14), { until: null })
      return
    }
    if (has(p, 'corms') && rng.chance(plenty ? 0.25 : 0.65)) {
      setPlan(ctx, p, ag, 'corms', scatter(ctx, ctx.world.poi('corm-slope'), 12), { until: t + hours(rng.range(1.5, 3)) })
      return
    }
    if (has(p, 'hides') || has(p, 'beads')) {
      setPlan(ctx, p, ag, 'hides', seatPos(ctx, ag), { until: t + hours(rng.range(1, 2)) })
      return
    }
    setPlan(ctx, p, ag, 'hearth', seatPos(ctx, ag), { until: t + hours(0.75) })
    return
  }

  // men and older boys
  const choice = chooseManDay(ctx, p, ag)
  const kind = choice?.kind ?? 'knap'
  if (kind === 'hunt' && ctx.state.clock.hour < set - 4) {
    const herd = ctx.herds[0]
    if (herd) {
      setPlan(ctx, p, ag, 'hunt', stagingPoint(ctx, herd.center, ag), { hunt: { stage: 'stage', attempts: 0 } })
      return
    }
  }
  if (kind === 'stone' && ag.load.silcrete === 0 && ctx.state.clock.hour < set - 4) {
    setPlan(ctx, p, ag, 'stone', scatter(ctx, ctx.world.poi('silcrete-ridge'), 8), { until: null })
    return
  }
  if (kind === 'wood' || (firewoodLow(ctx) && !someoneDoing(ctx, 'wood', p.id))) {
    setPlan(ctx, p, ag, 'wood', scatter(ctx, ctx.world.poi('firewood-gully'), 14), { until: null })
    return
  }
  if (kind === 'corms' && has(p, 'corms')) {
    setPlan(ctx, p, ag, 'corms', scatter(ctx, ctx.world.poi('corm-slope'), 12), { until: t + hours(rng.range(1.5, 2.5)) })
    return
  }
  if (has(p, 'knapping')) {
    setPlan(ctx, p, ag, 'knap', seatPos(ctx, ag, 1.3), { until: t + hours(rng.range(1.5, 3)) })
    return
  }
  setPlan(ctx, p, ag, 'hearth', seatPos(ctx, ag), { until: t + hours(0.75) })
}

/** downwind of the herd, where the hunters can begin their stalk */
function stagingPoint(ctx: SimCtx, center: Vec2, ag: Agent): Vec2 {
  const w = windVector(ctx.state.weather.windDir)
  const side = (ag.seat % 3) - 1
  return findWalkable(ctx, { x: center.x + w.x * 70 - w.z * side * 12, z: center.z + w.z * 70 + w.x * side * 12 }, 40)
}

function chooseEvening(ctx: SimCtx, p: SimPerson, ag: Agent): void {
  const t = ctx.state.clock.t
  const eh = eveningHour(ctx.state.clock.hour)
  if (!inCamp(ctx, p)) {
    setPlan(ctx, p, ag, 'hearth', seatPos(ctx, ag), { until: t + hours(0.25) })
    return
  }
  const h = ctx.state.hearth
  const food = h.meat + h.corms + h.shellfish
  if (ag.mealDay !== ctx.state.clock.day && eh >= mealTime(ctx) && food > 0) {
    setPlan(ctx, p, ag, 'eat', seatPos(ctx, ag), { until: t + hours(0.5) })
    return
  }
  const fire = needsTending(ctx)
  if (fire && roleOf(p) !== 'child' && roleOf(p) !== 'toddler' && ctx.state.hearth.firewood > 0) {
    claimTend(ctx, p, ag, fire)
    return
  }
  const { set } = sunTimes(ctx, ctx.state.clock.dayOfYear)
  if (p.id === storytellerId(ctx) && eh >= set + 0.7) {
    const kind: PlanKind = eh < set + 1.8 ? 'story' : 'sing'
    setPlan(ctx, p, ag, kind, seatPos(ctx, ag), { until: t + hours(0.5) })
    return
  }
  setPlan(ctx, p, ag, 'hearth', seatPos(ctx, ag), { until: t + hours(0.3) })
}

function chooseMorning(ctx: SimCtx, p: SimPerson, ag: Agent): void {
  const t = ctx.state.clock.t
  const h = ctx.state.hearth
  if (ag.breakfastDay !== ctx.state.clock.day && p.needs.fed < 0.55 && h.meat + h.corms + h.shellfish > 0 && inCamp(ctx, p)) {
    ag.breakfastDay = ctx.state.clock.day
    setPlan(ctx, p, ag, 'eat', seatPos(ctx, ag), { until: t + hours(0.25) })
    return
  }
  const fire = needsTending(ctx)
  if (fire && roleOf(p) === 'elder' && h.firewood > 0) {
    claimTend(ctx, p, ag, fire)
    return
  }
  // a shore trip can't wait for the morning to finish
  if (p.look.sex === 'female' && roleOf(p) !== 'elder' && has(p, 'shellfish') && shoreBed(ctx)) {
    chooseDay(ctx, p, ag)
    return
  }
  setPlan(ctx, p, ag, 'hearth', seatPos(ctx, ag), { until: t + hours(0.25) })
}

function needsTending(ctx: SimCtx): string | null {
  const night = ctx.state.clock.daylight < 0.5
  for (const f of ctx.state.fires) {
    const fu = ctx.fuel[f.id]
    if (!fu || fu.tender) continue
    if (fu.fuel < (night ? 0.8 : 0.35)) return f.id
  }
  return null
}

function claimTend(ctx: SimCtx, p: SimPerson, ag: Agent, fireId: string): void {
  const f = ctx.state.fires.find((x) => x.id === fireId)
  const fu = ctx.fuel[fireId]
  if (!f || !fu) return
  fu.tender = p.id
  const spot = findWalkable(ctx, { x: f.x + 0.9, z: f.z + 0.9 }, 6)
  setPlan(ctx, p, ag, 'tend', spot, { targetId: fireId, until: null })
}

function releaseTend(ctx: SimCtx, p: SimPerson): void {
  for (const fu of Object.values(ctx.fuel)) if (fu.tender === p.id) fu.tender = null
}

/** what fits the period: plans that may carry on when the period changes */
function fits(plan: Plan, period: Period): boolean {
  switch (period) {
    case 'night':
      return plan.kind === 'sleep'
    case 'evening':
      return ['hearth', 'eat', 'story', 'sing', 'tend', 'deposit'].includes(plan.kind)
    case 'morning':
      return plan.kind !== 'sleep'
    case 'day':
      return plan.kind !== 'sleep' && plan.kind !== 'story' && plan.kind !== 'sing'
  }
}

function think(ctx: SimCtx, p: SimPerson, ag: Agent): void {
  const t = ctx.state.clock.t
  ag.nextThink = t + THINK_EVERY
  const period = periodOf(ctx, p)
  const plan = ag.plan
  if (plan && !fits(plan, period)) {
    releaseTend(ctx, p)
    ag.plan = null
  }
  // a shore window opening pulls foragers off low-stakes work
  if (ag.plan && period === 'day' && ['hearth', 'hides', 'corms', 'play'].includes(ag.plan.kind)) {
    const r = roleOf(p)
    if ((r === 'adult' || r === 'teen') && p.look.sex === 'female' && has(p, 'shellfish') && stockDays(ctx) < 2.5 && shoreBed(ctx)) {
      ag.plan = null
    }
    if (r === 'child' || r === 'toddler') {
      const m = motherOf(ctx, p)
      if (m && ctx.agents.get(m.id)?.plan?.kind === 'shore') ag.plan = null
    }
  }
  if (ag.plan) return
  switch (period) {
    case 'night': {
      const { rise } = sunTimes(ctx, ctx.state.clock.dayOfYear)
      const wake = wakeHour(p, rise)
      const h = ctx.state.clock.hour
      const until = t + hours(h < 12 ? wake - h : 24 - h + wake)
      setPlan(ctx, p, ag, 'sleep', bedPos(ctx, ag), { until })
      return
    }
    case 'evening':
      chooseEvening(ctx, p, ag)
      return
    case 'morning':
      chooseMorning(ctx, p, ag)
      return
    case 'day':
      if (roleOf(p) === 'adult' || roleOf(p) === 'teen' || roleOf(p) === 'elder') {
        const fire = needsTending(ctx)
        if (fire && inCamp(ctx, p) && ctx.state.hearth.firewood > 0) {
          claimTend(ctx, p, ag, fire)
          return
        }
      }
      chooseDay(ctx, p, ag)
      return
  }
}

// ─── movement ───────────────────────────────────────────────────────────────────────────────────────────────

type Travel = 'moving' | 'arrived' | 'failed'

/** walk the plan's path toward dest */
function travel(ctx: SimCtx, p: SimPerson, ag: Agent, dest: Vec2, speed: number, dt: number): Travel {
  if (ag.path.length === 0 && !ag.pathReq) {
    if (dist(p.position, dest) < 0.4) return 'arrived'
    const sea = ctx.state.clock.seaLevel
    if (dist(p.position, dest) < 14 && ctx.paths.lineClear(p.position, dest, sea)) ag.path = [{ x: dest.x, z: dest.z }]
    else ag.pathReq = ctx.paths.request(p.position, dest, sea)
  }
  if (ag.pathReq) {
    if (!ag.pathReq.done) {
      p.speed = 0
      return 'moving'
    }
    if (ag.pathReq.failed) {
      // no way there from here: never walk through cliffs or the sea
      ag.pathReq = null
      p.speed = 0
      return 'failed'
    }
    ag.path = ag.pathReq.path
    ag.pathReq = null
  }
  let budget = speed * dt
  while (budget > 0 && ag.path.length > 0) {
    const wp = ag.path[0]
    if (!wp) break
    const d = dist(p.position, wp)
    if (d <= budget) {
      p.position.x = wp.x
      p.position.z = wp.z
      budget -= d
      ag.path.shift()
    } else {
      p.heading = headingTo(p.position, wp)
      p.position.x += Math.sin(p.heading) * budget
      p.position.z += Math.cos(p.heading) * budget
      budget = 0
    }
  }
  p.speed = speed
  if (ag.path.length === 0) {
    p.speed = 0
    return 'arrived'
  }
  return 'moving'
}

function abandon(ctx: SimCtx, p: SimPerson, ag: Agent): void {
  if (ag.plan?.kind === 'hunt') ag.dayChoice = { day: ctx.state.clock.day, kind: 'knap' }
  releaseTend(ctx, p)
  ag.plan = null
  ag.nextThink = ctx.state.clock.t + 60
}

// ─── work ───────────────────────────────────────────────────────────────────────────────────────────────────

type Look = { task: TaskKind; anim: PersonAnim; skill: SkillId | null; right: HeldItem; left: HeldItem }

const WORK: Record<PlanKind, Look> = {
  sleep: { task: 'sleep', anim: 'sleep', skill: null, right: 'none', left: 'none' },
  shore: { task: 'gather-shellfish', anim: 'gather', skill: 'shellfish', right: 'shell', left: 'bag' },
  corms: { task: 'dig-corms', anim: 'dig', skill: 'corms', right: 'digging-stick', left: 'none' },
  hunt: { task: 'track', anim: 'crouch', skill: 'tracking', right: 'spear', left: 'none' },
  stone: { task: 'knap', anim: 'knap', skill: 'knapping', right: 'stone', left: 'none' },
  knap: { task: 'knap', anim: 'knap', skill: 'knapping', right: 'stone', left: 'stone' },
  wood: { task: 'fetch-wood', anim: 'gather', skill: null, right: 'firewood', left: 'none' },
  play: { task: 'play', anim: 'run', skill: null, right: 'none', left: 'none' },
  hearth: { task: 'socialize', anim: 'sit', skill: null, right: 'none', left: 'none' },
  eat: { task: 'eat', anim: 'eat', skill: null, right: 'none', left: 'none' },
  story: { task: 'tell-story', anim: 'talk', skill: 'stories', right: 'none', left: 'none' },
  sing: { task: 'sing', anim: 'sit', skill: null, right: 'none', left: 'none' },
  follow: { task: 'follow', anim: 'idle', skill: null, right: 'none', left: 'none' },
  tend: { task: 'tend-fire', anim: 'tend-fire', skill: 'fire', right: 'firewood', left: 'none' },
  deposit: { task: 'walk-to', anim: 'idle', skill: null, right: 'none', left: 'none' },
  hides: { task: 'idle', anim: 'scrape', skill: 'hides', right: 'stone', left: 'none' },
}

function carriedItem(ag: Agent, fallback: HeldItem): HeldItem {
  const l = ag.load
  if (l.meat > 0) return 'meat'
  if (l.firewood > 0) return 'firewood'
  if (l.corms > 0) return 'corm'
  if (l.silcrete > 0) return 'stone'
  return fallback
}

function setLook(ctx: SimCtx, p: SimPerson, ag: Agent, plan: Plan): void {
  const w = WORK[plan.kind]
  const working = plan.phase === 'work'
  if (working && plan.kind === 'hunt' && (plan.hunt?.stage === 'chase' || plan.hunt?.stage === 'butcher')) {
    // the chase and the butchering set their own task and pose
    p.held.right = 'spear'
    return
  }
  if (working && plan.kind === 'shore' && plan.targetId && !bedOut(ctx, ctx.world.poi(plan.targetId))) {
    // waiting on the upper rocks for the sea to fall
    p.task = { kind: 'idle', targetId: plan.targetId, target: plan.dest, until: null, skill: null }
    p.anim = 'idle'
    p.held.left = 'bag'
    return
  }
  if (working) {
    p.task = { kind: w.task, targetId: plan.targetId, target: plan.dest, until: plan.until, skill: w.skill }
    if (p.speed > 0) p.anim = p.speed > 2 ? 'run' : 'walk'
    else p.anim = w.anim
    p.held.right = w.right
    p.held.left = loadTotal(ag) > 0 && w.left === 'none' ? carriedItem(ag, 'none') : w.left
  } else {
    const kind: TaskKind = plan.kind === 'follow' ? 'follow' : plan.kind === 'hunt' ? 'hunt' : 'walk-to'
    p.task = { kind, targetId: plan.targetId, target: plan.dest, until: null, skill: null }
    p.anim = p.speed > 2 ? 'run' : p.speed > 0 ? 'walk' : 'idle'
    p.held.right = plan.kind === 'hunt' ? 'spear' : plan.kind === 'corms' ? 'digging-stick' : carriedItem(ag, 'none')
    p.held.left = plan.kind === 'shore' ? 'bag' : 'none'
  }
  // a mother carrying an infant keeps it on her back, or in her arms while she sleeps
  if (p.carrying) p.carrying.slot = plan.kind === 'sleep' && working ? 'arms' : 'back'
  // the talking layer: storytellers and singers
  if (working && (plan.kind === 'story' || plan.kind === 'sing') && !p.speech) {
    p.speech = { text: plan.kind === 'story' ? '…' : '♪', until: ctx.state.clock.t + 60 }
  }
}

function work(ctx: SimCtx, p: SimPerson, ag: Agent, plan: Plan, dt: number): void {
  const t = ctx.state.clock.t
  const rng = ctx.rng
  if (plan.tick === 0) plan.tick = t
  switch (plan.kind) {
    case 'sleep':
    case 'hearth':
    case 'hides':
    case 'story':
    case 'sing':
      if (plan.until !== null && t >= plan.until) ag.plan = null
      return
    case 'eat': {
      if (ag.mealDay !== ctx.state.clock.day && plan.until !== null && plan.until - t > hours(0.2)) eat(ctx, p, ag)
      if (plan.until !== null && t >= plan.until) ag.plan = null
      return
    }
    case 'shore': {
      const bed = plan.targetId ? ctx.world.poi(plan.targetId) : null
      const { set } = sunTimes(ctx, ctx.state.clock.dayOfYear)
      const out = bed ? bedOut(ctx, bed) : false
      // wait on the upper rocks if the bed is about to come out
      const worthWaiting = bed && !out && bedWorthGoing(ctx, bed, 0.6, 0.4)
      if (!bed || (!out && !worthWaiting) || ag.load.shellfish >= 60 || ctx.state.clock.hour > set - 1) {
        setPlan(ctx, p, ag, 'deposit', seatPos(ctx, ag))
        return
      }
      if (plan.shuffle) {
        // shift along the rocks without stopping work
        const d = dist(p.position, plan.shuffle)
        const step = 0.6 * dt
        if (d <= step) {
          p.position.x = plan.shuffle.x
          p.position.z = plan.shuffle.z
          plan.shuffle = null
          p.speed = 0
        } else {
          p.heading = headingTo(p.position, plan.shuffle)
          p.position.x += Math.sin(p.heading) * step
          p.position.z += Math.cos(p.heading) * step
          p.speed = 0.6
        }
        return
      }
      p.speed = 0
      if (!out) {
        plan.tick = t
        return
      }
      while (t >= plan.tick) {
        plan.tick += rng.range(150, 210)
        ag.load.shellfish++
        if (rng.chance(0.15)) {
          const q = scatter(ctx, bed, bed.radius * 0.8)
          if (dist(q, p.position) < 8 && ctx.paths.lineClear(p.position, q, ctx.state.clock.seaLevel)) plan.shuffle = q
        }
      }
      return
    }
    case 'corms': {
      while (t >= plan.tick) {
        plan.tick += rng.range(480, 840)
        ag.load.corms++
      }
      if ((plan.until !== null && t >= plan.until) || ag.load.corms >= 14) setPlan(ctx, p, ag, 'deposit', seatPos(ctx, ag))
      return
    }
    case 'wood': {
      if (plan.until === null) plan.until = t + rng.range(1500, 2700)
      if (t >= plan.until) {
        ag.load.firewood += 8
        setPlan(ctx, p, ag, 'deposit', seatPos(ctx, ag))
      }
      return
    }
    case 'stone': {
      if (plan.until === null) plan.until = t + rng.range(3600, 5400)
      if (t >= plan.until) {
        ag.load.silcrete += 3
        setPlan(ctx, p, ag, 'knap', seatPos(ctx, ag, 1.3), { until: t + hours(5) })
      }
      return
    }
    case 'knap':
      if (plan.until !== null && t >= plan.until) {
        ag.load.silcrete = 0
        ag.plan = null
      }
      return
    case 'tend': {
      const fu = plan.targetId ? ctx.fuel[plan.targetId] : undefined
      if (plan.until === null) {
        plan.until = t + 600
        if (fu) {
          let added = 0
          while (fu.fuel < 1.1 && ctx.state.hearth.firewood > 0 && added < 4) {
            fu.fuel += 0.3
            ctx.state.hearth.firewood--
            added++
          }
          if (added > 0) ctx.events.push({ type: 'sfx', name: 'fire-flare', at: { x: plan.dest.x, z: plan.dest.z } })
        }
      }
      if (t >= plan.until) {
        if (fu) fu.tender = null
        ag.plan = null
      }
      return
    }
    case 'play': {
      if (plan.until !== null && t >= plan.until) {
        ag.plan = null
        return
      }
      // run about the dunes: short dashes between nearby points
      const target = plan.targetId === 'dash' ? plan.dest : null
      if (!target || dist(p.position, target) < 0.5) {
        const centre = ctx.world.poi('play-dunes')
        const q = scatter(ctx, centre, centre.radius * 0.8)
        if (ctx.paths.lineClear(p.position, q, ctx.state.clock.seaLevel)) {
          plan.dest = q
          plan.targetId = 'dash'
        }
        p.speed = 0
        return
      }
      const step = 2.6 * dt
      const d = dist(p.position, target)
      p.heading = headingTo(p.position, target)
      const k = Math.min(1, step / d)
      p.position.x += (target.x - p.position.x) * k
      p.position.z += (target.z - p.position.z) * k
      p.speed = 2.6
      return
    }
    case 'follow':
    case 'deposit':
      ag.plan = null
      return
    case 'hunt':
      hunt(ctx, p, ag, plan, dt)
      return
  }
}

function eat(ctx: SimCtx, p: SimPerson, ag: Agent): void {
  const h = ctx.state.hearth
  ag.mealDay = ctx.state.clock.day
  // share what is there among those who haven't eaten yet today
  let waiting = 0
  for (const q of ctx.state.people) {
    if (!q.alive || q.carriedBy || roleOf(q) === 'infant') continue
    const qa = ctx.agents.get(q.id)
    if (qa && qa.mealDay !== ctx.state.clock.day) waiting++
  }
  const total = h.meat * FOOD_VALUE.meat + h.corms * FOOD_VALUE.corms + h.shellfish * FOOD_VALUE.shellfish
  let want = Math.min(Math.max(0, 1 - p.needs.fed), total / (waiting + 1))
  const take = (key: 'meat' | 'corms' | 'shellfish') => {
    const value = FOOD_VALUE[key]
    const units = Math.min(h[key], Math.ceil(want / value))
    h[key] -= units
    want -= units * value
    p.needs.fed = Math.min(1, p.needs.fed + units * value)
  }
  // shellfish first, they spoil soonest; corms keep
  take('shellfish')
  if (want > 0) take('meat')
  if (want > 0) take('corms')
}

function hunt(ctx: SimCtx, p: SimPerson, ag: Agent, plan: Plan, dt: number): void {
  const t = ctx.state.clock.t
  const hs = plan.hunt
  const herd = ctx.herds[0]
  if (!hs || !herd) {
    ag.plan = null
    return
  }
  const { set } = sunTimes(ctx, ctx.state.clock.dayOfYear)
  const giveUp = () => {
    ag.dayChoice = { day: ctx.state.clock.day, kind: 'knap' }
    setPlan(ctx, p, ag, 'hearth', seatPos(ctx, ag), { until: t + hours(0.3) })
  }
  const stage = (s: HuntStage) => {
    hs.stage = s
  }
  switch (hs.stage) {
    case 'stage': {
      // arrived downwind of the herd: read the ground and wait for the herd to settle, then stalk
      if (plan.until === null) plan.until = t + ctx.rng.range(1800, 4200)
      p.speed = 0
      if (t >= plan.until) {
        plan.until = null
        stage('stalk')
      }
      return
    }
    case 'stalk': {
      if (hs.attempts >= 3 || ctx.state.clock.hour > set - 2.5) return giveUp()
      let target = null
      let best = Infinity
      for (const a of ctx.state.animals) {
        if (a.herdId !== herd.id || !a.alive || a.wounded) continue
        const d = dist(p.position, a.position)
        if (d < best) {
          best = d
          target = a
        }
      }
      if (!target) return giveUp()
      const brain = ctx.brains.get(target.id)
      if (brain?.mode === 'flee') {
        hs.attempts++
        plan.phase = 'go'
        plan.dest = stagingPoint(ctx, herd.center, ag)
        hs.stage = 'stage'
        plan.until = null
        ag.path = []
        return
      }
      plan.targetId = target.id
      // the first hunter of the party throws; the others hold still
      const lead = [...ctx.agents.values()].find((o) => o.plan?.kind === 'hunt' && o.plan.hunt?.stage === 'stalk')
      if (best <= 22 && lead === ag) {
        p.anim = 'throw'
        if (ctx.rng.chance(0.15)) {
          woundAnimal(ctx, target.id, p.position)
          for (const other of ctx.agents.values()) {
            const op = other.plan
            if (op?.kind === 'hunt' && op.hunt) {
              op.hunt.stage = 'chase'
              op.targetId = target.id
              op.phase = 'work'
              other.path = []
            }
          }
        } else {
          startleHerd(ctx, herd, p.position)
          hs.attempts++
        }
        return
      }
      if (best <= 30 && lead !== ag) {
        p.speed = 0
        return
      }
      const step = 0.3 * dt
      p.heading = headingTo(p.position, target.position)
      const nx = p.position.x + Math.sin(p.heading) * step
      const nz = p.position.z + Math.cos(p.heading) * step
      if (ctx.paths.passableAt(nx, nz, ctx.state.clock.seaLevel)) {
        p.position.x = nx
        p.position.z = nz
      }
      p.speed = 0.3
      return
    }
    case 'chase': {
      const a = ctx.state.animals.find((x) => x.id === plan.targetId)
      if (!a) return giveUp()
      if (dist(p.position, a.position) > 3) {
        if (!ag.path.length && !ag.pathReq) ag.path = [{ x: a.position.x, z: a.position.z }]
        const last = ag.path[ag.path.length - 1]
        if (last && dist(last, a.position) > 6) ag.path = [{ x: a.position.x, z: a.position.z }]
        if (travel(ctx, p, ag, a.position, 2.6, dt) === 'failed') return giveUp()
        p.task = { kind: 'hunt', targetId: a.id, target: { ...a.position }, until: null, skill: null }
        p.anim = 'run'
        return
      }
      if (!a.alive) {
        hs.stage = 'butcher'
        plan.until = t + hours(0.75)
      }
      p.speed = 0
      return
    }
    case 'butcher': {
      p.task = { kind: 'hunt', targetId: plan.targetId, target: plan.dest, until: plan.until, skill: 'hides' }
      p.anim = 'crouch'
      if (plan.until !== null && t >= plan.until) {
        const party = [...ctx.agents.values()].filter((o) => o.plan?.kind === 'hunt' && o.plan.targetId === plan.targetId)
        const share = Math.floor(ELAND_MEAT / Math.max(1, party.length))
        for (const o of party) {
          o.load.meat += share
          o.dayChoice = { day: ctx.state.clock.day, kind: 'knap' }
          const op = ctx.state.people.find((q) => q.id === o.id)
          if (op) setPlan(ctx, op, o, 'deposit', seatPos(ctx, o))
        }
        if (plan.targetId) removeAnimal(ctx, plan.targetId)
      }
      return
    }
  }
}

// ─── the step ───────────────────────────────────────────────────────────────────────────────────────────────

function deposit(ctx: SimCtx, p: SimPerson, ag: Agent): void {
  if (loadTotal(ag) === 0 || dist(p.position, hearth(ctx)) > 10) return
  const h = ctx.state.hearth
  h.shellfish += ag.load.shellfish
  h.corms += ag.load.corms
  h.meat += ag.load.meat
  h.firewood += ag.load.firewood
  ag.load = { shellfish: 0, corms: 0, meat: 0, firewood: 0, silcrete: ag.load.silcrete }
}

export function updatePerson(ctx: SimCtx, p: SimPerson, ag: Agent, dt: number): void {
  const t = ctx.state.clock.t
  if (p.speech && p.speech.until < t) p.speech = null
  if (!ag.plan || t >= ag.nextThink) think(ctx, p, ag)
  const plan = ag.plan
  if (!plan) return

  if (plan.kind === 'follow') {
    const leader = ctx.state.people.find((q) => q.id === plan.targetId)
    const la = leader ? ctx.agents.get(leader.id) : undefined
    if (!leader || !la || (inCamp(ctx, leader) && inCamp(ctx, p)) || la.plan?.kind === 'sleep') {
      ag.plan = null
      return
    }
    // keep close: re-aim when the leader has moved on
    if (dist(plan.dest, leader.position) > 6) {
      plan.dest = { x: leader.position.x, z: leader.position.z }
      ag.path = []
      if (ag.pathReq) ctx.paths.cancel(ag.pathReq)
      ag.pathReq = null
    }
    const near = dist(p.position, leader.position) < 3.5
    if (!near && travel(ctx, p, ag, plan.dest, walkSpeed(p) * 1.15, dt) === 'failed') {
      abandon(ctx, p, ag)
      return
    }
    if (near) p.speed = 0
    const bedId = la.plan?.kind === 'shore' && la.plan.phase === 'work' ? la.plan.targetId : null
    const gathering = near && bedId !== null && bedOut(ctx, ctx.world.poi(bedId))
    if (gathering && has(p, 'shellfish')) {
      p.task = { kind: 'gather-shellfish', targetId: bedId, target: null, until: null, skill: 'shellfish' }
      p.anim = 'gather'
      p.held.right = 'shell'
      if (ctx.rng.chance(dt / 200)) ag.load.shellfish++
    } else {
      p.task = { kind: 'follow', targetId: leader.id, target: { ...leader.position }, until: null, skill: null }
      p.anim = p.speed > 0 ? 'walk' : gathering ? 'crouch' : 'idle'
      p.held.right = 'none'
    }
    p.lookAt = null
    deposit(ctx, p, ag)
    return
  }

  if (plan.phase === 'go') {
    const speed = plan.kind === 'hunt' && plan.hunt?.stage === 'chase' ? 2.6 : walkSpeed(p)
    const went = travel(ctx, p, ag, plan.dest, speed, dt)
    if (went === 'failed') {
      abandon(ctx, p, ag)
      return
    }
    if (went === 'arrived') {
      plan.phase = 'work'
      plan.tick = 0
      if (plan.kind === 'sleep' || plan.kind === 'hearth' || plan.kind === 'eat' || plan.kind === 'story') {
        p.heading = headingTo(p.position, hearth(ctx))
      }
    }
  } else {
    work(ctx, p, ag, plan, dt)
  }
  const current = ag.plan
  if (current) setLook(ctx, p, ag, current)
  deposit(ctx, p, ag)
}

/** carried infants ride with their carrier */
export function syncCarried(ctx: SimCtx, p: SimPerson): void {
  const c = p.carriedBy ? ctx.state.people.find((q) => q.id === p.carriedBy) : undefined
  if (!c) return
  p.position.x = c.position.x
  p.position.z = c.position.z
  p.heading = c.heading
  p.speed = c.speed
  const asleep = c.task.kind === 'sleep'
  p.anim = asleep ? 'sleep' : 'held'
  p.task = { kind: asleep ? 'sleep' : 'idle', targetId: c.id, target: null, until: null, skill: null }
}
