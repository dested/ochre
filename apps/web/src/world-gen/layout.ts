/**
 * The coast's fixed layout: the cross-section stations the terrain is lofted from, the cave, the paths, the
 * river, the lagoon, the gully and the POIs. Axes: +X east, +Z south (the sea), metres. Three-free.
 *
 * Final POI coordinates are reported to the lead (plans/2026-10-17-ochre-overnight.md, world section).
 */
import type { PoiKind } from '../game/contracts'
import type { P2 } from './curves'

export const WORLD_SIZE = 2048
export const HALF = WORLD_SIZE / 2
/** height grid spacing, metres */
export const CELL = 2
/** grid samples per side */
export const GRID_N = WORLD_SIZE / CELL + 1
/** the lagoon's perched water level, metres above mean sea level */
export const LAGOON_LEVEL = 0.45
/** steepest walkable slope (rise over run) off the paths */
export const WALK_SLOPE = 0.7
/** water deeper than this is not walkable */
export const WADE_DEPTH = 0.9
/** spring high water: rock below this is wet rock */
export const HIGH_WATER = 1.45

// ─── Cross-section stations ──────────────────────────────────────────────────────────────────────────────────
//
// Each station is a profile north → south at one x: [z, height] pairs, the same count at every station so the
// loft morphs feature to feature (plateau, edge, face, toe, foreshore, low-tide line, drop-off, seabed).
// `sand` is how sandy the shore is there (0 rock shelf .. 1 beach).

export type Station = { x: number; sand: number; pts: readonly (readonly [number, number])[] }

const P0: readonly [number, number] = [-1500, 132]
const P10: readonly [number, number] = [1500, -42]

function st(x: number, sand: number, ...mid: (readonly [number, number])[]): Station {
  return { x, sand, pts: [P0, ...mid, P10] }
}

export const STATIONS: readonly Station[] = [
  st(-1100, 0.15, [-900, 76], [-560, 52], [-520, 48], [-505, 22], [-496, 5], [-490, 1], [-470, -1.6], [-430, -7], [-200, -18]),
  st(-800, 0.15, [-700, 74], [-300, 50], [-260, 46], [-246, 20], [-238, 4], [-232, 1], [-214, -1.6], [-180, -7], [50, -18]),
  st(-600, 0.2, [-560, 72], [-120, 46], [-90, 42], [-78, 18], [-70, 3], [-64, 1], [-50, -1.6], [-20, -7], [200, -18]),
  st(-470, 0.1, [-500, 72], [10, 38], [40, 34], [52, 16], [60, 3], [66, 1], [85, -1.5], [105, -7], [300, -18]),
  st(-405, 0.05, [-500, 72], [90, 30], [128, 26], [148, 14], [170, 3], [178, 1], [203, -1.5], [222, -7], [420, -18]),
  st(-345, 0.85, [-500, 72], [-40, 46], [0, 40], [40, 16], [95, 4], [110, 2.4], [150, -1.0], [195, -4], [400, -15]),
  st(-250, 1, [-500, 72], [-80, 48], [-50, 44], [20, 12], [100, 3.4], [110, 2.6], [152, -0.9], [205, -3.5], [420, -14]),
  st(-150, 1, [-500, 72], [-70, 48], [-40, 44], [20, 12], [100, 3.4], [110, 2.6], [150, -0.9], [200, -3.5], [420, -14]),
  st(-92, 0.7, [-500, 72], [30, 50], [55, 48], [86, 28], [120, 3.4], [128, 2.3], [150, -0.8], [185, -3], [400, -14]),
  st(-40, 0, [-500, 72], [55, 52], [82, 51], [93, 33], [138, 3], [148, 0.9], [208, -1.5], [228, -6], [450, -16]),
  st(30, 0, [-500, 72], [55, 52], [80, 50], [92, 32], [138, 3], [148, 0.9], [206, -1.5], [226, -6], [450, -16]),
  st(150, 0.05, [-500, 72], [55, 52], [78, 50], [90, 30], [130, 3], [140, 0.9], [196, -1.5], [218, -6], [440, -16]),
  st(225, 0.1, [-500, 70], [48, 50], [68, 47], [84, 26], [118, 3], [130, 0.8], [186, -1.5], [208, -6], [430, -16]),
  st(290, 0.6, [-500, 66], [-60, 40], [-20, 32], [40, 14], [100, 3], [150, 2.0], [192, -0.8], [228, -4], [430, -15]),
  st(340, 1, [-500, 64], [-130, 36], [-95, 24], [-60, 7], [-20, 2.2], [176, 2.0], [197, -0.8], [232, -4], [430, -15]),
  st(450, 1, [-500, 64], [-130, 36], [-92, 26], [-55, 7], [-15, 2.2], [176, 2.0], [196, -0.8], [230, -4], [430, -15]),
  st(520, 0.8, [-500, 66], [-80, 42], [-40, 32], [0, 9], [30, 2.4], [168, 2.0], [190, -0.8], [224, -4], [430, -15]),
  st(590, 0.2, [-500, 70], [30, 46], [60, 42], [76, 18], [90, 3], [98, 1.0], [140, -1.4], [165, -6], [400, -17]),
  st(800, 0.15, [-500, 72], [60, 48], [90, 44], [104, 18], [114, 3], [120, 1.0], [150, -1.6], [176, -7], [400, -18]),
  st(1100, 0.15, [-500, 72], [80, 46], [110, 42], [124, 18], [134, 3], [140, 1.0], [170, -1.6], [196, -7], [420, -18]),
]

