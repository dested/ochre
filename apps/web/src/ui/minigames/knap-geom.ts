/**
 * Knapping geometry, pure and framework-free. The stone is a closed outline in "stone units" (about a centimetre),
 * y down, long axis vertical. A blow at an edge vertex takes a scalloped flake out of the outline; how square or
 * slanting the blow is decides whether it bites the edge or travels across the face and thins it.
 */

export type Pt = { x: number; y: number }
export type Face = 0 | 1

export type Scar = {
  face: Face
  /** strike point on the edge at the time of the blow, the inward direction, and the scar's size */
  at: Pt
  inward: Pt
  halfWidth: number
  travel: number
}

export type Stone = {
  outline: Pt[]
  /** thickness of each face's half, 1 = an unworked blank, toward 0 = thinned */
  thick: [number, number]
  scars: Scar[]
  strikes: number
}

export type BlowKind = 'clean' | 'bite' | 'glance' | 'weak' | 'snap'

export type Blow = {
  kind: BlowKind
  /** the material that came off, in stone units, for the flying flake */
  flake: Pt[]
  stone: Stone
}

const SPACING = 0.08

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y
const len = (a: Pt) => Math.hypot(a.x, a.y)
const norm = (a: Pt): Pt => {
  const l = len(a) || 1
  return { x: a.x / l, y: a.y / l }
}
const at = (pts: readonly Pt[], i: number): Pt => pts[((i % pts.length) + pts.length) % pts.length] ?? { x: 0, y: 0 }

export function signedArea(pts: readonly Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = at(pts, i)
    const q = at(pts, i + 1)
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

export function centroid(pts: readonly Pt[]): Pt {
  let x = 0
  let y = 0
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = at(pts, i)
    const q = at(pts, i + 1)
    const c = p.x * q.y - q.x * p.y
    a += c
    x += (p.x + q.x) * c
    y += (p.y + q.y) * c
  }
  if (Math.abs(a) < 1e-9) return { x: 0, y: 0 }
  return { x: x / (3 * a), y: y / (3 * a) }
}

/** even spacing along the closed outline */
export function resample(pts: readonly Pt[], spacing = SPACING): Pt[] {
  let perimeter = 0
  for (let i = 0; i < pts.length; i++) perimeter += len(sub(at(pts, i + 1), at(pts, i)))
  const n = Math.max(24, Math.round(perimeter / spacing))
  const step = perimeter / n
  const out: Pt[] = []
  let seg = 0
  let segStart = 0
  let segLen = len(sub(at(pts, 1), at(pts, 0)))
  for (let k = 0; k < n; k++) {
    const d = k * step
    while (segStart + segLen < d && seg < pts.length) {
      segStart += segLen
      seg += 1
      segLen = len(sub(at(pts, seg + 1), at(pts, seg)))
    }
    const t = segLen > 0 ? (d - segStart) / segLen : 0
    const a = at(pts, seg)
    const b = at(pts, seg + 1)
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}

/** the outward normal at vertex i (works for either winding) */
export function normalAt(pts: readonly Pt[], i: number): Pt {
  const t = sub(at(pts, i + 6), at(pts, i - 6))
  const sign = signedArea(pts) > 0 ? 1 : -1
  return norm({ x: t.y * sign, y: -t.x * sign })
}

export function nearestVertex(pts: readonly Pt[], q: Pt): { index: number; dist: number } {
  let index = 0
  let dist = Number.POSITIVE_INFINITY
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - q.x, p.y - q.y)
    if (d < dist) {
      dist = d
      index = i
    }
  })
  return { index, dist }
}

/** distance from p along dir to the first crossing of the outline beyond a small gap: the stone's local width */
function widthAlong(pts: readonly Pt[], p: Pt, dir: Pt): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < pts.length; i++) {
    const a = at(pts, i)
    const b = at(pts, i + 1)
    const e = sub(b, a)
    const den = dir.x * e.y - dir.y * e.x
    if (Math.abs(den) < 1e-9) continue
    const w = sub(a, p)
    const t = (w.x * e.y - w.y * e.x) / den
    const u = (w.x * dir.y - w.y * dir.x) / den
    if (t > 0.25 && u >= 0 && u <= 1 && t < best) best = t
  }
  return best
}

/** keep the part of the outline on the side of the line (through p, normal n) where dot(x - p, n) <= 0 */
function clipHalf(pts: readonly Pt[], p: Pt, n: Pt): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = at(pts, i)
    const b = at(pts, i + 1)
    const da = dot(sub(a, p), n)
    const db = dot(sub(b, p), n)
    if (da <= 0) out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

