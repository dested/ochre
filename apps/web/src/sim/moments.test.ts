import { describe, expect, test } from 'bun:test'
import type { LifeStageId, Sim, SimEvent, Vec2 } from '../game/contracts'
import { createSandboxSim, createSim, debugCtx } from './index'
import { activeMoment, MOMENT_IDS, triggerMoment, type MomentId } from './moments'
import { createTestWorld } from './test-world'

const world = createTestWorld(1)

function ctxOf(sim: Sim) {
  const ctx = debugCtx(sim)
  if (!ctx) throw new Error('no ctx')
  return ctx
}

function runTo(sim: Sim, hour: number): void {
  for (let i = 0; i < 100_000 && sim.state.clock.hour < hour; i++) sim.step(10 / sim.state.timeScale)
}

const SETUP: Record<MomentId, { stage: LifeStageId; hour: number; stand: string }> = {
  // the honey is far off, so the player walks with the lead man
  honeyguide: { stage: 'provider', hour: 10, stand: 'cast:lead' },
  'lion-eyes': { stage: 'small', hour: 20.9, stand: 'hearth-main' },
  visitor: { stage: 'small', hour: 11, stand: 'hearth-main' },
  'seal-pup': { stage: 'small', hour: 10, stand: 'shore-path-bottom' },
  'rain-dash': { stage: 'small', hour: 11, stand: 'hearth-main' },
  'moon-dance': { stage: 'small', hour: 20.2, stand: 'hearth-main' },
  'first-steps': { stage: 'provider', hour: 10, stand: 'hearth-main' },
}

describe('days worth living', () => {
  for (const id of MOMENT_IDS) {
    test(`${id} can happen, says something, and leaves the world as it found it`, () => {
      const { stage, hour, stand } = SETUP[id]
      const sim = createSandboxSim({ seed: 1, world, stage, playerName: 'Teni' })
      runTo(sim, hour)
      const ctx = ctxOf(sim)
      const home = stand.startsWith('cast:') ? 'hearth-main' : stand
      const pl = sim.state.people.find((p) => p.isPlayer)
      if (!pl) throw new Error('no player')
      const spot = (): Vec2 => {
        const who = ctx.moments.active?.cast[stand.slice(5)]
        const q = who ? sim.state.people.find((p) => p.id === who) : undefined
        if (q) return { x: q.position.x + 3, z: q.position.z }
        return world.poi(home)
      }
      const hold = () => {
        const at = pl.carriedBy ? pl.position : spot()
        sim.command({ type: 'move', position: { x: at.x, z: at.z }, heading: 0, speed: 0, anim: 'idle' })
      }
      hold()
      sim.step(1 / 30)
      const people0 = sim.state.people.length
      const corms0 = sim.state.hearth.corms
      expect(triggerMoment(ctx, id)).toBe(true)
      const caps: string[] = []
      const seen = { lion: false, seal: false, visitor: false, rain: false, dance: false, setDown: false }
      for (let i = 0; i < 30 * 400 && activeMoment(ctx) === id; i++) {
        hold()
        for (const e of sim.step(1 / 30)) if (e.type === 'caption' && e.caption.id.startsWith('moment-')) caps.push(e.caption.text)
        const s = sim.state
        if (s.animals.some((a) => a.kind === 'lion')) seen.lion = true
        if (s.people.some((p) => p.id.startsWith('visitor-'))) seen.visitor = true
        if (s.weather.rain >= 0.8) seen.rain = true
        if (s.people.some((p) => p.anim === 'dance')) seen.dance = true
        if (s.people.some((p) => !p.carriedBy && p.look.ageYears < 2.2 && p.anim === 'walk')) seen.setDown = true
        if (ctx.moments.active?.animals.length && id === 'seal-pup') seen.seal = true
      }
      expect(activeMoment(ctx)).toBeNull()
      expect(caps.length).toBeGreaterThanOrEqual(2)
      // nothing the moment added stays behind, and nobody is left holding a pose
      expect(sim.state.people.length).toBe(people0)
      expect(sim.state.animals.some((a) => a.kind === 'lion')).toBe(false)
      expect([...ctx.agents.values()].some((a) => a.order !== null)).toBe(false)
      if (id === 'lion-eyes') expect(seen.lion).toBe(true)
      if (id === 'visitor') {
        expect(seen.visitor).toBe(true)
        expect(sim.state.hearth.corms).toBeGreaterThanOrEqual(corms0 + 20 - 40)
      }
      if (id === 'seal-pup') expect(seen.seal).toBe(true)
      if (id === 'rain-dash') expect(seen.rain).toBe(true)
      if (id === 'moon-dance') expect(seen.dance).toBe(true)
      if (id === 'first-steps') {
        expect(seen.setDown).toBe(true)
        expect(sim.state.people.find((p) => p.id === 'child-1')?.carriedBy).toBe(pl.id)
      }
      if (id === 'honeyguide') expect(caps.some((c) => c.startsWith('Honey'))).toBe(true)
    }, 30_000)
  }

  test('moments come by themselves in free days, at most one an hour, the same for a seed', () => {
    const run = () => {
      const sim = createSandboxSim({ seed: 3, world, stage: 'provider', playerName: 'Teni' })
      const ctx = ctxOf(sim)
      const starts: number[] = []
      let was: string | null = null
      for (let i = 0; i < 100_000 && sim.state.clock.t < 2 * 86_400; i++) {
        sim.step(10 / sim.state.timeScale)
        const now = activeMoment(ctx)
        if (now && now !== was) starts.push(sim.state.clock.t)
        was = now
      }
      return { log: [...ctx.moments.log], starts }
    }
    const a = run()
    expect(a.log.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < a.starts.length; i++) expect((a.starts[i] ?? 0) - (a.starts[i - 1] ?? 0)).toBeGreaterThanOrEqual(3600)
    expect(run().log).toEqual(a.log)
  }, 60_000)

  test('no moment starts while a director beat runs', () => {
    const sim = createSim({ seed: 1, world, stage: 'small', playerName: 'Teni' })
    const ctx = ctxOf(sim)
    const events: SimEvent[] = []
    for (let i = 0; i < 30 * 120; i++) events.push(...sim.step(1 / 30))
    expect(ctx.moments.log.length).toBe(0)
  })
})