// profile indices
export const PI_EDGE = 3
export const PI_FACE = 4
export const PI_TOE = 5
export const PI_SHORE = 6
export const PI_LOW = 7
export const PI_DROP = 8

// ─── The cave ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The cave: a rock shell set into the cliff over a flat floor terrace. (x, z) is the centre of the drip line;
 * the mouth faces `heading` (0 = +Z, growing toward +X), so it looks south-south-west over the shelf and cove.
 */
export const CAVE = {
  x: -40,
  z: 88,
  heading: -0.35,
  floor: 33.5,
  /** how far the interior runs back from the drip line */
  depth: 22,
  /** half the width of the floor at its widest */
  halfWidth: 12.5,
  /** ceiling height above the floor near the mouth */
  ceiling: 7.5,
  /** the terrace in front of the mouth runs this far out */
  terrace: 9,
} as const

const CAVE_FX = Math.sin(CAVE.heading)
const CAVE_FZ = Math.cos(CAVE.heading)

/** cave-local (a along the facing, + = out toward the sea; b lateral, + = toward the right hand looking out) */
export function caveLocal(x: number, z: number): { a: number; b: number } {
  const dx = x - CAVE.x
  const dz = z - CAVE.z
  return { a: dx * CAVE_FX + dz * CAVE_FZ, b: -(dx * CAVE_FZ - dz * CAVE_FX) }
}

export function caveWorld(a: number, b: number): P2 {
  // inverse of caveLocal: right-hand lateral is (−fz, fx) rotated: b axis = (−CAVE_FZ, CAVE_FX)
  return { x: CAVE.x + a * CAVE_FX - b * CAVE_FZ, z: CAVE.z + a * CAVE_FZ + b * CAVE_FX }
}

/** half-width of the floor at depth a (a ≤ 0 inside) */
export function caveHalfWidth(a: number): number {
  const a0 = -6
  const r = a < a0 ? CAVE.depth + a0 : 14
  const t = (a - a0) / r
  return CAVE.halfWidth * Math.sqrt(Math.max(0, 1 - t * t))
}

export function inCaveFootprint(x: number, z: number): boolean {
  const { a, b } = caveLocal(x, z)
  if (a > 0.8 || a < -CAVE.depth) return false
  return Math.abs(b) < caveHalfWidth(Math.min(a, 0))
}

// ─── Paths ───────────────────────────────────────────────────────────────────────────────────────────────────

export type PathDef = {
  id: string
  /** control points; the path is a Catmull-Rom curve through them */
  pts: readonly P2[]
  /** pinned heights at the ends (null = follow the terrain) */
  startY: number | null
  endY: number | null
  /** steepest grade along the path */
  maxGrade: number
  /** half-width of the flat bench */
  half: number
}

