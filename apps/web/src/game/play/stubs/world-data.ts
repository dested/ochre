/**
 * Stub WorldData for the play session until world-gen lands: an analytic coast with every required POI.
 * Plateau to the north, a cliff with the cave terrace, a cliff path to the shelf, the sea to the south.
 */
import type { CreateWorldData, Poi, PoiKind, Surface, Vec2, Vec3, WorldData } from '../../contracts'

const SIZE = 2048
const CAVE = { x: -40, z: 80, floor: 33 }

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

type Seg = { a: Vec2; b: Vec2; ha: number; hb: number }
const PATHS: Seg[] = [
  { a: { x: -40, z: 90 }, b: { x: -12, z: 104 }, ha: CAVE.floor, hb: 22 },
  { a: { x: -12, z: 104 }, b: { x: 18, z: 122 }, ha: 22, hb: 9 },
  { a: { x: 18, z: 122 }, b: { x: 30, z: 140 }, ha: 9, hb: 2.2 },
  { a: { x: -40, z: 72 }, b: { x: -30, z: 48 }, ha: CAVE.floor, hb: 43 },
  { a: { x: -60, z: 92 }, b: { x: -110, z: 135 }, ha: CAVE.floor, hb: 4 },
]

function segDist(p: Vec2, s: Seg): { d: number; h: number } {
  const dx = s.b.x - s.a.x
  const dz = s.b.z - s.a.z
  const len2 = dx * dx + dz * dz
  const t = Math.min(1, Math.max(0, ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / len2))
  const cx = s.a.x + dx * t
  const cz = s.a.z + dz * t
  return { d: Math.hypot(p.x - cx, p.z - cz), h: s.ha + (s.hb - s.ha) * t }
}

function baseHeight(x: number, z: number): number {
  // the cove and dunes to the west are low; the lagoon basin to the east
  const cove = smooth(-330, -260, x) * (1 - smooth(-110, -60, x))
  const cliffTop = 42 + Math.max(0, -z) * 0.025 + Math.sin(x * 0.013) * 2 + Math.cos(z * 0.017 + x * 0.004) * 1.5
  const shelf = 3 - smooth(120, 205, z) * 4.2
  const sea = z > 200 ? -(z - 200) * 0.06 : 0
  const cliffStart = 85 - cove * 40
  const drop = smooth(cliffStart, cliffStart + 40 + cove * 80, z)
  let h = cliffTop * (1 - cove * 0.7) * (1 - drop) + (shelf + sea) * drop
  // dunes behind the cove
  h += cove * drop * Math.max(0, Math.sin(x * 0.05) * Math.cos(z * 0.04)) * 3
  // lagoon basin
  const lag = smooth(220, 270, x) * (1 - smooth(480, 530, x)) * (1 - smooth(140, 190, z)) * smooth(-30, 10, z)
  h = h * (1 - lag) + -1.6 * lag
  return h
}

function heightAt(x: number, z: number): number {
  let h = baseHeight(x, z)
  // the cave terrace
  const cd = Math.hypot((x - CAVE.x) / 18, (z - CAVE.z) / 11)
  h = h + (CAVE.floor - h) * (1 - smooth(0.8, 1.25, cd))
  for (const s of PATHS) {
    const { d, h: ph } = segDist({ x, z }, s)
    if (d < 6) h = h + (ph - h) * (1 - smooth(2, 6, d))
  }
  return h
}

function onPath(x: number, z: number): boolean {
  for (const s of PATHS) if (segDist({ x, z }, s).d < 2.4) return true
  return false
}

function normalAt(x: number, z: number): Vec3 {
  const e = 0.75
  const dx = heightAt(x + e, z) - heightAt(x - e, z)
  const dz = heightAt(x, z + e) - heightAt(x, z - e)
  const nx = -dx / (2 * e)
  const nz = -dz / (2 * e)
  const len = Math.hypot(nx, 1, nz)
  return { x: nx / len, y: 1 / len, z: nz / len }
}

function inCave(x: number, z: number): boolean {
  return Math.hypot((x - CAVE.x) / 16, (z - CAVE.z) / 9) < 1 && z < CAVE.z + 8
}

function waterDepth(x: number, z: number, seaLevel: number): number {
  return Math.max(0, seaLevel - heightAt(x, z))
}

const SLOPE_LIMIT = Math.cos((38 * Math.PI) / 180)

