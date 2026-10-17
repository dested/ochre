/**
 * An analytic WorldData fixture for the sim's tests, the headless runner and the lab until world-gen lands.
 * Same layout as the brief: cliff z ≈ 60–100 with the cave terrace at 32 m near (−40, 80), the intertidal shelf
 * z ≈ 130–210, the cove and dunes to the west, the lagoon and river mouth to the east, the plateau rising north.
 * Three-free and DOM-free.
 */
import type { Poi, PoiKind, Surface, Vec3, WorldData } from '../game/contracts'

const SIZE = 2048
const HALF = 1000
const WALK_SLOPE = 0.8
const LAGOON_LEVEL = 0.3

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** the plateau: 38 m at the cliff top, rising gently inland */
function plateau(z: number): number {
  return 38 + Math.max(0, 60 - z) * 0.03
}

/** the cliff profile (the middle of the coast, around the cave) */
function cliffProfile(z: number): number {
  if (z <= 60) return plateau(z)
  if (z <= 100) return lerp(38, 3, smoothstep(60, 100, z))
  if (z <= 130) return lerp(3, 2, (z - 100) / 30)
  if (z <= 210) return lerp(2, -2, (z - 130) / 80)
  return Math.max(-25, -2 - (z - 210) * 0.08)
}

/** the cove profile (west): plateau, a long slope, dunes, the beach */
function coveProfile(x: number, z: number): number {
  if (z <= -40) return plateau(z)
  if (z <= 50) return lerp(plateau(-40), 12, smoothstep(-40, 50, z))
  if (z <= 100) return lerp(12, 5, (z - 50) / 50) + 1.6 * Math.sin(x * 0.05) * Math.sin(z * 0.09)
  if (z <= 190) return lerp(5, -1, (z - 100) / 90)
  return Math.max(-25, -1 - (z - 190) * 0.06)
}

/** the river-mouth profile (east): plateau dropping to low ground around the lagoon, a sand bar, the sea */
function eastProfile(z: number): number {
  if (z <= -150) return plateau(z)
  if (z <= -20) return lerp(plateau(-150), 4, smoothstep(-150, -20, z))
  if (z <= 170) return lerp(4, 1.6, (z + 20) / 190)
  if (z <= 230) return lerp(1.6, -1, (z - 170) / 60)
  return Math.max(-25, -1 - (z - 230) * 0.06)
}

function rectMask(x: number, z: number, x0: number, x1: number, z0: number, z1: number, soft: number): number {
  return (
    smoothstep(x0 - soft, x0, x) *
    (1 - smoothstep(x1, x1 + soft, x)) *
    smoothstep(z0 - soft, z0, z) *
    (1 - smoothstep(z1, z1 + soft, z))
  )
}

function lagoonD(x: number, z: number): number {
  const dx = (x - 380) / 120
  const dz = (z - 70) / 85
  return dx * dx + dz * dz
}

/** the coast and the big shapes, before the cut paths */
function baseHeight(x: number, z: number): number {
  const wW = 1 - smoothstep(-200, -80, x)
  const wE = smoothstep(150, 320, x)
  const wM = Math.max(0, 1 - wW - wE)
  let h = wW * coveProfile(x, z) + wM * cliffProfile(z) + wE * eastProfile(z)

  // the cave floor terrace cut into the cliff
  const cave = rectMask(x, z, -72, -8, 46, 100, 3)
  h = lerp(h, 32, cave)

  // the lagoon basin and the channel to the sea
  const d = lagoonD(x, z)
  h = lerp(h, -1.2, 1 - smoothstep(0.7, 1.0, d))
  const channel = rectMask(x, z, 370, 392, 150, 240, 6)
  h = lerp(h, -1.4, channel)

  // the river, shallow enough to wade
  if (z < 0 && z > -420) {
    const cx = lerp(420, 480, clamp01(-z / 400))
    const m = 1 - smoothstep(3, 7, Math.abs(x - cx))
    h = lerp(h, LAGOON_LEVEL - 0.6, m * smoothstep(-420, -380, z))
  }

  // the seal rocks, offshore
  const sd2 = (x - 130) ** 2 + (z - 300) ** 2
  if (sd2 < 400) h = Math.max(h, 2.5 - sd2 / 60)

  // the northern mountains (backdrop, unwalkable)
  if (z < -880) h += (-880 - z) * 1.5
  return h
}

