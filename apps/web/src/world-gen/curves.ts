/** Curve and polyline helpers for world-gen. Three-free. */

/**
 * A monotone cubic (Fritsch–Carlson) through points sorted by x: smooth, and it never overshoots, so a flat
 * shelf stays flat and a cliff never rings.
 */
export class MonotoneCurve {
  readonly xs: Float64Array
  readonly ys: Float64Array
  private readonly ms: Float64Array

  constructor(xs: ArrayLike<number>, ys: ArrayLike<number>) {
    const n = xs.length
    this.xs = Float64Array.from(xs)
    this.ys = Float64Array.from(ys)
    this.ms = new Float64Array(n)
    const d = new Float64Array(Math.max(1, n - 1))
    for (let i = 0; i < n - 1; i++) {
      const dx = (this.xs[i + 1] ?? 0) - (this.xs[i] ?? 0)
      d[i] = dx > 1e-9 ? ((this.ys[i + 1] ?? 0) - (this.ys[i] ?? 0)) / dx : 0
    }
    if (n > 1) {
      this.ms[0] = d[0] ?? 0
      this.ms[n - 1] = d[n - 2] ?? 0
    }
    for (let i = 1; i < n - 1; i++) {
      const a = d[i - 1] ?? 0
      const b = d[i] ?? 0
      this.ms[i] = a * b <= 0 ? 0 : (a + b) / 2
    }
    for (let i = 0; i < n - 1; i++) {
      const di = d[i] ?? 0
      if (di === 0) {
        this.ms[i] = 0
        this.ms[i + 1] = 0
        continue
      }
      const a = (this.ms[i] ?? 0) / di
      const b = (this.ms[i + 1] ?? 0) / di
      const s = a * a + b * b
      if (s > 9) {
        const t = 3 / Math.sqrt(s)
        this.ms[i] = t * a * di
        this.ms[i + 1] = t * b * di
      }
    }
  }

  at(x: number): number {
    const xs = this.xs
    const n = xs.length
    if (n === 0) return 0
    if (x <= (xs[0] ?? 0)) return this.ys[0] ?? 0
    if (x >= (xs[n - 1] ?? 0)) return this.ys[n - 1] ?? 0
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if ((xs[mid] ?? 0) <= x) lo = mid
      else hi = mid
    }
    const x0 = xs[lo] ?? 0
    const h = (xs[hi] ?? 0) - x0
    const t = (x - x0) / h
    const t2 = t * t
    const t3 = t2 * t
    const y0 = this.ys[lo] ?? 0
    const y1 = this.ys[hi] ?? 0
    const m0 = (this.ms[lo] ?? 0) * h
    const m1 = (this.ms[hi] ?? 0) * h
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1
  }
}

export type P2 = { x: number; z: number }
export type P3 = { x: number; z: number; y: number }

/** distance from p to segment ab, and the parameter t along it */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { d: number; t: number } {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const qx = ax + dx * t - px
  const qz = az + dz * t - pz
  return { d: Math.sqrt(qx * qx + qz * qz), t }
}

/** a polyline resampled every `step` metres along its length (Catmull-Rom smoothed through the points) */
export function resample(points: readonly P2[], step: number): P2[] {
  if (points.length < 2) return points.slice()
  const dense: P2[] = []
  const get = (i: number): P2 => {
    const p = points[Math.max(0, Math.min(points.length - 1, i))]
    if (!p) throw new Error('resample: empty polyline')
    return p
  }
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    const len = Math.hypot(p2.x - p1.x, p2.z - p1.z)
    const n = Math.max(2, Math.ceil(len / (step * 0.25)))
    for (let k = 0; k < n; k++) {
      const t = k / n
      const t2 = t * t
      const t3 = t2 * t
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      dense.push({ x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) })
    }
  }
  dense.push(get(points.length - 1))
  // even spacing
  const out: P2[] = [get(0)]
  let carry = 0
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1]
    const b = dense[i]
    if (!a || !b) continue
    let segLen = Math.hypot(b.x - a.x, b.z - a.z)
    let ax = a.x
    let az = a.z
    while (carry + segLen >= step) {
      const need = step - carry
      const t = need / segLen
      ax = ax + (b.x - ax) * t
      az = az + (b.z - az) * t
      out.push({ x: ax, z: az })
      segLen -= need
      carry = 0
    }
    carry += segLen
  }
  const last = get(points.length - 1)
  const tail = out[out.length - 1]
  if (tail && Math.hypot(tail.x - last.x, tail.z - last.z) > step * 0.3) out.push(last)
  else if (tail) {
    tail.x = last.x
    tail.z = last.z
  }
  return out
}
