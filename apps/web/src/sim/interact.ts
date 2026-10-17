/**
 * What the player can do where they stand (interactionsNear), what happens when they do it, and how everyone
 * in the band is related to them.
 */
import type { Interaction, Poi, SimPerson, SkillId, Vec2, Verb } from '../game/contracts'
import { FOOD_VALUE, type SimCtx } from './ctx'
import { addBond } from './life'
import { periodOf } from './ai'
import { bedOut, sunTimes } from './time'

export const NEED_SKILL = "You don't know how yet. Watch someone."
const SEA_COVERS = 'The sea covers the rocks. Wait for low tide.'

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function playerOf(ctx: SimCtx): SimPerson {
  const p = ctx.state.people.find((q) => q.id === ctx.state.playerId)
  if (!p) throw new Error('the sim has no player')
  return p
}

function bedLabel(poi: Poi): string {
  if (poi.id.includes('mussel')) return 'Gather mussels'
  if (poi.id.includes('limpet')) return 'Gather limpets'
  return 'Gather shellfish'
}

type Draft = Omit<Interaction, 'id' | 'enabled' | 'reason'> & { reason: string | null }

function make(d: Draft): Interaction {
  return { ...d, id: `${d.verb}:${d.targetId}`, enabled: d.reason === null }
}

function poiInteractions(ctx: SimCtx, player: SimPerson, poi: Poi): Draft[] {
  const s = ctx.state
  const inv = s.inventory
  const skill = (k: SkillId) => player.skills.includes(k)
  const at = { x: poi.x, z: poi.z }
  const base = { targetKind: 'poi' as const, targetId: poi.id, position: at }
  const youthUp = s.stage !== 'small'
  const out: Draft[] = []
  switch (poi.kind) {
    case 'shellfish-bed':
      out.push({
        ...base,
        verb: 'gather',
        label: bedLabel(poi),
        holdSeconds: 1,
        reason: !skill('shellfish') ? NEED_SKILL : !bedOut(ctx, poi) ? SEA_COVERS : null,
      })
      break
    case 'corm-patch':
      out.push({ ...base, verb: 'dig', label: 'Dig corms', holdSeconds: 2, reason: skill('corms') ? null : NEED_SKILL })
      break
    case 'firewood':
      out.push({ ...base, verb: 'fetch-wood', label: 'Gather firewood', holdSeconds: 1.5, reason: null })
      break
    case 'silcrete-outcrop':
      if (youthUp) out.push({ ...base, verb: 'collect', label: 'Collect silcrete', holdSeconds: 1.5, reason: null })
      break
    case 'ochre-source':
      if (youthUp) out.push({ ...base, verb: 'collect', label: 'Collect ochre', holdSeconds: 1.5, reason: null })
      break
    case 'sleep-spot': {
      const evening = periodOf(ctx, player) === 'night' || periodOf(ctx, player) === 'evening'
      out.push({ ...base, verb: 'sleep', label: 'Sleep', holdSeconds: 1, reason: evening ? null : 'It is not time to sleep.' })
      break
    }
    case 'hearth': {
      if (inv.shellfish + inv.corms > 0) out.push({ ...base, verb: 'give', label: 'Give food', holdSeconds: 0, reason: null })
      if (inv.firewood > 0) out.push({ ...base, verb: 'add-wood', label: 'Add wood', holdSeconds: 0, reason: null })
      const food = s.hearth.meat + s.hearth.corms + s.hearth.shellfish
      if (food > 0 && player.needs.fed < 0.85) out.push({ ...base, verb: 'eat', label: 'Eat', holdSeconds: 1.5, reason: null })
      if (inv.silcrete > 0 && poi.id === 'hearth-main') {
        out.push({ ...base, verb: 'bury-stones', label: 'Bury the stones under the hearth', holdSeconds: 1.5, reason: null })
      }
      if (inv.point > 0 && !inv.hafted && poi.id === 'hearth-main') {
        out.push({ ...base, verb: 'haft', label: 'Haft the point', holdSeconds: 2, reason: null })
      }
      break
    }
    default:
      break
  }
  return out
}