function surfaceAt(x: number, z: number, seaLevel: number): Surface {
  const h = heightAt(x, z)
  const depth = seaLevel - h
  if (x > 220 && x < 530 && z > -30 && z < 190 && h < 0) return 'lagoon'
  if (depth > 2.5) return 'deep-sea'
  if (depth > 0.6) return 'shallows'
  if (depth > 0) return 'surf'
  if (inCave(x, z)) return 'cave'
  if (onPath(x, z)) return 'path'
  if (normalAt(x, z).y < 0.7) return 'cliff'
  if (h < seaLevel + 0.6) return z > 140 && x > -80 ? 'wet-rock' : 'wet-sand'
  if (h < 5) return x < -80 ? 'sand' : 'rock'
  if (x < -100 && h < 18) return 'dune'
  return Math.sin(x * 0.03 + z * 0.02) > 0.4 ? 'grass' : 'fynbos'
}

function walkable(x: number, z: number, seaLevel: number): boolean {
  if (Math.abs(x) > SIZE / 2 - 4 || Math.abs(z) > SIZE / 2 - 4) return false
  if (waterDepth(x, z, seaLevel) > 0.9) return false
  if (onPath(x, z) || inCave(x, z)) return true
  return normalAt(x, z).y >= SLOPE_LIMIT
}

function shoreDistance(x: number, z: number, seaLevel: number): number {
  if (waterDepth(x, z, seaLevel) > 0) return 0
  // march south (the sea is to the south) to find the waterline
  for (let d = 2; d < 400; d += 2) if (heightAt(x, z + d) < seaLevel) return d
  return 400
}

const POI_DEFS: [string, PoiKind, number, number, number, string, number?][] = [
  ['cave-mouth', 'cave-mouth', -40, 88, 6, 'The cave'],
  ['hearth-main', 'hearth', -40, 81, 2.5, 'The hearth'],
  ['hearth-2', 'hearth', -50, 76, 2, 'The small hearth'],
  ['sleep-1', 'sleep-spot', -52, 73, 1.5, 'A sleeping hollow'],
  ['sleep-2', 'sleep-spot', -46, 72, 1.5, 'A sleeping hollow'],
  ['sleep-3', 'sleep-spot', -40, 71.5, 1.5, 'A sleeping hollow'],
  ['sleep-4', 'sleep-spot', -34, 72, 1.5, 'A sleeping hollow'],
  ['sleep-5', 'sleep-spot', -28, 74, 1.5, 'A sleeping hollow'],
  ['sleep-6', 'sleep-spot', -27, 79, 1.5, 'A sleeping hollow'],
  ['shore-mussels', 'shellfish-bed', 14, 162, 5, 'The mussel rocks', -0.3],
  ['shore-limpets', 'shellfish-bed', 42, 150, 4, 'The limpet rocks', 0],
  ['safe-sand', 'safe-sand', -95, 140, 8, 'The dry sand'],
  ['cove-beach', 'safe-sand', -180, 165, 20, 'The cove'],
  ['whale-beach', 'whale-beach', -200, 190, 12, 'The cove shore'],
  ['seal-rocks', 'seal-rocks', 90, 235, 10, 'The seal rocks'],
  ['corm-slope', 'corm-patch', -12, 40, 8, 'The corm slope'],
  ['adder-rock', 'adder-spot', -4, 34, 1.5, 'A warm rock'],
  ['play-dunes', 'play-ground', -190, 120, 20, 'The dunes'],
  ['silcrete-ridge', 'silcrete-outcrop', -180, -260, 8, 'The silcrete ridge'],
  ['ochre-seam', 'ochre-source', 70, 30, 4, 'The red gully'],
  ['firewood-gully', 'firewood', 70, 45, 10, 'The milkwood gully'],
  ['lookout-point', 'lookout', -45, 52, 3, 'The lookout'],
  ['eland-plateau', 'eland-range', 120, -560, 60, 'The eland plain'],
  ['lagoon-camp', 'lagoon-camp', 430, 60, 15, 'The lagoon camp'],
  ['spring', 'spring', -75, 58, 2, 'The spring'],
  ['shore-path-top', 'path-node', -34, 93, 2, 'The cliff path'],
  ['shore-path-bottom', 'path-node', 30, 140, 2, 'The foot of the path'],
  ['plateau-path-top', 'path-node', -30, 48, 2, 'The plateau path'],
]

export const createStubWorldData: CreateWorldData = (seed) => {
  const pois: Poi[] = POI_DEFS.map(([id, kind, x, z, radius, label, tideMax]) =>
    tideMax === undefined ? { id, kind, x, z, radius, label } : { id, kind, x, z, radius, label, tideMax },
  )
  const byId = new Map(pois.map((p) => [p.id, p]))
  const data: WorldData = {
    seed,
    size: SIZE,
    heightAt,
    normalAt,
    surfaceAt,
    walkable,
    waterDepth,
    shoreDistance,
    inCave,
    pois,
    poi(id) {
      const p = byId.get(id)
      if (!p) throw new Error(`unknown POI ${id}`)
      return p
    },
    poisOf: (kind) => pois.filter((p) => p.kind === kind),
  }
  return data
}
