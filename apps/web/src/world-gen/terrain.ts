/**
 * The terrain: a base field lofted from the cross-section stations (plateau, cliff, shelf, beach, seabed) with
 * seeded noise, valid everywhere (the view's far field samples it past the world's edge), then a grid at 2 m
 * with the local features stamped in: the lagoon, the river valley, the gully, the dunes, the stacks, the cave
 * terrace, the shellfish ledges and the path benches. Three-free.
 */
import { mix32 } from '../core/rng'
import { createCaveRock, type CaveRock } from './cave'
import { MonotoneCurve, resample, segDist, type P2 } from './curves'
import {
  CAVE,
  CELL,
  DUNES,
  GRID_N,
  GULLY,
  HALF,
  INLET,
  LAGOON,
  LAGOON_LEVEL,
  PATHS,
  PI_DROP,
  PI_EDGE,
  PI_LOW,
  PI_TOE,
  POI_DEFS,
  RIDGE,
  RIVER,
  STACKS,
  STATIONS,
  caveHalfWidth,
  caveLocal,
  inCaveFootprint,
  type PathDef,
} from './layout'
import { Noise2, clamp, lerp, smoothstep } from './noise'

/** base material classes (the tide is applied at query time) */
export const MAT = {
  seabed: 0,
  shelf: 1,
  sand: 2,
  dune: 3,
  fynbos: 4,
  grass: 5,
  rock: 6,
  cliff: 7,
  cave: 8,
  path: 9,
  lagoonBed: 10,
  riverBed: 11,
  scree: 12,
} as const

export const FRESH_NONE = -999

export type TerrainGrid = {
  n: number
  cell: number
  /** world coordinate of sample 0 on both axes */
  origin: number
  h: Float32Array
  mat: Uint8Array
  /** fresh water level (lagoon, river), FRESH_NONE where none */
  fresh: Float32Array
  /** 1 lagoon, 2 river */
  freshKind: Uint8Array
  /** 1 on a path bench */
  path: Uint8Array
  /** 1 where the cave's rock fills the space a body would stand in */
  blocked: Uint8Array
  /** rise over run */
  slope: Float32Array
  /** 0..1 how sandy the shore profile is */
  sand: Float32Array
  /** the cave's rock field (the view polygonises it) */
  cave: CaveRock
  /** the path centrelines with their bench heights */
  paths: readonly { id: string; pts: readonly { x: number; z: number; y: number }[] }[]
  /** the river centreline with its water level */
  river: readonly { x: number; z: number; level: number }[]
}

type Column = {
  curve: MonotoneCurve
  sand: number
  zEdge: number
  zToe: number
  zLow: number
  zDrop: number
  shift: number
}

/** The base field: lofted stations + noise. `heightAt` is valid at any x, z (far field included). */
export type BaseField = {
  heightAt(x: number, z: number): number
  column(x: number): Column
  /** height + the region weights at a point (for stamping and materials) */
  sample(x: number, z: number, col: Column): { h: number; sand: number; plat: number; face: number; shore: number }
}

const N_PTS = (STATIONS[0]?.pts.length ?? 0)