export function interactionsNear(ctx: SimCtx, p: Vec2, radius: number): Interaction[] {
  const s = ctx.state
  if (s.stage === 'held') return []
  const player = playerOf(ctx)
  const found: { d: number; i: Interaction }[] = []
  for (const poi of ctx.world.pois) {
    const d = Math.max(0, dist(p, poi) - poi.radius)
    if (d > radius) continue
    for (const draft of poiInteractions(ctx, player, poi)) found.push({ d, i: make(draft) })
  }
  for (const q of s.people) {
    if (q.isPlayer || !q.alive || q.carriedBy) continue
    const d = dist(p, q.position)
    if (d > radius) continue
    const base = { targetKind: 'person' as const, targetId: q.id, position: { x: q.position.x, z: q.position.z } }
    const asleep = q.task.kind === 'sleep'
    found.push({ d, i: make({ ...base, verb: 'talk', label: `Talk to ${q.name}`, holdSeconds: 0, reason: asleep ? `${q.name} is asleep.` : null }) })
    if (s.inventory.beads > 0 && !asleep) {
      found.push({ d: d + 0.01, i: make({ ...base, verb: 'give-beads', label: `Give your beads to ${q.name}`, holdSeconds: 1, reason: null }) })
    }
  }
  found.sort((a, b) => a.d - b.d)
  return found.map((f) => f.i)
}

// ─── doing it ───────────────────────────────────────────────────────────────────────────────────────────────

const talkedAt = new WeakMap<SimPerson, number>()

function talkLine(ctx: SimCtx, q: SimPerson): string {
  const rel = relationOf(ctx, q.id)
  const task = q.task.kind
  const rng = ctx.rng
  if (task === 'gather-shellfish') return rng.pick(['Stay close to me. The sea is strong.', 'Pull them off with a twist, like this.', 'Only the big ones. Leave the small ones to grow.'])
  if (task === 'dig-corms') return rng.pick(['Look for the dry leaves. The corm sleeps under them.', 'Dig gently. Do not break it.'])
  if (task === 'knap') return rng.pick(['Listen to the stone.', 'Not yet. Watch my hands.'])
  if (task === 'eat') return rng.pick(['Eat. There is enough for everyone.', 'Here, take this one.'])
  if (task === 'tend-fire') return 'The fire is hungry tonight.'
  if (task === 'play') return rng.pick(['You are the eland! Run!', 'Catch me if you can!'])
  if (rel === 'Mother') return rng.pick(['There you are.', 'Stay where I can see you.', 'You are getting so tall.'])
  if (rel === 'Grandmother') return rng.pick(['Come and sit with me.', 'When I was small, the sea came right up to the cave.'])
  if (rel === 'Father') return rng.pick(['Watch the wind. It tells you everything.', 'Mm. Good.'])
  return rng.pick(['The days are getting longer.', 'Have you eaten?', 'Ah, it is you.'])
}

function eatPlayer(ctx: SimCtx, player: SimPerson): void {
  const h = ctx.state.hearth
  let want = Math.max(0, 1 - player.needs.fed)
  for (const key of ['meat', 'corms', 'shellfish'] as const) {
    const value = FOOD_VALUE[key]
    const units = Math.min(h[key], Math.ceil(want / value))
    h[key] -= units
    want -= units * value
    player.needs.fed = Math.min(1, player.needs.fed + units * value)
    if (want <= 0) break
  }
}

export function interact(ctx: SimCtx, interactionId: string): Interaction | null {
  const player = playerOf(ctx)
  const options = interactionsNear(ctx, player.position, 4)
  const it = options.find((o) => o.id === interactionId)
  if (!it || !it.enabled) return null
  const s = ctx.state
  const inv = s.inventory
  const at = it.position
  const item = (key: keyof typeof inv, delta: number) => ctx.events.push({ type: 'item', item: key, delta })
  const verb: Verb = it.verb
  switch (verb) {
    case 'gather':
      inv.shellfish++
      item('shellfish', 1)
      ctx.events.push({ type: 'sfx', name: 'gather', at })
      break
    case 'dig':
      inv.corms++
      item('corms', 1)
      ctx.events.push({ type: 'sfx', name: 'dig', at })
      break
    case 'fetch-wood':
      inv.firewood += 2
      item('firewood', 2)
      break
    case 'collect':
      if (it.targetId.includes('ochre')) {
        inv.ochre++
        item('ochre', 1)
      } else {
        inv.silcrete++
        item('silcrete', 1)
      }
      ctx.events.push({ type: 'sfx', name: 'dig', at })
      break
    case 'give': {
      s.hearth.shellfish += inv.shellfish
      s.hearth.corms += inv.corms
      if (inv.shellfish) item('shellfish', -inv.shellfish)
      if (inv.corms) item('corms', -inv.corms)
      inv.shellfish = 0
      inv.corms = 0
      for (const q of s.people) {
        if (!q.isPlayer && q.alive && dist(q.position, at) < 8) addBond(ctx, q, 0.02)
      }
      break
    }
    case 'add-wood': {
      const fu = ctx.fuel[it.targetId]
      if (fu) fu.fuel += 0.3 * inv.firewood
      item('firewood', -inv.firewood)
      inv.firewood = 0
      ctx.events.push({ type: 'sfx', name: 'fire-flare', at })
      break
    }
    case 'eat':
      eatPlayer(ctx, player)
      break
    case 'bury-stones':
      item('silcrete', -inv.silcrete)
      inv.silcrete = 0
      break
    case 'haft':
      inv.hafted = true
      break
    case 'sleep':
      player.task = { kind: 'sleep', targetId: it.targetId, target: null, until: null, skill: null }
      player.anim = 'sleep'
      if (!ctx.sleepSkip) {
        ctx.sleepSkip = { restore: s.timeScale }
        s.timeScale = s.timeScale * 40
      }
      break
    case 'talk': {
      const q = s.people.find((x) => x.id === it.targetId)
      if (!q) break
      const text = talkLine(ctx, q)
      q.speech = { text, until: s.clock.t + 4 * s.timeScale }
      ctx.events.push({ type: 'caption', caption: { id: `talk-${q.id}-${Math.floor(s.clock.t)}`, text, speaker: q.name, kind: 'speech', seconds: 4 } })
      const last = talkedAt.get(q)
      if (last === undefined || s.clock.t - last > 3600) {
        talkedAt.set(q, s.clock.t)
        addBond(ctx, q, 0.03)
      }
      break
    }
    case 'give-beads': {
      const q = s.people.find((x) => x.id === it.targetId)
      if (!q) break
      item('beads', -inv.beads)
      inv.beads = 0
      addBond(ctx, q, 0.2)
      break
    }
    default:
      // the director's verbs (knap, haft, engrave, tell-story, tag, reach, pierce-beads) arrive in S2
      break
  }
  return it
}