type PathPoint = { x: number; z: number; h: number | null }
type Segment = { x0: number; z0: number; h0: number; x1: number; z1: number; h1: number }

const PATH_LINES: PathPoint[][] = [
  // cave ↔ shore: the cliff path with a switchback
  [
    { x: -12, z: 97, h: 32 },
    { x: 30, z: 112, h: 17 },
    { x: 2, z: 124, h: 7 },
    { x: 12, z: 136, h: null },
  ],
  // cave ↔ plateau
  [
    { x: -14, z: 72, h: 32 },
    { x: 12, z: 52, h: null },
  ],
  // cave ↔ cove
  [
    { x: -68, z: 92, h: 32 },
    { x: -92, z: 104, h: 23 },
    { x: -118, z: 98, h: 14 },
    { x: -145, z: 90, h: null },
  ],
]

const SEGMENTS: Segment[] = []
for (const line of PATH_LINES) {
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]
    const b = line[i + 1]
    if (!a || !b) continue
    SEGMENTS.push({
      x0: a.x,
      z0: a.z,
      h0: a.h ?? baseHeight(a.x, a.z),
      x1: b.x,
      z1: b.z,
      h1: b.h ?? baseHeight(b.x, b.z),
    })
  }
}

/** the nearest path segment: distance and height along it */
function nearestPath(x: number, z: number): { d: number; h: number } {
  let best = Infinity
  let bestH = 0
  for (const s of SEGMENTS) {
    const vx = s.x1 - s.x0
    const vz = s.z1 - s.z0
    const len2 = vx * vx + vz * vz
    const t = clamp01(((x - s.x0) * vx + (z - s.z0) * vz) / len2)
    const px = s.x0 + vx * t
    const pz = s.z0 + vz * t
    const d = Math.hypot(x - px, z - pz)
    if (d < best) {
      best = d
      bestH = lerp(s.h0, s.h1, t)
    }
  }
  return { d: best, h: bestH }
}

function height(x: number, z: number): number {
  const base = baseHeight(x, z)
  const p = nearestPath(x, z)
  if (p.d >= 6) return base
  return lerp(base, p.h, 1 - smoothstep(2.5, 6, p.d))
}

function onPath(x: number, z: number): boolean {
  return nearestPath(x, z).d < 2.5
}

function inLagoon(x: number, z: number): boolean {
  return lagoonD(x, z) < 1.1 || rectMask(x, z, 370, 392, 140, 150, 6) > 0.5 || isRiver(x, z)
}

function isRiver(x: number, z: number): boolean {
  if (z >= 0 || z <= -400) return false
  const cx = lerp(420, 480, clamp01(-z / 400))
  return Math.abs(x - cx) < 5
}

function slopeAt(x: number, z: number): number {
  const dx = (height(x + 1, z) - height(x - 1, z)) / 2
  const dz = (height(x, z + 1) - height(x, z - 1)) / 2
  return Math.hypot(dx, dz)
}

function inCave(x: number, z: number): boolean {
  return x > -70 && x < -10 && z > 46 && z < 82
}

function waterDepth(x: number, z: number, seaLevel: number): number {
  const h = height(x, z)
  if (inLagoon(x, z)) return Math.max(0, Math.max(LAGOON_LEVEL, seaLevel) - h)
  if (z > 100) return Math.max(0, seaLevel - h)
  return 0
}

function poi(id: string, kind: PoiKind, x: number, z: number, radius: number, label: string, tideMax?: number): Poi {
  return tideMax === undefined ? { id, kind, x, z, radius, label } : { id, kind, x, z, radius, label, tideMax }
}

