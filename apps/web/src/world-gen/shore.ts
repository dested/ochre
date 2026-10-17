/**
 * Distance to the waterline, precomputed: an exact Euclidean distance transform (Felzenszwalb–Huttenlocher) of
 * the water mask at nine sea levels on a 4 m grid, interpolated between levels at query time. Plus the distance
 * to deep water at mean sea level (where the surf breaks). Three-free.
 */
import { CELL, GRID_N, HALF } from './layout'
import { FRESH_NONE } from './terrain'

export const SHORE_STEP = 4
export const SHORE_N = Math.floor((GRID_N - 1) / (SHORE_STEP / CELL)) + 1
export const SHORE_LEVELS = [-1.6, -1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2, 1.6] as const
const MAX_DIST = 600
const INF = 1e20

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    const fq = f[q] ?? INF
    let s = 0
    for (;;) {
      const vk = v[k] ?? 0
      s = (fq + q * q - ((f[vk] ?? INF) + vk * vk)) / (2 * q - 2 * vk)
      if (s <= (z[k] ?? -INF) && k > 0) k--
      else break
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? INF) < q) k++
    const vk = v[k] ?? 0
    d[q] = (q - vk) * (q - vk) + (f[vk] ?? INF)
  }
}

/** distance in metres from every cell to the nearest cell where `wet` is true (0 on wet cells) */
export function distanceTransform(wet: Uint8Array, n: number, cell: number): Float32Array {
  const g = new Float64Array(n * n)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  // columns
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = wet[y * n + x] === 1 ? 0 : INF
    edt1d(f, n, d, v, z)
    for (let y = 0; y < n; y++) g[y * n + x] = d[y] ?? INF
  }
  const out = new Float32Array(n * n)
  // rows
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) f[x] = g[y * n + x] ?? INF
    edt1d(f, n, d, v, z)
    for (let x = 0; x < n; x++) out[y * n + x] = Math.min(MAX_DIST, Math.sqrt(d[x] ?? INF) * cell)
  }
  return out
}

export type ShoreFields = {
  /** one distance field per SHORE_LEVELS entry */
  levels: Float32Array[]
  /** distance to sea deeper than 3 m below mean sea level */
  deep: Float32Array
}

export function buildShore(h: Float32Array, fresh: Float32Array): ShoreFields {
  const n = SHORE_N
  const stride = SHORE_STEP / CELL
  const hs = new Float32Array(n * n)
  const fs = new Float32Array(n * n)
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const gi = iz * stride * GRID_N + ix * stride
      hs[iz * n + ix] = h[gi] ?? 0
      fs[iz * n + ix] = fresh[gi] ?? FRESH_NONE
    }
  }
  const wet = new Uint8Array(n * n)
  const levels: Float32Array[] = []
  for (const L of SHORE_LEVELS) {
    for (let i = 0; i < n * n; i++) {
      const fl = fs[i] ?? FRESH_NONE
      const hv = hs[i] ?? 0
      wet[i] = (fl !== FRESH_NONE ? hv < fl : hv < L) ? 1 : 0
    }
    levels.push(distanceTransform(wet, n, SHORE_STEP))
  }
  for (let i = 0; i < n * n; i++) wet[i] = (fs[i] ?? FRESH_NONE) === FRESH_NONE && (hs[i] ?? 0) < -3 ? 1 : 0
  const deep = distanceTransform(wet, n, SHORE_STEP)
  return { levels, deep }
}

function bilinear(arr: Float32Array, n: number, x: number, z: number): number {
  const fx = Math.min(n - 1.0001, Math.max(0, (x + HALF) / SHORE_STEP))
  const fz = Math.min(n - 1.0001, Math.max(0, (z + HALF) / SHORE_STEP))
  const ix = Math.floor(fx)
  const iz = Math.floor(fz)
  const tx = fx - ix
  const tz = fz - iz
  const i = iz * n + ix
  const a = arr[i] ?? 0
  const b = arr[i + 1] ?? 0
  const c = arr[i + n] ?? 0
  const d = arr[i + n + 1] ?? 0
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz
}

export function shoreDistanceAt(f: ShoreFields, x: number, z: number, seaLevel: number): number {
  const first = SHORE_LEVELS[0]
  const step = (SHORE_LEVELS[1] ?? 0) - first
  const t = Math.min(SHORE_LEVELS.length - 1.0001, Math.max(0, (seaLevel - first) / step))
  const k = Math.floor(t)
  const a = f.levels[k]
  const b = f.levels[k + 1]
  if (!a || !b) return 0
  const da = bilinear(a, SHORE_N, x, z)
  const db = bilinear(b, SHORE_N, x, z)
  return da + (db - da) * (t - k)
}

export function deepDistanceAt(f: ShoreFields, x: number, z: number): number {
  return bilinear(f.deep, SHORE_N, x, z)
}