export function createBaseField(seed: number): BaseField {
  const nA = new Noise2(mix32(seed, 0xb45e))
  const nB = new Noise2(mix32(seed, 0x3a71))
  const nC = new Noise2(mix32(seed, 0x51e1))
  const nM = new Noise2(mix32(seed, 0x6d0e))
  const zs = new Float64Array(N_PTS)
  const ys = new Float64Array(N_PTS)
  const cache = new Map<number, Column>()

  const column = (x: number): Column => {
    const key = Math.round(x * 4)
    const hit = cache.get(key)
    if (hit) return hit
    const first = STATIONS[0]
    const last = STATIONS[STATIONS.length - 1]
    if (!first || !last) throw new Error('no stations')
    let a = first
    let b = first
    let t = 0
    let shift = 0
    if (x <= first.x) {
      shift = (x - first.x) * 0.72 + nM.fbm(x / 1300, 0.5, 3) * 260 * smoothstep(first.x, first.x - 600, x)
    } else if (x >= last.x) {
      a = last
      b = last
      shift = (x - last.x) * -0.08 + nM.fbm(x / 1500, 4.5, 3) * 180 * smoothstep(last.x, last.x + 800, x)
    } else {
      for (let i = 0; i < STATIONS.length - 1; i++) {
        const s0 = STATIONS[i]
        const s1 = STATIONS[i + 1]
        if (s0 && s1 && x >= s0.x && x <= s1.x) {
          a = s0
          b = s1
          t = smoothstep(0, 1, (x - s0.x) / (s1.x - s0.x))
          break
        }
      }
    }
    for (let i = 0; i < N_PTS; i++) {
      const pa = a.pts[i]
      const pb = b.pts[i]
      if (!pa || !pb) continue
      const fixed = i === 0 || i === N_PTS - 1
      zs[i] = lerp(pa[0], pb[0], t) + (fixed ? 0 : shift)
      ys[i] = lerp(pa[1], pb[1], t)
    }
    // keep z strictly increasing after the shift
    for (let i = 1; i < N_PTS; i++) {
      const prev = zs[i - 1] ?? 0
      if ((zs[i] ?? 0) <= prev + 1) zs[i] = prev + 1
    }
    const col: Column = {
      curve: new MonotoneCurve(zs, ys),
      sand: lerp(a.sand, b.sand, t),
      zEdge: zs[PI_EDGE] ?? 0,
      zToe: zs[PI_TOE] ?? 0,
      zLow: zs[PI_LOW] ?? 0,
      zDrop: zs[PI_DROP] ?? 0,
      shift: 0,
    }
    if (cache.size > 20000) cache.clear()
    cache.set(key, col)
    return col
  }

  const caveDist = (x: number, z: number) => Math.hypot(x - CAVE.x, z - CAVE.z)

  const sample = (x: number, z: number, col: Column) => {
    const cd = caveDist(x, z)
    const nearCave = 1 - smoothstep(70, 200, cd)
    const sand = col.sand
    const warpK = (1 - nearCave) * (1 - sand * 0.55)
    const zw = warpK > 0.001 ? z + nB.fbm(x / 260, z / 260, 2) * 18 * warpK : z
    let h = col.curve.at(zw)
    const plat = 1 - smoothstep(col.zEdge - 40, col.zEdge - 4, zw)
    const face = smoothstep(col.zEdge - 8, col.zEdge + 2, zw) * (1 - smoothstep(col.zToe - 3, col.zToe + 4, zw))
    const shore = smoothstep(col.zToe - 2, col.zToe + 5, zw) * (1 - smoothstep(col.zDrop, col.zDrop + 40, zw))
    const sea = smoothstep(col.zLow, col.zDrop + 25, zw)
    if (plat > 0.001) h += plat * (1 - nearCave * 0.75) * nA.fbm(x / 380, z / 380, 5, 2.1, 0.42) * 12.5
    const faceK = face * (1 - sand * 0.85) * (1 - nearCave * 0.6)
    if (faceK > 0.001) h += faceK * (nC.ridged(x / 22, z / 22, 3) - 0.45) * 6.5
    if (shore > 0.001 && sand < 0.95) {
      // the shelf: tilted strata ledges with channels and pools
      const u = x * 0.906 + z * 0.423
      const v = -x * 0.423 + z * 0.906
      const ledge = nC.ridged(u / 13, v / 34, 3)
      const step = Math.floor(ledge * 4) / 4
      const ch = Math.abs(nB.at(x / 26, z / 26))
      let s = (lerp(ledge, step, 0.55) - 0.45) * 1.25
      if (ch < 0.09) s -= 0.8 * (1 - ch / 0.09)
      h += shore * (1 - sand) * s
    }
    if (sea > 0.001) h += sea * nA.fbm(x / 170, z / 170, 2) * 3
    if (sand < 0.98) h += (1 - sand * 0.85) * nB.fbm(x / 9, z / 9, 2) * 0.32
    // the north: foothills inside the world, mountain ranges beyond it
    if (z < -650) {
      h += smoothstep(-650, -1100, z) * nM.ridged(x / 520, z / 520, 4) * 46
      if (z < -1150) {
        const near = smoothstep(-1300, -3600, z) * (1 - smoothstep(-6000, -9500, z))
        const far = smoothstep(-7000, -12000, z)
        const m1 = near > 0 ? near * (180 + 520 * nM.ridged(x / 1900, z / 1900, 5)) : 0
        const m2 = far > 0 ? far * (650 + 1100 * nM.ridged(x / 3800 + 9.3, z / 3800, 5)) : 0
        h += Math.max(m1, m2)
      }
    }
    return { h, sand, plat, face, shore }
  }

  const heightAt = (x: number, z: number): number => sample(x, z, column(x)).h

  return { heightAt, column, sample }
}

