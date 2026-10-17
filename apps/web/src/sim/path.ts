/**
 * Grid A* over WorldData.walkable: 2 m cells, walkability computed lazily in 64 m chunks and shared per world,
 * searches amortized across steps (a budget of node expansions per pump) and results cached by start/goal cell.
 * Cells that are dry only at low tide are checked against the sea level of the request.
 */
import type { Vec2, WorldData } from '../game/contracts'

export const CELL = 2
const CHUNK = 32
const LOW_SEA = -1.6
const HIGH_SEA = 1.6
const MAX_EXPANSIONS = 250_000
const CACHE_LIMIT = 600

const BLOCKED = 0
const OPEN = 1
const TIDAL = 2

type WalkGrid = {
  world: WorldData
  n: number
  origin: number
  chunksPerSide: number
  chunkReady: Uint8Array
  cells: Uint8Array
}

const grids = new WeakMap<WorldData, WalkGrid>()

function gridFor(world: WorldData): WalkGrid {
  let g = grids.get(world)
  if (!g) {
    const n = Math.ceil(world.size / CELL)
    const chunksPerSide = Math.ceil(n / CHUNK)
    g = {
      world,
      n,
      origin: -world.size / 2,
      chunksPerSide,
      chunkReady: new Uint8Array(chunksPerSide * chunksPerSide),
      cells: new Uint8Array(n * n),
    }
    grids.set(world, g)
  }
  return g
}

function ensureChunk(g: WalkGrid, ix: number, iz: number): void {
  const cx = (ix / CHUNK) | 0
  const cz = (iz / CHUNK) | 0
  const ci = cz * g.chunksPerSide + cx
  if (g.chunkReady[ci]) return
  g.chunkReady[ci] = 1
  const x0 = cx * CHUNK
  const z0 = cz * CHUNK
  for (let j = z0; j < Math.min(g.n, z0 + CHUNK); j++) {
    const wz = g.origin + (j + 0.5) * CELL
    for (let i = x0; i < Math.min(g.n, x0 + CHUNK); i++) {
      const wx = g.origin + (i + 0.5) * CELL
      const high = g.world.walkable(wx, wz, HIGH_SEA)
      const low = high || g.world.walkable(wx, wz, LOW_SEA)
      g.cells[j * g.n + i] = high ? OPEN : low ? TIDAL : BLOCKED
    }
  }
}

type Heap = { f: number[]; idx: number[] }

function heapPush(h: Heap, f: number, idx: number): void {
  let i = h.f.length
  h.f.push(f)
  h.idx.push(idx)
  while (i > 0) {
    const p = (i - 1) >> 1
    const pf = h.f[p] ?? 0
    if (pf <= f) break
    h.f[i] = pf
    h.idx[i] = h.idx[p] ?? 0
    i = p
  }
  h.f[i] = f
  h.idx[i] = idx
}

function heapPop(h: Heap): number {
  const top = h.idx[0] ?? -1
  const lastF = h.f.pop()
  const lastI = h.idx.pop()
  const n = h.f.length
  if (n === 0 || lastF === undefined || lastI === undefined) return top
  let i = 0
  for (;;) {
    const l = 2 * i + 1
    if (l >= n) break
    const r = l + 1
    const lf = h.f[l] ?? Infinity
    const rf = r < n ? (h.f[r] ?? Infinity) : Infinity
    const c = rf < lf ? r : l
    const cf = rf < lf ? rf : lf
    if (cf >= lastF) break
    h.f[i] = cf
    h.idx[i] = h.idx[c] ?? 0
    i = c
  }
  h.f[i] = lastF
  h.idx[i] = lastI
  return top
}

export type PathRequest = {
  readonly id: number
  readonly from: Vec2
  readonly to: Vec2
  readonly seaLevel: number
  done: boolean
  /** the waypoints after `from`, ending at `to` (or near it); a straight line when no path exists */
  path: Vec2[]
  failed: boolean
}

type Search = {
  req: PathRequest
  startIdx: number
  goalIdx: number
  stamp: number
  heap: Heap
  expansions: number
  usedTidal: boolean
}

export type PathStats = { searches: number; cacheHits: number; failures: number; expansions: number }

export class PathService {
  private readonly g: WalkGrid
  private queue: PathRequest[] = []
  private active: Search | null = null
  private nextId = 1
  private stampCounter = 0
  private gScore: Float32Array | null = null
  private parent: Int32Array | null = null
  private seen: Uint32Array | null = null
  private cache = new Map<string, Vec2[]>()
  readonly stats: PathStats = { searches: 0, cacheHits: 0, failures: 0, expansions: 0 }

