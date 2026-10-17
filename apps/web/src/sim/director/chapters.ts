/**
 * The five chapters as data: the design doc's chapter scripts, beat by beat, with its exact copy for objectives
 * and captions. Each beat is a list of steps (see runtime.ts); people are named by their part in the life
 * (mother, father, grandmother…), so an heir's life plays the same scenes with their own family.
 */
import type { Choice, FieldNoteId, LifeStageId, Sex, SimPerson, SkillId, Vec2 } from '../../game/contracts'
import { addAnimal, removeAnimal } from '../animals'
import type { Pose, SimCtx } from '../ctx'
import { addBond } from '../life'
import { randomLook } from '../looks'
import { makeName } from '../names'
import { createAgent } from '../ai'
import { hashString, mix32, Rng } from '../../core/rng'
import { ageBand } from './history'
import {
  around,
  bump,
  caption,
  choice,
  clearObj,
  counter,
  dist,
  dryToward,
  emit,
  extra,
  face,
  fadeIn,
  fadeOut,
  learnSkill,
  minigame,
  nameOf,
  note,
  obj,
  order,
  person,
  place,
  player,
  poi,
  run,
  say,
  skipTo,
  song,
  spot,
  sun,
  teleport,
  until,
  unlockNote,
  wait,
  when,
  type Beat,
  type Chapter,
  type D,
  type Role,
} from './runtime'

// ─── poses ──────────────────────────────────────────────────────────────────────────────────────────────────

const pose = (task: Pose['task'], anim: Pose['anim'], skill: Pose['skill'] = null, right: Pose['right'] = 'none', left: Pose['left'] = 'none'): Pose => ({
  task,
  anim,
  skill,
  right,
  left,
})
const SIT = pose('socialize', 'sit')
const STAND = pose('scripted', 'idle')
const GATHER = pose('gather-shellfish', 'gather', 'shellfish', 'shell', 'bag')
const DIG = pose('dig-corms', 'dig', 'corms', 'digging-stick')
const OFFER_SHELL = pose('scripted', 'crouch', null, 'shell')
const SING = pose('sing', 'sit')
const TRACK = pose('track', 'crouch', 'tracking', 'spear')
const MOURN = pose('mourn', 'mourn')
const FEAST = pose('eat', 'crouch', null, 'stone')

// ─── the cast of a life ─────────────────────────────────────────────────────────────────────────────────────

/** who plays each part: the fixed cast in the first life, the heir's own family after that */
export function castFor(ctx: SimCtx, heir: boolean): Record<string, string> {
  const people = ctx.state.people
  const alive = (id: string | null | undefined) => (id ? people.find((p) => p.id === id && p.alive) : undefined)
  const out: Record<string, string> = {}
  const put = (role: Role, p: SimPerson | undefined) => {
    if (p) out[role] = p.id
  }
  const pl = people.find((p) => p.id === ctx.state.playerId)
  if (!pl) return out
  if (!heir) {
    for (const [role, id] of [
      ['mother', 'ama'],
      ['father', 'tuk'],
      ['grandmother', 'oro'],
      ['sister', 'kaya'],
      ['widow', 'nehe'],
    ] as const) put(role, alive(id))
  } else {
    const mother = alive(pl.motherId)
    const father = alive(pl.fatherId)
    put('mother', mother)
    put('father', father)
    const grans = [mother?.motherId, father?.motherId].map(alive).filter((p): p is SimPerson => !!p)
    const eldest = people.filter((p) => p.alive && !p.isPlayer && p.look.sex === 'female' && p.look.ageYears > 45).sort((a, b) => b.look.ageYears - a.look.ageYears)[0]
    put('grandmother', grans[0] ?? eldest)
    put('sister', people.find((p) => p.alive && !p.isPlayer && p.motherId !== null && p.motherId === pl.motherId && p.look.ageYears > pl.look.ageYears))
  }
  put('partner', alive(pl.partnerId))
  put('child', pl.childIds.map(alive).find((p) => !!p))
  return out
}

// ─── shared bits ────────────────────────────────────────────────────────────────────────────────────────────

const hearth = (d: D): Vec2 => poi(d, 'hearth-main')

/** a seat in the ring around the main hearth, facing the fire */
function hearthSeat(d: D, angle: number, r = 2.6): { at: Vec2; heading: number } {
  const h = hearth(d)
  const at = around(d, h, r, angle)
  return { at, heading: face(at, h) }
}

function seatPlayer(d: D, angle = 0.4): void {
  const s = hearthSeat(d, angle, 3)
  teleport(d, s.at, s.heading)
}

/** the edge of a shellfish bed nearest the path down, dry at the current tide */
function bedEdge(d: D, bedId: string): Vec2 {
  const bed = poi(d, bedId)
  return dryToward(d, poi(d, 'shore-path-bottom'), bed, 0.5)
}

function releaseAll(d: D): void {
  for (const p of d.ctx.state.people) order(d, p.id, null)
}

function relLabel(d: D, who: Role, fallback: string): string {
  const p = person(d, who)
  if (!p) return fallback
  return relationTo(d, p) ?? p.name
}

/** "Grandmother" if that is who she is to the player, else her name */
function relationTo(d: D, p: SimPerson): string | null {
  const pl = player(d)
  const parents = [pl.motherId, pl.fatherId]
  const isGran = d.ctx.state.people.some((q) => parents.includes(q.id) && (q.motherId === p.id || q.fatherId === p.id))
  if (isGran) return p.look.sex === 'female' ? 'Grandmother' : 'Grandfather'
  return null
}

function knownFaces(d: D): number {
  return d.ctx.state.people.filter((p) => !p.isPlayer && p.alive && p.known).length
}

function children(d: D, min: number, max: number): SimPerson[] {
  return d.ctx.state.people.filter((p) => p.alive && !p.isPlayer && !p.carriedBy && p.look.ageYears >= min && p.look.ageYears < max)
}

