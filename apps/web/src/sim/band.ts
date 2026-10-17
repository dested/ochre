/**
 * The band for a stage of the player's life: the fixed cast (Ama, Tuk, Oro, Kaya, Nehe and her children) placed
 * at the right ages, plus the other families, 22 people in all. Deterministic for a seed.
 */
import { Rng, hashString, mix32 } from '../core/rng'
import type { LifeStageId, Sex, SimPerson, SkillId } from '../game/contracts'
import { randomLook } from './looks'
import { makeName } from './names'

export const STAGE_AGE: Record<LifeStageId, number> = { held: 0, small: 6, youth: 14, provider: 26, elder: 58 }

export const PLAYER_ID = 'player'

/** the player's skills when a stage begins (what a life so far would have taught) */
export const PLAYER_SKILLS: Record<LifeStageId, SkillId[]> = {
  held: [],
  small: ['faces'],
  youth: ['faces', 'shellfish', 'tides', 'corms', 'fire'],
  provider: ['faces', 'shellfish', 'tides', 'corms', 'fire', 'knapping', 'heat', 'hafting', 'tracking', 'spear', 'beads', 'hides'],
  elder: [
    'faces', 'shellfish', 'tides', 'corms', 'fire', 'knapping', 'heat', 'hafting', 'tracking', 'spear', 'beads', 'hides',
    'ochre', 'medicine', 'stories',
  ],
}

type Spec = {
  id: string
  name: string
  sex: Sex
  age: number
  familyId: string
  motherId?: string
  fatherId?: string
  partnerId?: string
  skills?: SkillId[]
  bond?: number
}

/** generic skills for an age and sex; elders know the old things */
function defaultSkills(rng: Rng, sex: Sex, age: number): SkillId[] {
  const s = new Set<SkillId>()
  if (age >= 1) s.add('faces')
  if (age >= 8) {
    s.add('shellfish')
    s.add('corms')
  }
  if (age >= 10) s.add('tides')
  if (age >= 12) s.add('fire')
  if (sex === 'female' && age >= 13) {
    s.add('beads')
    if (age >= 16) s.add('hides')
    if (age >= 20 && rng.chance(0.4)) s.add('ochre')
    if (age >= 25 && rng.chance(0.3)) s.add('medicine')
  }
  if (sex === 'male' && age >= 14) {
    s.add('tracking')
    if (age >= 15) s.add('knapping')
    if (age >= 16) {
      s.add('spear')
      s.add('heat')
      s.add('hafting')
      s.add('hides')
    }
  }
  if (age >= 50) {
    s.add('stories')
    if (rng.chance(0.6)) s.add('medicine')
    if (rng.chance(0.5)) s.add('ochre')
    if (rng.chance(0.4)) s.add('engraving')
  }
  return [...s]
}

type Member = [sex: Sex | null, age: number]
/** other families: [father, mother, ...children]; a third adult past the children is an elder relative */
type FamilyTemplate = Member[]

const OTHERS_EARLY: FamilyTemplate[] = [
  [['male', 61], ['female', 55], [null, 14]],
  [['male', 34], ['female', 30], [null, 12], [null, 7]],
  [['male', 26], ['female', 24], [null, 0.5]],
  [['male', 40], ['female', 36], [null, 15], [null, 10]],
]