  constructor(world: WorldData) {
    this.g = gridFor(world)
  }

  get pending(): number {
    return this.queue.length + (this.active ? 1 : 0)
  }

  request(from: Vec2, to: Vec2, seaLevel: number): PathRequest {
    const req: PathRequest = {
      id: this.nextId++,
      from: { x: from.x, z: from.z },
      to: { x: to.x, z: to.z },
      seaLevel,
      done: false,
      path: [],
      failed: false,
    }
    const cached = this.fromCache(req)
    if (cached) {
      req.path = cached
      req.done = true
      this.stats.cacheHits++
      return req
    }
    this.queue.push(req)
    return req
  }

  cancel(req: PathRequest): void {
    const i = this.queue.indexOf(req)
    if (i >= 0) this.queue.splice(i, 1)
    if (this.active?.req === req) this.active = null
  }

  /** advance searches by at most `budget` node expansions */
  pump(budget: number): void {
    while (budget > 0) {
      if (!this.active) {
        const next = this.queue.shift()
        if (!next) return
        const cached = this.fromCache(next)
        if (cached) {
          next.path = cached
          next.done = true
          this.stats.cacheHits++
          continue
        }
        this.active = this.begin(next)
        if (!this.active) continue
      }
      budget = this.expand(this.active, budget)
    }
  }