/** a deterministic random from a seed */
export function rand(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

/** an unworked blank: a lumpy oval a little lopsided, so evening it out is part of the work */
export function newStone(seed: number): Stone {
  const pts: Pt[] = []
  const p1 = rand(seed) * 6.28
  const p2 = rand(seed + 1) * 6.28
  const p3 = rand(seed + 2) * 6.28
  const lean = 0.06 + rand(seed + 3) * 0.06
  for (let i = 0; i < 160; i++) {
    const th = (i / 160) * Math.PI * 2
    const r = 1 + 0.06 * Math.sin(3 * th + p1) + 0.04 * Math.sin(5 * th + p2) + 0.025 * Math.sin(9 * th + p3)
    const x = Math.cos(th) * 3.1 * r * (1 + lean * Math.sign(Math.cos(th)))
    pts.push({ x, y: Math.sin(th) * 4.8 * r })
  }
  return { outline: resample(pts), thick: [1, 1], scars: [], strikes: 0 }
}

/** the target: a Still Bay leaf point 8.2 long, half-width at t (0 base .. 1 tip) */
export const LEAF_LENGTH = 8.2
export function leafHalfWidth(t: number): number {
  if (t <= 0 || t >= 1) return 0
  return 1.55 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.92)), 0.78)
}

export function leafOutline(center: Pt): Pt[] {
  const pts: Pt[] = []
  const n = 60
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push({ x: center.x + leafHalfWidth(t), y: center.y + LEAF_LENGTH / 2 - t * LEAF_LENGTH })
  }
  for (let i = n - 1; i > 0; i--) {
    const t = i / n
    pts.push({ x: center.x - leafHalfWidth(t), y: center.y + LEAF_LENGTH / 2 - t * LEAF_LENGTH })
  }
  return pts
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))

/** how much a blow bites the outline and how far it travels across the face, from its angle off square (deg) */
export function blowShape(angleDeg: number): { bite: number; travel: number } {
  const a = angleDeg
  const bite = a <= 20 ? 1 : a <= 55 ? lerp(1, 0.45, (a - 20) / 35) : lerp(0.45, 0.1, (a - 55) / 30)
  const travel = a < 15 ? 0.2 : a < 30 ? lerp(0.2, 1, (a - 15) / 15) : a <= 50 ? 1 : a <= 75 ? lerp(1, 0.2, (a - 50) / 25) : 0.1
  return { bite, travel }
}

/**
 * Strike vertex `index` on face `face`. `angleDeg` is the blow's angle off square (0 = straight in), `side` is
 * which way along the edge it leans (−1..1), `force` 0..1.
 */
export function strike(stone: Stone, face: Face, index: number, angleDeg: number, side: number, force: number, seed: number): Blow {
  const pts = stone.outline
  const p = at(pts, index)
  const n = normalAt(pts, index)
  const inward = { x: -n.x, y: -n.y }
  const tangent = { x: -n.y, y: n.x }
  const strikes = stone.strikes + 1

  if (force < 0.12) return { kind: 'weak', flake: [], stone: { ...stone, strikes } }

  const { bite, travel } = blowShape(angleDeg)
  const depth = (0.15 + 0.85 * force) * bite
  const halfWidth = 0.45 + 1.3 * force
  const local = widthAlong(pts, p, inward)
  const faceThick = stone.thick[face]
  const r = rand(seed)

  const squareSnap = angleDeg < 14 && force > 0.65 && r < 0.6
  const throughSnap = local < depth * 1.8 + 0.3
  const thinSnap = faceThick < 0.3 && force > 0.8 && travel > 0.5 && r < 0.5
  if (throughSnap) {
    // the narrow part breaks right across, roughly along the edge
    const twist = (rand(seed + 7) - 0.5) * 0.6
    const along = { x: tangent.x * Math.cos(twist) - tangent.y * Math.sin(twist), y: tangent.x * Math.sin(twist) + tangent.y * Math.cos(twist) }
    const cut = { x: p.x + inward.x * local * 0.5, y: p.y + inward.y * local * 0.5 }
    const lineN = { x: -along.y, y: along.x }
    const a = clipHalf(pts, cut, lineN)
    const b = clipHalf(pts, cut, { x: -lineN.x, y: -lineN.y })
    const keep = Math.abs(signedArea(a)) >= Math.abs(signedArea(b)) ? a : b
    const lost = keep === a ? b : a
    if (keep.length < 6) return { kind: 'snap', flake: lost, stone: { ...stone, strikes } }
    return { kind: 'snap', flake: lost, stone: { ...stone, outline: resample(keep), strikes } }
  }
  if (squareSnap || thinSnap) {
    // a big chunk breaks away from the edge and nothing is thinned
    const big = chip(stone, face, index, p, inward, tangent, depth * 2.4, halfWidth * 1.5, strikes, 0.5, 0, seed)
    return { ...big, kind: 'snap' }
  }

  if (angleDeg > 72) {
    // glances off: a chip at most
    return chip(stone, face, index, p, inward, tangent, 0.12, 0.35, strikes, 0.08)
  }

  const shift = side * halfWidth * 0.35
  const kind: BlowKind = travel >= 0.6 ? 'clean' : 'bite'
  const thinBy = 0.085 * force * travel
  const result = chip(stone, face, index, p, inward, tangent, depth, halfWidth, strikes, travel * (0.6 + 2.2 * force), shift, seed)
  const thick: [number, number] = [...stone.thick]
  thick[face] = Math.max(0.05, thick[face] - thinBy)
  return { kind, flake: result.flake, stone: { ...result.stone, thick } }
}

