/**
 * Spoor: records where the eland walk and, once the player knows Tracking, lays the prints near the player
 * through world's spoor helper. Prints older than TRACK_LIFE fade out of the record.
 */
import type { Sim, Vec2 } from '../contracts'
import type { Spoor } from './modules'

const STRIDE = 2.2
const TRACK_LIFE = 1800 // game seconds a trail stays readable
const SHOW_RADIUS = 45
const MAX_PRINTS = 400

type Print = { x: number; z: number; heading: number; t: number; shown: boolean }

export type Tracks = { update(dt: number, player: Vec2): void; dispose(): void }

export function createTracks(sim: Sim, spoor: Spoor): Tracks {
  const last = new Map<string, Vec2>()
  const prints: Print[] = []
  let refresh = 0
  let showing = false
  return {
    update(dt, player) {
      const st = sim.state
      for (const a of st.animals) {
        if (a.kind !== 'eland' || !a.alive) continue
        const prev = last.get(a.id)
        if (!prev || Math.hypot(a.position.x - prev.x, a.position.z - prev.z) >= STRIDE) {
          last.set(a.id, { x: a.position.x, z: a.position.z })
          prints.push({
            x: a.position.x,
            z: a.position.z,
            heading: a.heading,
            t: st.clock.t,
            shown: false,
          })
          if (prints.length > MAX_PRINTS) prints.shift()
        }
      }
      const reads =
        st.stage !== 'held' && st.people.some((p) => p.isPlayer && p.skills.includes('tracking'))
      if (!reads) {
        if (showing) {
          spoor.clear()
          for (const p of prints) p.shown = false
          showing = false
        }
        return
      }
      refresh -= dt
      if (refresh > 0) return
      refresh = 0.5
      showing = true
      for (const p of prints) {
        const age = st.clock.t - p.t
        if (p.shown || age > TRACK_LIFE) continue
        if (Math.hypot(p.x - player.x, p.z - player.z) > SHOW_RADIUS) continue
        spoor.add(p.x, p.z, p.heading, age)
        p.shown = true
      }
    },
    dispose() {
      spoor.clear()
    },
  }
}
