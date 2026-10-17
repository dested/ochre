/**
 * The animals: an eland herd on the plateau that smells people upwind at 40 m and sees them downwind at 15 m,
 * seals on their rocks, gulls over the shore, two hyenas that come near the cave at night but keep off the fire,
 * and tortoises in the fynbos. Wounded eland run, then fall.
 */
import type { AnimalKind, SimAnimal, SimPerson, Vec2 } from '../game/contracts'
import { moveDt, type AnimalBrain, type Herd, type SimCtx } from './ctx'

const ELAND_SPOOK_UPWIND = 40
const ELAND_SPOOK_DOWNWIND = 15
const FIRE_FEAR = 28

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** heading (0 = +Z, π/2 = +X) of the vector from a to b */
export function headingTo(a: Vec2, b: Vec2): number {
  return Math.atan2(b.x - a.x, b.z - a.z)
}

export function windVector(dir: number): Vec2 {
  return { x: Math.sin(dir), z: Math.cos(dir) }
}

/** a walkable point near `p`, trying rings out to `radius` metres */
export function findWalkable(ctx: SimCtx, p: Vec2, radius: number): Vec2 {
  const sea = ctx.state.clock.seaLevel
  if (ctx.paths.passableAt(p.x, p.z, sea)) return { x: p.x, z: p.z }
  for (let r = 4; r <= radius; r += 4) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r }
      if (ctx.paths.passableAt(q.x, q.z, sea)) return q
    }
  }
  return { x: p.x, z: p.z }
}

function addAnimal(ctx: SimCtx, kind: AnimalKind, pos: Vec2, herdId: string | null, brain: Partial<AnimalBrain> = {}): SimAnimal {
  const id = `${kind}-${ctx.nextAnimalId++}`
  const a: SimAnimal = {
    id,
    kind,
    position: { x: pos.x, z: pos.z },
    altitude: 0,
    heading: ctx.rng.range(0, Math.PI * 2),
    speed: 0,
    anim: 'idle',
    alive: true,
    wounded: false,
    herdId,
  }
  ctx.state.animals.push(a)
  ctx.brains.set(id, { id, mode: 'calm', target: null, until: 0, home: { x: pos.x, z: pos.z }, orbit: null, ...brain })
  return a
}

export function spawnAnimals(ctx: SimCtx): void {
  const { world, rng } = ctx
  // eland
  const range = world.poi('eland-plateau')
  const center = findWalkable(ctx, { x: range.x, z: range.z }, 80)
  const herd: Herd = { id: 'herd-1', center: { ...center }, home: { ...center }, settleAt: 0 }
  ctx.herds.push(herd)
  const n = rng.int(8, 14)
  for (let i = 0; i < n; i++) {
    const p = findWalkable(ctx, { x: center.x + rng.range(-25, 25), z: center.z + rng.range(-25, 25) }, 30)
    addAnimal(ctx, 'eland', p, herd.id)
  }
  // seals on their rocks
  const rocks = world.poi('seal-rocks')
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const r = rocks.radius * rng.range(0.2, 0.7)
    addAnimal(ctx, 'seal', { x: rocks.x + Math.cos(a) * r, z: rocks.z + Math.sin(a) * r }, null)
  }
  // gulls over the shore
  const shore = world.poi('shore-mussels')
  for (let i = 0; i < 8; i++) {
    const g = addAnimal(ctx, 'gull', { x: shore.x, z: shore.z }, null, {
      orbit: { x: shore.x + rng.range(-60, 60), z: shore.z + rng.range(-30, 30), r: rng.range(25, 70), dir: rng.chance(0.5) ? 1 : -1 },
    })
    g.altitude = rng.range(10, 25)
    g.anim = 'fly'
  }
  // hyenas: a den well back from the cave, north-west on the plateau
  const cave = world.poi('cave-mouth')
  const den = findWalkable(ctx, { x: cave.x - 380, z: cave.z - 330 }, 120)
  for (let i = 0; i < 2; i++) addAnimal(ctx, 'hyena', { x: den.x + i * 3, z: den.z + i * 2 }, null, { home: den })
  // tortoises in the fynbos near the corm slope
  const corms = world.poi('corm-slope')
  for (let i = 0; i < 4; i++) {
    const p = findWalkable(ctx, { x: corms.x + rng.range(-70, 70), z: corms.z + rng.range(-60, 20) }, 30)
    addAnimal(ctx, 'tortoise', p, null)
  }
}

