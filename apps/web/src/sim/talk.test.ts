import { describe, expect, test } from 'bun:test'
import type { Sim, SimEvent, SimPerson } from '../game/contracts'
import { addAnimal } from './animals'
import { createSandboxSim, debugCtx } from './index'
import { TALK_CAST, TALK_LINES } from './lines'
import { CHATTER_EVERY, quiet } from './talk'
import { createTestWorld } from './test-world'

const world = createTestWorld(1)

function newSim(seed = 1): Sim {
  return createSandboxSim({ seed, world, stage: 'small', playerName: 'Teni' })
}

function ctxOf(sim: Sim) {
  const ctx = debugCtx(sim)
  if (!ctx) throw new Error('no ctx')
  return ctx
}

function person(sim: Sim, id: string): SimPerson {
  const p = sim.state.people.find((q) => q.id === id)
  if (!p) throw new Error(`no ${id}`)
  return p
}

function runTo(sim: Sim, hour: number): void {
  for (let i = 0; i < 100_000 && sim.state.clock.hour < hour; i++) sim.step(10 / sim.state.timeScale)
}

/** stand next to someone and talk; returns the caption text */
function talk(sim: Sim, id: string): string {
  const q = person(sim, id)
  sim.command({ type: 'move', position: { x: q.position.x + 1, z: q.position.z }, heading: 0, speed: 0, anim: 'idle' })
  const it = sim.interactionsNear({ x: q.position.x + 1, z: q.position.z }, 2.5).find((i) => i.verb === 'talk' && i.targetId === id)
  if (!it) throw new Error(`cannot talk to ${id}`)
  sim.command({ type: 'interact', interactionId: it.id })
  const caps = sim.step(1 / 60).filter((e): e is Extract<SimEvent, { type: 'caption' }> => e.type === 'caption' && e.caption.speaker === q.name)
  const last = caps[caps.length - 1]
  if (!last) throw new Error(`${id} said nothing`)
  return last.caption.text
}

describe('the band talks', () => {
  test('the bank: every fixed-cast voice has at least 8 lines, none over 90 characters, ids unique', () => {
    for (const c of TALK_CAST) expect(TALK_LINES.filter((l) => l.who === c).length).toBeGreaterThanOrEqual(8)
    for (const l of TALK_LINES) expect(l.text.length).toBeLessThanOrEqual(90)
    expect(new Set(TALK_LINES.map((l) => l.id)).size).toBe(TALK_LINES.length)
    expect(TALK_LINES.length).toBeGreaterThanOrEqual(150)
    // no exclamation spam
    expect(TALK_LINES.filter((l) => l.text.includes('!')).length).toBe(0)
  })

  test('talking to someone gives their own voice, no repeats within the day, and a little bond', () => {
    const sim = newSim()
    runTo(sim, 10)
    const ama = person(sim, 'ama')
    const bond0 = ama.bond
    const said: string[] = []
    for (let i = 0; i < 6; i++) said.push(talk(sim, 'ama'))
    expect(new Set(said).size).toBe(said.length)
    const amaLines = new Set(TALK_LINES.filter((l) => l.who === 'ama').map((l) => l.text))
    expect(said.filter((t) => amaLines.has(t)).length).toBeGreaterThanOrEqual(3)
    expect(ama.bond).toBeGreaterThan(bond0)
    // bond grows once an hour, not on every word
    expect(ama.bond - bond0).toBeLessThan(0.05)
  })

  test('the same seed says the same things', () => {
    const run = (seed: number) => {
      const sim = newSim(seed)
      runTo(sim, 10)
      return ['ama', 'tuk', 'oro', 'kaya', 'nehe', 'ilu', 'sabo'].map((id) => talk(sim, id))
    }
    expect(run(1)).toEqual(run(1))
  })

  test('the whale is the talk of the band', () => {
    const sim = newSim()
    runTo(sim, 10)
    const ctx = ctxOf(sim)
    addAnimal(ctx, 'whale', world.poi('cove-beach'), null)
    sim.step(1 / 60)
    const lines = ['ama', 'tuk', 'oro', 'kaya'].map((id) => talk(sim, id))
    const whale = new Set(TALK_LINES.filter((l) => l.after === 'whale').map((l) => l.text))
    expect(lines.filter((t) => whale.has(t)).length).toBeGreaterThanOrEqual(3)
  })

  test('chatter near two people at the hearth: sparse, and never over a director caption', () => {
    const sim = newSim()
    runTo(sim, 19.2)
    const ctx = ctxOf(sim)
    const pl = person(sim, sim.state.playerId)
    const at = sim.state.people.filter((p) => !p.isPlayer && ['socialize', 'eat', 'sing', 'tell-story'].includes(p.task.kind))
    const first = at[0]
    if (!first) throw new Error('nobody at the hearth')
    const chat: number[] = []
    const realStart = ctx.talk.realT
    for (let i = 0; i < 60 * 150; i++) {
      sim.command({ type: 'move', position: { x: first.position.x + 1, z: first.position.z }, heading: 0, speed: 0, anim: 'idle' })
      if (i === 60 * 100) quiet(ctx, 30)
      for (const e of sim.step(1 / 60)) {
        if (e.type === 'caption' && e.caption.id.startsWith('chat-')) chat.push(ctx.talk.realT - realStart)
      }
    }
    expect(pl.position.x).toBeCloseTo(first.position.x + 1, 0)
    expect(chat.length).toBeGreaterThanOrEqual(2)
    expect(chat.length).toBeLessThanOrEqual(Math.ceil(150 / CHATTER_EVERY) + 1)
    for (let i = 1; i < chat.length; i++) expect((chat[i] ?? 0) - (chat[i - 1] ?? 0)).toBeGreaterThanOrEqual(CHATTER_EVERY - 0.1)
    expect(chat.some((t) => t > 100 && t < 131)).toBe(false)
  })
})