/** the child who plays the eland: near the player's age, not their own sibling if anyone else can */
function elandChild(d: D): SimPerson | undefined {
  const pl = player(d)
  const kids = children(d, 4, 13)
  const others = kids.filter((k) => k.motherId !== pl.motherId)
  const pool = others.length > 0 ? others : kids
  return pool.sort((a, b) => Math.abs(a.look.ageYears - pl.look.ageYears) - Math.abs(b.look.ageYears - pl.look.ageYears))[0]
}

function herdNearest(d: D, from: Vec2): { id: string; d: number; calm: boolean } | null {
  let best: { id: string; d: number; calm: boolean } | null = null
  for (const a of d.ctx.state.animals) {
    if (a.kind !== 'eland' || !a.alive) continue
    const dd = dist(a.position, from)
    if (!best || dd < best.d) best = { id: a.id, d: dd, calm: d.ctx.brains.get(a.id)?.mode === 'calm' }
  }
  return best
}

// ─── Stage 1: Held ──────────────────────────────────────────────────────────────────────────────────────────

const held: Chapter = {
  stage: 'held',
  title: 'Held',
  subtitle: "Everything is faces, warmth and the sea's breath",
  next: 'small',
  beats: [
    {
      id: 'held.faces',
      steps: [
        run((d) => {
          // Ama by the fire with you in her arms; the family close around her, where a baby can see them
          const s = hearthSeat(d, 0.9, 2.8)
          place(d, 'mother', s.at, s.heading)
          order(d, 'mother', { kind: 'hold', slot: 'arms', pose: SIT, face: hearth(d) })
          const m = person(d, 'mother')
          if (!m) return
          teleport(d, m.position, m.heading)
          // they stand and sit just behind and beside her, facing the baby
          const back = m.heading + Math.PI
          const spots: [Role | string, number, number, Pose][] = [
            ['grandmother', back - 0.5, 1.3, SIT],
            ['father', back + 0.55, 1.5, STAND],
            ['sister', back + 0.05, 1.2, STAND],
            ['widow', back - 1.1, 1.8, STAND],
          ]
          for (const [who, ang, r, ps] of spots) {
            const at = { x: m.position.x + Math.sin(ang) * r, z: m.position.z + Math.cos(ang) * r }
            place(d, who, at, face(at, m.position))
            order(d, who, { kind: 'hold', pose: ps, face: m.position })
          }
        }),
        ...fadeIn(2.5),
        wait(1),
        say('Warmth. A heartbeat. A voice you already know.', null, 6),
        obj('Look at the faces around you', 4, knownFaces),
        until((d) => knownFaces(d) >= 4),
        note('faces'),
        clearObj(),
        wait(2),
      ],
    },
    {
      id: 'held.sea',
      steps: [
        run((d) => {
          for (const who of ['grandmother', 'father', 'sister', 'widow']) order(d, who, null)
          order(d, 'mother', { kind: 'goto', dest: bedEdge(d, 'shore-limpets'), speed: 2, slot: 'back', near: 1.2, face: poi(d, 'shore-limpets') })
        }),
        wait(1.5),
        say('The world sways. Somewhere ahead, something enormous is breathing.', null, 7),
        until((d) => d.ctx.agents.get(person(d, 'mother')?.id ?? '')?.order?.arrived === true, { max: 150 }),
        say('The sea breathes in, and out.', null, 5),
        note('coastal-life'),
        wait(3),
      ],
    },
    {
      id: 'held.shell',
      steps: [
        run((d) => order(d, 'mother', { kind: 'hold', slot: 'back', pose: OFFER_SHELL, face: poi(d, 'shore-limpets') })),
        obj('Reach for what she offers'),
        until((d) => counter(d, 'reach') > 0),
        run((d) => {
          const pl = player(d)
          pl.held.right = 'shell'
          const m = person(d, 'mother')
          if (m) order(d, 'mother', { kind: 'hold', slot: 'back', pose: pose('scripted', 'crouch'), face: poi(d, 'shore-limpets') })
        }),
        say('Look. Small, like you.', 'mother', 4),
        note('shell-beads'),
        clearObj(),
        wait(4),
      ],
      extras: (d) => {
        const m = person(d, 'mother')
        if (!m) return []
        const at = { x: m.position.x + Math.sin(m.heading) * 0.55, z: m.position.z + Math.cos(m.heading) * 0.55 }
        return [extra('shell', 'reach', 'Reach', at, () => {}, { targetKind: 'item', targetId: 'shell' })]
      },
    },
    {
      id: 'held.night',
      steps: [
        run((d) => {
          const s = hearthSeat(d, 0.9, 2.8)
          order(d, 'mother', { kind: 'goto', dest: s.at, speed: 2, slot: 'back', face: hearth(d) })
        }),
        wait(6),
        ...fadeOut(2),
        run((d) => {
          skipTo(d, sun(d).set + 0.5, 1)
          const s = hearthSeat(d, 0.9, 2.8)
          place(d, 'mother', s.at, s.heading)
          order(d, 'mother', { kind: 'hold', slot: 'arms', pose: SIT, face: hearth(d) })
          const g = hearthSeat(d, 2.1, 2.4)
          place(d, 'grandmother', g.at, g.heading)
          order(d, 'grandmother', { kind: 'hold', pose: SING, face: hearth(d) })
          const f = hearthSeat(d, -0.4, 2.7)
          place(d, 'father', f.at, f.heading)
          order(d, 'father', { kind: 'hold', pose: SIT, face: hearth(d) })
          player(d).held.right = 'none'
          const m = person(d, 'mother')
          if (m) teleport(d, m.position, m.heading)
          const fire = d.ctx.fuel['hearth-main']
          if (fire) fire.fuel = Math.max(fire.fuel, 1)
        }),
        ...fadeIn(2.5),
        wait(1),
        song('Your grandmother sings the song about the moon and the tide.', 9),
        wait(10),
        ...fadeOut(3.5),
        wait(1),
      ],
    },
  ],
}

// ─── Stage 2: Small ─────────────────────────────────────────────────────────────────────────────────────────