/** move toward the brain's target; returns true on arrival. Land animals stay on walkable ground. */
function moveToward(ctx: SimCtx, a: SimAnimal, b: AnimalBrain, speed: number, dt: number, land: boolean): boolean {
  if (!b.target) return true
  const d = dist(a.position, b.target)
  const step = speed * dt
  if (d <= Math.max(0.3, step)) {
    a.position.x = b.target.x
    a.position.z = b.target.z
    a.speed = 0
    return true
  }
  const h = headingTo(a.position, b.target)
  const sea = ctx.state.clock.seaLevel
  for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
    const hh = h + off
    const nx = a.position.x + Math.sin(hh) * step
    const nz = a.position.z + Math.cos(hh) * step
    if (!land || ctx.paths.passableAt(nx, nz, sea)) {
      a.position.x = nx
      a.position.z = nz
      a.heading = hh
      a.speed = speed
      return false
    }
  }
  a.speed = 0
  b.target = null
  return true
}

function lit(ctx: SimCtx): { x: number; z: number }[] {
  return ctx.state.fires.filter((f) => f.intensity > 0.15)
}

function threatTo(ctx: SimCtx, e: SimAnimal, people: readonly SimPerson[]): SimPerson | null {
  const w = windVector(ctx.state.weather.windDir)
  for (const p of people) {
    if (!p.alive || p.carriedBy) continue
    const dx = e.position.x - p.position.x
    const dz = e.position.z - p.position.z
    const d = Math.hypot(dx, dz)
    if (d > ELAND_SPOOK_UPWIND) continue
    // the person is upwind when the wind carries from them toward the eland
    const upwind = d > 0.01 && (dx * w.x + dz * w.z) / d > 0.3
    if (d < (upwind ? ELAND_SPOOK_UPWIND : ELAND_SPOOK_DOWNWIND)) return p
  }
  return null
}

/** the whole herd bolts away from `from` */
export function startleHerd(ctx: SimCtx, herd: Herd, from: Vec2): void {
  const t = ctx.state.clock.t
  const away = headingTo(from, herd.center)
  const sea = ctx.state.clock.seaLevel
  const lim = ctx.world.size / 2 - 30
  let target = { x: herd.center.x, z: herd.center.z }
  search: for (const run of [220, 150, 90]) {
    for (const off of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
      const x = herd.center.x + Math.sin(away + off) * run
      const z = herd.center.z + Math.cos(away + off) * run
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue
      if (!ctx.paths.passableAt(x, z, sea)) continue
      target = { x, z }
      break search
    }
  }
  herd.center = target
  herd.settleAt = t + 1800
  let snorted = false
  for (const a of ctx.state.animals) {
    if (a.herdId !== herd.id || !a.alive || a.wounded) continue
    const b = ctx.brains.get(a.id)
    if (!b) continue
    b.mode = 'flee'
    b.target = { x: target.x + ctx.rng.range(-20, 20), z: target.z + ctx.rng.range(-20, 20) }
    b.until = t + 300
    a.anim = 'run'
    if (!snorted) {
      ctx.events.push({ type: 'sfx', name: 'eland-snort', at: { x: a.position.x, z: a.position.z } })
      snorted = true
    }
  }
}

/** a spear lands: the eland runs away from the thrower, then falls */
export function woundAnimal(ctx: SimCtx, animalId: string, from: Vec2): boolean {
  const a = ctx.state.animals.find((x) => x.id === animalId)
  const b = ctx.brains.get(animalId)
  if (!a || !b || !a.alive || a.wounded) return false
  a.wounded = true
  const away = headingTo(from, a.position)
  const run = 90 + ctx.rng.range(0, 90)
  b.mode = 'wounded'
  b.target = findWalkable(ctx, { x: a.position.x + Math.sin(away) * run, z: a.position.z + Math.cos(away) * run }, 40)
  a.anim = 'run'
  ctx.events.push({ type: 'sfx', name: 'hit', at: { x: a.position.x, z: a.position.z } })
  const herd = ctx.herds.find((h) => h.id === a.herdId)
  if (herd) startleHerd(ctx, herd, from)
  return true
}

/** at dawn, a thinned herd is joined by eland from elsewhere */
export function replenishHerds(ctx: SimCtx): void {
  for (const herd of ctx.herds) {
    const alive = ctx.state.animals.filter((a) => a.herdId === herd.id && a.alive).length
    if (alive >= 8) continue
    const n = ctx.rng.int(1, 2)
    for (let i = 0; i < n; i++) {
      const p = findWalkable(ctx, { x: herd.home.x + ctx.rng.range(-40, 40), z: herd.home.z + ctx.rng.range(-40, 40) }, 30)
      addAnimal(ctx, 'eland', p, herd.id)
    }
  }
}

export function removeAnimal(ctx: SimCtx, id: string): void {
  const i = ctx.state.animals.findIndex((a) => a.id === id)
  if (i >= 0) ctx.state.animals.splice(i, 1)
  ctx.brains.delete(id)
}

