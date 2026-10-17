import { describe, expect, test } from 'bun:test'
import { FIELD_NOTE_IDS, type LifeStageId, type Sim, type SimEvent } from '../game/contracts'
import { BEAT_IDS, NOTES_BY_STAGE } from './director/chapters'
import { createSim, debugCtx, debugDirector } from './index'
import { sunTimes } from './time'
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

/** the sun's height above the horizon */
function sunDegrees(sim: Sim): number {
  return (Math.asin(sim.state.clock.sunDir.y) * 180) / Math.PI
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

/** play: walk the player straight toward `to` at `speed` m/s until within `near` m (or `max` real seconds); returns the seconds taken */
function walkTo(sim: Sim, to: { x: number; z: number }, speed: number, events: SimEvent[] = [], near = 1.2, max = 600): number {
  let t = 0
  for (; t < max; t += 1 / 30) {
    const p = player(sim).position
    const left = Math.hypot(to.x - p.x, to.z - p.z)
    if (left <= near) break
    const k = Math.min(1, speed / 30 / left)
    const at = { x: p.x + (to.x - p.x) * k, z: p.z + (to.z - p.z) * k }
    sim.command({ type: 'move', position: at, heading: Math.atan2(to.x - p.x, to.z - p.z), speed, anim: 'walk' })
    events.push(...sim.step(1 / 30))
  }
  return t
}

/** play: hold E on the first enabled interaction with this verb in reach; returns the seconds held, or null if none */
function holdVerb(sim: Sim, verb: string, events: SimEvent[] = []): number | null {
  const p = player(sim).position
  const i = sim.interactionsNear(p, 2.5).find((x) => x.enabled && x.verb === verb)
  if (!i) return null
  standAt(sim, p, i.holdSeconds, events)
  sim.command({ type: 'interact', interactionId: i.id })
  events.push(...sim.step(1 / 30))
  return i.holdSeconds + 1 / 30
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

    // the old players' parents are gone, but Kaya is still the player's sister
    expect(sim.relationOf('kaya')).toBe('Sister')
    // continue as the heir: Small again, as a six-year-old grandchild
    sim.command({ type: 'continue-as-heir' })
    const after = steps(sim, 1.5)
    expect(after.some((e) => e.type === 'chapter-start' && e.stage === 'small')).toBe(true)
    expect(sim.state.stage).toBe('small')
    expect(sim.state.playerId).toBe(summary.summary.heirId ?? '')
    expect(Math.round(player(sim).look.ageYears)).toBe(6)
    expect(sim.state.people.find((p) => p.id === 'player')?.alive).toBe(false)
    expect(sim.state.chapter.objective?.text.startsWith('Follow ')).toBe(true)
    // awake and standing, not in the sleep pose the grandchild had at the end of the last life
    expect(player(sim).anim).toBe('idle')
    // relations are the heir's now: the old life's partner is a grandparent, not "Partner"
    const oldPartner = sim.state.people.find((p) => p.id === 'partner')
    if (oldPartner) expect(sim.relationOf(oldPartner.id)).toMatch(/^Grand(father|mother)$/)
    expect(sim.state.people.some((p) => sim.relationOf(p.id) === 'Partner')).toBe(false)
    // and the old player's sister is the heir's great-aunt
    expect(sim.relationOf('kaya')).toBe('Great-aunt')
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

  test('every objective with somewhere to go points there (a person or a place)', () => {
    const MOVE = /^(Follow|Walk|Go |Get back|Bring|Tell the others|Catch|Give|Teach|Collect|Gather)/
    const seen: { text: string; target: unknown }[] = []
    for (const stage of ['small', 'youth', 'provider', 'elder'] as const) {
      const sim = newSim(stage)
      const dir = director(sim)
      for (let guard = 0; guard < 60 && sim.state.stage === stage && !sim.state.chapter.finished; guard++) {
        // let the beat run until it shows its objective (past any fades), then finish it
        for (let i = 0; i < 30 * 6; i++) {
          for (const e of sim.step(1 / 30)) if (e.type === 'objective' && e.objective) seen.push({ text: e.objective.text, target: e.objective.target ?? null })
          if (sim.state.chapter.objective) break
        }
        dir.completeBeat()
      }
    }
    const moving = seen.filter((o) => MOVE.test(o.text))
    expect(moving.length).toBeGreaterThanOrEqual(10)
    for (const o of moving) expect({ text: o.text, has: o.target !== null }).toEqual({ text: o.text, has: true })
  }, 120_000)

  test('provider teaches in daylight, says how, and the band talks corms', () => {
    const sim = newSim('provider')
    const dir = director(sim)
    for (let i = 0; i < 20 && sim.state.chapter.beatId !== 'provider.teach'; i++) {
      dir.completeBeat()
      steps(sim, 0.2)
    }
    const events = steps(sim, 0, [])
    for (let i = 0; i < 30 * 12 && sim.state.chapter.objective?.text !== 'Teach your child to dig corms'; i++) events.push(...sim.step(1 / 30))
    expect(sim.state.chapter.objective?.text).toBe('Teach your child to dig corms')
    expect(sim.state.clock.daylight).toBeGreaterThan(0.5)
    expect(sim.state.clock.hour).toBeLessThan(14)
    const caps: string[] = []
    for (let i = 0; i < 30 * 50; i++) for (const e of sim.step(1 / 30)) if (e.type === 'caption') caps.push(e.caption.id.startsWith('chat-') ? `chat:${e.caption.text}` : e.caption.text)
    expect(caps.some((c) => c.startsWith('Dig where the dry leaves are'))).toBe(true)
    expect(caps.some((c) => /corm|leaves|stick|dug|Roast/.test(c) && !c.startsWith('Dig where'))).toBe(true)
    // the band's own chatter holds off over the lesson
    expect(caps.filter((c) => c.startsWith('chat:'))).toEqual([])
  }, 60_000)

  test('the whale comes ashore by daylight: runners call out, then the band goes down', () => {
    const sim = newSim('provider')
    const dir = director(sim)
    const events: SimEvent[] = []
    for (let i = 0; i < 20 && sim.state.chapter.beatId !== 'provider.whale'; i++) {
      dir.completeBeat()
      events.length = 0
      steps(sim, 0.2, events)
    }
    expect(sim.state.chapter.beatId).toBe('provider.whale')
    steps(sim, 15, events)
    const caps = events.flatMap((e) => (e.type === 'caption' ? [e.caption.text] : []))
    expect(sunDegrees(sim)).toBeGreaterThan(20)
    expect(caps).toContain('A whale! A whale on the sand!')
    expect(caps).toContain('Bring the knives! Bring everyone!')
    // the skipped lesson's lines don't carry over the whale
    expect(caps).not.toContain('Like this? I found one!')
    expect(sim.state.chapter.objective?.text.startsWith('Tell the others')).toBe(true)
    expect(sim.state.chapter.objective?.target?.kind).toBe('person')
    // the runners are on their way to the shore
    const beach = world.poi('whale-beach')
    const running = sim.state.people.filter((p) => !p.isPlayer && Math.hypot(p.position.x - beach.x, p.position.z - beach.z) < 30)
    expect(running.length).toBeGreaterThanOrEqual(1)
  }, 60_000)

  test('the whale is in full daylight on the normal path too: teach, its free wait, the cut to morning', () => {
    const sim = newSim('provider')
    const dir = director(sim)
    for (let i = 0; i < 20 && sim.state.chapter.beatId !== 'provider.teach'; i++) {
      dir.completeBeat()
      steps(sim, 0.2)
    }
    // the lesson done, the free wait and the cut run on their own
    dir.completeBeat({ toFree: true })
    let whaleAt: number | null = null
    for (let i = 0; i < 30 * 200 && sim.state.chapter.objective?.text.startsWith('Tell the others') !== true; i++) {
      sim.step(1 / 30)
      if (whaleAt === null && sim.state.chapter.beatId === 'provider.whale') whaleAt = sunDegrees(sim)
    }
    expect(sim.state.chapter.objective?.text.startsWith('Tell the others')).toBe(true)
    expect(whaleAt ?? 0).toBeGreaterThan(20)
    expect(sunDegrees(sim)).toBeGreaterThan(20)
  }, 60_000)

  test('storm firewood: walking at 1.4 m/s to the wood and back finishes with 40% of the time to spare', () => {
    const sim = newSim('provider')
    const dir = director(sim)
    for (let i = 0; i < 20 && sim.state.chapter.beatId !== 'provider.storm'; i++) {
      dir.completeBeat()
      steps(sim, 0.2)
    }
    expect(sim.state.chapter.beatId).toBe('provider.storm')
    for (let i = 0; i < 30 * 20 && sim.state.chapter.objective?.text !== 'Bring firewood before dark'; i++) sim.step(1 / 30)
    const o = sim.state.chapter.objective
    expect(o?.text).toBe('Bring firewood before dark')
    // the count is the HUD's (done/total), never in the text
    expect(o?.total).toBe(5)
    const ctx = debugCtx(sim)
    if (!ctx) throw new Error('no ctx')
    const { set } = sunTimes(ctx, sim.state.clock.dayOfYear)
    const budget = ((set + 0.75 - sim.state.clock.hour) * 3600) / sim.state.timeScale
    let spent = 0
    for (let trip = 0; trip < 4 && (sim.state.chapter.objective?.done ?? 5) < 5; trip++) {
      const wood = sim.state.chapter.objective?.target
      if (wood?.kind !== 'point') throw new Error('the wood has no place')
      spent += walkTo(sim, wood.at, 1.4)
      for (let n = 0; n < 3; n++) spent += holdVerb(sim, 'fetch-wood') ?? 0
      expect(sim.state.inventory.firewood).toBeGreaterThanOrEqual(5)
      const fire = sim.state.chapter.objective?.target
      if (fire?.kind !== 'point') throw new Error('the hearth has no place')
      spent += walkTo(sim, fire.at, 1.4, [], 1.5)
      spent += holdVerb(sim, 'add-wood') ?? 0
      spent += 2
      steps(sim, 2)
    }
    // the objective is met (cleared), well before dark
    expect(sim.state.chapter.objective?.text === 'Bring firewood before dark').toBe(false)
    expect(spent).toBeLessThan(budget * 0.6)
  }, 60_000)

  test('youth.track: Tuk teaches as they go, never more than 45 s without a word at the headless pace', () => {
    const sim = newSim('youth')
    const dir = director(sim)
    for (let i = 0; i < 20 && sim.state.chapter.beatId !== 'youth.track'; i++) {
      dir.completeBeat()
      steps(sim, 0.2)
    }
    expect(sim.state.chapter.beatId).toBe('youth.track')
    let t = 0
    const said: { t: number; who: string | null; text: string }[] = []
    const frame = (to: { x: number; z: number } | null, speed: number) => {
      const p = player(sim).position
      let at = p
      if (to) {
        const left = Math.hypot(to.x - p.x, to.z - p.z)
        const k = left > 0.01 ? Math.min(1, speed / 30 / left) : 0
        at = { x: p.x + (to.x - p.x) * k, z: p.z + (to.z - p.z) * k }
      }
      sim.command({ type: 'move', position: at, heading: 0, speed, anim: to ? 'walk' : 'idle' })
      for (const e of sim.step(1 / 30)) if (e.type === 'caption') said.push({ t, who: e.caption.speaker, text: e.caption.text })
      t += 1 / 30
    }
    const tuk = () => sim.state.people.find((p) => p.id === 'tuk')
    const top = world.poi('plateau-path-top')
    // up the path at 2.5 m/s, then stand by Tuk while he reads the ground, then creep in at 0.8 m/s
    while (t < 200 && sim.state.chapter.beatId === 'youth.track' && sim.state.chapter.objective?.text.startsWith('Follow ') === true) {
      const p = player(sim).position
      frame(Math.hypot(top.x - p.x, top.z - p.z) > 9 ? top : null, 2.5)
    }
    while (t < 260 && sim.state.chapter.beatId === 'youth.track' && !player(sim).skills.includes('tracking')) {
      const f = tuk()
      const p = player(sim).position
      frame(f && Math.hypot(f.position.x - p.x, f.position.z - p.z) > 2 ? f.position : null, 2.2)
    }
    while (t < 420 && sim.state.chapter.beatId === 'youth.track') {
      const p = player(sim).position
      const e = sim.state.animals
        .filter((a) => a.kind === 'eland' && a.alive)
        .sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z))[0]
      frame(e ? e.position : null, 0.8)
    }
    expect(sim.state.chapter.beatId).not.toBe('youth.track')
    const marks = [0, ...said.map((x) => x.t), t]
    const gaps = marks.slice(1).map((m, i) => m - (marks[i] ?? 0))
    expect(Math.max(...gaps)).toBeLessThanOrEqual(45)
    const tukSaid = said.filter((x) => x.who === tuk()?.name).map((x) => x.text)
    expect(tukSaid.length).toBeGreaterThanOrEqual(8)
    expect(tukSaid.some((x) => x.includes('wind on your face'))).toBe(true)
    expect(tukSaid.every((x) => x.split(/\s+/).length <= 14)).toBe(true)
  }, 60_000)

  test('elder.walk remembers: three memories from this life, in order, on the way down', () => {
    const sim = newSim('provider')
    const dir = director(sim)
    // provider (the whale comes) and on into elder, to the last walk
    for (let i = 0; i < 40 && sim.state.chapter.beatId !== 'elder.walk'; i++) {
      dir.completeBeat()
      steps(sim, 0.2)
    }
    expect(sim.state.chapter.beatId).toBe('elder.walk')
    for (let i = 0; i < 30 * 10 && sim.state.chapter.objective?.text !== 'Walk down to the sea'; i++) sim.step(1 / 30)
    const sit = sim.state.chapter.objective?.target
    if (sit?.kind !== 'point') throw new Error('the walk has no place')
    const events: SimEvent[] = []
    walkTo(sim, sit.at, 0.8, events, 2)
    const memories = events.flatMap((e) =>
      e.type === 'caption' && e.caption.id.startsWith('elder.walk:') && e.caption.speaker === null ? [e.caption.text] : [],
    )
    expect(memories.length).toBe(3)
    for (const m of memories) expect(m.split(/\s+/).length).toBeLessThanOrEqual(12)
    const kids = player(sim).childIds.flatMap((id) => sim.state.people.find((p) => p.id === id)?.name ?? [])
    expect(kids.length).toBeGreaterThanOrEqual(2)
    const kidsAt = memories.findIndex((m) => kids.every((k) => m.includes(k)))
    const whaleAt = memories.findIndex((m) => m.includes('whale'))
    expect(kidsAt).toBeGreaterThanOrEqual(0)
    expect(whaleAt).toBeGreaterThan(kidsAt)
    // all said before the sit
    expect(sim.interactionsNear(player(sim).position, 2.5).some((i) => i.verb === 'sit')).toBe(true)
  }, 60_000)

  test('elder.walk opens on the elder standing at the path top, not still seated from the story', () => {
    const sim = newSim('elder')
    const dir = director(sim)
    for (let i = 0; i < 20 && sim.state.chapter.beatId !== 'elder.story'; i++) {
      dir.completeBeat()
      steps(sim, 0.2)
    }
    for (let i = 0; i < 30 * 8 && player(sim).anim !== 'sit'; i++) sim.step(1 / 30)
    expect(player(sim).anim).toBe('sit')
    for (let i = 0; i < 20 && sim.state.chapter.beatId !== 'elder.walk'; i++) {
      dir.completeBeat()
      steps(sim, 0.2)
    }
    for (let i = 0; i < 30 * 8 && sim.state.chapter.objective?.text !== 'Walk down to the sea'; i++) sim.step(1 / 30)
    expect(sim.state.chapter.objective?.text).toBe('Walk down to the sea')
    expect(player(sim).anim).toBe('idle')
  }, 60_000)
})