function chip(
  stone: Stone,
  face: Face,
  index: number,
  p: Pt,
  inward: Pt,
  tangent: Pt,
  depth: number,
  halfWidth: number,
  strikes: number,
  travel: number,
  shift = 0,
  seed = 0,
): Blow {
  const pts = stone.outline
  const out = pts.map((q) => ({ ...q }))
  const flake: Pt[] = []
  // walk out from the strike along the outline while within reach, pushing the edge back onto the scar curve
  const reach = halfWidth * 2.2
  const touched: number[] = [index]
  for (const dir of [1, -1]) {
    let walked = 0
    for (let k = 1; k < pts.length / 2; k++) {
      walked += len(sub(at(pts, index + dir * k), at(pts, index + dir * (k - 1))))
      if (walked > reach) break
      touched.push(index + dir * k)
    }
  }
  touched.sort((a, b) => a - b)
  const wobble = rand(seed + 3) * 6
  for (const i of touched) {
    const j = ((i % pts.length) + pts.length) % pts.length
    const q = at(pts, j)
    const rel = sub(q, p)
    const s = dot(rel, tangent)
    const u = dot(rel, inward)
    const k = (s - shift) / halfWidth
    if (Math.abs(k) >= 1) continue
    const d = depth * Math.pow(1 - k * k, 0.8) * (1 + 0.08 * Math.sin(s * 7 + wobble))
    if (u < d) {
      flake.push(q)
      out[j] = { x: p.x + tangent.x * s + inward.x * d, y: p.y + inward.y * d + tangent.y * s }
    }
  }
  // close the flake along the new edge, reversed
  for (let i = touched.length - 1; i >= 0; i--) {
    const j = (((touched[i] ?? 0) % pts.length) + pts.length) % pts.length
    const before = at(pts, j)
    const after = at(out, j)
    if (before.x !== after.x || before.y !== after.y) flake.push(after)
  }
  const scar: Scar = { face, at: p, inward, halfWidth: halfWidth * 0.95, travel: Math.max(0.3, travel) }
  return {
    kind: 'clean',
    flake,
    stone: { ...stone, outline: resample(out), scars: [...stone.scars, scar].slice(-80), strikes },
  }
}

export type Assessment = { symmetry: number; leaf: number; thin: number; length: number; widerSide: 'left' | 'right' | null; quality: number }

/** symmetry about the vertical axis through the centroid, fit to the leaf, and thinness; quality 0..1 */
export function assess(stone: Stone): Assessment {
  const pts = stone.outline
  const c = centroid(pts)
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const p of pts) {
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const length = maxY - minY
  const rows = 48
  const widths: number[] = []
  let asym = 0
  let lean = 0
  for (let k = 0; k < rows; k++) {
    const y = minY + ((k + 0.5) / rows) * length
    let left = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    for (let i = 0; i < pts.length; i++) {
      const a = at(pts, i)
      const b = at(pts, i + 1)
      if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) continue
      const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)
      left = Math.min(left, x)
      right = Math.max(right, x)
    }
    if (!Number.isFinite(left)) {
      widths.push(0)
      continue
    }
    widths.push(right - left)
    const l = c.x - left
    const r = right - c.x
    asym += Math.abs(l - r)
    lean += r - l
  }
  const meanW = widths.reduce((s, w) => s + w, 0) / rows || 1
  const symmetry = Math.min(1, Math.max(0, 1 - (2.2 * (asym / rows)) / meanW))
  const fit = (flip: boolean) => {
    let err = 0
    for (let k = 0; k < rows; k++) {
      const t = (k + 0.5) / rows
      const target = 2 * leafHalfWidth(flip ? t : 1 - t) * (length / LEAF_LENGTH)
      err += Math.abs((widths[k] ?? 0) - target)
    }
    return err / rows / (3.1 * (length / LEAF_LENGTH) || 1)
  }
  const leaf = Math.min(1, Math.max(0, 1 - 1.8 * Math.min(fit(false), fit(true))))
  const [ta, tb] = stone.thick
  const thin = Math.min(1, Math.max(0, (1 - (ta + tb) / 2) / 0.65)) * (1 - Math.min(0.5, Math.abs(ta - tb)))
  const size = Math.min(1, length / 5.5)
  const quality = Math.min(1, Math.max(0, (0.6 * (0.55 * symmetry + 0.45 * leaf) + 0.4 * thin) * size))
  const widerSide = Math.abs(lean / rows) > meanW * 0.08 ? (lean > 0 ? 'right' : 'left') : null
  return { symmetry, leaf, thin, length, widerSide, quality }
}

export function areaOf(stone: Stone): number {
  return Math.abs(signedArea(stone.outline))
}
