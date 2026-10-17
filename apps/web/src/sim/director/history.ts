/**
 * A life's history between chapters: who is alive, how old, who the player married, whose child carries on.
 * The first life follows the fixed cast through `buildBand`, carrying over names, bonds and what the player knows;
 * an heir's life ages the band it inherited.
 */
import { hashString, mix32, Rng } from '../../core/rng'
import type { LifeStageId, Sex, SimPerson, SkillId } from '../../game/contracts'
import { buildBand, defaultSkills, PLAYER_SKILLS, STAGE_AGE } from '../band'
import { randomLook } from '../looks'
import { makeName } from '../names'
import type { DirectorSave } from '../save'

/** what the director remembers of the life so far */
export type LifeRecord = DirectorSave['life']

export function emptyLife(): LifeRecord {
  return {
    beadsGivenTo: null,
    partnerName: null,
    partnerSex: null,
    storyTold: null,
    taught: [],
    shareChoice: null,
    pointQuality: null,
    engraving: null,
    motherName: null,
    lived: [],
  }
}

/** a chapter entered from the title: what the years before it would have left behind */
export function seededLife(stage: LifeStageId, people: readonly SimPerson[]): LifeRecord {
  const life = emptyLife()
  // the first life's mother is always the fixed cast's Ama, here or long gone
  life.motherName = people.find((p) => p.id === 'ama')?.name ?? 'Ama'
  const partner = people.find((p) => p.id === 'partner')
  if ((stage === 'provider' || stage === 'elder') && partner) {
    life.beadsGivenTo = partner.name
    life.partnerName = partner.name
    life.partnerSex = partner.look.sex
  }
  const child = people.find((p) => p.id === 'child-1')
  if (stage === 'elder' && child) life.taught.push({ name: child.name, skill: 'corms' })
  return life
}

const YEAR = 365

function union(a: readonly SkillId[], b: readonly SkillId[]): SkillId[] {
  return [...new Set([...a, ...b])]
}

function setAge(p: SimPerson, seed: number, age: number, sex: Sex = p.look.sex): void {
  p.look = randomLook(mix32(seed, hashString(p.id)), sex, age)
  p.birthDay = -Math.round(age * YEAR)
}

/** carried infants: anyone under two rides with their mother; everyone older walks */
function recarry(people: SimPerson[], carrierOf: (p: SimPerson) => string | null): void {
  const byId = new Map(people.map((p) => [p.id, p]))
  for (const p of people) {
    p.carrying = null
    p.carriedBy = null
  }
  for (const p of people) {
    if (!p.alive || p.look.ageYears >= 2) continue
    const carrier = byId.get(carrierOf(p) ?? '')
    if (!carrier || !carrier.alive || carrier.carrying) continue
    carrier.carrying = { id: p.id, slot: 'back' }
    p.carriedBy = carrier.id
  }
}

/**
 * The first life: the next stage's band from `buildBand`, with the people who were already here keeping their
 * names, sex and bonds, the player keeping every skill they learned, and the partner they chose at the lagoon.
 */
export function nextBandFirstLife(seed: number, playerName: string, next: LifeStageId, old: readonly SimPerson[], life: LifeRecord): SimPerson[] {
  const fresh = buildBand(seed, next, playerName)
  const before = new Map(old.map((p) => [p.id, p]))
  const taken = new Set(fresh.map((p) => p.name))
  const rng = new Rng(mix32(seed, hashString(`names-${next}`)))
  const rename = (name: string, except: SimPerson) => {
    const clash = fresh.find((q) => q !== except && q.name === name)
    if (clash) {
      const n = makeName(rng, taken)
      taken.add(n)
      clash.name = n
    }
  }
  for (const p of fresh) {
    const was = before.get(p.id)
    if (was) {
      if (was.name !== p.name) {
        rename(was.name, p)
        p.name = was.name
      }
      if (was.look.sex !== p.look.sex) setAge(p, seed, p.look.ageYears, was.look.sex)
      p.bond = Math.max(p.bond, was.bond)
      if (p.isPlayer) p.skills = union(was.skills, p.skills)
    }
    p.known = true
  }
  const partner = fresh.find((p) => p.id === 'partner')
  if (partner && life.partnerName) {
    rename(life.partnerName, partner)
    partner.name = life.partnerName
  }
  return fresh
}

/** the descendant who carries on: a grandchild (or child) nearest six, the age the next life starts at */
export function pickHeir(people: readonly SimPerson[], playerId: string): SimPerson | null {
  const player = people.find((p) => p.id === playerId)
  if (!player) return null
  const children = people.filter((p) => p.alive && player.childIds.includes(p.id))
  const grandchildren = people.filter((p) => p.alive && children.some((c) => c.childIds.includes(p.id)))
  const pool = [...grandchildren, ...children].filter((p) => p.look.ageYears <= 12)
  const all = pool.length > 0 ? pool : [...grandchildren, ...children]
  let best: SimPerson | null = null
  for (const p of all) if (!best || Math.abs(p.look.ageYears - 6) < Math.abs(best.look.ageYears - 6)) best = p
  return best
}