// ─── The grid ────────────────────────────────────────────────────────────────────────────────────────────────

export const gridIndex = (ix: number, iz: number): number => iz * GRID_N + ix

/** bilinear sample of a grid array at world (x, z) */
export function sampleGrid(arr: Float32Array, x: number, z: number): number {
  const fx = clamp((x + HALF) / CELL, 0, GRID_N - 1.0001)
  const fz = clamp((z + HALF) / CELL, 0, GRID_N - 1.0001)
  const ix = Math.floor(fx)
  const iz = Math.floor(fz)
  const tx = fx - ix
  const tz = fz - iz
  const i = iz * GRID_N + ix
  const a = arr[i] ?? 0
  const b = arr[i + 1] ?? 0
  const c = arr[i + GRID_N] ?? 0
  const d = arr[i + GRID_N + 1] ?? 0
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz
}

/** nearest grid cell index for world (x, z), or −1 out of bounds */
export function cellOf(x: number, z: number): number {
  const ix = Math.round((x + HALF) / CELL)
  const iz = Math.round((z + HALF) / CELL)
  if (ix < 0 || iz < 0 || ix >= GRID_N || iz >= GRID_N) return -1
  return iz * GRID_N + ix
}

function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1)
  return lerp(b, a, h) - k * h * (1 - h)
}

type Stamp = (x: number, z: number, h: number, i: number) => number

/** apply a stamp to every grid sample in a world-space box */
function stampBox(g: Float32Array, x0: number, z0: number, x1: number, z1: number, f: Stamp): void {
  const ix0 = Math.max(0, Math.floor((x0 + HALF) / CELL))
  const ix1 = Math.min(GRID_N - 1, Math.ceil((x1 + HALF) / CELL))
  const iz0 = Math.max(0, Math.floor((z0 + HALF) / CELL))
  const iz1 = Math.min(GRID_N - 1, Math.ceil((z1 + HALF) / CELL))
  for (let iz = iz0; iz <= iz1; iz++) {
    const z = -HALF + iz * CELL
    for (let ix = ix0; ix <= ix1; ix++) {
      const x = -HALF + ix * CELL
      const i = iz * GRID_N + ix
      g[i] = f(x, z, g[i] ?? 0, i)
    }
  }
}

type PolyHit = { d: number; s: number }

/** a resampled polyline with cumulative lengths, and a nearest-point query */
class Poly {
  readonly pts: P2[]
  readonly cum: Float64Array
  readonly length: number
  constructor(points: readonly P2[], step: number) {
    this.pts = resample(points, step)
    this.cum = new Float64Array(this.pts.length)
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1]
      const b = this.pts[i]
      if (a && b) this.cum[i] = (this.cum[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.z - a.z)
    }
    this.length = this.cum[this.pts.length - 1] ?? 0
  }
  nearest(x: number, z: number): PolyHit {
    let best = Infinity
    let bs = 0
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i]
      const b = this.pts[i + 1]
      if (!a || !b) continue
      // cheap reject
      const mx = (a.x + b.x) / 2 - x
      const mz = (a.z + b.z) / 2 - z
      const seg = Math.abs(b.x - a.x) + Math.abs(b.z - a.z)
      if (mx * mx + mz * mz > (best + seg) * (best + seg)) continue
      const r = segDist(x, z, a.x, a.z, b.x, b.z)
      if (r.d < best) {
        best = r.d
        bs = (this.cum[i] ?? 0) + r.t * ((this.cum[i + 1] ?? 0) - (this.cum[i] ?? 0))
      }
    }
    return { d: best, s: bs }
  }
  bounds(margin: number): { x0: number; z0: number; x1: number; z1: number } {
    let x0 = Infinity
    let z0 = Infinity
    let x1 = -Infinity
    let z1 = -Infinity
    for (const p of this.pts) {
      x0 = Math.min(x0, p.x)
      z0 = Math.min(z0, p.z)
      x1 = Math.max(x1, p.x)
      z1 = Math.max(z1, p.z)
    }
    return { x0: x0 - margin, z0: z0 - margin, x1: x1 + margin, z1: z1 + margin }
  }
}