export function buildBand(seed: number, stage: LifeStageId, playerName: string): SimPerson[] {
  const rng = new Rng(mix32(seed, 0xba4d))
  const P = STAGE_AGE[stage]
  const playerSex: Sex = rng.chance(0.5) ? 'female' : 'male'
  const other = (s: Sex): Sex => (s === 'female' ? 'male' : 'female')
  const specs: Spec[] = []
  const taken = new Set<string>()
  const name = (): string => {
    const n = makeName(rng, taken)
    taken.add(n)
    return n
  }
  const add = (s: Spec): string => {
    specs.push(s)
    taken.add(s.name)
    return s.id
  }

  const playerSpec = (familyId: string, extra: Partial<Spec> = {}): void => {
    add({
      id: PLAYER_ID,
      name: playerName,
      sex: playerSex,
      age: P,
      familyId,
      skills: PLAYER_SKILLS[stage],
      bond: 1,
      ...extra,
    })
  }

  if (P <= 14) {
    // the player's family: grandmother Oro, mother Ama, father Tuk, older sister Kaya, maybe a younger sibling
    add({ id: 'oro', name: 'Oro', sex: 'female', age: P + 56, familyId: 'fam-a', bond: 0.85,
      skills: ['faces', 'corms', 'medicine', 'stories', 'ochre', 'engraving', 'fire', 'shellfish', 'tides', 'hides'] })
    add({ id: 'ama', name: 'Ama', sex: 'female', age: P + 22, familyId: 'fam-a', motherId: 'oro', partnerId: 'tuk', bond: 0.95,
      skills: ['faces', 'shellfish', 'tides', 'corms', 'beads', 'hides', 'fire'] })
    add({ id: 'tuk', name: 'Tuk', sex: 'male', age: P + 25, familyId: 'fam-a', partnerId: 'ama', bond: 0.9,
      skills: ['faces', 'knapping', 'heat', 'hafting', 'tracking', 'spear', 'fire', 'hides'] })
    add({ id: 'kaya', name: 'Kaya', sex: 'female', age: P + 4, familyId: 'fam-a', motherId: 'ama', fatherId: 'tuk', bond: 0.85 })
    playerSpec('fam-a', { motherId: 'ama', fatherId: 'tuk' })
    if (P >= 1) {
      add({ id: 'sibling', name: name(), sex: rng.chance(0.5) ? 'female' : 'male', age: Math.max(0.6, P - 5),
        familyId: 'fam-a', motherId: 'ama', fatherId: 'tuk', bond: 0.8 })
    }
    // the widow and her two children
    add({ id: 'nehe', name: 'Nehe', sex: 'female', age: P + 24, familyId: 'fam-b', bond: 0.55 })
    add({ id: 'ilu', name: 'Ilu', sex: 'male', age: P + 3, familyId: 'fam-b', motherId: 'nehe', bond: 0.55 })
    add({ id: 'sabo', name: 'Sabo', sex: 'female', age: P + 1, familyId: 'fam-b', motherId: 'nehe', bond: 0.6 })
    // 22 in all: with a younger sibling in the family, one fewer child elsewhere
    const templates = P >= 14
      ? OTHERS_EARLY.map((f, i) => (i === 0 ? f.slice(0, 2) : f))
      : P >= 1
        ? OTHERS_EARLY.map((f, i) => (i === 3 ? f.slice(0, 3) : f))
        : OTHERS_EARLY
    addOthers(templates, ['fam-c', 'fam-d', 'fam-e', 'fam-f'])
  } else if (stage === 'provider') {
    // the player's own family: a partner from the lagoon band and a child of one, carried on the back
    const partnerId = 'partner'
    add({ id: partnerId, name: name(), sex: other(playerSex), age: P - 1, familyId: 'fam-p', partnerId: PLAYER_ID, bond: 0.9 })
    playerSpec('fam-p', { motherId: 'ama', fatherId: 'tuk', partnerId })
    const [m, f] = playerSex === 'female' ? [PLAYER_ID, partnerId] : [partnerId, PLAYER_ID]
    add({ id: 'child-1', name: name(), sex: rng.chance(0.5) ? 'female' : 'male', age: 1, familyId: 'fam-p',
      motherId: m, fatherId: f, bond: 0.95 })
    add({ id: 'oro', name: 'Oro', sex: 'female', age: 82, familyId: 'fam-a', bond: 0.9,
      skills: ['faces', 'corms', 'medicine', 'stories', 'ochre', 'engraving', 'fire', 'shellfish', 'tides', 'hides'] })
    add({ id: 'ama', name: 'Ama', sex: 'female', age: P + 22, familyId: 'fam-a', motherId: 'oro', partnerId: 'tuk', bond: 0.9,
      skills: ['faces', 'shellfish', 'tides', 'corms', 'beads', 'hides', 'fire', 'medicine'] })
    add({ id: 'tuk', name: 'Tuk', sex: 'male', age: P + 25, familyId: 'fam-a', partnerId: 'ama', bond: 0.85,
      skills: ['faces', 'knapping', 'heat', 'hafting', 'tracking', 'spear', 'fire', 'hides', 'stories'] })
    add({ id: 'sibling', name: name(), sex: rng.chance(0.5) ? 'female' : 'male', age: P - 5, familyId: 'fam-a',
      motherId: 'ama', fatherId: 'tuk', bond: 0.75 })
    // Kaya's family
    const kp = add({ id: 'kaya-partner', name: name(), sex: 'male', age: P + 6, familyId: 'fam-k', partnerId: 'kaya', bond: 0.5 })
    add({ id: 'kaya', name: 'Kaya', sex: 'female', age: P + 4, familyId: 'fam-k', motherId: 'ama', fatherId: 'tuk', partnerId: kp, bond: 0.8 })
    add({ id: 'kaya-child-1', name: name(), sex: 'female', age: 8, familyId: 'fam-k', motherId: 'kaya', fatherId: kp, bond: 0.6 })
    add({ id: 'kaya-child-2', name: name(), sex: 'male', age: 4, familyId: 'fam-k', motherId: 'kaya', fatherId: kp, bond: 0.6 })
    // Nehe, older now, and her children grown
    add({ id: 'nehe', name: 'Nehe', sex: 'female', age: P + 24, familyId: 'fam-b', bond: 0.55 })
    add({ id: 'sabo', name: 'Sabo', sex: 'female', age: P + 1, familyId: 'fam-b', motherId: 'nehe', bond: 0.6 })
    const ip = add({ id: 'ilu-partner', name: name(), sex: 'female', age: P + 1, familyId: 'fam-i', partnerId: 'ilu', bond: 0.4 })
    add({ id: 'ilu', name: 'Ilu', sex: 'male', age: P + 3, familyId: 'fam-i', motherId: 'nehe', partnerId: ip, bond: 0.6 })
    add({ id: 'ilu-child-1', name: name(), sex: 'male', age: 6, familyId: 'fam-i', motherId: ip, fatherId: 'ilu', bond: 0.5 })
    add({ id: 'ilu-child-2', name: name(), sex: 'female', age: 0.5, familyId: 'fam-i', motherId: ip, fatherId: 'ilu', bond: 0.5 })
    addOthers([[['male', 40], ['female', 38], [null, 16], [null, 11], ['male', 66]]], ['fam-c'])
  } else {
    // elder: the player's children are grown with children of their own; the old generation is gone
    const partnerId = 'partner'
    add({ id: partnerId, name: name(), sex: other(playerSex), age: P - 1, familyId: 'fam-p', partnerId: PLAYER_ID, bond: 0.95 })
    playerSpec('fam-p', { partnerId })
    const [m, f] = playerSex === 'female' ? [PLAYER_ID, partnerId] : [partnerId, PLAYER_ID]
    const c1Sex: Sex = rng.chance(0.5) ? 'female' : 'male'
    const c1p = add({ id: 'child-1-partner', name: name(), sex: other(c1Sex), age: 31, familyId: 'fam-c1', partnerId: 'child-1', bond: 0.6 })
    add({ id: 'child-1', name: name(), sex: c1Sex, age: 32, familyId: 'fam-c1', motherId: m, fatherId: f, partnerId: c1p, bond: 0.9 })
    const [gm, gf] = c1Sex === 'female' ? ['child-1', c1p] : [c1p, 'child-1']
    add({ id: 'grandchild-1', name: name(), sex: 'female', age: 9, familyId: 'fam-c1', motherId: gm, fatherId: gf, bond: 0.8 })
    add({ id: 'grandchild-2', name: name(), sex: 'male', age: 5, familyId: 'fam-c1', motherId: gm, fatherId: gf, bond: 0.8 })
    add({ id: 'grandchild-3', name: name(), sex: 'female', age: 1, familyId: 'fam-c1', motherId: gm, fatherId: gf, bond: 0.75 })
    const c2Sex: Sex = rng.chance(0.5) ? 'female' : 'male'
    const c2p = add({ id: 'child-2-partner', name: name(), sex: other(c2Sex), age: 27, familyId: 'fam-c2', partnerId: 'child-2', bond: 0.55 })
    add({ id: 'child-2', name: name(), sex: c2Sex, age: 28, familyId: 'fam-c2', motherId: m, fatherId: f, partnerId: c2p, bond: 0.9 })
    const [hm, hf] = c2Sex === 'female' ? ['child-2', c2p] : [c2p, 'child-2']
    add({ id: 'grandchild-4', name: name(), sex: 'male', age: 3, familyId: 'fam-c2', motherId: hm, fatherId: hf, bond: 0.75 })
    add({ id: 'child-3', name: name(), sex: rng.chance(0.5) ? 'female' : 'male', age: 23, familyId: 'fam-p', motherId: m, fatherId: f, bond: 0.85 })
    add({ id: 'kaya', name: 'Kaya', sex: 'female', age: P + 4, familyId: 'fam-k', bond: 0.8,
      skills: ['faces', 'shellfish', 'tides', 'corms', 'beads', 'hides', 'fire', 'medicine', 'stories'] })
    const ks = add({ id: 'kaya-son', name: name(), sex: 'male', age: 36, familyId: 'fam-k', motherId: 'kaya', bond: 0.6 })
    const ksp = add({ id: 'kaya-son-partner', name: name(), sex: 'female', age: 34, familyId: 'fam-k', partnerId: ks, bond: 0.45 })
    add({ id: 'kaya-grandchild-1', name: name(), sex: 'female', age: 12, familyId: 'fam-k', motherId: ksp, fatherId: ks, bond: 0.55 })
    add({ id: 'kaya-grandchild-2', name: name(), sex: 'male', age: 7, familyId: 'fam-k', motherId: ksp, fatherId: ks, bond: 0.55 })
    const sp = add({ id: 'sabo-partner', name: name(), sex: 'male', age: 56, familyId: 'fam-b', partnerId: 'sabo', bond: 0.45 })
    add({ id: 'sabo', name: 'Sabo', sex: 'female', age: P + 1, familyId: 'fam-b', partnerId: sp, bond: 0.65 })
    addOthers([[['male', 30], ['female', 28], [null, 10], [null, 6]]], ['fam-x'])
  }

  function addOthers(templates: FamilyTemplate[], familyIds: string[]): void {
    templates.forEach((fam, fi) => {
      const familyId = familyIds[fi] ?? `fam-${fi}`
      const [fatherM, motherM, ...rest] = fam
      if (!fatherM || !motherM) return
      const fatherId = `${familyId}-father`
      const motherId = `${familyId}-mother`
      add({ id: fatherId, name: name(), sex: 'male', age: fatherM[1], familyId, partnerId: motherId, bond: rng.range(0.3, 0.5) })
      add({ id: motherId, name: name(), sex: 'female', age: motherM[1], familyId, partnerId: fatherId, bond: rng.range(0.3, 0.5) })
      rest.forEach(([sex, age], ci) => {
        const isElder = age > fatherM[1]
        add({
          id: isElder ? `${familyId}-elder` : `${familyId}-child-${ci + 1}`,
          name: name(),
          sex: sex ?? (rng.chance(0.5) ? 'female' : 'male'),
          age,
          familyId,
          motherId: isElder ? undefined : motherId,
          fatherId: isElder ? undefined : fatherId,
          bond: rng.range(0.3, 0.55),
        })
      })
    })
  }

  // build the people and wire children
  const people: SimPerson[] = specs.map((s) => {
    const look = randomLook(mix32(seed, hashString(s.id)), s.sex, s.age)
    return {
      id: s.id,
      name: s.name,
      look,
      birthDay: -Math.round(s.age * 365),
      motherId: s.motherId ?? null,
      fatherId: s.fatherId ?? null,
      partnerId: s.partnerId ?? null,
      childIds: [],
      familyId: s.familyId,
      alive: true,
      isPlayer: s.id === PLAYER_ID,
      position: { x: 0, z: 0 },
      heading: 0,
      speed: 0,
      anim: 'idle',
      held: { left: 'none', right: 'none' },
      carrying: null,
      carriedBy: null,
      lookAt: null,
      task: { kind: 'idle', targetId: null, target: null, until: null, skill: null },
      needs: { fed: rng.range(0.7, 0.9), warmth: rng.range(0.75, 0.9), energy: rng.range(0.8, 1), health: 1 },
      skills: s.skills ? [...s.skills] : defaultSkills(rng, s.sex, s.age),
      bond: s.bond ?? 0.4,
      known: stage !== 'held',
      speech: null,
    }
  })
  const byId = new Map(people.map((p) => [p.id, p]))
  for (const p of people) {
    for (const parentId of [p.motherId, p.fatherId]) {
      const parent = parentId ? byId.get(parentId) : undefined
      if (parent) parent.childIds.push(p.id)
    }
  }
  // infants ride with a carrier: the player's own child rides with the player in Provider, otherwise the mother
  for (const p of people) {
    if (p.look.ageYears >= 2) continue
    const carrierId = stage === 'provider' && p.id === 'child-1' ? PLAYER_ID : p.motherId
    const carrier = carrierId ? byId.get(carrierId) : undefined
    if (!carrier || carrier.carrying) continue
    carrier.carrying = { id: p.id, slot: 'back' }
    p.carriedBy = carrier.id
  }
  return people
}
