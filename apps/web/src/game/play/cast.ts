/**
 * Keeps one actor per SimPerson and SimAnimal: created as they appear, disposed when they leave the state,
 * placed on the ground each frame, with anim, held items, carries, gaze and talking mirrored from the sim.
 */
import { Group, type Object3D } from 'three'
import { hashString } from '../../core/rng'
import type {
  AnimalActor,
  AnimalAnim,
  CarrySlot,
  HeldItem,
  PersonActor,
  PersonAnim,
  SimState,
  WorldData,
} from '../contracts'
import type { Modules } from './modules'

type PersonEntry = {
  actor: PersonActor
  anim: PersonAnim | null
  age: number
  left: HeldItem
  right: HeldItem
  carrying: string | null
  slot: CarrySlot | null
  talking: boolean
}
type AnimalEntry = { actor: AnimalActor; anim: AnimalAnim | null }

export type PlayerPose = { x: number; z: number; heading: number; speed: number; anim: PersonAnim }

export type Cast = {
  readonly root: Object3D
  person(id: string): PersonActor | null
  animal(id: string): AnimalActor | null
  /** player pose overrides the sim's copy (no one-frame lag for the controlled body) */
  sync(state: SimState, dt: number, player: PlayerPose | null): void
  dispose(): void
}

export function createCast(world: WorldData, modules: Pick<Modules, 'createPerson' | 'createAnimal'>): Cast {
  const root = new Group()
  root.name = 'cast'
  const people = new Map<string, PersonEntry>()
  const animals = new Map<string, AnimalEntry>()
  const seen = new Set<string>()

  return {
    root,
    person: (id) => people.get(id)?.actor ?? null,
    animal: (id) => animals.get(id)?.actor ?? null,
    sync(state, dt, playerPose) {
      seen.clear()
      for (const p of state.people) {
        seen.add(p.id)
        let e = people.get(p.id)
        if (!e) {
          const actor = modules.createPerson(p.look)
          root.add(actor.object)
          e = { actor, anim: null, age: p.look.ageYears, left: 'none', right: 'none', carrying: null, slot: null, talking: false }
          people.set(p.id, e)
        }
        const a = e.actor
        const pose = p.isPlayer && playerPose && !p.carriedBy ? playerPose : null
        const anim = pose ? pose.anim : p.anim
        if (anim !== e.anim) {
          a.setAnim(anim, e.anim === null ? 0 : 0.25)
          e.anim = anim
        }
        a.setSpeed(pose ? pose.speed : p.speed)
        if (Math.abs(p.look.ageYears - e.age) > 0.02) {
          a.setAge(p.look.ageYears)
          e.age = p.look.ageYears
        }
        if (p.held.left !== e.left) {
          a.setHeld('left', p.held.left)
          e.left = p.held.left
        }
        if (p.held.right !== e.right) {
          a.setHeld('right', p.held.right)
          e.right = p.held.right
        }
        const talking = p.speech !== null && p.speech.until > state.clock.t
        if (talking !== e.talking) {
          a.setTalking(talking)
          e.talking = talking
        }
        a.setLookAt(p.lookAt)
        if (!p.carriedBy) {
          if (a.object.parent !== root) root.add(a.object)
          const x = pose ? pose.x : p.position.x
          const z = pose ? pose.z : p.position.z
          a.object.position.set(x, world.heightAt(x, z), z)
          a.object.rotation.set(0, pose ? pose.heading : p.heading, 0)
          a.object.visible = p.alive || p.anim === 'lie-dead'
        }
      }
      // carries after every actor exists
      for (const p of state.people) {
        const e = people.get(p.id)
        if (!e) continue
        const cid = p.carrying?.id ?? null
        const slot = p.carrying?.slot ?? null
        if (cid !== e.carrying || slot !== e.slot) {
          const child = cid ? people.get(cid)?.actor ?? null : null
          if (e.carrying && e.carrying !== cid) {
            const prev = people.get(e.carrying)
            e.actor.carry(null)
            if (prev && prev.actor.object.parent !== root) root.add(prev.actor.object)
          }
          if (child) e.actor.carry(child, slot ?? 'back')
          e.carrying = child ? cid : null
          e.slot = child ? slot : null
        }
      }
      for (const [id, e] of people) {
        if (seen.has(id)) {
          e.actor.update(dt)
          continue
        }
        e.actor.object.removeFromParent()
        e.actor.dispose()
        people.delete(id)
      }

      seen.clear()
      for (const an of state.animals) {
        seen.add(an.id)
        let e = animals.get(an.id)
        if (!e) {
          const actor = modules.createAnimal(an.kind, hashString(an.id) ^ state.seed)
          root.add(actor.object)
          e = { actor, anim: null }
          animals.set(an.id, e)
        }
        const a = e.actor
        if (an.anim !== e.anim) {
          a.setAnim(an.anim, e.anim === null ? 0 : 0.3)
          e.anim = an.anim
        }
        a.setSpeed(an.speed)
        const ground = an.kind === 'whale' || an.kind === 'seal' ? Math.max(world.heightAt(an.position.x, an.position.z), state.clock.seaLevel - 0.3) : world.heightAt(an.position.x, an.position.z)
        a.object.position.set(an.position.x, ground + an.altitude, an.position.z)
        a.object.rotation.set(0, an.heading, 0)
        a.update(dt)
      }
      for (const [id, e] of animals) {
        if (seen.has(id)) continue
        e.actor.object.removeFromParent()
        e.actor.dispose()
        animals.delete(id)
      }
    },
    dispose() {
      for (const e of people.values()) {
        e.actor.object.removeFromParent()
        e.actor.dispose()
      }
      for (const e of animals.values()) {
        e.actor.object.removeFromParent()
        e.actor.dispose()
      }
      people.clear()
      animals.clear()
      root.removeFromParent()
    },
  }
}