  /** true when a straight walk between two points stays on walkable cells (sampled every metre) */
  lineClear(a: Vec2, b: Vec2, seaLevel: number): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z)
    const steps = Math.max(1, Math.ceil(d))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const idx = this.cellIndex(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)
      if (idx < 0 || !this.passable(idx, seaLevel)) return false
    }
    return true
  }

  passableAt(x: number, z: number, seaLevel: number): boolean {
    const idx = this.cellIndex(x, z)
    return idx >= 0 && this.passable(idx, seaLevel)
  }

  // ─── internals ──────────────────────────────────────────────────────────────────────────────────────────────

  private cellIndex(x: number, z: number): number {
    const ix = Math.floor((x - this.g.origin) / CELL)
    const iz = Math.floor((z - this.g.origin) / CELL)
    if (ix < 0 || iz < 0 || ix >= this.g.n || iz >= this.g.n) return -1
    return iz * this.g.n + ix
  }

  private cellCenter(idx: number): Vec2 {
    const ix = idx % this.g.n
    const iz = (idx / this.g.n) | 0
    return { x: this.g.origin + (ix + 0.5) * CELL, z: this.g.origin + (iz + 0.5) * CELL }
  }

  private passable(idx: number, seaLevel: number): boolean {
    const n = this.g.n
    ensureChunk(this.g, idx % n, (idx / n) | 0)
    const v = this.g.cells[idx]
    if (v === OPEN) return true
    if (v !== TIDAL) return false
    const c = this.cellCenter(idx)
    return this.g.world.walkable(c.x, c.z, seaLevel)
  }

  /** the nearest passable cell to a point, searching rings out to `radius` cells */
  private snap(p: Vec2, seaLevel: number, radius: number): number {
    const idx = this.cellIndex(p.x, p.z)
    if (idx < 0) return -1
    if (this.passable(idx, seaLevel)) return idx
    const n = this.g.n
    const ix = idx % n
    const iz = (idx / n) | 0
    for (let r = 1; r <= radius; r++) {
      let best = -1
      let bestD = Infinity
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const jx = ix + dx
          const jz = iz + dz
          if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue
          const j = jz * n + jx
          if (!this.passable(j, seaLevel)) continue
          const d = dx * dx + dz * dz
          if (d < bestD) {
            bestD = d
            best = j
          }
        }
      }
      if (best >= 0) return best
    }
    return -1
  }

  private cacheKeys(req: PathRequest): { base: string; tidal: string } {
    const q = (v: number) => Math.floor((v - this.g.origin) / (CELL * 4))
    const g = (v: number) => Math.floor((v - this.g.origin) / CELL)
    const base = `${q(req.from.x)},${q(req.from.z)}>${g(req.to.x)},${g(req.to.z)}`
    return { base: `${base}|a`, tidal: `${base}|${Math.round(req.seaLevel / 0.2)}` }
  }

  private fromCache(req: PathRequest): Vec2[] | null {
    const keys = this.cacheKeys(req)
    const hit = this.cache.get(keys.base) ?? this.cache.get(keys.tidal)
    if (!hit) return null
    const path = hit.map((p) => ({ x: p.x, z: p.z }))
    path.push({ x: req.to.x, z: req.to.z })
    return path
  }

  private begin(req: PathRequest): Search | null {
    const startIdx = this.snap(req.from, req.seaLevel, 4)
    const goalIdx = this.snap(req.to, req.seaLevel, 8)
    if (startIdx < 0 || goalIdx < 0) {
      this.finish(req, null, false)
      return null
    }
    if (startIdx === goalIdx) {
      this.finish(req, [], false)
      return null
    }
    const size = this.g.n * this.g.n
    if (!this.gScore || !this.parent || !this.seen) {
      this.gScore = new Float32Array(size)
      this.parent = new Int32Array(size)
      this.seen = new Uint32Array(size)
    }
    this.stampCounter += 2
    if (this.stampCounter > 0xfffffff0) {
      this.seen.fill(0)
      this.stampCounter = 2
    }
    const stamp = this.stampCounter
    const s: Search = { req, startIdx, goalIdx, stamp, heap: { f: [], idx: [] }, expansions: 0, usedTidal: false }
    this.gScore[startIdx] = 0
    this.parent[startIdx] = -1
    this.seen[startIdx] = stamp
    heapPush(s.heap, this.heuristic(startIdx, goalIdx), startIdx)
    this.stats.searches++
    return s
  }

  private heuristic(a: number, b: number): number {
    const n = this.g.n
    const dx = Math.abs((a % n) - (b % n))
    const dz = Math.abs(((a / n) | 0) - ((b / n) | 0))
    return (Math.max(dx, dz) + 0.41421356 * Math.min(dx, dz)) * 1.15
  }

  /** returns the unused budget */
  private expand(s: Search, budget: number): number {
    const gScore = this.gScore
    const parent = this.parent
    const seen = this.seen
    if (!gScore || !parent || !seen) return budget
    const n = this.g.n
    const sea = s.req.seaLevel
    const closed = s.stamp + 1
    while (budget > 0) {
      if (s.heap.f.length === 0 || s.expansions > MAX_EXPANSIONS) {
        this.active = null
        this.finish(s.req, null, false)
        return budget
      }
      const cur = heapPop(s.heap)
      if (seen[cur] === closed) continue
      seen[cur] = closed
      budget--
      s.expansions++
      this.stats.expansions++
      if (cur === s.goalIdx) {
        this.active = null
        const cells: number[] = []
        for (let c = cur; c >= 0; c = parent[c] ?? -1) cells.push(c)
        cells.reverse()
        this.finish(s.req, this.smooth(cells, sea), s.usedTidal)
        return budget
      }
      const cx = cur % n
      const cz = (cur / n) | 0
      const gc = gScore[cur] ?? 0
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue
          const nx = cx + dx
          const nz = cz + dz
          if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue
          const ni = nz * n + nx
          if (seen[ni] === closed) continue
          if (!this.passable(ni, sea)) continue
          if (dx !== 0 && dz !== 0) {
            if (!this.passable(cz * n + nx, sea) || !this.passable(nz * n + cx, sea)) continue
          }
          if (this.g.cells[ni] === TIDAL) s.usedTidal = true
          const ng = gc + (dx !== 0 && dz !== 0 ? 1.41421356 : 1)
          if (seen[ni] === s.stamp && (gScore[ni] ?? 0) <= ng) continue
          seen[ni] = s.stamp
          gScore[ni] = ng
          parent[ni] = cur
          heapPush(s.heap, ng + this.heuristic(ni, s.goalIdx), ni)
        }
      }
    }
    return 0
  }

  /** string-pull the cell path into a few waypoints */
  private smooth(cells: number[], sea: number): Vec2[] {
    const pts = cells.map((c) => this.cellCenter(c))
    if (pts.length <= 2) return pts.slice(1)
    const out: Vec2[] = []
    let i = 0
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 48)
      const a = pts[i]
      if (!a) break
      for (; j > i + 1; j--) {
        const b = pts[j]
        if (b && this.lineClear(a, b, sea)) break
      }
      const b = pts[j]
      if (b) out.push(b)
      i = j
    }
    return out
  }

  private finish(req: PathRequest, path: Vec2[] | null, usedTidal: boolean): void {
    req.done = true
    if (!path) {
      req.failed = true
      req.path = [{ x: req.to.x, z: req.to.z }]
      this.stats.failures++
      return
    }
    const keys = this.cacheKeys(req)
    if (this.cache.size > CACHE_LIMIT) this.cache.clear()
    this.cache.set(usedTidal ? keys.tidal : keys.base, path.map((p) => ({ x: p.x, z: p.z })))
    req.path = [...path, { x: req.to.x, z: req.to.z }]
  }
}