export const PATHS: readonly PathDef[] = [
  {
    id: 'shore',
    pts: [
      { x: -27, z: 98 },
      { x: 14, z: 105 },
      { x: -16, z: 113 },
      { x: 22, z: 120 },
      { x: -10, z: 127.5 },
      { x: 30, z: 134 },
      { x: 42, z: 141 },
    ],
    startY: CAVE.floor - 0.1,
    endY: null,
    maxGrade: 0.32,
    half: 1.9,
  },
  {
    id: 'plateau',
    pts: [
      { x: -27, z: 95 },
      { x: 0, z: 91.5 },
      { x: 30, z: 88.5 },
      { x: 60, z: 84.5 },
      { x: 90, z: 78 },
    ],
    startY: CAVE.floor - 0.1,
    endY: null,
    maxGrade: 0.3,
    half: 1.9,
  },
  {
    id: 'cove',
    pts: [
      { x: -52, z: 93 },
      { x: -72, z: 96 },
      { x: -92, z: 100 },
      { x: -110, z: 104 },
      { x: -125, z: 110 },
      { x: -138, z: 118 },
    ],
    startY: CAVE.floor - 0.1,
    endY: null,
    maxGrade: 0.32,
    half: 1.9,
  },
  {
    id: 'lagoon',
    pts: [
      { x: 90, z: 78 },
      { x: 104, z: 45 },
      { x: 122, z: 8 },
      { x: 165, z: -12 },
      { x: 215, z: -12 },
      { x: 258, z: -14 },
      { x: 296, z: -24 },
      { x: 334, z: -16 },
      { x: 372, z: -8 },
      { x: 402, z: -6 },
    ],
    startY: null,
    endY: null,
    maxGrade: 0.3,
    half: 1.7,
  },
  {
    id: 'ridge',
    pts: [
      { x: 90, z: 78 },
      { x: 40, z: 40 },
      { x: -40, z: -20 },
      { x: -140, z: -110 },
      { x: -230, z: -200 },
      { x: -272, z: -232 },
    ],
    startY: null,
    endY: null,
    maxGrade: 0.3,
    half: 1.4,
  },
]

// ─── Water and landforms ─────────────────────────────────────────────────────────────────────────────────────

export const RIVER: readonly P2[] = [
  { x: 388, z: 30 },
  { x: 376, z: -40 },
  { x: 352, z: -110 },
  { x: 368, z: -200 },
  { x: 405, z: -290 },
  { x: 392, z: -390 },
  { x: 345, z: -480 },
  { x: 352, z: -590 },
  { x: 398, z: -700 },
  { x: 388, z: -820 },
  { x: 350, z: -940 },
  { x: 340, z: -1060 },
  { x: 330, z: -1300 },
]

export const LAGOON = { x: 398, z: 86, rx: 98, rz: 56 } as const

export const INLET: readonly P2[] = [
  { x: 452, z: 120 },
  { x: 460, z: 160 },
  { x: 468, z: 208 },
]

export const GULLY: readonly P2[] = [
  { x: 150, z: -170 },
  { x: 136, z: -90 },
  { x: 126, z: -20 },
  { x: 120, z: 40 },
  { x: 116, z: 86 },
  { x: 113, z: 120 },
]

/** offshore stacks: x, z, radius, top height */
export const STACKS: readonly (readonly [number, number, number, number])[] = [
  [118, 330, 16, 5.5],
  [140, 318, 9, 3.2],
  [98, 342, 8, 2.6],
  [-430, 250, 14, 9],
  [-398, 236, 8, 4],
  [232, 262, 7, 2.4],
  [610, 214, 11, 6],
  [-80, 242, 6, 1.6],
]

export const RIDGE = { x: -280, z: -240, angle: 0.7, length: 70, height: 6 } as const

/** the dune field behind the cove */
export const DUNES = { x0: -335, x1: -88, z0: -30, z1: 106 } as const

// ─── POIs ────────────────────────────────────────────────────────────────────────────────────────────────────

export type PoiDef = { id: string; kind: PoiKind; x: number; z: number; radius: number; label: string; tideMax?: number }

