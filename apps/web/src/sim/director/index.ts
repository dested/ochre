/**
 * The director: runs the five chapters of a life as data (`chapters.ts`) on top of the living band. It owns the
 * objective line, captions, notes, choices, minigames, camera cues and time skips, hands the life from one
 * chapter to the next in place, writes the life summary and starts an heir's life.
 */
import type { Interaction, LifeStageId, MinigameId } from '../../game/contracts'
import { setOrder } from '../ai'
import type { DirectorHooks } from '../ctx'
import type { DirectorSave } from '../save'
import { resetStage } from '../setup'
import { beadsGiven, CHAPTERS, castFor, NOTES_BY_STAGE } from './chapters'
import { emptyLife, heirBand, nextBandFirstLife, nextBandHeir, pickHeir, seededLife } from './history'
import {
  bump,
  dist,
  emit,
  objectiveNow,
  targetKey,
  player,
  restoreScale,
  type Beat,
  type D,
  type DirectorHost,
  type Extra,
} from './runtime'

export type Director = {
  /** after the world's substeps, on the player's clock (real seconds) */
  update(realDt: number): void
  /** an interaction just happened (sandbox or director); `before` is the inventory before it */
  onInteract(i: Interaction, before: { firewood: number; food: number }): void
  onSpearHit(animalId: string, hit: boolean): void
  onMinigame(game: MinigameId, quality: number): void
  onChoose(choiceId: string, optionId: string): void
  continueAsHeir(): void
  /** finish the current beat now (the lab's and QA's button); `toFree` stops at the beat's next free wait instead */
  completeBeat(opts?: { toFree?: boolean }): void
  readonly beatId: string
  readonly hooks: DirectorHooks
  save(): DirectorSave
}

