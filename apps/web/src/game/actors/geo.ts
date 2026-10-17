/**
 * The actor mesh builder: every body part is a lathe, an ellipsoid, a tube or a parametric grid, placed in bind
 * space with a matrix and skinned to up to four bones. All parts of one material merge into ONE BufferGeometry,
 * so a whole person is a handful of draw calls. Parts never share vertices: normals smooth within a part and stay
 * crisp between parts. Vertex colours carry the albedo with the shading baked in (occlusion, warmth, mottling).
 *
 * Adapted from celworld's chars/mesh.ts MeshBuilder (Sal's engine, G:\code\celworld): the lathe with seams and the
 * cosine ring spacing come from there; the 4-bone skinning, tubes and grids are new here.
 */
import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Matrix4, Uint16BufferAttribute, Uint32BufferAttribute, Vector3 } from 'three'

/** up to four bone influences; weights need not be normalised (build normalises) */
export type SkinW = { b: readonly number[]; w: readonly number[] }
export type SkinFn = (x: number, y: number, z: number) => SkinW

export function rigid(bone: number): SkinFn {
  const s: SkinW = { b: [bone], w: [1] }
  return () => s
}

/** two bones: weight t on b, the rest on a */
export function blend2(a: number, b: number, t: number): SkinW {
  return { b: [a, b], w: [1 - t, t] }
}

export type Vtx = { x: number; y: number; z: number }

/** colour at a vertex: `y` and `theta` are the lathe's parameters, `v` the deformed local position */
export type ColorFn = (y: number, theta: number, v: Vtx) => Color

export type LatheOpts = {
  /** axis span, bottom → top */
  y0: number
  y1: number
  /** radius (x half-width) at height y; ~0 at an end closes it to a pole, else the end is capped flat */
  r: (y: number) => number
  rings?: number
  segs?: number
  /** z radius as a fraction of the x radius */
  depth?: number
  /** cross-section superellipse exponent (2 = ellipse) */
  sq?: number
  /** heights where r and colour may jump (a duplicated ring) */
  seams?: readonly number[]
  color: Color | ColorFn
  /** last-word vertex tweak, in the part's local frame; theta 0 = +Z (front), π/2 = +X */
  deform?: (v: Vtx, theta: number, y: number) => void
  /** no end caps (an open sleeve) */
  open?: boolean
}

/** a grid vertex: position, colour and a roughness offset (`g`, reset to the part's own before each call) */
export type GridPoint = { x: number; y: number; z: number; c: Color; g: number }

const POLE_EPS = 1e-5

/** level-of-detail resampling: small counts stay (their shape depends on them), large ones scale by q */
const lodN = (n: number, q: number, keep: number): number => (q >= 1 || n <= keep ? n : Math.max(keep, Math.round(n * q)))

export class MeshBuilder {
  /**
   * Detail level: 1 builds every part as asked; below 1 every lathe, grid and tube is resampled with about q times
   * the segments and rings (the far levels of a person). Builders may also read it to thin out scattered parts.
   */
  constructor(readonly q = 1) {}

  private pos: number[] = []
  private col: number[] = []
  private rgh: number[] = []
  private sIdx: number[] = []
  private sW: number[] = []
  private idx: number[] = []
  private m = new Matrix4()
  private flip = false
  private skin: SkinFn = rigid(0)
  private roughK = 0
  private tmp = new Vector3()

  /** transform + skin for every part added until the next `at` */
  at(m: Matrix4, skin: SkinFn): this {
    this.m.copy(m)
    this.flip = m.determinant() < 0
    this.skin = skin
    this.roughK = 0
    return this
  }

  /**
   * roughness offset for every part added until the next `at`: negative is a skin sheen, positive dulls a part
   * (the eyeballs) past the shared material's roughness
   */
  rough(k: number): this {
    this.roughK = k
    return this
  }

  get vertexCount(): number {
    return this.pos.length / 3
  }

