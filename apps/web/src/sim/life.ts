/**
 * The body and the band: needs (fed, warmth, energy, health), the hearth fires and their fuel, learning by
 * watching, bonds with the player, faces learned by gazing, and ages that keep up with the calendar.
 */
import type { SimPerson, SkillId, Vec2 } from '../game/contracts'
import { LEARN_SECONDS, SKILL_LABEL, SKILL_MIN_AGE, WATCH_RADIUS, type Agent, type SimCtx } from './ctx'

const DAY = 86_400
const FACE_SECONDS = 1.5
const NPC_LEARN_MAX_AGE = 20

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

// ─── fires ──────────────────────────────────────────────────────────────────────────────────────────────────

export function updateFires(ctx: SimCtx, dt: number): void {
  const night = ctx.state.clock.daylight < 0.5
  for (const f of ctx.state.fires) {
    const fu = ctx.fuel[f.id]
    if (!fu) continue
    // a big fire at night, coals by day
    const burn = (night ? 0.09 : 0.035) / 3600
    fu.fuel = Math.max(0, fu.fuel - burn * dt)
    const target = fu.fuel <= 0 ? 0 : Math.min(1, 0.2 + fu.fuel * 0.8) * (night ? 1 : 0.55)
    f.intensity += (target - f.intensity) * Math.min(1, dt / 120)
    if (f.intensity < 0.01 && fu.fuel <= 0) f.intensity = 0
  }
}

function nearestFire(ctx: SimCtx, p: Vec2): { d: number; intensity: number } {
  let d = Infinity
  let intensity = 0
  for (const f of ctx.state.fires) {
    if (f.intensity < 0.05) continue
    const fd = dist(f, p)
    if (fd < d) {
      d = fd
      intensity = f.intensity
    }
  }
  return { d, intensity }
}

/** once an hour: shellfish spoil within a day or two, meat a little slower, corms keep */
export function spoil(ctx: SimCtx): void {
  const h = ctx.state.hearth
  h.shellfish = Math.round(h.shellfish * 0.975)
  h.meat = Math.round(h.meat * 0.985)
  h.corms = Math.round(h.corms * 0.9985)
}

// ─── needs ──────────────────────────────────────────────────────────────────────────────────────────────────

export function updateNeeds(ctx: SimCtx, p: SimPerson, dt: number): void {
  const n = p.needs
  const { clock, weather } = ctx.state
  const asleep = p.task.kind === 'sleep'
  const busy = p.speed > 0 || ['gather-shellfish', 'dig-corms', 'fetch-wood', 'hunt', 'track', 'play'].includes(p.task.kind)

  if (p.carriedBy) {
    // carried infants nurse and stay warm against the carrier
    n.fed = clamp01(n.fed + (0.9 - n.fed) * Math.min(1, dt / 3600))
    const c = ctx.state.people.find((q) => q.id === p.carriedBy)
    n.warmth = Math.max(c ? c.needs.warmth : 0.7, 0.6)
    n.energy = clamp01(n.energy + (asleep ? dt / (8 * 3600) : -dt / (14 * 3600)))
    return
  }

  n.fed = clamp01(n.fed - (0.5 / DAY) * dt * (busy ? 1.3 : 1) * (p.look.ageYears < 13 ? 1.1 : 1))
  if (asleep) n.energy = clamp01(n.energy + dt / (6.5 * 3600))
  else n.energy = clamp01(n.energy - (0.7 / (16 * 3600)) * dt * (p.speed > 2 ? 2 : busy ? 1.3 : 1))

  const inCave = ctx.world.inCave(p.position.x, p.position.z)
  const cold = clock.season === 'winter' ? 0.15 : clock.season === 'summer' ? -0.1 : 0
  let target = clock.daylight * 0.85 + (1 - clock.daylight) * 0.35 - cold
  if (inCave) target += 0.2
  else target -= weather.rain * 0.3 + weather.wind * 0.15
  if (asleep && inCave) target += 0.1
  const fire = nearestFire(ctx, p.position)
  if (fire.d < 7) target = Math.max(target, 0.55 + 0.45 * fire.intensity)
  n.warmth = clamp01(n.warmth + (clamp01(target) - n.warmth) * Math.min(1, dt / 2400))

  const suffering = n.fed < 0.12 || n.warmth < 0.15
  n.health = clamp01(n.health + (suffering ? -dt / (3 * DAY) : dt / (2 * DAY)))
}

