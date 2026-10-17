import { describe, expect, test } from 'bun:test'
import { FIELD_NOTE_IDS, type LifeStageId, type Sim, type SimEvent } from '../game/contracts'
import { BEAT_IDS, NOTES_BY_STAGE } from './director/chapters'
import { createSim, debugDirector } from './index'
import { createTestWorld } from './test-world'

const world = createTestWorld(1)

function newSim(stage: LifeStageId = 'held', seed = 1): Sim {
  return createSim({ seed, world, stage, playerName: 'Teni' })
}

function director(sim: Sim) {
  const d = debugDirector(sim)
  if (!d) throw new Error('no director')
  return d
}

function player(sim: Sim) {
  const p = sim.state.people.find((q) => q.id === sim.state.playerId)
  if (!p) throw new Error('no player')
  return p
}

/** play: report the player standing at `at` and step real time */
function standAt(sim: Sim, at: { x: number; z: number }, seconds: number, events: SimEvent[] = []): SimEvent[] {
  const frames = Math.ceil(seconds * 30)
  for (let i = 0; i < frames; i++) {
    sim.command({ type: 'move', position: at, heading: 0, speed: 0, anim: 'idle' })
    events.push(...sim.step(1 / 30))
  }
  return events
}

function steps(sim: Sim, seconds: number, events: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) events.push(...sim.step(1 / 30))
  return events
}