/** dt: game seconds; realDt: real seconds (animals near the player move in real time) */
export function updateAnimals(ctx: SimCtx, dt: number, realDt: number): void {
  const { state, rng } = ctx
  const t = state.clock.t
  const night = state.clock.daylight < 0.15
  const people = state.people

  for (const herd of ctx.herds) {
    const members = state.animals.filter((a) => a.herdId === herd.id && a.alive && !a.wounded)
    if (members.length === 0) continue
    if (t > herd.settleAt) {
      // drift back toward the home range over the hours after a scare
      const d = dist(herd.center, herd.home)
      if (d > 60) {
        const k = Math.min(1, (0.05 * dt) / d)
        herd.center.x += (herd.home.x - herd.center.x) * k
        herd.center.z += (herd.home.z - herd.center.z) * k
      }
      for (const e of members) {
        const threat = threatTo(ctx, e, people)
        if (threat) {
          startleHerd(ctx, herd, threat.position)
          break
        }
      }
    }
  }

  for (const a of state.animals) {
    const b = ctx.brains.get(a.id)
    if (!b) continue
    const mdt = moveDt(ctx, a.position, dt, realDt)
    switch (a.kind) {
      case 'eland':
        updateEland(ctx, a, b, mdt, night)
        break
      case 'seal':
        updateSeal(ctx, a, b, mdt)
        break
      case 'gull':
        updateGull(ctx, a, b, mdt, night)
        break
      case 'hyena':
        updateHyena(ctx, a, b, mdt, night)
        break
      case 'tortoise':
        if (t > b.until || !b.target) {
          if (night || rng.chance(0.5)) {
            b.target = null
            a.anim = 'idle'
            a.speed = 0
          } else {
            b.target = findWalkable(ctx, { x: b.home.x + rng.range(-35, 35), z: b.home.z + rng.range(-35, 35) }, 10)
            a.anim = 'walk'
          }
          b.until = t + rng.range(600, 2400)
        }
        if (b.target && moveToward(ctx, a, b, 0.05, mdt, true)) {
          a.anim = 'idle'
          b.target = null
        }
        break
      case 'lion':
      case 'whale':
        break
    }
  }

  // dead eland that nobody butchered fade after a day and a half
  for (const a of [...state.animals]) {
    const b = ctx.brains.get(a.id)
    if (b && b.mode === 'dead' && t > b.until) removeAnimal(ctx, a.id)
  }
}

function updateEland(ctx: SimCtx, a: SimAnimal, b: AnimalBrain, dt: number, night: boolean): void {
  const t = ctx.state.clock.t
  const rng = ctx.rng
  switch (b.mode) {
    case 'flee':
      if (moveToward(ctx, a, b, 8, dt, true) || t > b.until) {
        b.mode = 'calm'
        b.target = null
        a.anim = 'alert'
        a.speed = 0
        b.until = t + 90
      }
      return
    case 'wounded':
      if (moveToward(ctx, a, b, 6, dt, true)) {
        b.mode = 'dying'
        a.anim = 'fall'
        a.speed = 0
        b.until = t + 5
      }
      return
    case 'dying':
      if (t > b.until) {
        b.mode = 'dead'
        a.alive = false
        a.anim = 'dead'
        b.until = t + 86_400 * 1.5
      }
      return
    case 'dead':
      return
    default:
      break
  }
  const herd = ctx.herds.find((h) => h.id === a.herdId)
  if (!herd) return
  if (t > b.until) {
    if (night && rng.chance(0.6)) {
      b.target = null
      a.anim = 'lie'
      a.speed = 0
      b.until = t + rng.range(1800, 5400)
    } else if (rng.chance(0.55)) {
      b.target = null
      a.anim = rng.chance(0.85) ? 'graze' : 'idle'
      a.speed = 0
      b.until = t + rng.range(120, 900)
    } else {
      b.target = findWalkable(ctx, { x: herd.center.x + rng.range(-28, 28), z: herd.center.z + rng.range(-28, 28) }, 12)
      a.anim = 'walk'
      b.until = t + 600
    }
  }
  if (b.target && moveToward(ctx, a, b, 0.9, dt, true)) {
    b.target = null
    a.anim = 'graze'
  }
}