const POIS: Poi[] = [
  poi('cave-mouth', 'cave-mouth', -40, 84, 6, 'The cave mouth'),
  poi('hearth-main', 'hearth', -38, 74, 3, 'The hearth'),
  poi('hearth-2', 'hearth', -58, 62, 2.5, 'The back hearth'),
  poi('sleep-1', 'sleep-spot', -24, 60, 3, 'A sleeping hollow'),
  poi('sleep-2', 'sleep-spot', -34, 54, 3, 'A sleeping hollow'),
  poi('sleep-3', 'sleep-spot', -46, 52, 3, 'A sleeping hollow'),
  poi('sleep-4', 'sleep-spot', -60, 54, 3, 'A sleeping hollow'),
  poi('sleep-5', 'sleep-spot', -65, 70, 3, 'A sleeping hollow'),
  poi('sleep-6', 'sleep-spot', -20, 72, 3, 'A sleeping hollow'),
  poi('shore-mussels', 'shellfish-bed', 25, 188, 10, 'The mussel rocks', -0.3),
  poi('shore-limpets', 'shellfish-bed', 70, 172, 8, 'The limpet rocks', 0),
  poi('safe-sand', 'safe-sand', -120, 125, 8, 'The high sand'),
  poi('cove-beach', 'safe-sand', -190, 140, 25, 'The cove'),
  poi('whale-beach', 'whale-beach', -215, 168, 15, 'The long beach'),
  poi('seal-rocks', 'seal-rocks', 130, 300, 12, 'The seal rocks'),
  poi('corm-slope', 'corm-patch', -75, 30, 14, 'The corm slope'),
  poi('adder-rock', 'adder-spot', -67, 36, 2, 'A warm rock'),
  poi('play-dunes', 'play-ground', -210, 72, 25, 'The dunes'),
  poi('silcrete-ridge', 'silcrete-outcrop', -330, -160, 10, 'The silcrete ridge'),
  poi('ochre-seam', 'ochre-source', -160, 10, 5, 'The red seam'),
  poi('firewood-gully', 'firewood', -150, -30, 20, 'The milkwood gully'),
  poi('lookout-point', 'lookout', 15, 54, 4, 'The lookout'),
  poi('eland-plateau', 'eland-range', -120, -620, 150, 'The eland grass'),
  poi('lagoon-camp', 'lagoon-camp', 380, -30, 20, 'The lagoon camp'),
  poi('spring', 'spring', -130, 60, 3, 'The spring'),
  poi('shore-path-top', 'path-node', -12, 97, 3, 'The cliff path'),
  poi('shore-path-bottom', 'path-node', 12, 136, 3, 'The foot of the path'),
  poi('plateau-path-top', 'path-node', 12, 52, 3, 'The top path'),
]

export function createTestWorld(seed = 1): WorldData {
  const byId = new Map(POIS.map((p) => [p.id, p]))
  return {
    seed,
    size: SIZE,
    heightAt: height,
    normalAt(x: number, z: number): Vec3 {
      const dx = (height(x + 1, z) - height(x - 1, z)) / 2
      const dz = (height(x, z + 1) - height(x, z - 1)) / 2
      const len = Math.hypot(dx, 1, dz)
      return { x: -dx / len, y: 1 / len, z: -dz / len }
    },
    surfaceAt(x: number, z: number, seaLevel: number): Surface {
      const depth = waterDepth(x, z, seaLevel)
      if (inLagoon(x, z) && depth > 0) return isRiver(x, z) ? 'river' : 'lagoon'
      if (depth > 2) return 'deep-sea'
      if (depth > 0.3) return 'shallows'
      if (depth > 0) return 'surf'
      if (inCave(x, z)) return 'cave'
      if (onPath(x, z)) return 'path'
      const h = height(x, z)
      if (slopeAt(x, z) > 0.9) return 'cliff'
      if (z > 100 && h < 1.6) return x > -100 && x < 260 ? 'wet-rock' : 'wet-sand'
      if (z > 100 && h < 3.5) return x > -100 && x < 260 ? 'rock' : 'sand'
      if (x < -120 && z > 40) return 'dune'
      return z < -400 ? 'grass' : 'fynbos'
    },
    walkable(x: number, z: number, seaLevel: number): boolean {
      if (x < -HALF || x > HALF || z < -HALF || z > HALF) return false
      if (z < -880) return false
      if (waterDepth(x, z, seaLevel) > 0.9) return false
      return slopeAt(x, z) <= WALK_SLOPE || onPath(x, z)
    },
    waterDepth,
    shoreDistance(x: number, z: number, seaLevel: number): number {
      if (waterDepth(x, z, seaLevel) > 0) return 0
      const above = height(x, z) - seaLevel
      return Math.min(500, above / Math.max(0.03, slopeAt(x, z)))
    },
    inCave,
    pois: POIS,
    poi(id: string): Poi {
      const p = byId.get(id)
      if (!p) throw new Error(`unknown POI "${id}"`)
      return p
    },
    poisOf(kind: PoiKind): readonly Poi[] {
      return POIS.filter((p) => p.kind === kind)
    },
  }
}