const small: Chapter = {
  stage: 'small',
  title: 'Small',
  subtitle: 'Learning by watching, the joy and danger of the shore',
  next: 'youth',
  beats: [
    {
      id: 'small.follow',
      scale: 20,
      steps: [
        run((d) => {
          // the morning has begun; the mussel bed is about to come out
          skipTo(d, 8)
          const pl = player(d)
          pl.skills = pl.skills.filter((s) => s !== 'shellfish' && s !== 'corms')
          const s = hearthSeat(d, 0.2, 3.4)
          teleport(d, s.at, face(s.at, poi(d, 'cave-mouth')))
          const m = around(d, s.at, 1.6, 1.4)
          place(d, 'mother', m, face(m, poi(d, 'cave-mouth')))
          order(d, 'mother', { kind: 'goto', dest: bedEdge(d, 'shore-mussels'), waitFor: pl.id, waitDist: 9, near: 1.5, speed: 1.25, face: poi(d, 'shore-mussels') })
        }),
        ...fadeIn(2),
        wait(0.8),
        say('Come. The moon was full. The sea is sleeping.', 'mother'),
        obj((d) => `Follow ${nameOf(d, 'mother', 'Ama')} to the rocks`),
        until((d) => {
          const bed = poi(d, 'shore-mussels')
          const m = person(d, 'mother')
          return dist(player(d).position, bed) < bed.radius + 6 && (!m || dist(m.position, bed) < bed.radius + 6)
        }),
        note('spring-tides'),
      ],
    },
    {
      id: 'small.watch',
      scale: 20,
      steps: [
        run((d) => {
          const m = person(d, 'mother')
          if (m) order(d, 'mother', { kind: 'hold', pose: GATHER, face: poi(d, 'shore-mussels') })
        }),
        obj((d) => `Watch ${nameOf(d, 'mother', 'Ama')} gather mussels`),
        until((d) => player(d).skills.includes('shellfish')),
      ],
    },
    {
      id: 'small.gather',
      scale: 20,
      steps: [
        obj('Gather shellfish (0/12)', 12, (d) => counter(d, 'gather')),
        until((d) => counter(d, 'gather') >= 12),
        note('shellfish'),
        clearObj(),
      ],
    },
    {
      id: 'small.tide',
      scale: 300,
      steps: [
        run((d) => order(d, 'mother', { kind: 'goto', dest: spot(d, poi(d, 'safe-sand'), 10), waitFor: player(d).id, waitDist: 14, near: 1.5 })),
        obj('Get back to the sand before the sea wakes up'),
        until(
          (d) => {
            const sand = poi(d, 'safe-sand')
            const p = player(d).position
            return dist(p, sand) < sand.radius + 3 && d.ctx.world.heightAt(p.x, p.z) > d.ctx.state.clock.seaLevel + 0.5
          },
          {
            // the tide comes in fast for a minute, then at its own pace
            tick: (d) => {
              d.ctx.state.timeScale = d.stepT < 90 && d.ctx.state.clock.seaLevel < 0.3 ? 300 : 72
            },
          },
        ),
        run((d) => {
          d.ctx.state.timeScale = 72
          order(d, 'mother', null)
        }),
        clearObj(),
      ],
    },
    {
      id: 'small.play',
      steps: [
        ...fadeOut(1.2),
        run((d) => {
          const dunes = poi(d, 'play-dunes')
          const kid = elandChild(d)
          const k = spot(d, dunes, 12)
          if (kid) {
            place(d, kid.id, k)
            order(d, kid.id, { kind: 'flee', targetId: player(d).id, speed: 2.3, area: { x: dunes.x, z: dunes.z, r: Math.max(12, dunes.radius) } })
            d.st.cast.eland = kid.id
          }
          const at = around(d, k, 9, 2.2)
          teleport(d, at, face(at, k))
          // the other children run about the dunes on their own
        }),
        ...fadeIn(1.2),
        run((d) => {
          const kid = person(d, 'eland')
          if (kid) caption(d, 'I am the eland! Catch me!', kid.id)
        }),
        obj('Catch the eland'),
        until((d) => counter(d, 'tag') > 0, { max: 60 }),
        run((d) => {
          const kid = person(d, 'eland')
          if (kid && counter(d, 'tag') > 0) {
            caption(d, 'You caught me!', kid.id, undefined, 3)
            addBond(d.ctx, kid, 0.05)
          }
          if (kid) order(d, kid.id, null)
        }),
        note('play'),
        clearObj(),
        wait(2),
      ],
      extras: (d) => {
        const kid = person(d, 'eland')
        if (!kid) return []
        return [extra('tag', 'tag', `Tag ${kid.name}`, kid.position, () => {}, { targetKind: 'person', targetId: kid.id })]
      },
    },
    {
      id: 'small.dig',
      steps: [
        ...fadeOut(1.2),
        run((d) => {
          const slope = poi(d, 'corm-slope')
          const g = spot(d, slope, 8)
          place(d, 'grandmother', g)
          order(d, 'grandmother', { kind: 'hold', pose: DIG, face: poi(d, 'adder-rock') })
          const at = around(d, g, 3.2, face(g, hearth(d)))
          teleport(d, at, face(at, g))
        }),
        ...fadeIn(1.2),
        obj((d) => `Watch ${relLabel(d, 'grandmother', 'Grandmother')} dig`),
        until((d) => player(d).skills.includes('corms'), { tick: adder }),
        obj('Dig corms (0/3)', 3, (d) => counter(d, 'dig')),
        until((d) => counter(d, 'dig') >= 3, { tick: adder }),
        note('corms'),
        note('danger'),
        run((d) => order(d, 'grandmother', null)),
        clearObj(),
      ],
    },
    {
      id: 'small.fire',
      steps: [
        obj('Bring the food to the hearth'),
        until((d) => counter(d, 'given') > 0 || d.ctx.state.inventory.shellfish + d.ctx.state.inventory.corms === 0),
        clearObj(),
        wait(1.5),
        ...fadeOut(1.6),
        run((d) => {
          skipTo(d, sun(d).set - 0.15, 0.5)
          seatPlayer(d, 0.6)
          player(d).needs.fed = Math.max(player(d).needs.fed, 0.9)
        }),
        ...fadeIn(1.8),
        wait(0.5),
        say('The corms roast in the coals. Everyone eats from the same fire.', null, 20),
        wait(20),
        note('sharing'),
        run((d) => {
          const pl = player(d)
          const at = around(d, hearth(d), 2.6, face(hearth(d), pl.position) + 0.7)
          place(d, 'father', at, face(at, hearth(d)))
          order(d, 'father', { kind: 'hold', pose: pose('knap', 'knap', null, 'stone', 'stone'), face: hearth(d) })
        }),
        say('Your father turns a stone in his hands as if he is listening to it.', null, 8),
        wait(8),
        note('fire'),
        wait(2),
        ...fadeOut(3),
        wait(0.8),
      ],
    },
  ],
}