function updateSeal(ctx: SimCtx, a: SimAnimal, b: AnimalBrain, dt: number): void {
  const t = ctx.state.clock.t
  const rng = ctx.rng
  const rocks = ctx.world.poi('seal-rocks')
  if (t > b.until) {
    if (b.mode === 'swim' || rng.chance(0.75)) {
      b.mode = 'calm'
      const ang = rng.range(0, Math.PI * 2)
      const r = rocks.radius * rng.range(0.1, 0.7)
      b.target = { x: rocks.x + Math.cos(ang) * r, z: rocks.z + Math.sin(ang) * r }
      b.until = t + rng.range(1200, 5400)
    } else {
      b.mode = 'swim'
      b.orbit = { x: rocks.x, z: rocks.z, r: rocks.radius + rng.range(8, 25), dir: rng.chance(0.5) ? 1 : -1 }
      b.until = t + rng.range(600, 1500)
    }
  }
  if (b.mode === 'swim' && b.orbit) {
    const o = b.orbit
    const ang = Math.atan2(a.position.z - o.z, a.position.x - o.x) + (o.dir * 1.6 * dt) / o.r
    const nx = o.x + Math.cos(ang) * o.r
    const nz = o.z + Math.sin(ang) * o.r
    a.heading = headingTo(a.position, { x: nx, z: nz })
    a.position.x = nx
    a.position.z = nz
    a.speed = 1.6
    a.anim = 'swim'
    return
  }
  if (b.target && !moveToward(ctx, a, b, 0.5, dt, false)) {
    a.anim = 'walk'
    return
  }
  b.target = null
  a.anim = ctx.state.clock.daylight > 0.5 ? 'lie' : 'idle'
}

function updateGull(ctx: SimCtx, a: SimAnimal, b: AnimalBrain, dt: number, night: boolean): void {
  const t = ctx.state.clock.t
  const rng = ctx.rng
  if (night && b.mode !== 'land') {
    const rocks = ctx.world.poi('seal-rocks')
    b.mode = 'land'
    b.target = { x: rocks.x + rng.range(-6, 6), z: rocks.z + rng.range(-6, 6) }
    b.until = Infinity
  }
  if (!night && b.mode === 'land' && b.until === Infinity) b.until = t + rng.range(60, 900)
  if (t > b.until) {
    if (b.mode === 'land') {
      b.mode = 'calm'
      b.until = t + rng.range(900, 3600)
    } else if (b.orbit) {
      // land on the shore under the circle for a while
      b.mode = 'land'
      b.target = { x: b.orbit.x + rng.range(-20, 20), z: b.orbit.z + rng.range(-15, 15) }
      b.until = t + rng.range(300, 1500)
      if (rng.chance(0.3)) ctx.events.push({ type: 'sfx', name: 'gull', at: { x: a.position.x, z: a.position.z } })
    }
  }
  if (b.mode === 'land') {
    if (b.target && !moveToward(ctx, a, b, 7, dt, false)) {
      a.altitude = Math.max(0, a.altitude - 4 * dt)
      a.anim = 'fly'
      return
    }
    a.altitude = Math.max(0, a.altitude - 4 * dt)
    a.anim = a.altitude > 0.1 ? 'fly' : 'idle'
    a.speed = 0
    return
  }
  const o = b.orbit
  if (!o) return
  const ang = Math.atan2(a.position.z - o.z, a.position.x - o.x) + (o.dir * 7 * dt) / o.r
  const nx = o.x + Math.cos(ang) * o.r
  const nz = o.z + Math.sin(ang) * o.r
  a.heading = headingTo(a.position, { x: nx, z: nz })
  a.position.x = nx
  a.position.z = nz
  a.altitude = Math.min(30, a.altitude + 3 * dt, 14 + 6 * Math.sin(t / 40 + o.r))
  a.speed = 7
  a.anim = 'fly'
}

function updateHyena(ctx: SimCtx, a: SimAnimal, b: AnimalBrain, dt: number, night: boolean): void {
  const t = ctx.state.clock.t
  const rng = ctx.rng
  const fires = lit(ctx)
  if (!night) {
    if (dist(a.position, b.home) > 4) {
      if (!b.target || dist(b.target, b.home) > 4) b.target = { ...b.home }
      moveToward(ctx, a, b, 1.6, dt, true)
      a.anim = a.speed > 0 ? 'walk' : 'lie'
    } else {
      a.anim = 'lie'
      a.speed = 0
    }
    return
  }
  const nearFire = fires.some((f) => dist(f, a.position) < FIRE_FEAR)
  if (t > b.until || !b.target || nearFire) {
    const hearth = ctx.world.poi('hearth-main')
    for (let tries = 0; tries < 8; tries++) {
      const ang = rng.range(0, Math.PI * 2)
      const r = rng.range(50, 150)
      const q = { x: hearth.x + Math.cos(ang) * r, z: hearth.z + Math.sin(ang) * r }
      if (ctx.world.inCave(q.x, q.z)) continue
      if (fires.some((f) => dist(f, q) < FIRE_FEAR + 10)) continue
      if (!ctx.paths.passableAt(q.x, q.z, ctx.state.clock.seaLevel)) continue
      b.target = q
      break
    }
    b.until = t + rng.range(300, 1200)
    if (rng.chance(0.15)) ctx.events.push({ type: 'sfx', name: 'hyena', at: { x: a.position.x, z: a.position.z } })
  }
  if (moveToward(ctx, a, b, 1.4, dt, true)) {
    a.anim = 'idle'
  } else {
    a.anim = 'walk'
  }
}