describe('director', () => {
  test('a new life opens on the Held chapter card and its first beat', () => {
    const sim = newSim()
    const events = sim.step(1 / 30)
    const start = events.find((e) => e.type === 'chapter-start')
    expect(start).toEqual({ type: 'chapter-start', stage: 'held', title: 'Held', subtitle: "Everything is faces, warmth and the sea's breath", ageYears: 0 })
    expect(events.some((e) => e.type === 'teleport')).toBe(true)
    expect(sim.state.chapter.beatId).toBe('held.faces')
    steps(sim, 4)
    expect(sim.state.chapter.objective?.text).toBe('Look at the faces around you')
    expect(player(sim).carriedBy).toBe('ama')
    expect(sim.state.people.find((p) => p.id === 'ama')?.carrying?.slot).toBe('arms')
  })

  test('Held: four faces learned by looking moves the life to the sea', () => {
    const sim = newSim()
    const events: SimEvent[] = steps(sim, 5)
    for (const id of ['ama', 'oro', 'tuk', 'kaya']) {
      for (let i = 0; i < 60; i++) {
        sim.command({ type: 'gaze', personId: id, dt: 1 / 30 })
        events.push(...sim.step(1 / 30))
      }
    }
    expect(events.filter((e) => e.type === 'face-learned').length).toBe(4)
    steps(sim, 3, events)
    expect(sim.state.notes).toContain('faces')
    expect(sim.state.chapter.beatId).toBe('held.sea')
    expect(events.some((e) => e.type === 'caption' && e.caption.text === 'Warmth. A heartbeat. A voice you already know.')).toBe(true)
  })

  test('Small: follow, watch, gather twelve, the tide turns', () => {
    const sim = newSim('small')
    steps(sim, 3)
    expect(sim.state.chapter.beatId).toBe('small.follow')
    expect(sim.state.chapter.objective?.text).toBe('Follow Ama to the rocks')
    const bed = world.poi('shore-mussels')
    const ama = sim.state.people.find((p) => p.id === 'ama')
    if (!ama) throw new Error('no Ama')
    // walk beside Ama down to the rocks
    for (let i = 0; i < 30 * 240 && sim.state.chapter.beatId === 'small.follow'; i++) {
      const at = { x: ama.position.x + 1.5, z: ama.position.z }
      sim.command({ type: 'move', position: at, heading: 0, speed: 1.2, anim: 'walk' })
      sim.step(1 / 30)
    }
    expect(sim.state.chapter.beatId).toBe('small.watch')
    expect(sim.state.notes).toContain('spring-tides')
    const events = standAt(sim, { x: ama.position.x + 1.5, z: ama.position.z }, 10)
    expect(events.some((e) => e.type === 'learned' && e.skill === 'shellfish')).toBe(true)
    steps(sim, 0.2)
    expect(sim.state.chapter.beatId).toBe('small.gather')
    expect(sim.state.clock.seaLevel).toBeLessThan(bed.tideMax ?? 0)
    for (let n = 0; n < 12; n++) {
      sim.command({ type: 'move', position: { x: bed.x, z: bed.z }, heading: 0, speed: 0, anim: 'idle' })
      const gather = sim.interactionsNear({ x: bed.x, z: bed.z }, 2.5).find((i) => i.verb === 'gather')
      expect(gather?.enabled).toBe(true)
      if (gather) sim.command({ type: 'interact', interactionId: gather.id })
      sim.step(1 / 30)
      if (n === 5) expect(sim.state.chapter.objective?.text).toBe('Gather shellfish (6/12)')
    }
    steps(sim, 0.2)
    expect(sim.state.notes).toContain('shellfish')
    expect(sim.state.chapter.beatId).toBe('small.tide')
    expect(sim.state.chapter.objective?.text).toBe('Get back to the sand before the sea wakes up')
    const sea0 = sim.state.clock.seaLevel
    const sand = world.poi('safe-sand')
    // the sea may fall a little more before it turns, then comes in fast
    standAt(sim, { x: bed.x, z: bed.z }, 40)
    expect(sim.state.clock.seaLevel).toBeGreaterThan(sea0 + 0.5)
    standAt(sim, { x: sand.x, z: sand.z }, 1)
    expect(sim.state.chapter.beatId).toBe('small.play')
    expect(sim.state.timeScale).toBe(72)
  })

  test('complete-beat walks a whole life: five chapters in place, every Field Note, the life summary', () => {
    const sim = newSim()
    const all: SimEvent[] = []
    all.push(...sim.step(1 / 30))
    const seen: string[] = [sim.state.chapter.beatId]
    for (let i = 0; i < 200 && !sim.state.chapter.finished; i++) {
      director(sim).completeBeat()
      all.push(...steps(sim, 0.1))
      if (seen[seen.length - 1] !== sim.state.chapter.beatId) seen.push(sim.state.chapter.beatId)
    }
    expect(sim.state.chapter.finished).toBe(true)
    expect(seen).toEqual([...BEAT_IDS])
    const starts = all.filter((e) => e.type === 'chapter-start').map((e) => (e.type === 'chapter-start' ? `${e.stage}:${e.title}:${e.ageYears}` : ''))
    expect(starts).toEqual(['held:Held:0', 'small:Small:6', 'youth:Coming of age:14', 'provider:Provider:26', 'elder:Elder:58'])
    const ends = all.filter((e) => e.type === 'chapter-end').map((e) => (e.type === 'chapter-end' ? `${e.stage}>${e.next}` : ''))
    expect(ends).toEqual(['held>small', 'small>youth', 'youth>provider', 'provider>elder', 'elder>null'])
    expect([...sim.state.notes].sort()).toEqual([...FIELD_NOTE_IDS].sort())
    // each chapter unlocks exactly the notes a later-chapter start seeds for it
    const byStage: Record<string, string[]> = {}
    let at = 'held'
    for (const e of all) {
      if (e.type === 'chapter-start') at = e.stage
      if (e.type === 'note') (byStage[at] ??= []).push(e.noteId)
    }
    for (const [stage, ids] of Object.entries(NOTES_BY_STAGE)) expect([...(byStage[stage] ?? [])].sort()).toEqual([...ids].sort())
    const summary = all.find((e) => e.type === 'life-summary')
    if (!summary || summary.type !== 'life-summary') throw new Error('no summary')
    expect(summary.summary.name).toBe('Teni')
    expect(summary.summary.years).toBe(58)
    expect(summary.summary.children.length).toBe(3)
    expect(summary.summary.beadsGivenTo).not.toBeNull()
    expect(summary.summary.storyTold).toBe('The night the sea slept')
    expect(summary.summary.taught.length).toBeGreaterThan(0)
    expect(summary.summary.heirName).not.toBeNull()
    // the partner chosen at the lagoon is the partner in Provider and Elder
    const partner = sim.state.people.find((p) => p.id === 'partner')
    expect(partner?.name).toBe(summary.summary.beadsGivenTo ?? '')
    expect(sim.state.people.some((p) => p.id === 'oro')).toBe(false)
    expect(sim.state.people.every((p) => [p.position.x, p.position.z].every(Number.isFinite))).toBe(true)

    // continue as the heir: Small again, as a six-year-old grandchild
    sim.command({ type: 'continue-as-heir' })
    const after = steps(sim, 1.5)
    expect(after.some((e) => e.type === 'chapter-start' && e.stage === 'small')).toBe(true)
    expect(sim.state.stage).toBe('small')
    expect(sim.state.playerId).toBe(summary.summary.heirId ?? '')
    expect(Math.round(player(sim).look.ageYears)).toBe(6)
    expect(sim.state.people.find((p) => p.id === 'player')?.alive).toBe(false)
    expect(sim.state.chapter.objective?.text.startsWith('Follow ')).toBe(true)
    // the heir's life plays on
    for (let i = 0; i < 40 && sim.state.stage === 'small'; i++) {
      director(sim).completeBeat()
      steps(sim, 0.1)
    }
    expect(sim.state.stage).toBe('youth')
  }, 60_000)

  test('skip-to-chapter gives each stage a fitting band', () => {
    const youth = newSim('youth')
    youth.step(1 / 30)
    expect(Math.round(player(youth).look.ageYears)).toBe(14)
    expect(youth.state.people.find((p) => p.id === 'tuk')?.alive).toBe(true)
    expect(youth.state.people.find((p) => p.id === 'ama')?.alive).toBe(true)

    const provider = newSim('provider')
    provider.step(1 / 30)
    const pl = player(provider)
    expect(Math.round(pl.look.ageYears)).toBe(26)
    expect(pl.partnerId).toBe('partner')
    const child = provider.state.people.find((p) => p.id === 'child-1')
    expect(child?.carriedBy).toBe(pl.id)
    expect(Math.round(child?.look.ageYears ?? 0)).toBe(1)
    expect(provider.state.people.find((p) => p.id === 'oro')?.look.ageYears).toBeGreaterThan(80)

    const elder = newSim('elder')
    elder.step(1 / 30)
    const old = player(elder)
    expect(Math.round(old.look.ageYears)).toBe(58)
    const kids = elder.state.people.filter((p) => old.childIds.includes(p.id))
    expect(kids.length).toBeGreaterThanOrEqual(2)
    expect(kids.every((k) => k.look.ageYears >= 20)).toBe(true)
    expect(elder.state.people.some((p) => kids.some((k) => k.childIds.includes(p.id)))).toBe(true)
    expect([...elder.state.notes].sort()).toEqual([...NOTES_BY_STAGE.held, ...NOTES_BY_STAGE.small, ...NOTES_BY_STAGE.youth, ...NOTES_BY_STAGE.provider].sort())
  })

  test('Coming of age: beads go only to the lagoon youths, and the one who gets them is the partner', () => {
    const sim = newSim('youth')
    sim.step(1 / 30)
    while (sim.state.chapter.beatId !== 'youth.gathering') {
      director(sim).completeBeat()
      steps(sim, 0.05)
    }
    steps(sim, 4)
    const camp = world.poi('lagoon-camp')
    standAt(sim, { x: camp.x, z: camp.z }, 0.5)
    expect(sim.state.chapter.objective?.text).toBe('Give your beads to someone')
    const youths = sim.state.people.filter((p) => p.familyId === 'lagoon')
    expect(youths.length).toBe(3)
    const y = youths[1]
    if (!y) throw new Error('no youth')
    const tuk = sim.state.people.find((p) => p.id === 'tuk')
    if (!tuk) throw new Error('no Tuk')
    sim.command({ type: 'move', position: { x: tuk.position.x + 1, z: tuk.position.z }, heading: 0, speed: 0, anim: 'idle' })
    expect(sim.interactionsNear(tuk.position, 2.5).some((i) => i.verb === 'give-beads')).toBe(false)
    sim.command({ type: 'move', position: { x: y.position.x + 1, z: y.position.z }, heading: 0, speed: 0, anim: 'idle' })
    const give = sim.interactionsNear(y.position, 2.5).find((i) => i.verb === 'give-beads' && i.targetId === y.id)
    if (!give) throw new Error('no give-beads')
    sim.command({ type: 'interact', interactionId: give.id })
    const ev = steps(sim, 9)
    expect(sim.state.notes).toContain('networks')
    expect(ev.some((e) => e.type === 'chapter-end' && e.stage === 'youth' && e.next === 'provider')).toBe(true)
    expect(sim.state.stage).toBe('provider')
    expect(sim.state.people.find((p) => p.id === 'partner')?.name).toBe(y.name)
  })

  test('the knapping minigame and the share choice wait for play, then carry on', () => {
    const sim = newSim('youth')
    sim.step(1 / 30)
    while (sim.state.chapter.beatId !== 'youth.knap') {
      director(sim).completeBeat()
      steps(sim, 0.05)
    }
    const h = world.poi('hearth-main')
    const tuk = sim.state.people.find((p) => p.id === 'tuk')
    if (!tuk) throw new Error('no Tuk')
    expect(tuk.task.skill).toBe('knapping')
    // not yet: watch Tuk first
    standAt(sim, { x: h.x + 1.5, z: h.z }, 0.2)
    expect(sim.interactionsNear({ x: h.x + 1.5, z: h.z }, 2.5).find((i) => i.verb === 'knap')?.enabled).toBe(false)
    standAt(sim, { x: tuk.position.x + 1, z: tuk.position.z }, 9)
    standAt(sim, { x: h.x + 1.5, z: h.z }, 0.2)
    const knap = sim.interactionsNear({ x: h.x + 1.5, z: h.z }, 2.5).find((i) => i.verb === 'knap')
    expect(knap?.enabled).toBe(true)
    if (!knap) throw new Error('no knap')
    sim.command({ type: 'interact', interactionId: knap.id })
    const ev = steps(sim, 0.2)
    expect(ev.some((e) => e.type === 'minigame' && e.game === 'knapping')).toBe(true)
    steps(sim, 2)
    expect(sim.state.chapter.beatId).toBe('youth.knap')
    sim.command({ type: 'minigame-result', game: 'knapping', quality: 0.82 })
    steps(sim, 0.2)
    expect(sim.state.inventory.point).toBeCloseTo(0.82)
    expect(sim.state.notes).toContain('still-bay')
    expect(sim.state.chapter.beatId).toBe('youth.haft')
  })

  test('saves mid-chapter and resumes the same beat', () => {
    const sim = newSim('small')
    sim.step(1 / 30)
    director(sim).completeBeat()
    director(sim).completeBeat()
    steps(sim, 0.2)
    expect(sim.state.chapter.beatId).toBe('small.gather')
    const save = sim.serialize()
    const loaded = createSim({ seed: 1, world, stage: 'small', playerName: 'Teni', save })
    const ev = steps(loaded, 0.5)
    expect(ev.some((e) => e.type === 'chapter-start')).toBe(false)
    expect(loaded.state.chapter.beatId).toBe('small.gather')
    expect(loaded.state.chapter.objective?.text).toBe('Gather shellfish (0/12)')
    expect(loaded.state.notes).toEqual(sim.state.notes)
  })

  test('a seated beat sits the player down; the last walk sits them by the sea', () => {
    const sim = newSim('elder')
    steps(sim, 1.5)
    expect(sim.state.chapter.beatId).toBe('elder.mark')
    expect(player(sim).anim).toBe('sit')
    for (let i = 0; i < 10 && sim.state.chapter.beatId !== 'elder.walk'; i++) {
      director(sim).completeBeat()
      steps(sim, 0.1)
    }
    steps(sim, 8)
    expect(sim.state.chapter.beatId).toBe('elder.walk')
    const sit = sim.interactionsNear(player(sim).position, 200).find((i) => i.verb === 'sit')
    if (!sit) throw new Error('no sit by the sea')
    sim.command({ type: 'move', position: sit.position, heading: 0, speed: 0, anim: 'idle' })
    sim.command({ type: 'interact', interactionId: sit.id })
    expect(player(sim).anim).toBe('sit')
  })

  test('the director is deterministic for a seed', () => {
    const run = () => {
      const sim = newSim('small', 5)
      for (let i = 0; i < 3; i++) {
        steps(sim, 2)
        director(sim).completeBeat()
      }
      steps(sim, 5)
      return JSON.stringify(sim.state)
    }
    expect(run()).toBe(run())
  })
})