export function createDirector(host: DirectorHost, stage: LifeStageId, saved: DirectorSave | null): Director {
  const ctx = host.ctx
  const st: DirectorSave = saved ?? {
    stage,
    beat: 0,
    begun: false,
    finished: false,
    heir: false,
    cast: castFor(ctx, false),
    counters: {},
    life: seededLife(stage, ctx.state.people),
  }
  const d: D = {
    ctx,
    host,
    st,
    stepT: 0,
    answer: null,
    forced: false,
    toFree: false,
    objective: null,
    objectiveKey: '',
    captionN: 0,
    beatId: '',
    life: st.life,
    lastHit: null,
  }
  let stepIndex = 0
  let entered = false
  let enteredBeat = -1

  const chapter = () => CHAPTERS[st.stage]
  const beat = (): Beat | undefined => chapter().beats[st.beat]

  function enterBeat(b: Beat): void {
    enteredBeat = st.beat
    d.beatId = b.id
    d.forced = false
    // an answer to a skipped beat's minigame or choice never reaches the next one
    d.answer = null
    if (!st.life.lived.includes(b.id)) st.life.lived.push(b.id)
    st.counters = {}
    stepIndex = 0
    entered = false
    d.stepT = 0
    ctx.state.chapter.beatId = b.id
    ctx.state.chapter.stage = st.stage
    if (b.scale !== undefined) ctx.state.timeScale = b.scale
    else restoreScale(d)
  }

  function syncObjective(): void {
    // a moment's aside ("Go with Tuk after the honeyguide") stands in for a free wait's objective while it lasts,
    // and fills in whenever the beat sets none of its own
    const aside = ctx.moments.aside
    const o = (aside && hooks.free() ? aside : null) ?? objectiveNow(d) ?? aside
    const key = o ? `${o.id}|${o.text}|${o.done ?? ''}|${targetKey(o.target)}` : ''
    if (key === d.objectiveKey) return
    d.objectiveKey = key
    ctx.state.chapter.objective = o
    emit(d, { type: 'objective', objective: o })
  }

  function beginChapter(): void {
    const c = chapter()
    st.begun = true
    st.finished = false
    st.beat = 0
    enteredBeat = -1
    const pl = player(d)
    // an heir's life starts with an empty record: its mother is whoever is here
    if (st.life.motherName === null) st.life.motherName = ctx.state.people.find((p) => p.id === pl.motherId)?.name ?? null
    ctx.state.chapter = { stage: c.stage, beatId: '', objective: null, finished: false }
    d.objective = null
    d.objectiveKey = ''
    emit(d, { type: 'objective', objective: null })
    emit(d, { type: 'chapter-start', stage: c.stage, title: c.title, subtitle: c.subtitle, ageYears: Math.floor(pl.look.ageYears) })
    emit(d, { type: 'sfx', name: 'chapter', at: null })
  }

  /** chapter-end, then the next stage set up in the same sim */
  function endChapter(): void {
    const c = chapter()
    emit(d, { type: 'chapter-end', stage: c.stage, next: c.next })
    for (const p of ctx.state.people) setOrder(ctx, p.id, null)
    if (!c.next) {
      st.finished = true
      ctx.state.chapter.finished = true
      d.objective = null
      syncObjective()
      summary()
      return
    }
    const next = c.next
    const people = st.heir
      ? nextBandHeir(ctx.state.seed, next, [...ctx.state.people], ctx.state.playerId, st.life)
      : nextBandFirstLife(ctx.state.seed, host.playerName, next, ctx.state.people, st.life)
    const notes = ctx.state.notes
    resetStage(ctx, next, people)
    ctx.state.notes = notes
    st.stage = next
    st.cast = castFor(ctx, st.heir)
    beginChapter()
  }

  function summary(): void {
    const pl = player(d)
    const kids = ctx.state.people.filter((p) => pl.childIds.includes(p.id))
    const heir = pickHeir(ctx.state.people, pl.id)
    emit(d, {
      type: 'life-summary',
      summary: {
        name: pl.name,
        years: Math.floor(pl.look.ageYears),
        children: kids.map((k) => k.name),
        taught: st.life.taught.map((x) => ({ ...x })),
        storyTold: st.life.storyTold,
        beadsGivenTo: st.life.beadsGivenTo,
        notesFound: ctx.state.notes.length,
        heirId: heir?.id ?? null,
        heirName: heir?.name ?? null,
      },
    })
  }

  /** run steps until one blocks */
  function advance(realDt: number): void {
    d.stepT += realDt
    for (let guard = 0; guard < 400; guard++) {
      if (st.finished) return
      const b = beat()
      if (!b) {
        endChapter()
        if (st.finished) return
        continue
      }
      if (enteredBeat !== st.beat) enterBeat(b)
      const step = b.steps[stepIndex]
      if (!step) {
        st.beat++
        continue
      }
      const first = !entered
      entered = true
      let done = false
      switch (step.k) {
        case 'do':
          step.fn(d)
          done = true
          break
        case 'wait':
          done = d.forced || d.stepT >= step.s
          break
        case 'until':
          if (d.forced && d.toFree && step.free) d.forced = false
          step.tick?.(d)
          done = d.forced || step.test(d) || (step.max !== undefined && d.stepT >= step.max)
          break
        case 'minigame': {
          if (first && !d.forced) emit(d, { type: 'minigame', game: step.game })
          const a = d.answer
          if (a && 'game' in a && a.game === step.game) {
            d.answer = null
            step.then(d, a.quality)
            done = true
          } else if (d.forced) {
            step.then(d, 0.7)
            done = true
          }
          break
        }
        case 'choice': {
          const c = step.make(d)
          if (first && !d.forced) emit(d, { type: 'choice', choice: c })
          const a = d.answer
          if (a && 'choiceId' in a && a.choiceId === c.id && c.options.some((o) => o.id === a.optionId)) {
            d.answer = null
            step.then(d, a.optionId)
            done = true
          } else if (d.forced) {
            const o = c.options[0]
            if (o) step.then(d, o.id)
            done = true
          }
          break
        }
        case 'unless':
          if (!step.test(d)) stepIndex += step.n
          done = true
          break
      }
      if (!done) break
      // a step that ended the life or moved the chapter on leaves the index to the new beat
      if (enteredBeat !== st.beat || st.finished) continue
      stepIndex++
      entered = false
      d.stepT = 0
    }
  }

  /** the unscripted moments the life went through, once each */
  function collectLived(): void {
    const m = ctx.moments.active
    if (!m) return
    const key = `${st.stage}:${m.id}`
    if (!st.life.lived.includes(key)) st.life.lived.push(key)
  }

  function collectTaught(): void {
    const pid = ctx.state.playerId
    for (const e of ctx.events) {
      if (e.type !== 'learned' || e.fromId !== pid || e.personId === pid) continue
      const p = ctx.state.people.find((q) => q.id === e.personId)
      if (p && !st.life.taught.some((x) => x.name === p.name && x.skill === e.skill)) st.life.taught.push({ name: p.name, skill: e.skill })
    }
  }

  function extrasHere(): Extra[] {
    const b = beat()
    return b?.extras ? b.extras(d) : []
  }

  const hooks: DirectorHooks = {
    extras(p, radius) {
      return extrasHere()
        .filter((x) => dist(p, x.i.position) <= radius + (x.i.targetKind === 'poi' ? 2 : 0.5))
        .map((x) => x.i)
    },
    allows(i) {
      const b = beat()
      return b?.allows ? b.allows(d, i) : true
    },
    talk(personId) {
      const b = beat()
      return b?.talk ? b.talk(d, personId) : null
    },
    free() {
      const step = beat()?.steps[stepIndex]
      return st.begun && !st.finished && step?.k === 'until' && step.free === true
    },
  }

  const director: Director = {
    update(realDt) {
      if (!st.begun) beginChapter()
      collectTaught()
      collectLived()
      advance(realDt)
      syncObjective()
    },
    onInteract(i, before) {
      if (i.id.startsWith('dir:')) {
        const x = extrasHere().find((e) => e.i.id === i.id)
        bump(d, i.verb)
        x?.act(d)
        return
      }
      bump(d, i.verb)
      if (i.verb === 'talk') bump(d, `talk:${i.targetId}`)
      const inv = ctx.state.inventory
      if (i.verb === 'add-wood') bump(d, 'wood', before.firewood - inv.firewood)
      if (i.verb === 'give') bump(d, 'given', before.food - (inv.shellfish + inv.corms))
      if (i.verb === 'give-beads') beadsGiven(d, i.targetId)
    },
    onSpearHit(animalId, hit) {
      if (hit) {
        bump(d, 'spear-hit')
        d.lastHit = animalId
      } else bump(d, 'spear-miss')
    },
    onMinigame(game, quality) {
      d.answer = { game, quality }
    },
    onChoose(choiceId, optionId) {
      d.answer = { choiceId, optionId }
    },
    continueAsHeir() {
      if (!st.finished) return
      const people = [...ctx.state.people]
      const made = heirBand(ctx.state.seed, people, ctx.state.playerId)
      if (!made) return
      const notes = ctx.state.notes
      ctx.state.playerId = made.heir.id
      resetStage(ctx, 'small', made.people)
      ctx.state.notes = notes
      st.heir = true
      st.stage = 'small'
      st.life = emptyLife()
      d.life = st.life
      st.cast = castFor(ctx, true)
      beginChapter()
      advance(0)
      syncObjective()
    },
    completeBeat(opts) {
      if (st.finished) return
      if (!st.begun) {
        beginChapter()
        advance(0)
      }
      d.forced = true
      d.toFree = opts?.toFree === true
      const at = st.beat
      const stage = st.stage
      for (let i = 0; i < 64 && d.forced && st.beat === at && st.stage === stage && !st.finished; i++) advance(0)
      d.forced = false
      d.toFree = false
      syncObjective()
    },
    get beatId() {
      return d.beatId
    },
    hooks,
    save() {
      return JSON.parse(JSON.stringify(st))
    },
  }

  if (!saved) {
    // a life started at a later chapter has already found the earlier chapters' notes
    const order: LifeStageId[] = ['held', 'small', 'youth', 'provider', 'elder']
    for (const s of order.slice(0, order.indexOf(stage))) {
      for (const n of NOTES_BY_STAGE[s]) if (!ctx.state.notes.includes(n)) ctx.state.notes.push(n)
    }
  }
  if (saved) {
    // a loaded life resumes at the start of its beat (orders and positions are re-issued there)
    enteredBeat = -1
  }
  return director
}