  get triangleCount(): number {
    return this.idx.length / 3
  }

  /** emit one vertex in the current frame; returns its index */
  vertex(v: Vtx, c: Color, rough = this.roughK): number {
    const p = this.tmp.set(v.x, v.y, v.z).applyMatrix4(this.m)
    const i = this.pos.length / 3
    this.pos.push(p.x, p.y, p.z)
    this.col.push(c.r, c.g, c.b)
    this.rgh.push(rough)
    const s = this.skin(p.x, p.y, p.z)
    let total = 0
    for (let k = 0; k < 4; k++) total += s.w[k] ?? 0
    if (total <= 1e-9) total = 1
    for (let k = 0; k < 4; k++) {
      this.sIdx.push(s.b[k] ?? 0)
      this.sW.push((s.w[k] ?? 0) / total)
    }
    return i
  }

  tri(a: number, b: number, c: number): void {
    if (this.flip) this.idx.push(a, c, b)
    else this.idx.push(a, b, c)
  }

  lathe(o: LatheOpts): void {
    const segs = lodN(o.segs ?? 16, this.q, 6)
    const rings = lodN(o.rings ?? 12, this.q, 4)
    const depth = o.depth ?? 1
    const e = 2 / (o.sq ?? 2)
    const span = o.y1 - o.y0
    const eps = span * 1e-4
    const solid = o.color instanceof Color ? o.color : null
    const colorFn = typeof o.color === 'function' ? o.color : null

    // cosine spacing packs rings at the poles (round caps); a seam is two rings at one y read either side of it
    const seams = (o.seams ?? []).filter((y) => y > o.y0 + eps && y < o.y1 - eps)
    const minGap = (span / rings) * 0.35
    const samples: { y: number; s: number }[] = []
    for (let k = 0; k <= rings; k++) {
      const y = o.y0 + (span * (1 - Math.cos((Math.PI * k) / rings))) / 2
      if (k > 0 && k < rings && seams.some((sy) => Math.abs(sy - y) < minGap)) continue
      samples.push({ y, s: y })
    }
    for (const sy of seams) samples.push({ y: sy, s: sy - eps }, { y: sy, s: sy + eps })
    samples.sort((a, b) => a.y - b.y || a.s - b.s)

    const sinT: number[] = []
    const cosT: number[] = []
    for (let j = 0; j < segs; j++) {
      const th = (2 * Math.PI * j) / segs
      const sn = Math.sin(th)
      const cs = Math.cos(th)
      sinT.push(Math.sign(sn) * Math.abs(sn) ** e)
      cosT.push(Math.sign(cs) * Math.abs(cs) ** e)
    }
    const colorAt = (s: number, th: number, v: Vtx): Color => (solid ?? colorFn?.(s, th, v) ?? WHITE)

    const ring = (y: number, s: number, r: number): number[] => {
      const out: number[] = []
      for (let j = 0; j < segs; j++) {
        const th = (2 * Math.PI * j) / segs
        const v: Vtx = { x: r * (sinT[j] ?? 0), y, z: r * depth * (cosT[j] ?? 0) }
        o.deform?.(v, th, s)
        out.push(this.vertex(v, colorAt(s, th, v)))
      }
      return out
    }
    const pole = (y: number, s: number): number => {
      const v: Vtx = { x: 0, y, z: 0 }
      o.deform?.(v, 0, s)
      return this.vertex(v, colorAt(s, 0, v))
    }

    const first = samples[0]
    const last = samples[samples.length - 1]
    if (!first || !last) return
    const bottomPole = o.r(first.s) < POLE_EPS
    const topPole = o.r(last.s) < POLE_EPS
    const body = samples.slice(bottomPole ? 1 : 0, topPole ? samples.length - 1 : samples.length)
    const rs = body.map((smp) => ring(smp.y, smp.s, Math.max(o.r(smp.s), POLE_EPS)))

    for (let k = 0; k + 1 < rs.length; k++) {
      const lo = rs[k]
      const hi = rs[k + 1]
      if (!lo || !hi) continue
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs
        this.tri(lo[j] ?? 0, lo[j1] ?? 0, hi[j1] ?? 0)
        this.tri(lo[j] ?? 0, hi[j1] ?? 0, hi[j] ?? 0)
      }
    }