// ─── ages ───────────────────────────────────────────────────────────────────────────────────────────────────

export function updateAge(ctx: SimCtx, p: SimPerson): void {
  p.look.ageYears = Math.max(0, (ctx.state.clock.t / DAY - p.birthDay) / 365)
}

// ─── learning by watching ───────────────────────────────────────────────────────────────────────────────────

export function learn(ctx: SimCtx, p: SimPerson, skill: SkillId, fromId: string | null): void {
  if (p.skills.includes(skill)) return
  p.skills.push(skill)
  ctx.events.push({ type: 'learned', personId: p.id, skill, fromId })
  if (p.isPlayer) ctx.events.push({ type: 'sfx', name: 'learn', at: null })
}

function teacherFor(ctx: SimCtx, p: SimPerson): { teacher: SimPerson; skill: SkillId } | null {
  let best: { teacher: SimPerson; skill: SkillId } | null = null
  let bestD = WATCH_RADIUS
  for (const q of ctx.state.people) {
    if (q === p || !q.alive) continue
    const skill = q.task.skill
    if (!skill || p.skills.includes(skill) || p.look.ageYears < SKILL_MIN_AGE[skill]) continue
    // grown people in the band keep their own crafts; the young and the player learn by watching
    if (!p.isPlayer && p.look.ageYears >= NPC_LEARN_MAX_AGE) continue
    const d = dist(p.position, q.position)
    if (d <= bestD) {
      bestD = d
      best = { teacher: q, skill }
    }
  }
  return best
}

/** dtReal: real seconds (learning runs on the player's clock, not the game's) */
export function updateLearning(ctx: SimCtx, realDt: number): void {
  const state = ctx.state
  for (const p of state.people) {
    if (!p.alive || p.carriedBy || p.task.kind === 'sleep') {
      if (p.isPlayer) state.watching = null
      continue
    }
    const ag = ctx.agents.get(p.id)
    if (!ag) continue
    const found = teacherFor(ctx, p)
    if (!found) {
      if (p.isPlayer) state.watching = null
      continue
    }
    const progress = (ag.learn[found.skill] ?? 0) + realDt / LEARN_SECONDS
    ag.learn[found.skill] = progress
    if (p.isPlayer) state.watching = { personId: found.teacher.id, skill: found.skill, progress: Math.min(1, progress) }
    if (progress >= 1) {
      learn(ctx, p, found.skill, found.teacher.id)
      delete ag.learn[found.skill]
      if (p.isPlayer) state.watching = null
    }
  }
}

export function skillLabel(skill: SkillId): string {
  return SKILL_LABEL[skill]
}

// ─── bonds and faces ────────────────────────────────────────────────────────────────────────────────────────

export function updateBonds(ctx: SimCtx, dt: number): void {
  const player = ctx.state.people.find((p) => p.isPlayer)
  if (!player) return
  for (const p of ctx.state.people) {
    if (p.isPlayer || !p.alive) continue
    if (dist(p.position, player.position) < 5) p.bond = clamp01(p.bond + (0.006 / 3600) * dt)
  }
}

export function addBond(ctx: SimCtx, p: SimPerson, delta: number): void {
  p.bond = clamp01(p.bond + delta)
  ctx.events.push({ type: 'bond', personId: p.id, value: p.bond })
}

export function gaze(ctx: SimCtx, personId: string | null, dt: number): void {
  if (!personId) return
  const p = ctx.state.people.find((q) => q.id === personId)
  const ag = ctx.agents.get(personId)
  if (!p || !ag || p.known) return
  ag.gaze += dt
  if (ag.gaze >= FACE_SECONDS) {
    p.known = true
    ctx.events.push({ type: 'face-learned', personId })
  }
}

export function agentOf(ctx: SimCtx, id: string): Agent | undefined {
  return ctx.agents.get(id)
}
