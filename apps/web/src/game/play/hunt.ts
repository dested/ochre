/**
 * Aiming and throwing for a player with a hafted spear: RMB raises the aim (the HUD reticle), LMB throws, the
 * result goes to the sim, and a thrown-and-missed spear waits on the ground for E.
 */
import type { PerspectiveCamera, Scene } from 'three'
import { Vector3 } from 'three'
import type { Bridge, PromptState } from '../bridge'
import type { GameAudio, HeldItem, Sim, SimPerson, WorldData } from '../contracts'
import type { Cast } from './cast'
import type { Input } from './input'
import type { Modules } from './modules'
import { createSpear, type Spear } from './spear'

const THROW_SECONDS = 0.55

export type Hunt = {
  /** 0..1 how far the aim is raised */
  readonly aim: number
  /** the throw anim is playing */
  readonly throwing: boolean
  /** advance; returns a prompt that outranks the sim's (pick up the spear) */
  update(dt: number, input: Input, player: SimPerson, live: boolean): PromptState | null
  readonly spear: Spear
  /** what the right hand should hold, or null to leave it to the sim */
  rightHand(): HeldItem | null
  dispose(): void
}

export function createHunt(deps: {
  world: WorldData
  scene: Scene
  modules: Modules
  sim: Sim
  camera: PerspectiveCamera
  cast: Cast
  bridge: Bridge
  audio: GameAudio
}): Hunt {
  const { world, scene, modules, sim, camera, cast, bridge, audio } = deps
  const spear: Spear = createSpear(world, modules.paint)
  scene.add(spear.root)
  let aim = 0
  let throwT = 0
  let aimingShown = false
  const hand = new Vector3()

  const armed = () => {
    const st = sim.state
    return (st.stage === 'youth' || st.stage === 'provider') && st.inventory.hafted
  }

  return {
    get aim() {
      return aim
    },
    get throwing() {
      return throwT > 0
    },
    spear,
    update(dt, input, player, live) {
      spear.pointQuality = sim.state.inventory.point > 0 ? sim.state.inventory.point : 0.6
      const canAim = live && armed() && spear.state === 'held' && player.carriedBy === null
      const want = canAim && input.mouse.rmb ? 1 : 0
      aim += (want - aim) * Math.min(1, dt * (want > aim ? 7 : 10))
      if (aim < 0.01) aim = 0
      throwT = Math.max(0, throwT - dt)

      if (canAim && aim > 0.6 && input.mouse.lmbPressed) {
        const actor = cast.person(player.id)
        if (actor) actor.handPosition('right', hand)
        else hand.set(player.position.x, world.heightAt(player.position.x, player.position.z) + 1.5, player.position.z)
        if (spear.throw(hand, camera, sim.state.animals)) {
          throwT = THROW_SECONDS
          audio.sfx('throw', hand)
        }
      }

      const hit = spear.update(dt, sim.state.animals, sim.state.clock.seaLevel)
      if (hit?.kind === 'hit') {
        sim.command({ type: 'spear-hit', animalId: hit.animalId, quality: hit.quality })
        const a = sim.state.animals.find((x) => x.id === hit.animalId)
        if (a) audio.sfx('hit', new Vector3(a.position.x, world.heightAt(a.position.x, a.position.z) + 1, a.position.z))
      } else if (hit?.kind === 'miss') sim.command({ type: 'spear-miss' })

      const showAim = aim > 0.35
      if (showAim !== aimingShown) {
        aimingShown = showAim
        bridge.setHud({ aiming: showAim })
      }

      if (live && spear.canPickUp(player.position)) {
        if (input.pressed('KeyE')) {
          spear.pickUp()
          return null
        }
        return { label: 'Pick up the spear', key: 'E', holdSeconds: 0, holdProgress: 0, enabled: true, reason: null }
      }
      return null
    },
    rightHand() {
      if (!armed()) return null
      return spear.state === 'held' ? 'spear' : 'none'
    },
    dispose() {
      spear.dispose()
      if (aimingShown) bridge.setHud({ aiming: false })
    },
  }
}