/** the puff adder by the corm patch: come within 2 m and Grandmother stops you */
function adder(d: D): void {
  if (counter(d, 'adder') > 0) return
  const rock = poi(d, 'adder-rock')
  if (dist(player(d).position, rock) > Math.max(2, rock.radius + 1.2)) return
  bump(d, 'adder')
  emit(d, { type: 'camera', cue: { kind: 'shake', strength: 0.35, seconds: 0.6 } })
  emit(d, { type: 'camera', cue: { kind: 'focus', targetId: 'adder-rock', seconds: 1.5 } })
  caption(d, 'Stop. Look where you step.', 'grandmother', undefined, 4)
  unlockNote(d, 'danger')
}

// ─── Stage 3: Coming of age ─────────────────────────────────────────────────────────────────────────────────

const LAGOON_LINES = [
  'You came from the cave by the sea? Your mothers make the finest beads.',
  'My grandmother says your band knows every song about the tide.',
  'Stay for the dancing tonight. Everyone is here.',
]

function spawnLagoon(d: D): void {
  const ctx = d.ctx
  if (ctx.state.people.some((p) => p.familyId === 'lagoon')) return
  const pl = player(d)
  const camp = poi(d, 'lagoon-camp')
  const rng = new Rng(mix32(ctx.state.seed, hashString('lagoon')))
  const taken = new Set(ctx.state.people.map((p) => p.name))
  const sex: Sex = pl.look.sex === 'female' ? 'male' : 'female'
  for (let i = 0; i < 3; i++) {
    const id = `lagoon-${i + 1}`
    const name = makeName(rng, taken)
    taken.add(name)
    const age = 14 + i * 0.8 + rng.range(0, 0.6)
    const at = spot(d, { x: camp.x - 6 + i * 4, z: camp.z + rng.range(-3, 3) }, 10)
    const p: SimPerson = {
      id,
      name,
      look: randomLook(mix32(ctx.state.seed, hashString(id)), sex, age),
      birthDay: ctx.state.clock.day - Math.round(age * 365),
      motherId: null,
      fatherId: null,
      partnerId: null,
      childIds: [],
      familyId: 'lagoon',
      alive: true,
      isPlayer: false,
      position: at,
      heading: 0,
      speed: 0,
      anim: 'idle',
      held: { left: 'none', right: 'none' },
      carrying: null,
      carriedBy: null,
      lookAt: null,
      task: { kind: 'idle', targetId: null, target: null, until: null, skill: null },
      needs: { fed: 0.8, warmth: 0.8, energy: 0.9, health: 1 },
      skills: ['faces', 'shellfish', 'corms', 'tides'],
      bond: 0.2,
      known: true,
      speech: null,
    }
    ctx.state.people.push(p)
    ctx.agents.set(id, createAgent(id, 'sleep-6', 40 + i, i))
    order(d, id, { kind: 'hold', pose: i === 1 ? SIT : STAND, face: { x: camp.x - 60, z: camp.z } })
  }
}

