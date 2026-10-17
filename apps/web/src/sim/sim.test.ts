import { describe, expect, test } from 'bun:test'
import { REQUIRED_POIS, type Sim, type SimPerson } from '../game/contracts'
import { createSim } from './index'
import { NEED_SKILL } from './interact'
import { createTestWorld } from './test-world'

const world = createTestWorld(1)

function newSim(seed = 1): Sim {
  return createSim({ seed, world, stage: 'small', playerName: 'Teni' })
}

/** step in 10-game-second slices until the clock reaches day/hour */
function runTo(sim: Sim, day: number, hour: number, each?: (sim: Sim) => void): void {
  const s = sim.state
  const dt = 10 / s.timeScale
  for (let i = 0; i < 100_000; i++) {
    if (s.clock.day > day || (s.clock.day === day && s.clock.hour >= hour)) return
    sim.step(dt)
    each?.(sim)
  }
  throw new Error('runTo never arrived')
}

function food(sim: Sim): number {
  const h = sim.state.hearth
  return h.shellfish + h.corms + h.meat
}

function finitePerson(p: SimPerson): boolean {
  return [p.position.x, p.position.z, p.heading, p.speed, p.needs.fed, p.needs.warmth, p.needs.energy, p.needs.health, p.bond, p.look.ageYears].every(Number.isFinite)
}

describe('fixture world', () => {
  test('has every required POI, each walkable at low tide', () => {
    for (const id of REQUIRED_POIS) {
      const p = world.poi(id)
      if (id !== 'seal-rocks') expect(world.walkable(p.x, p.z, -1.4)).toBe(true)
    }
  })
})