    const lo = rs[0]
    const hi = rs[rs.length - 1]
    const bottom = body[0]
    const top = body[body.length - 1]
    if (!lo || !hi || !bottom || !top) return
    if (bottomPole) {
      const p = pole(first.y, first.s)
      for (let j = 0; j < segs; j++) this.tri(p, lo[(j + 1) % segs] ?? 0, lo[j] ?? 0)
    } else if (!o.open) {
      const capRing = ring(bottom.y, bottom.s, o.r(bottom.s))
      const p = pole(bottom.y, bottom.s)
      for (let j = 0; j < segs; j++) this.tri(p, capRing[(j + 1) % segs] ?? 0, capRing[j] ?? 0)
    }
    if (topPole) {
      const p = pole(last.y, last.s)
      for (let j = 0; j < segs; j++) this.tri(hi[j] ?? 0, hi[(j + 1) % segs] ?? 0, p)
    } else if (!o.open) {
      const capRing = ring(top.y, top.s, o.r(top.s))
      const p = pole(top.y, top.s)
      for (let j = 0; j < segs; j++) this.tri(capRing[j] ?? 0, capRing[(j + 1) % segs] ?? 0, p)
    }
  }

  /** ellipsoid centred on the local origin */
  ellipsoid(rx: number, ry: number, rz: number, color: Color | ColorFn, segs = 12, rings = 8, deform?: LatheOpts['deform']): void {
    this.lathe({
      y0: -ry,
      y1: ry,
      r: (y) => rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)),
      depth: rz / rx,
      segs,
      rings,
      color,
      deform,
    })
  }

  /** rounded box (superellipsoid) centred on the local origin */
  box(hx: number, hy: number, hz: number, color: Color | ColorFn, sq = 4, segs = 16, rings = 10, deform?: LatheOpts['deform']): void {
    this.lathe({
      y0: -hy,
      y1: hy,
      r: (y) => hx * Math.max(0, 1 - Math.abs(y / hy) ** sq) ** (1 / sq),
      depth: hz / hx,
      sq,
      segs,
      rings,
      color,
      deform,
    })
  }

  /**
   * A tube along a polyline (smoothed by the caller), radius and colour per arc fraction t ∈ [0,1].
   * Frames are parallel-transported, so it never twists. Ends are capped with a rounded pole; `tipRings` rounds the
   * far end properly (a squashed dome of that many rings before the pole), for fingertips seen up close.
   */
  tube(
    ptsIn: readonly Vector3[],
    radius: (t: number) => number,
    color: Color | ((t: number, a: number) => Color),
    segsIn = 8,
    opts: { flatten?: number; roll?: number; tipRings?: number } = {},
  ): void {
    const segs = lodN(segsIn, this.q, 5)
    const tipRings = this.q >= 1 ? (opts.tipRings ?? 0) : 0
    const m = lodN(ptsIn.length, this.q, 4)
    // resample the path to m points, keeping both ends
    const pts = m === ptsIn.length ? ptsIn : Array.from({ length: m }, (_, i) => ptsIn[Math.round((i * (ptsIn.length - 1)) / (m - 1))]).filter((p): p is Vector3 => !!p)
    const n = pts.length
    if (n < 2) return
    const flatten = opts.flatten ?? 1
    const lens: number[] = [0]
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      lens.push((lens[i - 1] ?? 0) + (a && b ? a.distanceTo(b) : 0))
    }
    const total = lens[n - 1] ?? 1
    const tangents: Vector3[] = []
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(n - 1, i + 1)]
      tangents.push(a && b ? new Vector3().subVectors(b, a).normalize() : new Vector3(0, 1, 0))
    }
    const t0 = tangents[0] ?? new Vector3(0, 1, 0)
    let normal = Math.abs(t0.y) < 0.9 ? new Vector3(0, 1, 0).cross(t0).normalize() : new Vector3(1, 0, 0).cross(t0).normalize()
    if (opts.roll) normal.applyAxisAngle(t0, opts.roll)
    const colorAt = (t: number, a: number): Color => (color instanceof Color ? color : color(t, a))
    const rows: number[][] = []
    const q = new Vector3()
    const endN = new Vector3()
    const endB = new Vector3()
    for (let i = 0; i < n; i++) {
      const tan = tangents[i] ?? t0
      if (i > 0) {
        const prev = tangents[i - 1] ?? tan
        const axis = new Vector3().crossVectors(prev, tan)
        const s = axis.length()
        if (s > 1e-8) normal.applyAxisAngle(axis.normalize(), Math.asin(Math.min(1, s)))
        normal = normal.sub(q.copy(tan).multiplyScalar(normal.dot(tan))).normalize()
      }
      const bin = new Vector3().crossVectors(tan, normal)
      if (i === n - 1) {
        endN.copy(normal)
        endB.copy(bin)
      }
      const t = (lens[i] ?? 0) / total
      const r = radius(t)
      const p = pts[i]
      if (!p) continue
      const row: number[] = []
      for (let j = 0; j < segs; j++) {
        const a = (2 * Math.PI * j) / segs
        const ca = Math.cos(a) * r
        const sa = Math.sin(a) * r * flatten
        row.push(this.vertex({ x: p.x + normal.x * ca + bin.x * sa, y: p.y + normal.y * ca + bin.y * sa, z: p.z + normal.z * ca + bin.z * sa }, colorAt(t, a)))
      }
      rows.push(row)
    }
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i]
      const b = rows[i + 1]
      if (!a || !b) continue
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs
        this.tri(a[j] ?? 0, a[j1] ?? 0, b[j1] ?? 0)
        this.tri(a[j] ?? 0, b[j1] ?? 0, b[j] ?? 0)
      }
    }
    // the far end's dome: rings shrinking on a quarter ellipse (0.7 deep, closed by the pole), each joined to the last
    if (tipRings > 0) {
      const p = pts[n - 1]
      const tan = tangents[n - 1]
      const r = radius(1)
      if (p && tan) {
        for (let k = 1; k <= tipRings; k++) {
          const phi = (k / (tipRings + 1)) * (Math.PI / 2)
          const c = p.clone().addScaledVector(tan, r * 0.7 * Math.sin(phi))
          const rr = r * Math.cos(phi)
          const row: number[] = []
          for (let j = 0; j < segs; j++) {
            const a = (2 * Math.PI * j) / segs
            const ca = Math.cos(a) * rr
            const sa = Math.sin(a) * rr * flatten
            row.push(this.vertex({ x: c.x + endN.x * ca + endB.x * sa, y: c.y + endN.y * ca + endB.y * sa, z: c.z + endN.z * ca + endB.z * sa }, colorAt(1, a)))
          }
          const prev = rows[rows.length - 1]
          if (prev) {
            for (let j = 0; j < segs; j++) {
              const j1 = (j + 1) % segs
              this.tri(prev[j] ?? 0, prev[j1] ?? 0, row[j1] ?? 0)
              this.tri(prev[j] ?? 0, row[j1] ?? 0, row[j] ?? 0)
            }
          }
          rows.push(row)
        }
      }
    }
    // rounded-ish caps: a fan to a point pushed out along the tangent
    const ends: [number, number][] = [
      [0, -1],
      [rows.length - 1, 1],
    ]
    for (const [i, dir] of ends) {
      const row = rows[i]
      const p = pts[i === 0 ? 0 : n - 1]
      const tan = tangents[i === 0 ? 0 : n - 1]
      if (!row || !p || !tan) continue
      const r = radius(i === 0 ? 0 : 1)
      const tip = this.vertex({ x: p.x + tan.x * r * 0.7 * dir, y: p.y + tan.y * r * 0.7 * dir, z: p.z + tan.z * r * 0.7 * dir }, colorAt(i === 0 ? 0 : 1, 0))
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs
        if (dir < 0) this.tri(tip, row[j1] ?? 0, row[j] ?? 0)
        else this.tri(tip, row[j] ?? 0, row[j1] ?? 0)
      }
    }
  }

  /**
   * A parametric grid: f(u, v) for u ∈ [0,1] (nu+1 columns, or nu wrapped) and v ∈ [0,1] (nv+1 rows).
   * Open grids are single surfaces: draw them with a double-sided material.
   */
  grid(nuIn: number, nvIn: number, f: (u: number, v: number, out: GridPoint) => void, opts: { wrapU?: boolean } = {}): void {
    const nu = lodN(nuIn, this.q, opts.wrapU ? 6 : 3)
    const nv = lodN(nvIn, this.q, 3)
    const cols = opts.wrapU ? nu : nu + 1
    const out: GridPoint = { x: 0, y: 0, z: 0, c: new Color(), g: 0 }
    const rows: number[][] = []
    for (let i = 0; i <= nv; i++) {
      const row: number[] = []
      for (let j = 0; j < cols; j++) {
        out.g = this.roughK
        f(j / nu, i / nv, out)
        row.push(this.vertex(out, out.c, out.g))
      }
      rows.push(row)
    }
    for (let i = 0; i < nv; i++) {
      const a = rows[i]
      const b = rows[i + 1]
      if (!a || !b) continue
      for (let j = 0; j < nu; j++) {
        const j1 = opts.wrapU ? (j + 1) % nu : j + 1
        this.tri(a[j] ?? 0, a[j1] ?? 0, b[j1] ?? 0)
        this.tri(a[j] ?? 0, b[j1] ?? 0, b[j] ?? 0)
      }
    }
  }

  /** copy every vertex and triangle of another builder into this one */
  append(o: MeshBuilder): this {
    const base = this.pos.length / 3
    for (const v of o.pos) this.pos.push(v)
    for (const v of o.col) this.col.push(v)
    for (const v of o.rgh) this.rgh.push(v)
    for (const v of o.sIdx) this.sIdx.push(v)
    for (const v of o.sW) this.sW.push(v)
    for (const i of o.idx) this.idx.push(i + base)
    return this
  }

  /** merge everything into one geometry; normals from the final triangles */
  build(): BufferGeometry {
    const pos = new Float32Array(this.pos)
    const nrm = new Float32Array(pos.length)
    const idx = this.idx
    for (let t = 0; t < idx.length; t += 3) {
      const a = (idx[t] ?? 0) * 3
      const b = (idx[t + 1] ?? 0) * 3
      const c = (idx[t + 2] ?? 0) * 3
      const e1x = (pos[b] ?? 0) - (pos[a] ?? 0)
      const e1y = (pos[b + 1] ?? 0) - (pos[a + 1] ?? 0)
      const e1z = (pos[b + 2] ?? 0) - (pos[a + 2] ?? 0)
      const e2x = (pos[c] ?? 0) - (pos[a] ?? 0)
      const e2y = (pos[c + 1] ?? 0) - (pos[a + 1] ?? 0)
      const e2z = (pos[c + 2] ?? 0) - (pos[a + 2] ?? 0)
      const nx = e1y * e2z - e1z * e2y
      const ny = e1z * e2x - e1x * e2z
      const nz = e1x * e2y - e1y * e2x
      for (const v of [a, b, c]) {
        nrm[v] = (nrm[v] ?? 0) + nx
        nrm[v + 1] = (nrm[v + 1] ?? 0) + ny
        nrm[v + 2] = (nrm[v + 2] ?? 0) + nz
      }
    }
    for (let v = 0; v < nrm.length; v += 3) {
      const l = Math.hypot(nrm[v] ?? 0, nrm[v + 1] ?? 0, nrm[v + 2] ?? 0)
      if (l > 1e-12) {
        nrm[v] = (nrm[v] ?? 0) / l
        nrm[v + 1] = (nrm[v + 1] ?? 0) / l
        nrm[v + 2] = (nrm[v + 2] ?? 0) / l
      } else {
        nrm[v + 1] = 1
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('normal', new BufferAttribute(nrm, 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3))
    g.setAttribute('aRough', new BufferAttribute(new Float32Array(this.rgh), 1))
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.sIdx, 4))
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.sW, 4))
    g.setIndex(pos.length / 3 > 65535 ? new Uint32BufferAttribute(idx, 1) : new Uint16BufferAttribute(idx, 1))
    return g
  }
}