const youth: Chapter = {
  stage: 'youth',
  title: 'Coming of age',
  subtitle: 'Becoming useful, the first hunt, choosing someone',
  next: 'provider',
  beats: [
    {
      id: 'youth.stone',
      steps: [
        run((d) => {
          d.ctx.noAiHunts = true
          skipTo(d, sun(d).rise + 1)
          const ridge = poi(d, 'silcrete-ridge')
          const h = hearth(d)
          const len = dist(ridge, h)
          const k = Math.min(1, (ridge.radius + 60) / len)
          const start = spot(d, { x: ridge.x + (h.x - ridge.x) * k, z: ridge.z + (h.z - ridge.z) * k }, 30)
          teleport(d, start, face(start, ridge))
          const t = around(d, start, 2, face(start, ridge) + 1.2)
          place(d, 'father', t, face(t, ridge))
          order(d, 'father', { kind: 'goto', dest: spot(d, ridge, 12), waitFor: player(d).id, waitDist: 10, near: ridge.radius * 0.5 + 1, face: ridge })
        }),
        ...fadeIn(2),
        wait(0.5),
        obj((d) => `Walk with ${nameOf(d, 'father', 'Tuk')} to the silcrete outcrop`),
        until((d) => {
          const ridge = poi(d, 'silcrete-ridge')
          return dist(player(d).position, ridge) < ridge.radius + 4
        }),
        run((d) => order(d, 'father', { kind: 'hold', pose: pose('knap', 'crouch', null, 'stone'), face: poi(d, 'silcrete-ridge') })),
        obj('Collect silcrete (0/3)', 3, (d) => d.ctx.state.inventory.silcrete),
        until((d) => d.ctx.state.inventory.silcrete >= 3),
        note('silcrete'),
        clearObj(),
      ],
    },
    {
      id: 'youth.heat',
      steps: [
        ...fadeOut(1.4),
        run((d) => {
          seatPlayer(d, 0.3)
          const f = hearthSeat(d, 1.3, 2.6)
          place(d, 'father', f.at, f.heading)
          order(d, 'father', { kind: 'hold', pose: SIT, face: hearth(d) })
        }),
        ...fadeIn(1.4),
        obj('Bury the stones under the hearth'),
        until((d) => counter(d, 'bury-stones') > 0),
        clearObj(),
        wait(1),
        ...fadeOut(2),
        say('Under the coals, all night, the stone slowly changes.', null, 6),
        run((d) => {
          order(d, 'father', null)
          skipTo(d, sun(d).rise + 0.5, 6)
          learnSkill(d, player(d), 'heat', person(d, 'father')?.id ?? null)
          seatPlayer(d, 0.3)
          const f = hearthSeat(d, 1.1, 2.4)
          place(d, 'father', f.at, f.heading)
          order(d, 'father', { kind: 'hold', pose: pose('knap', 'knap', 'knapping', 'stone', 'stone'), face: hearth(d) })
        }),
        wait(5),
        ...fadeIn(2),
        note('heat-treatment'),
      ],
    },
    {
      id: 'youth.knap',
      steps: [
        obj('Shape a spear point'),
        until((d) => counter(d, 'knap') > 0),
        minigame('knapping', (d, q) => {
          const quality = Math.max(0.05, Math.min(1, q))
          d.ctx.state.inventory.point = quality
          d.life.pointQuality = quality
          learnSkill(d, player(d), 'knapping', person(d, 'father')?.id ?? null)
          emit(d, { type: 'item', item: 'point', delta: 1 })
        }),
        note('still-bay'),
        clearObj(),
      ],
      extras: (d) => [
        extra('knap', 'knap', 'Shape a spear point', hearth(d), () => {}, {
          targetId: 'hearth-main',
          reason: player(d).skills.includes('knapping') ? null : "You don't know how yet. Watch someone.",
        }),
      ],
    },
    {
      id: 'youth.haft',
      steps: [
        run((d) => {
          const inv = d.ctx.state.inventory
          if (inv.point <= 0) inv.point = 0.6
          inv.ochre = Math.max(inv.ochre, 1)
          inv.gum = Math.max(inv.gum, 1)
          emit(d, { type: 'item', item: 'ochre', delta: 1 })
          emit(d, { type: 'item', item: 'gum', delta: 1 })
          order(d, 'father', { kind: 'hold', pose: pose('knap', 'knap', 'hafting', 'spear', 'ochre'), face: hearth(d) })
        }),
        obj('Haft the point'),
        until((d) => counter(d, 'haft') > 0 || d.ctx.state.inventory.hafted),
        run((d) => {
          const inv = d.ctx.state.inventory
          inv.hafted = true
          inv.ochre = Math.max(0, inv.ochre - 1)
          inv.gum = Math.max(0, inv.gum - 1)
          learnSkill(d, player(d), 'hafting', person(d, 'father')?.id ?? null)
        }),
        say('Ochre, gum and heat. Three things that make a fourth.', null, 6),
        note('adhesives'),
        clearObj(),
        wait(2),
      ],
    },
    {
      id: 'youth.track',
      steps: [
        run((d) => order(d, 'father', { kind: 'goto', dest: spot(d, poi(d, 'plateau-path-top'), 8), waitFor: player(d).id, waitDist: 12, near: 1.5 })),
        obj((d) => `Follow ${nameOf(d, 'father', 'Tuk')} onto the plateau`),
        until((d) => dist(player(d).position, poi(d, 'plateau-path-top')) < 10),
        ...fadeOut(1.4),
        run((d) => {
          // out on the plateau, downwind of the herd
          const herd = d.ctx.herds[0]
          const c = herd ? herd.center : poi(d, 'eland-plateau')
          const w = d.ctx.state.weather.windDir
          const at = spot(d, { x: c.x + Math.sin(w) * 95, z: c.z + Math.cos(w) * 95 }, 40)
          teleport(d, at, face(at, c))
          const t = around(d, at, 2.5, face(at, c) + 0.9)
          place(d, 'father', t, face(t, c))
          order(d, 'father', { kind: 'hold', pose: TRACK, face: c })
        }),
        ...fadeIn(1.4),
        obj((d) => `Watch ${nameOf(d, 'father', 'Tuk')} read the ground`),
        until((d) => player(d).skills.includes('tracking')),
        note('tracking'),
        run((d) => order(d, 'father', { kind: 'follow', targetId: player(d).id, near: 6, speed: 1.2 })),
        obj("Follow the eland's trail"),
        until((d) => {
          const e = herdNearest(d, player(d).position)
          return e !== null && e.calm && e.d < 32
        }),
      ],
    },
    {
      id: 'youth.throw',
      steps: [
        obj('Get close. Throw.'),
        until((d) => counter(d, 'spear-hit') > 0),
        clearObj(),
        wait(2.5),
        ...fadeOut(1.5),
        run((d) => {
          // no gore: a cut to the carry home
          if (d.lastHit) removeAnimal(d.ctx, d.lastHit)
          const top = poi(d, 'plateau-path-top')
          const at = spot(d, { x: top.x - 14, z: top.z - 14 }, 12)
          teleport(d, at, face(at, hearth(d)))
          const pl = player(d)
          pl.held.right = 'meat'
          learnSkill(d, pl, 'spear', person(d, 'father')?.id ?? null)
          const t = around(d, at, 2, face(at, hearth(d)) + 1.3)
          place(d, 'father', t, face(t, hearth(d)))
          const f = person(d, 'father')
          if (f) f.held = { left: 'none', right: 'meat' }
          const s = hearthSeat(d, 1.5, 3)
          order(d, 'father', { kind: 'goto', dest: s.at, waitFor: pl.id, waitDist: 9, face: hearth(d), pose: pose('scripted', 'idle', null, 'meat') })
        }),
        ...fadeIn(1.5),
        note('hunting'),
      ],
    },
    {
      id: 'youth.share',
      steps: [
        obj('Share the meat'),
        until((d) => counter(d, 'give') > 0),
        choice(
          (d): Choice => {
            const widow = person(d, 'widow')
            const kids = widow ? d.ctx.state.people.filter((p) => p.alive && p.motherId === widow.id) : []
            const options: Choice['options'][number][] = []
            const g = person(d, 'grandmother')
            if (g) options.push({ id: 'grandmother', label: g.name, detail: relLabel(d, 'grandmother', 'Grandmother'), personId: g.id })
            if (widow && kids.length > 0) {
              options.push({ id: 'children', label: `${widow.name}'s children`, detail: kids.map((k) => k.name).join(' and '), personId: kids[0]?.id ?? widow.id })
            }
            const f = person(d, 'father')
            if (f) options.push({ id: 'father', label: f.name, detail: 'Father', personId: f.id })
            if (options.length === 0) options.push({ id: 'everyone', label: 'Everyone at the fire', detail: null, personId: null })
            return { id: 'youth.share', prompt: 'Who eats first?', options }
          },
          (d, id) => {
            d.life.shareChoice = id
            d.ctx.state.hearth.meat += 120
            player(d).held.right = 'none'
            const f = person(d, 'father')
            if (f) f.held.right = 'none'
            const widow = person(d, 'widow')
            const react: Record<string, [Role | string, string, Role | string | null]> = {
              grandmother: ['grandmother', 'The old ones first. You were taught well.', 'grandmother'],
              children: ['widow', 'You fed my children first. I will not forget it.', widow ? widow.id : null],
              father: ['father', 'Me? Then I will give it to the others. That is how it goes round.', 'father'],
              everyone: ['mother', 'Good. Everyone eats.', null],
            }
            const r = react[id]
            if (!r) return
            caption(d, r[1], r[0], undefined, 5)
            const who = r[2] ? person(d, r[2]) : undefined
            if (who) addBond(d.ctx, who, 0.12)
            if (id === 'children' && widow) for (const k of d.ctx.state.people.filter((p) => p.motherId === widow.id)) addBond(d.ctx, k, 0.1)
          },
        ),
        note('reciprocity'),
        clearObj(),
        wait(3),
      ],
      extras: (d) => [extra('share', 'give', 'Share the meat', hearth(d), () => {}, { targetId: 'hearth-main' })],
      allows: (_d, i) => i.verb !== 'give',
    },
    {
      id: 'youth.gathering',
      steps: [
        ...fadeOut(1.6),
        run((d) => {
          releaseAll(d)
          spawnLagoon(d)
          const inv = d.ctx.state.inventory
          inv.beads = 1
          emit(d, { type: 'item', item: 'beads', delta: 1 })
          const camp = poi(d, 'lagoon-camp')
          const at = spot(d, { x: camp.x - camp.radius - 70, z: camp.z + 10 }, 30)
          teleport(d, at, face(at, camp))
        }),
        ...fadeIn(1.6),
        obj('Go to the river mouth'),
        until((d) => {
          const camp = poi(d, 'lagoon-camp')
          return dist(player(d).position, camp) < camp.radius + 8
        }),
        obj('Give your beads to someone'),
        until((d) => d.life.beadsGivenTo !== null || d.ctx.state.inventory.beads === 0),
        run((d) => {
          // a skipped beat still leaves someone holding the beads
          if (d.life.beadsGivenTo === null) {
            d.ctx.state.inventory.beads = 0
            beadsGiven(d, 'lagoon-1')
          }
        }),
        note('networks'),
        clearObj(),
        wait(4),
        ...fadeOut(3),
        wait(0.8),
      ],
      allows: (_d, i) => i.verb !== 'give-beads' || i.targetId.startsWith('lagoon-'),
      talk: (d, id) => {
        const m = /^lagoon-(\d)$/.exec(id)
        if (!m) return null
        return LAGOON_LINES[Number(m[1]) - 1] ?? null
      },
    },
  ],
}