/**
 * Distance (and arc length) to a polyline for every grid sample within `radius`, by splatting its samples:
 * one pass over the samples instead of a nearest-segment search per grid point.
 */
class PolyField {
  readonly ix0: number
  readonly iz0: number
  readonly w: number
  readonly hgt: number
  readonly dist: Float32Array
  readonly arc: Float32Array
  constructor(poly: Poly, radius: number, step: number) {
    const dense = new Poly(poly.pts, step)
    const bb = dense.bounds(radius + CELL)
    this.ix0 = Math.max(0, Math.floor((bb.x0 + HALF) / CELL))
    this.iz0 = Math.max(0, Math.floor((bb.z0 + HALF) / CELL))
    const ix1 = Math.min(GRID_N - 1, Math.ceil((bb.x1 + HALF) / CELL))
    const iz1 = Math.min(GRID_N - 1, Math.ceil((bb.z1 + HALF) / CELL))
    this.w = Math.max(1, ix1 - this.ix0 + 1)
    this.hgt = Math.max(1, iz1 - this.iz0 + 1)
    this.dist = new Float32Array(this.w * this.hgt).fill(1e18)
    this.arc = new Float32Array(this.w * this.hgt)
    const rc = Math.ceil(radius / CELL)
    const r2 = (radius + CELL) * (radius + CELL)
    for (let k = 0; k < dense.pts.length; k++) {
      const p = dense.pts[k]
      if (!p) continue
      const s = dense.cum[k] ?? 0
      const cx = Math.round((p.x + HALF) / CELL) - this.ix0
      const cz = Math.round((p.z + HALF) / CELL) - this.iz0
      for (let dz = -rc; dz <= rc; dz++) {
        const lz = cz + dz
        if (lz < 0 || lz >= this.hgt) continue
        const wz = -HALF + (lz + this.iz0) * CELL - p.z
        for (let dx = -rc; dx <= rc; dx++) {
          const lx = cx + dx
          if (lx < 0 || lx >= this.w) continue
          const wx = -HALF + (lx + this.ix0) * CELL - p.x
          const d2 = wx * wx + wz * wz
          const li = lz * this.w + lx
          if (d2 < r2 && d2 < (this.dist[li] ?? 1e18)) {
            this.dist[li] = d2
            this.arc[li] = s
          }
        }
      }
    }
    for (let i = 0; i < this.dist.length; i++) this.dist[i] = Math.sqrt(this.dist[i] ?? 1e18)
  }
  /** distance and arc length at world (x, z) (a grid sample) */
  at(x: number, z: number): PolyHit {
    const lx = Math.round((x + HALF) / CELL) - this.ix0
    const lz = Math.round((z + HALF) / CELL) - this.iz0
    if (lx < 0 || lz < 0 || lx >= this.w || lz >= this.hgt) return { d: 1e9, s: 0 }
    const li = lz * this.w + lx
    return { d: this.dist[li] ?? 1e9, s: this.arc[li] ?? 0 }
  }
  box(): { x0: number; z0: number; x1: number; z1: number } {
    return {
      x0: -HALF + this.ix0 * CELL,
      z0: -HALF + this.iz0 * CELL,
      x1: -HALF + (this.ix0 + this.w - 1) * CELL,
      z1: -HALF + (this.iz0 + this.hgt - 1) * CELL,
    }
  }
}

/** bench heights along a path: the terrain, smoothed, pinned at the ends, held under the grade limit */
function pathHeights(def: PathDef, poly: Poly, h: Float32Array): Float64Array {
  const n = poly.pts.length
  const raw = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const p = poly.pts[i]
    if (p) raw[i] = sampleGrid(h, p.x, p.z)
  }
  const y = new Float64Array(n)
  const win = 6
  for (let i = 0; i < n; i++) {
    let s = 0
    let c = 0
    for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) {
      s += raw[k] ?? 0
      c++
    }
    y[i] = s / c
  }
  if (def.startY !== null) y[0] = def.startY
  if (def.endY !== null) y[n - 1] = def.endY
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < n; i++) {
      const ds = (poly.cum[i] ?? 0) - (poly.cum[i - 1] ?? 0)
      const prev = y[i - 1] ?? 0
      y[i] = clamp(y[i] ?? 0, prev - def.maxGrade * ds, prev + def.maxGrade * ds)
    }
    if (def.endY !== null) y[n - 1] = def.endY
    for (let i = n - 2; i >= 0; i--) {
      const ds = (poly.cum[i + 1] ?? 0) - (poly.cum[i] ?? 0)
      const next = y[i + 1] ?? 0
      y[i] = clamp(y[i] ?? 0, next - def.maxGrade * ds, next + def.maxGrade * ds)
    }
    if (def.startY !== null) y[0] = def.startY
  }
  return y
}