/**
 * Years pass for a band that is not the fixed cast's (an heir's life): everyone ages, the very old die, the
 * grown learn what grown people know. Returns who died.
 */
export function ageBand(seed: number, people: SimPerson[], years: number, mortal = true): string[] {
  const rng = new Rng(mix32(seed, hashString(`age-${years}-${people.length}`)))
  const died: string[] = []
  for (const p of people) {
    if (!p.alive) continue
    const age = p.look.ageYears + years
    setAge(p, seed, age)
    if (mortal && !p.isPlayer && age > 74) {
      p.alive = false
      p.anim = 'idle'
      died.push(p.id)
      continue
    }
    if (!p.isPlayer) p.skills = union(p.skills, defaultSkills(rng, p.look.sex, age))
  }
  recarry(people, (p) => p.motherId)
  return died
}

/** the heir's first chapter: the old player gone, the heir six, the band around them aged to match */
export function heirBand(seed: number, people: SimPerson[], playerId: string): { heir: SimPerson; people: SimPerson[] } | null {
  const heir = pickHeir(people, playerId)
  const old = people.find((p) => p.id === playerId)
  if (!heir || !old) return null
  old.alive = false
  old.isPlayer = false
  old.anim = 'idle'
  old.carrying = null
  const years = Math.max(0, Math.round(STAGE_AGE.small - heir.look.ageYears))
  heir.isPlayer = true
  ageBand(seed, people, years)
  heir.skills = union(heir.skills, PLAYER_SKILLS.small)
  heir.bond = 1
  for (const p of people) p.known = true
  return { heir, people }
}

/** an heir's later chapters: years pass, and the life gains a partner, children and grandchildren as it goes */
export function nextBandHeir(seed: number, next: LifeStageId, people: SimPerson[], playerId: string, life: LifeRecord): SimPerson[] {
  const player = people.find((p) => p.id === playerId)
  if (!player) return people
  const years = STAGE_AGE[next] - player.look.ageYears
  ageBand(seed, people, Math.max(0, years))
  player.skills = union(player.skills, PLAYER_SKILLS[next])
  const rng = new Rng(mix32(seed, hashString(`heir-${next}`)))
  const taken = new Set(people.map((p) => p.name))
  const name = () => {
    const n = makeName(rng, taken)
    taken.add(n)
    return n
  }
  const other: Sex = player.look.sex === 'female' ? 'male' : 'female'
  const add = (id: string, nm: string, sex: Sex, age: number, extra: Partial<SimPerson>): SimPerson => {
    const p: SimPerson = {
      id,
      name: nm,
      look: randomLook(mix32(seed, hashString(id)), sex, age),
      birthDay: -Math.round(age * YEAR),
      motherId: null,
      fatherId: null,
      partnerId: null,
      childIds: [],
      familyId: player.familyId,
      alive: true,
      isPlayer: false,
      position: { ...player.position },
      heading: 0,
      speed: 0,
      anim: 'idle',
      held: { left: 'none', right: 'none' },
      carrying: null,
      carriedBy: null,
      lookAt: null,
      task: { kind: 'idle', targetId: null, target: null, until: null, skill: null },
      needs: { fed: 0.8, warmth: 0.8, energy: 0.9, health: 1 },
      skills: defaultSkills(rng, sex, age),
      bond: 0.85,
      known: true,
      speech: null,
      ...extra,
    }
    people.push(p)
    return p
  }
  const pid = player.id
  if (next === 'provider' || next === 'elder') {
    let partner = people.find((p) => p.id === player.partnerId && p.alive)
    if (!partner) {
      const sex = life.partnerSex ?? other
      partner = add(`${pid}-partner`, life.partnerName ?? name(), sex, player.look.ageYears - 1, { partnerId: pid, bond: 0.9 })
      player.partnerId = partner.id
    }
    const [m, f] = player.look.sex === 'female' ? [pid, partner.id] : [partner.id, pid]
    const kids = people.filter((p) => player.childIds.includes(p.id))
    const want: [number, string][] = next === 'provider' ? [[1, 'a']] : [[32, 'a'], [28, 'b'], [23, 'c']]
    for (const [age, tag] of want.slice(kids.length)) {
      const c = add(`${pid}-child-${tag}`, name(), rng.chance(0.5) ? 'female' : 'male', age, { motherId: m, fatherId: f, bond: 0.95 })
      player.childIds.push(c.id)
      partner.childIds.push(c.id)
    }
    if (next === 'elder') {
      for (const c of people.filter((p) => player.childIds.includes(p.id) && p.alive && p.look.ageYears >= 25)) {
        if (c.childIds.length > 0) continue
        const g = add(`${c.id}-child`, name(), rng.chance(0.5) ? 'female' : 'male', rng.range(3, 10), {
          motherId: c.look.sex === 'female' ? c.id : null,
          fatherId: c.look.sex === 'male' ? c.id : null,
          familyId: c.familyId,
          bond: 0.8,
        })
        c.childIds.push(g.id)
      }
    }
  }
  // the player's own baby rides with the player in Provider
  recarry(people, (p) => (next === 'provider' && player.childIds.includes(p.id) ? pid : p.motherId))
  return people
}