/** the bead gift at the lagoon: whoever gets them becomes the partner */
export function beadsGiven(d: D, toId: string): void {
  const to = d.ctx.state.people.find((p) => p.id === toId)
  if (!to || d.life.beadsGivenTo) return
  d.life.beadsGivenTo = to.name
  if (to.familyId !== 'lagoon') return
  const pl = player(d)
  d.life.partnerName = to.name
  d.life.partnerSex = to.look.sex
  pl.partnerId = to.id
  to.partnerId = pl.id
  caption(d, 'I will wear them. Come back to us soon.', to.id, undefined, 4)
}

// ─── Stage 4: Provider ──────────────────────────────────────────────────────────────────────────────────────

const WHALE_LINES = ['A whale? In the cove? Show me!', 'I will run and tell the others.', 'Bring the stone knives. Bring everyone.', 'The sea has fed us!']

const provider: Chapter = {
  stage: 'provider',
  title: 'Provider',
  subtitle: 'Keeping people alive through the seasons',
  next: 'elder',
  beats: [
    {
      id: 'provider.teach',
      steps: [
        run((d) => {
          d.ctx.noAiHunts = false
          // the chapter opens in full morning light, not the grey before dawn
          skipTo(d, sun(d).rise + 1)
          seatPlayer(d, 0.5)
        }),
        ...fadeIn(2),
        wait(4),
        ...fadeOut(1.5),
        say('Four summers pass.', null, 4),
        run((d) => {
          // the years skip: the child walks now
          ageBand(d.ctx.state.seed, d.ctx.state.people, 4, false)
          const pl = player(d)
          const c = person(d, 'child')
          if (c) {
            const at = around(d, pl.position, 1.5, pl.heading + 1.4)
            place(d, c.id, at, face(at, pl.position))
            order(d, 'child', { kind: 'follow', targetId: pl.id, near: 2.5 })
            d.ctx.pupil = c.id
          }
          for (const p of d.ctx.state.people) {
            if (p.carriedBy && p.look.ageYears >= 2) {
              const carrier = d.ctx.state.people.find((q) => q.id === p.carriedBy)
              if (carrier) carrier.carrying = null
              p.carriedBy = null
            }
          }
        }),
        wait(3.5),
        ...fadeIn(1.5),
        obj('Teach your child to dig corms'),
        until((d) => {
          const c = person(d, 'child')
          return !c || c.skills.includes('corms')
        }),
        run((d) => {
          d.ctx.pupil = null
          const c = person(d, 'child')
          if (c) caption(d, 'Like this? I found one!', c.id, undefined, 4)
        }),
        note('cumulative-culture'),
        clearObj(),
        wait(3),
        run((d) => order(d, 'child', null)),
        // free days until the whale
        until((d) => d.ctx.state.clock.day >= 1 && hourNowGE(d, sun(d).rise + 0.05) && !d.ctx.sleepSkip),
      ],
    },
    {
      id: 'provider.whale',
      steps: [
        run((d) => {
          const beach = poi(d, 'whale-beach')
          if (!d.ctx.state.animals.some((a) => a.kind === 'whale')) {
            const w = addAnimal(d.ctx, 'whale', spot(d, beach, 15), null, { mode: 'dead', until: d.ctx.state.clock.t + 4 * 86_400 })
            w.alive = false
            w.anim = 'dead'
            w.heading = 1.2
          }
        }),
        say('Shouts from the cliff top. A whale has come ashore in the cove!', null, 6),
        obj('Tell the others', 3, (d) => talkedTo(d)),
        until((d) => talkedTo(d) >= 3),
        clearObj(),
        run((d) => {
          const beach = poi(d, 'whale-beach')
          let i = 0
          for (const p of d.ctx.state.people) {
            if (p.isPlayer || !p.alive || p.carriedBy) continue
            const ang = (i++ / 7) * Math.PI * 2
            const at = spot(d, { x: beach.x + Math.sin(ang) * (7 + (i % 3) * 3), z: beach.z + Math.cos(ang) * (5 + (i % 4) * 2) }, 12)
            order(d, p.id, { kind: 'goto', dest: at, face: beach, pose: FEAST, speed: 1.6 })
          }
        }),
        say('The whole band goes down to the cove, and the lagoon people come too. For a day, everyone eats.', null, 8),
        wait(30),
        ...fadeOut(2),
        run((d) => {
          releaseAll(d)
          skipTo(d, sun(d).set - 0.1, 1)
          d.ctx.state.hearth.meat += 300
          for (const p of d.ctx.state.people) if (p.alive) p.needs.fed = Math.max(p.needs.fed, 0.95)
          seatPlayer(d, 0.5)
        }),
        ...fadeIn(2),
        note('whale'),
        until((d) => d.ctx.state.clock.day >= 2 && hourNowGE(d, 13) && !d.ctx.sleepSkip),
      ],
      talk: (d, id) => {
        if (counter(d, `talk:${id}`) > 0 || talkedTo(d) >= 3) return null
        return WHALE_LINES[talkedTo(d) % WHALE_LINES.length] ?? null
      },
    },
    {
      id: 'provider.storm',
      steps: [
        run((d) => {
          // the wood by the fire is wet; the fire needs dry wood from the gully
          d.ctx.state.hearth.firewood = Math.min(d.ctx.state.hearth.firewood, 3)
        }),
        say('The wind turns cold. A storm is coming in from the sea.', null, 5),
        obj('Bring firewood before dark (0/5)', 5, (d) => counter(d, 'wood')),
        until((d) => counter(d, 'wood') >= 5 || hourNowGE(d, sun(d).set + 0.75)),
        run((d) => {
          // a fire fed well holds through the night; a starved one sinks to coals and the cold comes in
          const fu = d.ctx.fuel['hearth-main']
          if (fu && counter(d, 'wood') < 5) fu.fuel = Math.min(fu.fuel, 0.15)
        }),
        clearObj(),
        wait(4),
        ...fadeOut(2.5),
        ...when(
          (d) => person(d, 'grandmother') !== undefined,
          run((d) => {
            releaseAll(d)
            skipTo(d, 3, 1)
            const g = person(d, 'grandmother')
            if (!g) return
            g.alive = false
            g.anim = 'lie-dead'
            g.speed = 0
            g.carrying = null
            const back = poi(d, 'hearth-2')
            const at = spot(d, { x: back.x - 2, z: back.z - 2 }, 8)
            g.position = { x: at.x, z: at.z }
            d.st.cast.departed = g.id
            emit(d, { type: 'death', personId: g.id })
          }),
          say((d) => `In the night, while the storm beats on the cliff, ${departedName(d)} dies.`, null, 6),
          wait(6),
          run((d) => {
            skipTo(d, sun(d).rise + 0.1, 1)
            const g = d.ctx.state.people.find((p) => p.id === d.st.cast.departed)
            if (!g) return
            const mourners = d.ctx.state.people.filter((p) => p.alive && !p.isPlayer && !p.carriedBy && p.look.ageYears > 4)
            mourners.forEach((p, i) => {
              const ang = (i / Math.max(1, mourners.length)) * Math.PI * 2
              const r = 1.6 + (i % 3) * 0.8
              const at = { x: g.position.x + Math.sin(ang) * r, z: g.position.z + Math.cos(ang) * r }
              place(d, p.id, at, face(at, g.position))
              const ps = p.id === d.st.cast.mother ? pose('mourn', 'mourn', 'ochre', 'ochre') : MOURN
              order(d, p.id, { kind: 'hold', pose: ps, face: g.position })
            })
            const at = { x: g.position.x + 3.2, z: g.position.z + 2.2 }
            teleport(d, spot(d, at, 6), face(at, g.position))
          }),
        ),
        ...fadeIn(3),
        ...when(
          (d) => d.st.cast.departed !== undefined,
          say(
            (d) =>
              `At dawn the band gathers around her. ${nameOf(d, 'mother', 'Her daughter')} marks her with red ochre, and they lay her in the earth at the back of the cave.`,
            null,
            9,
          ),
          wait(9),
          note('burial'),
          note('ochre'),
          wait(4),
          run((d) => {
            const g = d.ctx.state.people.find((p) => p.id === d.st.cast.departed)
            if (g) g.anim = 'idle'
            releaseAll(d)
          }),
        ),
        ...fadeOut(3),
        wait(0.8),
      ],
      allows: (_d, i) => i.verb !== 'sleep',
    },
  ],
}