/** wake the player from a sleep skip once the night is over */
export function updateSleepSkip(ctx: SimCtx): void {
  const skip = ctx.sleepSkip
  if (!skip) return
  const player = playerOf(ctx)
  const { rise } = sunTimes(ctx, ctx.state.clock.dayOfYear)
  const h = ctx.state.clock.hour
  if (h > rise && h < 12) {
    ctx.state.timeScale = skip.restore
    ctx.sleepSkip = null
    player.task = { kind: 'idle', targetId: null, target: null, until: null, skill: null }
    player.anim = 'idle'
  } else {
    player.needs.energy = Math.min(1, player.needs.energy + 0.0001)
  }
}

// ─── relations ──────────────────────────────────────────────────────────────────────────────────────────────

export function relationOf(ctx: SimCtx, personId: string): string | null {
  const s = ctx.state
  const byId = (id: string | null) => (id ? s.people.find((q) => q.id === id) : undefined)
  const pl = byId(s.playerId)
  const p = byId(personId)
  if (!pl || !p || p === pl) return null
  const f = p.look.sex === 'female'
  const parents = [pl.motherId, pl.fatherId].filter((x): x is string => x !== null)
  if (p.id === pl.motherId) return 'Mother'
  if (p.id === pl.fatherId) return 'Father'
  if (p.id === pl.partnerId) return 'Partner'
  if (pl.childIds.includes(p.id)) return f ? 'Daughter' : 'Son'
  if (parents.some((id) => byId(id)?.motherId === p.id || byId(id)?.fatherId === p.id)) return f ? 'Grandmother' : 'Grandfather'
  const pParents = [p.motherId, p.fatherId].filter((x): x is string => x !== null)
  if (pParents.some((id) => parents.includes(id))) {
    if (p.look.ageYears < 2) return f ? 'Baby sister' : 'Baby brother'
    return f ? 'Sister' : 'Brother'
  }
  if (pParents.some((id) => pl.childIds.includes(id))) return f ? 'Granddaughter' : 'Grandson'
  const parentSiblings = parents.flatMap((id) => {
    const par = byId(id)
    const gp = [par?.motherId, par?.fatherId].filter((x): x is string => !!x)
    return s.people.filter((q) => q.id !== id && gp.some((g) => q.motherId === g || q.fatherId === g)).map((q) => q.id)
  })
  if (parentSiblings.includes(p.id)) return f ? 'Aunt' : 'Uncle'
  const siblings = s.people.filter((q) => q !== pl && [q.motherId, q.fatherId].some((id) => id !== null && parents.includes(id))).map((q) => q.id)
  if (pParents.some((id) => siblings.includes(id))) return f ? 'Niece' : 'Nephew'
  if (p.partnerId && siblings.includes(p.partnerId)) return f ? 'Sister-in-law' : 'Brother-in-law'
  if (p.look.ageYears < 18) {
    const parent = byId(p.motherId) ?? byId(p.fatherId)
    if (parent) return `${parent.name}'s ${f ? 'daughter' : 'son'}`
  }
  if (p.look.ageYears >= 55) return 'Elder'
  const partner = byId(p.partnerId)
  if (partner) return `${partner.name}'s ${f ? 'wife' : 'husband'}`
  return null
}
