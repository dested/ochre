import { beforeAll, describe, expect, test } from 'bun:test'
import { REQUIRED_POIS, type Poi, type WorldData } from '../game/contracts'
import { createWorldData } from './index'

const SEED = 80_000
const LOW = -1.4
const MEAN = 0
const CELL = 2

let world: WorldData

beforeAll(() => {
  world = createWorldData(SEED)
})

/** flood the walk grid from a start point at a sea level; returns a lookup of reached cells */
function flood(w: WorldData, sx: number, sz: number, seaLevel: number): (x: number, z: number) => boolean {
  const half = w.size / 2
  const n = Math.floor(w.size / CELL) + 1
  const ok = new Uint8Array(n * n)
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) ok[iz * n + ix] = w.walkable(-half + ix * CELL, -half + iz * CELL, seaLevel) ? 1 : 0
  const seen = new Uint8Array(n * n)
  const toI = (x: number, z: number) => Math.round((z + half) / CELL) * n + Math.round((x + half) / CELL)
  const start = toI(sx, sz)
  const queue = new Int32Array(n * n)
  let head = 0
  let tail = 0
  if (ok[start]) {
    queue[tail++] = start
    seen[start] = 1
  }
  while (head < tail) {
    const i = queue[head++] ?? 0
    const ix = i % n
    const iz = (i - ix) / n
    const next = [ix > 0 ? i - 1 : -1, ix < n - 1 ? i + 1 : -1, iz > 0 ? i - n : -1, iz < n - 1 ? i + n : -1]
    for (const j of next) {
      if (j < 0 || seen[j] || !ok[j]) continue
      seen[j] = 1
      queue[tail++] = j
    }
  }
  return (x: number, z: number) => seen[toI(x, z)] === 1
}

/** a POI counts as reached when any reached cell lies within its radius (at least 2 m) */
function reaches(reached: (x: number, z: number) => boolean, p: Poi): boolean {
  const r = Math.max(2, p.radius)
  for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) if (dx * dx + dz * dz <= r * r && reached(p.x + dx, p.z + dz)) return true
  return false
}

describe('world-gen', () => {
  test('every required POI exists', () => {
    for (const id of REQUIRED_POIS) expect(() => world.poi(id)).not.toThrow()
    expect(() => world.poi('no-such-place')).toThrow()
  })

  test('every POI is walkable (shellfish beds at low tide)', () => {
    const bad: string[] = []
    for (const p of world.pois) {
      const sea = p.tideMax !== undefined || p.kind === 'seal-rocks' ? LOW : MEAN
      if (!world.walkable(p.x, p.z, sea)) bad.push(`${p.id} (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) ${world.surfaceAt(p.x, p.z, sea)}`)
    }
    expect(bad).toEqual([])
  })

  test('the cave connects to the shore, the plateau, the cove and the lagoon on the walk grid', () => {
    const cave = world.poi('cave-mouth')
    const low = flood(world, cave.x, cave.z, LOW)
    const missingLow = world.pois.filter((p) => p.kind !== 'seal-rocks' && !reaches(low, p)).map((p) => p.id)
    expect(missingLow).toEqual([])
    // the land places stay connected at mid tide too
    const mean = flood(world, cave.x, cave.z, MEAN)
    const land = ['shore-path-bottom', 'safe-sand', 'cove-beach', 'plateau-path-top', 'eland-plateau', 'lagoon-camp', 'lookout-point', 'silcrete-ridge']
    const missingMean = land.filter((id) => !reaches(mean, world.poi(id)))
    expect(missingMean).toEqual([])
  })

  test('the shellfish beds drown at high tide', () => {
    const m = world.poi('shore-mussels')
    expect(world.waterDepth(m.x, m.z, 1.4)).toBeGreaterThan(0.5)
    expect(world.waterDepth(m.x, m.z, LOW)).toBe(0)
  })

  test('heightAt is deterministic and smooth', () => {
    const other = createWorldData(SEED)
    for (let i = 0; i < 200; i++) {
      const x = ((i * 7919) % 2000) - 1000
      const z = ((i * 104729) % 2000) - 1000
      expect(other.heightAt(x, z)).toBe(world.heightAt(x, z))
    }
    expect(createWorldData(SEED + 1).heightAt(-300, -300)).not.toBe(world.heightAt(-300, -300))
  })

  test('the cave floor sits 30–35 m up and is inside the cave', () => {
    const h = world.poi('hearth-main')
    const y = world.heightAt(h.x, h.z)
    expect(y).toBeGreaterThan(30)
    expect(y).toBeLessThan(35.5)
    expect(world.inCave(h.x, h.z)).toBe(true)
    expect(world.surfaceAt(h.x, h.z, MEAN)).toBe('cave')
  })

  test('createWorldData runs in under 1.5 s', () => {
    const t0 = performance.now()
    createWorldData(SEED + 7)
    expect(performance.now() - t0).toBeLessThan(1500)
  })
})