/** "your grandmother", or her name if she was someone else to an heir */
function departedName(d: D): string {
  const g = d.ctx.state.people.find((p) => p.id === d.st.cast.departed)
  if (!g) return 'your grandmother'
  return relationTo(d, g) === 'Grandmother' ? 'your grandmother' : g.name
}

function hourNowGE(d: D, h: number): boolean {
  return d.ctx.state.clock.hour >= h
}

function talkedTo(d: D): number {
  return Object.keys(d.st.counters).filter((k) => k.startsWith('talk:')).length
}

// ─── Stage 5: Elder ─────────────────────────────────────────────────────────────────────────────────────────

const STORIES: { id: string; skill: SkillId; title: string; telling: string }[] = [
  {
    id: 'tides',
    skill: 'tides',
    title: 'The night the sea slept',
    telling: 'You tell them how the moon pulls the sea away from the rocks, and how to know the morning it will sleep.',
  },
  {
    id: 'heat',
    skill: 'heat',
    title: 'How the stone learned fire',
    telling: 'You tell them how the stone sleeps a night under the coals and wakes up sharp and shining.',
  },
  {
    id: 'tracking',
    skill: 'tracking',
    title: "The eland's trail",
    telling: 'You tell them how the eland writes its name in the sand, and how the wind carries yours to it.',
  },
]