function inCave(id: string, kind: PoiKind, a: number, b: number, radius: number, label: string): PoiDef {
  const p = caveWorld(a, b)
  return { id, kind, x: p.x, z: p.z, radius, label }
}

export const POI_DEFS: readonly PoiDef[] = [
  { ...caveWorld(0, 0), id: 'cave-mouth', kind: 'cave-mouth', radius: 12, label: 'The cave' },
  inCave('hearth-main', 'hearth', -4.5, 1.5, 2.2, 'The hearth'),
  inCave('hearth-2', 'hearth', -11, -5, 1.8, 'The back hearth'),
  inCave('sleep-1', 'sleep-spot', -14, -6.5, 1.4, 'A sleeping hollow'),
  inCave('sleep-2', 'sleep-spot', -16.5, -3, 1.4, 'A sleeping hollow'),
  inCave('sleep-3', 'sleep-spot', -17.5, 1, 1.4, 'A sleeping hollow'),
  inCave('sleep-4', 'sleep-spot', -16, 4.8, 1.4, 'A sleeping hollow'),
  inCave('sleep-5', 'sleep-spot', -12.5, 7.5, 1.4, 'A sleeping hollow'),
  inCave('sleep-6', 'sleep-spot', -9.5, 9.5, 1.4, 'A sleeping hollow'),
  { id: 'shore-mussels', kind: 'shellfish-bed', x: 12, z: 197, radius: 9, label: 'The mussel rocks', tideMax: -0.3 },
  { id: 'shore-limpets', kind: 'shellfish-bed', x: -18, z: 172, radius: 8, label: 'The limpet ledge', tideMax: 0 },
  { id: 'shore-turbans', kind: 'shellfish-bed', x: 62, z: 186, radius: 7, label: 'The turban pools', tideMax: -0.15 },
  { id: 'safe-sand', kind: 'safe-sand', x: -110, z: 118, radius: 8, label: 'The high sand' },
  { id: 'cove-beach', kind: 'safe-sand', x: -212, z: 121, radius: 30, label: 'The cove' },
  { id: 'whale-beach', kind: 'whale-beach', x: -190, z: 146, radius: 14, label: 'The whale beach' },
  { id: 'seal-rocks', kind: 'seal-rocks', x: 118, z: 330, radius: 18, label: 'The seal rocks' },
  { id: 'corm-slope', kind: 'corm-patch', x: 36, z: 56, radius: 9, label: 'The corm slope' },
  { id: 'corm-flats', kind: 'corm-patch', x: -70, z: 30, radius: 12, label: 'The bulb flats' },
  { id: 'adder-rock', kind: 'adder-spot', x: 43, z: 50, radius: 1.5, label: 'A warm rock' },
  { id: 'play-dunes', kind: 'play-ground', x: -212, z: 52, radius: 22, label: 'The dunes' },
  { id: 'silcrete-ridge', kind: 'silcrete-outcrop', x: -276, z: -236, radius: 10, label: 'The silcrete ridge' },
  { id: 'ochre-seam', kind: 'ochre-source', x: 119, z: 62, radius: 4, label: 'The red seam' },
  { id: 'firewood-gully', kind: 'firewood', x: 124, z: 6, radius: 14, label: 'The milkwood gully' },
  { id: 'lookout-point', kind: 'lookout', x: -2, z: 80, radius: 5, label: 'The lookout' },
  { id: 'eland-plateau', kind: 'eland-range', x: -60, z: -640, radius: 140, label: 'The eland grass' },
  { id: 'lagoon-camp', kind: 'lagoon-camp', x: 402, z: -6, radius: 16, label: 'The river-mouth camp' },
  { id: 'spring', kind: 'spring', x: 120, z: 40, radius: 3, label: 'The spring' },
  { id: 'shore-path-top', kind: 'path-node', x: -27, z: 98, radius: 2, label: 'The cliff path' },
  { id: 'shore-path-bottom', kind: 'path-node', x: 42, z: 141, radius: 2, label: 'The foot of the path' },
  { id: 'plateau-path-top', kind: 'path-node', x: 90, z: 78, radius: 2, label: 'The top of the path' },
]