describe('sim', () => {
  test('builds a band of 22 with the fixed cast', () => {
    const s = newSim().state
    expect(s.people.length).toBe(22)
    for (const id of ['ama', 'tuk', 'oro', 'kaya', 'nehe', 'ilu', 'sabo', 'player']) {
      expect(s.people.some((p) => p.id === id)).toBe(true)
    }
    expect(s.people.find((p) => p.id === 'player')?.look.ageYears).toBe(6)
  })

  test('is deterministic for a seed', () => {
    const a = newSim(7)
    const b = newSim(7)
    for (let i = 0; i < 3000; i++) {
      a.step(1 / 30)
      b.step(1 / 30)
    }
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state))
    const c = newSim(8)
    for (let i = 0; i < 3000; i++) c.step(1 / 30)
    expect(JSON.stringify(c.state)).not.toBe(JSON.stringify(a.state))
  })

  test('runs a full day without NaN or stuck walkers, everyone asleep in the cave at 01:00', () => {
    const sim = newSim()
    const stuck = new Map<string, number>()
    let worst = 0
    runTo(sim, 1, 1, (sm) => {
      const s = sm.state
      for (const p of s.people) {
        expect(finitePerson(p)).toBe(true)
        const waiting = p.task.kind === 'walk-to' && p.speed === 0
        const since = stuck.get(p.id)
        if (waiting) {
          if (since === undefined) stuck.set(p.id, s.clock.t)
          else worst = Math.max(worst, s.clock.t - since)
        } else stuck.delete(p.id)
      }
    })
    // nobody stands waiting to walk for more than half an hour
    expect(worst).toBeLessThan(1800)
    const awake = sim.state.people.filter((p) => p.alive && (p.task.kind !== 'sleep' || !world.inCave(p.position.x, p.position.z)))
    expect(awake.map((p) => `${p.name} ${p.task.kind}`)).toEqual([])
  })

  test('gathers shellfish at the morning low tide, and only while the bed is out', () => {
    const sim = newSim()
    let gatherers = 0
    let wrong = 0
    runTo(sim, 0, 12, (sm) => {
      for (const p of sm.state.people) {
        if (p.task.kind !== 'gather-shellfish' || p.carriedBy) continue
        const bedId = p.task.targetId
        if (!bedId) continue
        gatherers++
        const bed = world.poi(bedId)
        if (sm.state.clock.seaLevel >= (bed.tideMax ?? 0)) wrong++
      }
    })
    expect(gatherers).toBeGreaterThan(0)
    expect(wrong).toBe(0)
    expect(sim.state.hearth.shellfish).toBeGreaterThan(20)
  })

  test('the band eats from the hearth at dusk', () => {
    const sim = newSim()
    runTo(sim, 0, 17.5)
    const before = food(sim)
    const fedBefore = sim.state.people.reduce((a, p) => a + p.needs.fed, 0)
    runTo(sim, 0, 20)
    expect(food(sim)).toBeLessThan(before)
    expect(sim.state.people.reduce((a, p) => a + p.needs.fed, 0)).toBeGreaterThan(fedBefore)
  })

  test('learns by watching: 8 real seconds near Ama gathering', () => {
    const sim = newSim()
    runTo(sim, 0, 9)
    const ama = sim.state.people.find((p) => p.id === 'ama')
    if (!ama) throw new Error('no Ama')
    expect(ama.task.kind).toBe('gather-shellfish')
    const player = sim.state.people.find((p) => p.isPlayer)
    if (!player) throw new Error('no player')
    player.skills = player.skills.filter((s) => s !== 'shellfish')
    const events: string[] = []
    for (let i = 0; i < 60 * 9; i++) {
      sim.command({ type: 'move', position: { x: ama.position.x + 1, z: ama.position.z }, heading: 0, speed: 0, anim: 'idle' })
      for (const e of sim.step(1 / 60)) if (e.type === 'learned' && e.personId === player.id) events.push(e.skill)
      if (i === 60 * 4) expect(sim.state.watching?.skill).toBe('shellfish')
    }
    expect(events).toContain('shellfish')
    expect(player.skills).toContain('shellfish')
  })

  test('interactions are gated by skill and tide', () => {
    const sim = newSim()
    const bed = world.poi('shore-mussels')
    const player = sim.state.people.find((p) => p.isPlayer)
    if (!player) throw new Error('no player')
    sim.command({ type: 'move', position: { x: bed.x, z: bed.z }, heading: 0, speed: 0, anim: 'idle' })
    player.skills = ['faces']
    const noSkill = sim.interactionsNear({ x: bed.x, z: bed.z }, 2.5).find((i) => i.verb === 'gather')
    expect(noSkill?.enabled).toBe(false)
    expect(noSkill?.reason).toBe(NEED_SKILL)
    player.skills.push('shellfish')
    runTo(sim, 0, 9.3)
    const low = sim.interactionsNear({ x: bed.x, z: bed.z }, 2.5).find((i) => i.verb === 'gather')
    expect(low?.enabled).toBe(true)
    if (!low) throw new Error('no gather')
    sim.command({ type: 'interact', interactionId: low.id })
    expect(sim.state.inventory.shellfish).toBe(1)
    runTo(sim, 0, 15)
    const high = sim.interactionsNear({ x: bed.x, z: bed.z }, 2.5).find((i) => i.verb === 'gather')
    expect(high?.enabled).toBe(false)
  })

  test('saves and loads; a bad save throws a clear error', () => {
    const sim = newSim()
    runTo(sim, 0, 10)
    const save = sim.serialize()
    const loaded = createSim({ seed: 1, world, stage: 'small', playerName: 'Teni', save })
    expect(loaded.state.clock.t).toBe(sim.state.clock.t)
    expect(loaded.state.people.map((p) => p.position)).toEqual(sim.state.people.map((p) => p.position))
    expect(loaded.state.hearth).toEqual(sim.state.hearth)
    for (let i = 0; i < 600; i++) loaded.step(1 / 30)
    expect(loaded.state.people.every(finitePerson)).toBe(true)
    expect(() => createSim({ seed: 1, world, stage: 'small', playerName: 'Teni', save: { version: 1, payload: { nope: true } } })).toThrow(/OCHRE save/)
  })

  test('every stage builds and runs', () => {
    for (const stage of ['held', 'youth', 'provider', 'elder'] as const) {
      const sim = createSim({ seed: 3, world, stage, playerName: 'Teni' })
      expect(sim.state.people.length).toBeGreaterThanOrEqual(20)
      for (let i = 0; i < 600; i++) sim.step(1 / 10)
      expect(sim.state.people.every(finitePerson)).toBe(true)
    }
    const held = createSim({ seed: 3, world, stage: 'held', playerName: 'Teni' })
    expect(held.state.people.find((p) => p.isPlayer)?.carriedBy).toBe('ama')
  })

  test('a step for the band and its animals averages under 1 ms', () => {
    const sim = newSim()
    for (let i = 0; i < 600; i++) sim.step(1 / 60)
    const n = 3000
    const t0 = performance.now()
    for (let i = 0; i < n; i++) sim.step(1 / 60)
    const ms = (performance.now() - t0) / n
    expect(sim.state.animals.length).toBeGreaterThan(20)
    expect(ms).toBeLessThan(1)
  })
})