/** where the elder sits: above the high-water line below the shore path, so it holds still through the tide */
function sitPoint(d: D): Vec2 {
  const bottom = poi(d, 'shore-path-bottom')
  return dryToward(d, bottom, poi(d, 'shore-mussels'), 1, 1.3)
}

/** the sit is offered wherever the elder stops once they are down on the shore */
function sitHere(d: D): Vec2 {
  const at = sitPoint(d)
  const pl = player(d)
  return dist(pl.position, at) < 7 ? { x: pl.position.x, z: pl.position.z } : at
}

const elder: Chapter = {
  stage: 'elder',
  title: 'Elder',
  subtitle: 'Passing it on, and letting go',
  next: null,
  beats: [
    {
      id: 'elder.mark',
      steps: [
        run((d) => {
          skipTo(d, sun(d).rise + 1.5)
          seatPlayer(d, 0.4)
        }),
        ...fadeIn(2),
        wait(1),
        obj('Engrave the ochre'),
        until((d) => counter(d, 'engrave') > 0),
        minigame('engraving', (d, q) => {
          d.life.engraving = Math.max(0, Math.min(1, q))
          learnSkill(d, player(d), 'engraving', null)
        }),
        note('engraved-ochre'),
        clearObj(),
        wait(3),
      ],
      extras: (d) => [extra('engrave', 'engrave', 'Engrave the ochre', hearth(d), () => {}, { targetId: 'hearth-main' })],
    },
    {
      id: 'elder.story',
      steps: [
        ...fadeOut(2),
        run((d) => {
          skipTo(d, sun(d).set + 1, 1)
          seatPlayer(d, 0.4)
          const pl = player(d)
          const kids = children(d, 3, 16)
          kids.forEach((k, i) => {
            const ang = face(hearth(d), pl.position) + 0.5 + i * 0.42
            const s = hearthSeat(d, ang, 2.4 + (i % 2) * 0.7)
            place(d, k.id, s.at, s.heading)
            order(d, k.id, { kind: 'hold', pose: SIT, face: pl.position })
          })
        }),
        ...fadeIn(2),
        obj('Tell a story at the fire'),
        until((d) => counter(d, 'tell-story') > 0),
        choice(
          (d): Choice => {
            const pl = player(d)
            const known = STORIES.filter((s) => pl.skills.includes(s.skill))
            const list = known.length > 0 ? known : STORIES
            return {
              id: 'elder.story',
              prompt: 'Which story will you tell?',
              options: list.map((s) => ({ id: s.id, label: s.title, detail: null, personId: null })),
            }
          },
          (d, id) => {
            const story = STORIES.find((s) => s.id === id)
            if (!story) return
            d.life.storyTold = story.title
            const pl = player(d)
            caption(d, story.telling, null, undefined, 8)
            // the children who hear it learn it
            for (const k of children(d, 3, 16)) {
              if (dist(k.position, pl.position) < 9) learnSkill(d, k, story.skill, pl.id)
            }
          },
        ),
        wait(8),
        note('stories'),
        clearObj(),
        wait(3),
        run((d) => releaseAll(d)),
      ],
      extras: (d) => [extra('story', 'tell-story', 'Tell a story', hearth(d), () => {}, { targetId: 'hearth-main' })],
    },
    {
      id: 'elder.walk',
      steps: [
        ...fadeOut(2.5),
        run((d) => {
          skipTo(d, sun(d).rise - 0.2, 4)
          const top = poi(d, 'shore-path-top')
          teleport(d, top, face(top, poi(d, 'shore-path-bottom')))
        }),
        ...fadeIn(3),
        obj('Walk down to the sea'),
        until((d) => counter(d, 'sit') > 0),
        clearObj(),
        wait(4),
        ...fadeOut(4),
        wait(1),
      ],
      extras: (d) => [extra('sit', 'sit', 'Sit by the sea', sitHere(d), () => {}, { targetKind: 'poi', targetId: 'shore' })],
    },
  ],
}

export const CHAPTERS: Record<LifeStageId, Chapter> = { held, small, youth, provider, elder }

/** the Field Notes each chapter unlocks, so a life started at a later chapter carries the earlier ones */
export const NOTES_BY_STAGE: Record<LifeStageId, readonly FieldNoteId[]> = {
  held: ['faces', 'coastal-life', 'shell-beads'],
  small: ['spring-tides', 'shellfish', 'play', 'corms', 'danger', 'sharing', 'fire'],
  youth: ['silcrete', 'heat-treatment', 'still-bay', 'adhesives', 'tracking', 'hunting', 'reciprocity', 'networks'],
  provider: ['cumulative-culture', 'whale', 'burial', 'ochre'],
  elder: ['engraved-ochre', 'stories'],
}

/** every beat id in order, for the lab and tests */
export const BEAT_IDS: readonly string[] = Object.values(CHAPTERS).flatMap((c) => c.beats.map((b: Beat) => b.id))