export function buildTerrain(seed: number): TerrainGrid {
  const N = GRID_N
  const total = N * N
  const base = createBaseField(seed)
  const nD = new Noise2(mix32(seed, 0xd0e5))
  const h = new Float32Array(total)
  const sand = new Float32Array(total)
  const regPlat = new Float32Array(total)
  const regFace = new Float32Array(total)
  const regShore = new Float32Array(total)
  const fresh = new Float32Array(total).fill(FRESH_NONE)
  const freshKind = new Uint8Array(total)
  const dune = new Float32Array(total)

  // 1. the base field, column by column (one loft per x)
  for (let ix = 0; ix < N; ix++) {
    const x = -HALF + ix * CELL
    const col = base.column(x)
    for (let iz = 0; iz < N; iz++) {
      const z = -HALF + iz * CELL
      const s = base.sample(x, z, col)
      const i = iz * N + ix
      h[i] = s.h
      sand[i] = s.sand
      regPlat[i] = s.plat
      regFace[i] = s.face
      regShore[i] = s.shore
    }
  }

  // 2. the dunes behind the cove
  stampBox(h, DUNES.x0 - 20, DUNES.z0 - 20, DUNES.x1 + 20, DUNES.z1 + 6, (x, z, v, i) => {
    const mx = smoothstep(DUNES.x0 - 20, DUNES.x0 + 25, x) * (1 - smoothstep(DUNES.x1 - 25, DUNES.x1 + 15, x))
    const mz = smoothstep(DUNES.z0 - 20, DUNES.z0 + 20, z) * (1 - smoothstep(DUNES.z1 - 22, DUNES.z1, z))
    const m = mx * mz
    if (m <= 0) return v
    const u = x * 0.866 + z * 0.5
    const w = -x * 0.5 + z * 0.866
    const crest = nD.ridged(u / 38 + nD.at(x / 60, z / 60) * 0.6, w / 85, 2)
    let add = (crest * 7.5 + nD.fbm(x / 25, z / 25, 2) * 1.2) * m
    // an open slack where the children play
    const pd = Math.hypot(x + 212, z - 52)
    add *= lerp(0.35, 1, smoothstep(14, 34, pd))
    dune[i] = m
    return v + add
  })

  // 3. the lagoon basin and its inlet
  stampBox(h, LAGOON.x - LAGOON.rx * 1.4, LAGOON.z - LAGOON.rz * 1.4, LAGOON.x + LAGOON.rx * 1.4, LAGOON.z + LAGOON.rz * 1.4, (x, z, v, i) => {
    const dx = (x - LAGOON.x) / LAGOON.rx
    const dz = (z - LAGOON.z) / LAGOON.rz
    const e = Math.sqrt(dx * dx + dz * dz) + nD.fbm(x / 70, z / 70, 3) * 0.13
    if (e > 1.3) return v
    const bed = lerp(-1.25, 1.6, smoothstep(0.45, 1.02, e)) + nD.fbm(x / 20, z / 20, 2) * 0.12
    const k = 1 - smoothstep(1.0, 1.3, e)
    if (e < 1.12) {
      fresh[i] = LAGOON_LEVEL
      freshKind[i] = 1
    }
    return lerp(v, Math.min(v, bed), k)
  })
  const inlet = new Poly(INLET, 2)
  {
    const f = new PolyField(inlet, 20, 1)
    const bb = f.box()
    stampBox(h, bb.x0, bb.z0, bb.x1, bb.z1, (x, z, v, i) => {
      const r = f.at(x, z)
      if (r.d > 18) return v
      const bed = lerp(-0.9, 2.3, smoothstep(4, 15, r.d))
      if (r.d < 9 && r.s < inlet.length * 0.62) {
        fresh[i] = LAGOON_LEVEL
        freshKind[i] = 1
      }
      return Math.min(v, bed)
    })
  }

  // 4. the river valley
  const riverPoly = new Poly(RIVER, 3)
  const riverFloor = (s: number) => 0.35 + s * 0.03
  {
    const f = new PolyField(riverPoly, 168, 3)
    const bb = f.box()
    stampBox(h, bb.x0, bb.z0, bb.x1, bb.z1, (x, z, v, i) => {
      const r = f.at(x, z)
      if (r.d > 165) return v
      const F = riverFloor(r.s) + nD.fbm(x / 40, z / 40, 2) * 0.25
      const wall = F + 1 + Math.max(0, r.d - 22) * 0.52 + nD.ridged(x / 30, z / 30, 2) * 2 * smoothstep(22, 60, r.d)
      let out = smin(v, wall, 6)
      if (r.d < 7.5) {
        const bed = F - 0.85 * (1 - (r.d / 7.5) * (r.d / 7.5))
        out = Math.min(out, bed)
        if (freshKind[i] !== 1) {
          fresh[i] = F + 0.1
          freshKind[i] = 2
        }
      }
      return out
    })
  }

  // 5. the gully (milkwoods, the spring, the ochre seam)
  const gully = new Poly(GULLY, 2)
  const gullyFloor = new MonotoneCurve([0, 80, 150, 215, 262, 300], [56, 50, 45, 39, 29, 8])
  {
    const f = new PolyField(gully, 40, 1)
    const bb = f.box()
    stampBox(h, bb.x0, bb.z0, bb.x1, bb.z1, (x, z, v) => {
      const r = f.at(x, z)
      if (r.d > 38) return v
      const F = gullyFloor.at(r.s) + nD.fbm(x / 15, z / 15, 2) * 0.3
      const target = F + Math.max(0, r.d - 4) * 0.62 + nD.ridged(x / 12, z / 12, 2) * 1.2 * smoothstep(4, 14, r.d)
      return smin(v, target, 3)
    })
  }

  // 6. the silcrete ridge
  {
    const ca = Math.cos(RIDGE.angle)
    const sa = Math.sin(RIDGE.angle)
    stampBox(h, RIDGE.x - 60, RIDGE.z - 60, RIDGE.x + 60, RIDGE.z + 60, (x, z, v) => {
      const dx = x - RIDGE.x
      const dz = z - RIDGE.z
      const along = dx * ca + dz * sa
      const across = -dx * sa + dz * ca
      const t = along / (RIDGE.length / 2)
      if (Math.abs(t) > 1.3) return v
      const k = Math.max(0, 1 - t * t) * Math.exp(-(across * across) / (2 * 9 * 9))
      return v + k * (RIDGE.height + nD.ridged(x / 6, z / 6, 3) * 2.5)
    })
  }

  // 7. the stacks
  const stack = new Uint8Array(total)
  for (const [sx, sz, r, top] of STACKS) {
    stampBox(h, sx - r - 4, sz - r - 4, sx + r + 4, sz + r + 4, (x, z, v, i) => {
      const d = Math.hypot(x - sx, z - sz) * (1 + nD.at(x / 7, z / 7) * 0.25)
      if (d > r) return v
      stack[i] = 1
      const k = 1 - smoothstep(r * 0.5, r, d)
      return Math.max(v, top * k + nD.ridged(x / 4, z / 4, 2) * 1.6 * k + v * (1 - k))
    })
  }

  // 8. the shellfish ledges and the dry sand
  for (const p of POI_DEFS) {
    if (p.kind === 'shellfish-bed' && p.tideMax !== undefined) {
      const target = p.tideMax - 0.4
      stampBox(h, p.x - p.radius * 2, p.z - p.radius * 2, p.x + p.radius * 2, p.z + p.radius * 2, (x, z, v) => {
        const d = Math.hypot(x - p.x, z - p.z)
        const k = 1 - smoothstep(p.radius * 0.8, p.radius * 1.9, d)
        return lerp(v, target + nD.ridged(x / 3, z / 3, 2) * 0.35, k)
      })
    }
    if (p.id === 'safe-sand') {
      stampBox(h, p.x - 14, p.z - 14, p.x + 14, p.z + 14, (x, z, v) => {
        const k = 1 - smoothstep(p.radius, p.radius + 6, Math.hypot(x - p.x, z - p.z))
        return Math.max(v, lerp(v, 2.4, k))
      })
    }
    if (p.id === 'eland-plateau') {
      // gentle open grass: soften the plateau's bumps
      stampBox(h, p.x - p.radius * 1.4, p.z - p.radius * 1.4, p.x + p.radius * 1.4, p.z + p.radius * 1.4, (x, z, v) => {
        const k = 0.5 * (1 - smoothstep(p.radius * 0.6, p.radius * 1.4, Math.hypot(x - p.x, z - p.z)))
        const ref = base.heightAt(x, z)
        return lerp(v, (v + ref) / 2, k)
      })
    }
  }

  // 9. the cave terrace (the heightfield floor under the rock shell)
  const preCave = new Float32Array(h)
  stampBox(h, CAVE.x - 40, CAVE.z - 40, CAVE.x + 40, CAVE.z + 40, (x, z, v) => {
    const { a, b } = caveLocal(x, z)
    if (a < -CAVE.depth - 6 || a > CAVE.terrace + 9) return v
    const hw = caveHalfWidth(Math.min(a, -0.5))
    const inner = (1 - smoothstep(hw + 1.5, hw + 3.5, Math.abs(b))) * smoothstep(-CAVE.depth - 3, -CAVE.depth - 1, a)
    const front = (1 - smoothstep(CAVE.terrace, CAVE.terrace + 2.5, a)) * (1 - smoothstep(CAVE.halfWidth + 1, CAVE.halfWidth + 7, Math.abs(b)))
    const k = a < 0.5 ? inner : Math.max(front, inner * (1 - smoothstep(0.5, 3, a)))
    if (k <= 0) return v
    const floor = CAVE.floor + nD.fbm(x / 3, z / 3, 2) * 0.06 + 0.35 * smoothstep(hw - 3, hw + 1, Math.abs(b))
    return lerp(v, floor, k)
  })
  // the scarp below the mouth: past the terrace's lip the ground falls away steeply, so from the cave you look
  // straight down onto the shelf and the cove
  stampBox(h, CAVE.x - 70, CAVE.z - 70, CAVE.x + 70, CAVE.z + 70, (x, z, v) => {
    const { a, b } = caveLocal(x, z)
    if (a < CAVE.terrace || a > CAVE.terrace + 60) return v
    const side = 1 - smoothstep(CAVE.halfWidth + 2, CAVE.halfWidth + 16 + a * 0.3, Math.abs(b))
    if (side <= 0) return v
    const run = a - CAVE.terrace
    // never deeper than the slope below would run anyway, and gone well before the shore
    const target = Math.max(CAVE.floor - 0.3 - run * (0.55 + 0.35 * smoothstep(0, 6, run)) + nD.at(x / 6, z / 6) * 0.8, v * 0.45 - 1)
    return v > target ? lerp(v, target, side * (1 - smoothstep(30, 55, run))) : v
  })

  // 10. the paths: bench heights from the terrain, then cut and fill
  const pathMask = new Uint8Array(total)
  const pathDist = new Float32Array(total).fill(99)
  const paths: { id: string; pts: { x: number; z: number; y: number }[] }[] = []
  for (const def of PATHS) {
    const poly = new Poly(def.pts, 1)
    const ys = pathHeights(def, poly, h)
    paths.push({ id: def.id, pts: poly.pts.map((p, k) => ({ x: p.x, z: p.z, y: ys[k] ?? 0 })) })
    const reach = def.half + 4
    const f = new PolyField(poly, reach + 1, 0.5)
    const bb = f.box()
    stampBox(h, bb.x0, bb.z0, bb.x1, bb.z1, (x, z, v, i) => {
      const r = f.at(x, z)
      if (r.d > reach) return v
      const k = Math.min(poly.pts.length - 1, Math.max(0, Math.round(r.s)))
      const y = ys[k] ?? v
      if (r.d < (pathDist[i] ?? 99)) pathDist[i] = r.d
      if (r.d < def.half + 0.6) pathMask[i] = 1
      const w = 1 - smoothstep(def.half, reach, r.d)
      return lerp(v, y, w)
    })
  }

  // the cave's rock, for blocking the walls (and for the view's shell)
  const finalH = (x: number, z: number) => sampleGrid(h, x, z)
  const preH = (x: number, z: number) => sampleGrid(preCave, x, z)
  const pathNear = (x: number, z: number) => sampleGrid(pathDist, x, z)
  const cave = createCaveRock(seed, finalH, preH, pathNear)
  const blocked = new Uint8Array(total)
  stampBox(h, CAVE.x - 36, CAVE.z - 36, CAVE.x + 36, CAVE.z + 30, (x, z, v, i) => {
    const { a } = caveLocal(x, z)
    if (a > 3 || a < -CAVE.depth - 4) return v
    const col = cave.column(x, z)
    if (cave.density(col, v + 1.0) > 0 || cave.density(col, v + 0.3) > 0) blocked[i] = 1
    return v
  })

  // 11. slope and materials
  const slope = new Float32Array(total)
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const i = iz * N + ix
      const l = h[iz * N + Math.max(0, ix - 1)] ?? 0
      const r = h[iz * N + Math.min(N - 1, ix + 1)] ?? 0
      const u = h[Math.max(0, iz - 1) * N + ix] ?? 0
      const d = h[Math.min(N - 1, iz + 1) * N + ix] ?? 0
      const sx = (r - l) / ((Math.min(N - 1, ix + 1) - Math.max(0, ix - 1)) * CELL)
      const sz = (d - u) / ((Math.min(N - 1, iz + 1) - Math.max(0, iz - 1)) * CELL)
      slope[i] = Math.sqrt(sx * sx + sz * sz)
    }
  }
  const mat = new Uint8Array(total)
  for (let iz = 0; iz < N; iz++) {
    const z = -HALF + iz * CELL
    for (let ix = 0; ix < N; ix++) {
      const x = -HALF + ix * CELL
      const i = iz * N + ix
      const hv = h[i] ?? 0
      const sl = slope[i] ?? 0
      // a ragged sand/rock boundary, not the straight line the stations interpolate
      const sd = (sand[i] ?? 0) + nD.at(x / 34, z / 34) * 0.3 + nD.at(x / 9 + 3.1, z / 9) * 0.1
      let m: number
      if (inCaveFootprint(x, z)) m = MAT.cave
      else if (pathMask[i] === 1) m = MAT.path
      else if (freshKind[i] === 1 && hv < LAGOON_LEVEL + 0.5) m = MAT.lagoonBed
      else if (freshKind[i] === 2 && hv < (fresh[i] ?? 0) + 0.3) m = MAT.riverBed
      else if (sl > 1.05) m = MAT.cliff
      else if (stack[i] === 1 && hv > -2) m = MAT.rock
      else if (hv < -3) m = sd > 0.4 || nD.at(x / 40, z / 40) > 0.25 ? MAT.seabed : MAT.shelf
      else if (hv < 2.6 && sd < 0.45 && (regShore[i] ?? 0) > 0.2) m = MAT.shelf
      else if (sl > 0.62) m = sd > 0.6 && hv < 20 ? MAT.scree : MAT.rock
      else if ((dune[i] ?? 0) > 0.35 && hv > 3.2) m = MAT.dune
      else if (hv < 4.6 && sd > 0.45) m = MAT.sand
      else if (hv < 3.2) m = sd > 0.25 ? MAT.sand : MAT.shelf
      else if ((regFace[i] ?? 0) > 0.5 && sl > 0.45) m = MAT.scree
      else {
        // plateau: fynbos near the sea, grass inland where the eland graze
        const inland = smoothstep(-260, -560, z)
        const n = nD.at(x / 70, z / 70) + nD.at(x / 23, z / 23) * 0.35
        m = n * 0.5 + 0.5 < lerp(0.25, 0.82, inland) ? MAT.grass : MAT.fynbos
        if ((regPlat[i] ?? 0) > 0.5 && nD.at(x / 15 + 7.7, z / 15) > 0.52) m = MAT.rock
      }
      mat[i] = m
    }
  }

  const river = riverPoly.pts.map((p, k) => ({ x: p.x, z: p.z, level: riverFloor(riverPoly.cum[k] ?? 0) + 0.1 }))

  return { n: N, cell: CELL, origin: -HALF, h, mat, fresh, freshKind, path: pathMask, blocked, slope, sand, cave, paths, river }
}