const WHITE = new Color(1, 1, 1)

/* ─── small math shared by the builders ─────────────────────────────────────────────────────────────────── */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
/** a smooth maximum: max(a, b) with the crease rounded over k */
export const smax = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.max(a, b) + h * h * k * 0.25
}
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
/** gaussian bump, 1 at the centre */
export const bump = (d2: number): number => Math.exp(-d2)

export function T(x: number, y: number, z: number): Matrix4 {
  return new Matrix4().makeTranslation(x, y, z)
}
export function Rx(a: number): Matrix4 {
  return new Matrix4().makeRotationX(a)
}
export function Ry(a: number): Matrix4 {
  return new Matrix4().makeRotationY(a)
}
export function Rz(a: number): Matrix4 {
  return new Matrix4().makeRotationZ(a)
}
export function S(x: number, y: number, z: number): Matrix4 {
  return new Matrix4().makeScale(x, y, z)
}
export function mul(...ms: Matrix4[]): Matrix4 {
  const out = new Matrix4()
  for (const m of ms) out.multiply(m)
  return out
}

/** Hermite spline through (y, r) stations; flat tangents at both ends */
export function profile(pts: ReadonlyArray<readonly [number, number]>): (y: number) => number {
  const n = pts.length
  const m = pts.map((_, i) => {
    const a = pts[i - 1]
    const b = pts[i + 1]
    if (!a || !b) return 0
    return (b[1] - a[1]) / (b[0] - a[0])
  })
  return (y) => {
    const first = pts[0]
    const lastPt = pts[n - 1]
    if (!first || !lastPt) return 0
    if (y <= first[0]) return first[1]
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i]
      const p1 = pts[i + 1]
      if (!p0 || !p1) break
      const [y0, r0] = p0
      const [y1, r1] = p1
      if (y <= y1) {
        const h = y1 - y0
        const t = (y - y0) / h
        const t2 = t * t
        const t3 = t2 * t
        return (2 * t3 - 3 * t2 + 1) * r0 + (t3 - 2 * t2 + t) * h * (m[i] ?? 0) + (-2 * t3 + 3 * t2) * r1 + (t3 - t2) * h * (m[i + 1] ?? 0)
      }
    }
    return lastPt[1]
  }
}

/* ─── value noise (deterministic, no Math.random) ───────────────────────────────────────────────────────── */

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x1b873593) ^ seed) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** smooth 3D value noise in [0, 1] */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz, seed)
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u)
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u)
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u)
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u)
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w)
}

/** two-octave noise in [0, 1] */
export function fbm3(x: number, y: number, z: number, seed = 0): number {
  return noise3(x, y, z, seed) * 0.65 + noise3(x * 2.13 + 7.1, y * 2.13 - 3.3, z * 2.13 + 1.7, seed ^ 0x9e37) * 0.35
}
