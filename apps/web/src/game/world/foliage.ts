/**
 * Foliage and stones: fynbos clumps, proteas, restios, grass tufts, milkwoods in the gully, boulders and rubble,
 * and the props round the hearths and along the paths. Every plant sits in a hashed grid cell, so where it grows is
 * a pure function of position: the instance buffers are refilled round the focus as it moves (one kind per frame),
 * and plants shrink away at the ring's edge where the terrain's painted fynbos takes over. Shrubs and grass bend
 * in the wind in the vertex shader.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three'
import type { Quality, Vec3, WorldData } from '../contracts'
import { patchPaint } from '../render/paint'
import { GULLY, LAGOON, PATHS, STACKS } from '../../world-gen/layout'
import { MAT, type TerrainGrid } from '../../world-gen/terrain'

type V3 = [number, number, number]

// ─── hashing ─────────────────────────────────────────────────────────────────────────────────────────────────

function hash(i: number, j: number, s: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(s | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** a small seeded stream for building geometry */
function stream(seed: number): () => number {
  let k = 0
  return () => hash(seed, k++, 7177)
}

function srgb(c: number): number {
  return Math.pow(c, 2.2)
}

function lin3(r: number, g: number, b: number): V3 {
  return [srgb(r), srgb(g), srgb(b)]
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

// ─── geometry ────────────────────────────────────────────────────────────────────────────────────────────────

class Builder {
  readonly pos: number[] = []
  readonly nor: number[] = []
  readonly col: number[] = []
  vert(p: V3, n: V3, c: V3): void {
    this.pos.push(p[0], p[1], p[2])
    const l = Math.hypot(n[0], n[1], n[2]) || 1
    this.nor.push(n[0] / l, n[1] / l, n[2] / l)
    this.col.push(c[0], c[1], c[2])
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3))
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3))
    g.computeBoundingSphere()
    return g
  }
}

/** unit icosahedron triangles (non-indexed) at a detail level */
function icoTris(detail: number): Float32Array {
  const g = new IcosahedronGeometry(1, detail).toNonIndexed()
  const a = g.getAttribute('position').array
  const out = new Float32Array(a.length)
  out.set(a)
  g.dispose()
  return out
}
const ICO0 = icoTris(0)
const ICO1 = icoTris(1)

/** a stable jitter for a unit-sphere vertex, so shared corners of a non-indexed mesh stay welded */
function vjit(x: number, y: number, z: number, seed: number): number {
  return hash(Math.round(x * 1000), Math.round(y * 1000) * 31 + Math.round(z * 1000), seed)
}

/**
 * A lump of foliage: an icosahedron squashed and jittered, its normals bent toward the whole plant's dome so the
 * light falls across the clump as one soft mass, and darker low down and inside.
 */
function lump(b: Builder, tris: Float32Array, c: V3, s: V3, seed: number, dome: V3, height: number, base: V3, tone: number, domeK = 0.7): void {
  for (let i = 0; i < tris.length; i += 3) {
    const ux = tris[i] ?? 0
    const uy = tris[i + 1] ?? 0
    const uz = tris[i + 2] ?? 0
    const j = 0.82 + 0.36 * vjit(ux, uy, uz, seed)
    const p: V3 = [c[0] + ux * s[0] * j, c[1] + uy * s[1] * j, c[2] + uz * s[2] * j]
    const dn: V3 = [p[0] - dome[0], (p[1] - dome[1]) * 0.8, p[2] - dome[2]]
    const dl = Math.hypot(dn[0], dn[1], dn[2]) || 1
    const n: V3 = [ux * (1 - domeK) + (dn[0] / dl) * domeK, uy * (1 - domeK) + (dn[1] / dl) * domeK + 0.15, uz * (1 - domeK) + (dn[2] / dl) * domeK]
    const lift = smooth(-0.1, 1, p[1] / height)
    const k = tone * (0.5 + 0.5 * lift) * (0.9 + 0.2 * vjit(uz, ux, uy, seed + 3))
    b.vert(p, n, [base[0] * k, base[1] * k, base[2] * k])
  }
}

/** a fynbos clump: a dome of small lumps (erica, a little wider than tall) */
function fynbosGeo(seed: number, tall: boolean): BufferGeometry {
  const b = new Builder()
  const r = stream(seed)
  const h = tall ? 0.95 : 0.62
  const w = tall ? 0.5 : 0.62
  const dome: V3 = [0, -h * 0.25, 0]
  const n = tall ? 7 : 8
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.6
    const rr = i === 0 ? 0 : w * (0.45 + 0.4 * r())
    const y = i === 0 ? h * 0.55 : h * (0.25 + 0.35 * r())
    const sz = (i === 0 ? 0.42 : 0.3 + 0.14 * r()) * (tall ? 0.9 : 1)
    lump(b, ICO0, [Math.cos(a) * rr, y, Math.sin(a) * rr], [sz * 1.1, sz * (tall ? 1.15 : 0.85), sz * 1.1], seed * 13 + i, dome, h, [1, 1, 1], 0.85 + 0.3 * r())
  }
  return b.geometry()
}

/** a protea: a grey-green leafy shrub carrying big pink cup flowers with cream hearts */
function proteaGeo(seed: number): BufferGeometry {
  const b = new Builder()
  const r = stream(seed)
  const h = 1.05
  const dome: V3 = [0, -0.2, 0]
  const leaf = lin3(0.5, 0.58, 0.46)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r()
    const rr = i === 0 ? 0 : 0.32 + 0.2 * r()
    const sz = 0.26 + 0.1 * r()
    lump(b, ICO0, [Math.cos(a) * rr, 0.3 + 0.4 * r(), Math.sin(a) * rr], [sz, sz * 1.25, sz], seed * 7 + i, dome, h, leaf, 0.9 + 0.2 * r())
  }
  const pink = lin3(0.88, 0.52, 0.58)
  const pinkDeep = lin3(0.72, 0.32, 0.4)
  const cream = lin3(0.95, 0.88, 0.74)
  const heads = 3 + Math.floor(r() * 3)
  for (let k = 0; k < heads; k++) {
    const a = r() * Math.PI * 2
    const rr = 0.18 + 0.3 * r()
    const c: V3 = [Math.cos(a) * rr, 0.8 + 0.3 * r(), Math.sin(a) * rr]
    const tilt: V3 = [Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35]
    const tl = Math.hypot(tilt[0], tilt[1], tilt[2])
    const up: V3 = [tilt[0] / tl, tilt[1] / tl, tilt[2] / tl]
    // a frame round the head's axis
    const side: V3 = Math.abs(up[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
    const ex: V3 = [up[1] * side[2] - up[2] * side[1], up[2] * side[0] - up[0] * side[2], up[0] * side[1] - up[1] * side[0]]
    const el = Math.hypot(ex[0], ex[1], ex[2]) || 1
    ex[0] /= el
    ex[1] /= el
    ex[2] /= el
    const ez: V3 = [up[1] * ex[2] - up[2] * ex[1], up[2] * ex[0] - up[0] * ex[2], up[0] * ex[1] - up[1] * ex[0]]
    const at = (u: number, v: number, w: number): V3 => [c[0] + ex[0] * u + up[0] * v + ez[0] * w, c[1] + ex[1] * u + up[1] * v + ez[1] * w, c[2] + ex[2] * u + up[2] * v + ez[2] * w]
    const R = 0.17 + 0.05 * r()
    const bracts = 9
    for (let i = 0; i < bracts; i++) {
      const a0 = (i / bracts) * Math.PI * 2
      const a1 = ((i + 0.5) / bracts) * Math.PI * 2
      const a2 = ((i + 1) / bracts) * Math.PI * 2
      const base0 = at(Math.cos(a0) * R * 0.35, 0, Math.sin(a0) * R * 0.35)
      const base1 = at(Math.cos(a2) * R * 0.35, 0, Math.sin(a2) * R * 0.35)
      const tip = at(Math.cos(a1) * R, R * 1.35, Math.sin(a1) * R)
      const n: V3 = [Math.cos(a1) * ex[0] + Math.sin(a1) * ez[0] + up[0] * 0.6, Math.cos(a1) * ex[1] + Math.sin(a1) * ez[1] + up[1] * 0.6, Math.cos(a1) * ex[2] + Math.sin(a1) * ez[2] + up[2] * 0.6]
      b.vert(base0, n, pinkDeep)
      b.vert(tip, n, pink)
      b.vert(base1, n, pinkDeep)
      b.vert(base1, n, pinkDeep)
      b.vert(tip, n, pink)
      b.vert(base0, n, pinkDeep)
    }
    // the cream cone of florets
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2
      const a2 = ((i + 1) / 6) * Math.PI * 2
      const p0 = at(Math.cos(a0) * R * 0.38, R * 0.15, Math.sin(a0) * R * 0.38)
      const p1 = at(Math.cos(a2) * R * 0.38, R * 0.15, Math.sin(a2) * R * 0.38)
      const tip = at(0, R * 1.0, 0)
      const n: V3 = [Math.cos(a0 + 0.5) * ex[0] + Math.sin(a0 + 0.5) * ez[0] + up[0], Math.cos(a0 + 0.5) * ex[1] + Math.sin(a0 + 0.5) * ez[1] + up[1], Math.cos(a0 + 0.5) * ex[2] + Math.sin(a0 + 0.5) * ez[2] + up[2]]
      b.vert(p0, n, cream)
      b.vert(tip, n, cream)
      b.vert(p1, n, cream)
    }
  }
  return b.geometry()
}

/** a restio: a fountain of thin reeds, tan with dark seed heads */
function restioGeo(seed: number): BufferGeometry {
  const b = new Builder()
  const r = stream(seed)
  const n = 18
  const base = lin3(0.42, 0.42, 0.25)
  const mid = lin3(0.66, 0.58, 0.36)
  const tipC = lin3(0.36, 0.26, 0.16)
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const lean = 0.08 + 0.3 * r()
    const hgt = 0.7 + 0.55 * r()
    const w = 0.022
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    const bx = dx * 0.08 * r()
    const bz = dz * 0.08 * r()
    // a reed as two stacked quads, bending outward
    const px = -dz * w
    const pz = dx * w
    const p0: V3 = [bx, 0, bz]
    const p1: V3 = [bx + dx * lean * hgt * 0.4, hgt * 0.55, bz + dz * lean * hgt * 0.4]
    const p2: V3 = [bx + dx * lean * hgt * 1.1, hgt, bz + dz * lean * hgt * 1.1]
    const nn: V3 = [dx * 0.5, 1, dz * 0.5]
    const quad = (a0: V3, a1: V3, wa: number, wb: number, ca: V3, cb: V3) => {
      const l0: V3 = [a0[0] - px * wa, a0[1], a0[2] - pz * wa]
      const r0: V3 = [a0[0] + px * wa, a0[1], a0[2] + pz * wa]
      const l1: V3 = [a1[0] - px * wb, a1[1], a1[2] - pz * wb]
      const r1: V3 = [a1[0] + px * wb, a1[1], a1[2] + pz * wb]
      b.vert(l0, nn, ca)
      b.vert(r0, nn, ca)
      b.vert(r1, nn, cb)
      b.vert(l0, nn, ca)
      b.vert(r1, nn, cb)
      b.vert(l1, nn, cb)
    }
    quad(p0, p1, 1, 0.8, base, mid)
    quad(p1, p2, 0.8, 0.35, mid, tipC)
  }
  return b.geometry()
}

/** a grass tuft: thin tapering blades, dark at the base and pale at the tips, some dry; normals lean up so it lights like the ground */
function grassGeo(seed: number): BufferGeometry {
  const b = new Builder()
  const r = stream(seed)
  const n = 13
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const hgt = 0.22 + 0.36 * r()
    const lean = 0.12 + 0.4 * r()
    const w = 0.022 + 0.014 * r()
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    const ox = dx * 0.08 * r()
    const oz = dz * 0.08 * r()
    const px = -dz * w
    const pz = dx * w
    const nn: V3 = [dx * 0.3, 1, dz * 0.3]
    // a blade is green, straw or a dead grey
    const k = r()
    const tip: V3 = k < 0.55 ? [1.0, 1.02, 0.95] : k < 0.85 ? [1.15, 1.05, 0.9] : [0.95, 0.93, 0.92]
    const c0: V3 = [0.36, 0.37, 0.34]
    // bend: the blade's midpoint sits a little out, the tip further
    const mx = ox + dx * lean * hgt * 0.35
    const mz = oz + dz * lean * hgt * 0.35
    const tx = ox + dx * lean * hgt
    const tz = oz + dz * lean * hgt
    const cm: V3 = [(c0[0] + tip[0]) * 0.5, (c0[1] + tip[1]) * 0.5, (c0[2] + tip[2]) * 0.5]
    b.vert([ox - px, 0, oz - pz], nn, c0)
    b.vert([ox + px, 0, oz + pz], nn, c0)
    b.vert([mx + px * 0.7, hgt * 0.55, mz + pz * 0.7], nn, cm)
    b.vert([ox - px, 0, oz - pz], nn, c0)
    b.vert([mx + px * 0.7, hgt * 0.55, mz + pz * 0.7], nn, cm)
    b.vert([mx - px * 0.7, hgt * 0.55, mz - pz * 0.7], nn, cm)
    b.vert([mx - px * 0.7, hgt * 0.55, mz - pz * 0.7], nn, cm)
    b.vert([mx + px * 0.7, hgt * 0.55, mz + pz * 0.7], nn, cm)
    b.vert([tx, hgt, tz], nn, tip)
  }
  return b.geometry()
}

/**
 * A boulder: a sphere cut by a handful of random planes (big flat faces, rounded where they meet), sat on a flat
 * base, welded and smooth-shaded so the ramp light rounds it; the shader paints the knife facets and the tide.
 * Vertex colour is a little occlusion low down.
 */
function rockGeo(seed: number, detail: number): BufferGeometry {
  const r = stream(seed)
  const planes: { n: V3; d: number }[] = []
  for (let k = 0; k < 8; k++) {
    const a = r() * Math.PI * 2
    const y = (r() * 2 - 1) * 0.75
    const c = Math.sqrt(1 - y * y)
    planes.push({ n: [Math.cos(a) * c, y, Math.sin(a) * c], d: 0.58 + 0.3 * r() })
  }
  const sq = 0.5 + 0.35 * r()
  const sx = 0.85 + 0.4 * r()
  const src = new IcosahedronGeometry(1, detail).toNonIndexed()
  const a = src.getAttribute('position').array
  const keyOf = (x: number, y: number, z: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`
  const weld = new Map<string, number>()
  const pos: number[] = []
  const index: number[] = []
  for (let i = 0; i < a.length; i += 3) {
    const ux = a[i] ?? 0
    const uy = a[i + 1] ?? 0
    const uz = a[i + 2] ?? 0
    const key = keyOf(ux, uy, uz)
    let vi = weld.get(key)
    if (vi === undefined) {
      // pull the point in to the nearest cutting plane along its ray
      let t = 1
      for (const p of planes) {
        const dn = ux * p.n[0] + uy * p.n[1] + uz * p.n[2]
        if (dn > 1e-3) t = Math.min(t, p.d / dn)
      }
      t *= 0.94 + 0.08 * vjit(ux, uy, uz, seed)
      vi = pos.length / 3
      pos.push(ux * t * sx, Math.max(uy * t * sq, -0.32), uz * t)
      weld.set(key, vi)
    }
    index.push(vi)
  }
  src.dispose()
  const nv = pos.length / 3
  const nor = new Float32Array(nv * 3)
  for (let t = 0; t + 2 < index.length; t += 3) {
    const i0 = index[t] ?? 0
    const i1 = index[t + 1] ?? 0
    const i2 = index[t + 2] ?? 0
    const ax = pos[i0 * 3] ?? 0
    const ay = pos[i0 * 3 + 1] ?? 0
    const az = pos[i0 * 3 + 2] ?? 0
    const e1x = (pos[i1 * 3] ?? 0) - ax
    const e1y = (pos[i1 * 3 + 1] ?? 0) - ay
    const e1z = (pos[i1 * 3 + 2] ?? 0) - az
    const e2x = (pos[i2 * 3] ?? 0) - ax
    const e2y = (pos[i2 * 3 + 1] ?? 0) - ay
    const e2z = (pos[i2 * 3 + 2] ?? 0) - az
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    for (const vi of [i0, i1, i2]) {
      nor[vi * 3] = (nor[vi * 3] ?? 0) + nx
      nor[vi * 3 + 1] = (nor[vi * 3 + 1] ?? 0) + ny
      nor[vi * 3 + 2] = (nor[vi * 3 + 2] ?? 0) + nz
    }
  }
  const col = new Float32Array(nv * 3)
  for (let v = 0; v < nv; v++) {
    const l = Math.hypot(nor[v * 3] ?? 0, nor[v * 3 + 1] ?? 0, nor[v * 3 + 2] ?? 1) || 1
    nor[v * 3] = (nor[v * 3] ?? 0) / l
    nor[v * 3 + 1] = (nor[v * 3 + 1] ?? 0) / l
    nor[v * 3 + 2] = (nor[v * 3 + 2] ?? 0) / l
    const k = 0.55 + 0.45 * smooth(-0.32, 0.25, pos[v * 3 + 1] ?? 0)
    col[v * 3] = k
    col[v * 3 + 1] = k
    col[v * 3 + 2] = k
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(nor, 3))
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.setIndex(index)
  g.computeBoundingSphere()
  return g
}

/** a milkwood: a short gnarled trunk under a dense, low, wind-pruned dome of dark leaves */
function milkwoodGeo(seed: number): BufferGeometry {
  const b = new Builder()
  const r = stream(seed)
  const bark = lin3(0.3, 0.26, 0.22)
  const trunks = 3
  for (let k = 0; k < trunks; k++) {
    const a = (k / trunks) * Math.PI * 2 + r()
    const lean = 0.25 + 0.3 * r()
    const top: V3 = [Math.cos(a) * lean * 2.2, 2.2 + r() * 0.8, Math.sin(a) * lean * 2.2]
    const cyl = new CylinderGeometry(0.1, 0.2, 1, 6, 1, true).toNonIndexed()
    const ca = cyl.getAttribute('position').array
    const cn = cyl.getAttribute('normal').array
    for (let i = 0; i < ca.length; i += 3) {
      const y = (ca[i + 1] ?? 0) + 0.5
      const p: V3 = [(ca[i] ?? 0) + top[0] * y, y * top[1], (ca[i + 2] ?? 0) + top[2] * y]
      b.vert(p, [cn[i] ?? 0, cn[i + 1] ?? 0, cn[i + 2] ?? 0], [bark[0] * (0.7 + 0.5 * y), bark[1] * (0.7 + 0.5 * y), bark[2] * (0.7 + 0.5 * y)])
    }
    cyl.dispose()
  }
  const h = 5.2
  const dome: V3 = [0, 1.5, 0]
  const leaf = lin3(0.3, 0.38, 0.22)
  const n = 11
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5
    const rr = i < 2 ? r() * 0.8 : 1.6 + 1.5 * r()
    const y = i < 2 ? 4.0 + r() * 0.6 : 2.6 + 1.3 * r()
    const sz = i < 2 ? 1.7 : 1.15 + 0.6 * r()
    lump(b, ICO1, [Math.cos(a) * rr, y, Math.sin(a) * rr], [sz * 1.2, sz * 0.75, sz * 1.2], seed * 5 + i, dome, h, leaf, 0.85 + 0.3 * r(), 0.8)
  }
  return b.geometry()
}

// ─── materials ───────────────────────────────────────────────────────────────────────────────────────────────

/** wind: the instance's own frame turns the world wind into object space; bending grows with height squared */
const WIND_PRE = /* glsl */ `
	{
		vec3 ocW0 = vec3( 0.0 );
		vec3 ocWl = vec3( uWind.x, 0.0, uWind.z );
		#ifdef USE_INSTANCING
			ocW0 = vec3( instanceMatrix[ 3 ][ 0 ], 0.0, instanceMatrix[ 3 ][ 2 ] );
			mat3 ocIm = mat3( instanceMatrix );
			ocWl = transpose( ocIm ) * ocWl / max( dot( ocIm[ 0 ], ocIm[ 0 ] ), 1e-4 );
		#endif
		float ocH = max( position.y, 0.0 ) * uFlex;
		float ocGust = sin( uTime * 1.3 + ocW0.x * 0.11 + ocW0.z * 0.07 ) * 0.5 + 0.5;
		ocGust = ocGust * ocGust;
		float ocFlut = sin( uTime * ( 4.0 + uWind.y * 5.0 ) + ocW0.x * 1.7 + ocW0.z * 1.3 + position.y * 3.0 );
		float ocK = ocH * ocH * ( 0.08 + uWind.y * ( 0.35 + 0.6 * ocGust ) );
		transformed += ocWl * ocK + vec3( ocWl.z, 0.0, - ocWl.x ) * ocFlut * ocK * 0.25;
		transformed.y -= ocK * 0.3;
	}
`

const PAINT_HEAD = /* glsl */ `
vec4 ocFacetR = vec4( 0.0 );
vec3 ocLinF( vec3 c ) { return pow( c, vec3( 2.2 ) ); }
float ocEdgeF( float t, float n ) {
	float w = max( fwidth( n ) * 0.75, 1e-4 );
	return smoothstep( t - w, t + w, n );
}
`

/**
 * Leaves: small clusters with dark gaps between them, and a ragged silhouette (the fragments where the surface
 * turns away from the eye are cut by noise), so a clump reads as twigs and leaves rather than a lump.
 */
const LEAF_ALBEDO = /* glsl */ `
	{
		vec3 wp = vOcWorld * uLeaf;
		float lf = ocNoise( wp.xz * 1.0 + wp.y * 0.7 ) * 0.6 + ocNoise( vec2( wp.x - wp.z, wp.y ) * 2.6 ) * 0.4;
		diffuseColor.rgb *= mix( 0.58, 1.07, ocEdgeF( 0.4, lf ) );
		#ifndef FLAT_SHADED
			float ndv = abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) );
			float rag = ocNoise( wp.xz * 1.6 + wp.y * 1.3 + 7.0 );
			if ( ndv < 0.5 && rag > ndv * 1.9 + 0.3 ) discard;
		#endif
	}
`

const ROCK_ALBEDO = /* glsl */ `
	{
		vec3 wp = vOcWorld;
		vec3 nW = normalize( vOcNormalW );
		ocFacetR = ocFacet( wp, nW, 0.8 );
		vec4 s2 = ocFacet( wp + 5.3, nW, 0.3 );
		float f = ocFacetR.w * 0.7 + s2.w * 0.3;
		vec3 rock = mix( ocLinF( vec3( 0.56, 0.48, 0.39 ) ), ocLinF( vec3( 0.76, 0.66, 0.52 ) ), f );
		rock = mix( rock, ocLinF( vec3( 0.54, 0.52, 0.5 ) ), step( 0.8, ocFacetR.w ) * 0.6 );
		// orange and grey-green lichen on the tops, above the spray
		float lich = ocEdgeF( 0.7, ocNoise( wp.xz * 1.4 + wp.y * 0.8 ) * 0.7 + ocNoise( wp.xz * 4.3 ) * 0.3 ) * smoothstep( 0.2, 0.8, nW.y );
		float dry = smoothstep( 3.8, 6.0, wp.y );
		rock = mix( rock, ocLinF( vec3( 0.8, 0.56, 0.28 ) ), lich * dry * 0.55 );
		rock = mix( rock, ocLinF( vec3( 0.6, 0.62, 0.52 ) ), ocEdgeF( 0.75, ocNoise( wp.xz * 0.9 + 4.0 ) ) * smoothstep( 0.1, 0.7, nW.y ) * dry * 0.4 );
		// rock near the sea is darker (salt, spray, no lichen), and the sea's reach darker still: a pale barnacle
		// band, mussels and weed at the foot
		rock = mix( rock, rock * vec3( 0.6, 0.57, 0.55 ), smoothstep( 14.0, 2.0, wp.y ) * 0.8 );
		#ifdef OC_STACK
			// the birds' white on the tops
			float guano = ocEdgeF( 0.55, ocNoise( wp.xz * 0.8 ) * 0.6 + ocNoise( wp.xz * 3.3 ) * 0.4 ) * smoothstep( 0.35, 0.8, nW.y ) * smoothstep( 3.0, 5.0, wp.y );
			rock = mix( rock, ocLinF( vec3( 0.86, 0.84, 0.78 ) ), guano * 0.85 );
		#endif
		float tidal = smoothstep( 3.6, 1.8, wp.y );
		rock = mix( rock, rock * vec3( 0.48, 0.46, 0.45 ), tidal );
		float band = smoothstep( 2.2, 1.5, wp.y ) * smoothstep( -0.6, 0.2, wp.y );
		rock = mix( rock, ocLinF( vec3( 0.6, 0.58, 0.54 ) ), ocEdgeF( 0.5, ocNoise( wp.xz * 5.0 + wp.y * 6.0 ) ) * band * 0.4 );
		float low = smoothstep( 0.6, -0.4, wp.y );
		rock = mix( rock, ocLinF( vec3( 0.1, 0.1, 0.12 ) ), ocEdgeF( 0.55, ocNoise( wp.xz * 3.1 + wp.y * 2.0 ) ) * low * 0.8 );
		rock = mix( rock, ocLinF( vec3( 0.26, 0.27, 0.13 ) ), smoothstep( -0.2, -0.9, wp.y ) * 0.6 );
		// wet where the swash reaches now
		float wet = smoothstep( uSeaLevel + 1.4, uSeaLevel + 0.1, wp.y );
		rock *= 1.0 - 0.3 * wet;
		diffuseColor.rgb = rock * diffuseColor.rgb;
	}
`

const ROCK_NORMAL = /* glsl */ `
	normal = normalize( normal + ( viewMatrix * vec4( ocFacetR.xyz, 0.0 ) ).xyz * 0.45 );
`

function foliageMaterial(key: string, flex: number, brush: number, leaf: number): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
  patchPaint(m, { brush, rim: 0.4 }, {
    key: `foliage-${key}`,
    vertexHead: 'uniform float uFlex;',
    vertexPre: flex > 0 ? WIND_PRE : '',
    fragmentHead: `${PAINT_HEAD}\nuniform float uLeaf;`,
    albedo: leaf > 0 ? LEAF_ALBEDO : '',
    uniforms: { uFlex: { value: flex }, uLeaf: { value: leaf } },
  })
  return m
}

function rockMaterial(stack = false): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
  const head = stack ? `#define OC_STACK\n${PAINT_HEAD}` : PAINT_HEAD
  patchPaint(m, { brush: 0.4, rim: 0.3 }, { key: `foliage-rock${stack ? '-stack' : ''}`, fragmentHead: head, albedo: ROCK_ALBEDO, normal: ROCK_NORMAL })
  return m
}

// ─── placement ───────────────────────────────────────────────────────────────────────────────────────────────

type Place = { x: number; z: number; y: number; s: number; yaw: number; r: number; g: number; b: number; tilt: number; sy?: number }

type Kind = {
  name: string
  meshes: InstancedMesh[]
  /** grid cell size, metres */
  cell: number
  /** fill radius per quality */
  radius: Record<Quality, number>
  seed: number
  /** variant index for a cell, or −1 when nothing grows there */
  place(ix: number, iz: number, out: Place): number
  /** full random rotation (stones) instead of upright */
  tumble: boolean
  counts: number[]
  cx: number
  cz: number
  q: Quality | null
}

export type FoliageView = {
  root: Group
  update(focus: Vec3, camX: number, camZ: number, quality: Quality): void
  dispose(): void
}

export function createFoliageView(world: WorldData, grid: TerrainGrid | null): FoliageView {
  const root = new Group()
  root.name = 'foliage'
  if (!grid) {
    return { root, update() {}, dispose() {} }
  }
  const g = grid
  const N = g.n
  const idx = (x: number, z: number): number => {
    const ix = Math.round((x - g.origin) / g.cell)
    const iz = Math.round((z - g.origin) / g.cell)
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return -1
    return iz * N + ix
  }
  const matAt = (x: number, z: number): number => {
    const i = idx(x, z)
    return i < 0 ? MAT.seabed : (g.mat[i] ?? MAT.seabed)
  }
  const slopeAt = (x: number, z: number): number => {
    const i = idx(x, z)
    return i < 0 ? 9 : (g.slope[i] ?? 9)
  }
  const onPath = (x: number, z: number): boolean => {
    const i = idx(x, z)
    return i >= 0 && g.path[i] === 1
  }
  const hearths = world.pois.filter((p) => p.kind === 'hearth' || p.kind === 'sleep-spot')
  const nearHearth = (x: number, z: number, r: number): boolean => hearths.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r)
  // where the lagoon and river keep the ground wet (restios gather there)
  const wetAt = (x: number, z: number): number => {
    const d = Math.hypot((x - LAGOON.x) / (LAGOON.rx + 40), (z - LAGOON.z) / (LAGOON.rz + 40))
    return smooth(1.2, 0.8, d)
  }

  const disposables: { dispose(): void }[] = []
  const makeMeshes = (geos: BufferGeometry[], mat: MeshStandardMaterial, max: number, shadow: boolean, name: string): InstancedMesh[] => {
    disposables.push(mat)
    return geos.map((geo, i) => {
      disposables.push(geo)
      const m = new InstancedMesh(geo, mat, max)
      m.name = `${name}-${i}`
      m.count = 0
      m.frustumCulled = false
      m.castShadow = shadow
      m.receiveShadow = true
      m.instanceMatrix.setUsage(DynamicDrawUsage)
      m.instanceColor = new InstancedBufferAttribute(new Float32Array(max * 3), 3)
      m.instanceColor.setUsage(DynamicDrawUsage)
      root.add(m)
      return m
    })
  }

  // fynbos palette (sRGB): greens, olive, rust, blond
  const FYN: readonly V3[] = [
    [0.46, 0.52, 0.33],
    [0.37, 0.44, 0.28],
    [0.52, 0.42, 0.28],
    [0.64, 0.58, 0.38],
    [0.5, 0.53, 0.44],
    [0.42, 0.47, 0.36],
    [0.58, 0.47, 0.32],
  ]
  const setCol = (out: Place, c: V3, jit: number) => {
    out.r = srgb(c[0] * jit)
    out.g = srgb(c[1] * jit)
    out.b = srgb(c[2] * jit)
  }

  const kinds: Kind[] = []
  const kind = (k: Omit<Kind, 'counts' | 'cx' | 'cz' | 'q'>) => {
    const full: Kind = { ...k, counts: k.meshes.map(() => 0), cx: 1e9, cz: 1e9, q: null }
    kinds.push(full)
    return full
  }

  // fynbos clumps
  kind({
    name: 'fynbos',
    meshes: makeMeshes([fynbosGeo(11, false), fynbosGeo(23, false), fynbosGeo(37, true)], foliageMaterial('fyn', 0.35, 0.6, 9), 7000, true, 'fynbos'),
    cell: 1.9,
    radius: { high: 85, medium: 60, low: 40 },
    seed: 101,
    tumble: false,
    place(ix, iz, out) {
      const h0 = hash(ix, iz, this.seed)
      out.x = (ix + 0.15 + 0.7 * hash(ix, iz, 102)) * this.cell
      out.z = (iz + 0.15 + 0.7 * hash(ix, iz, 103)) * this.cell
      const m = matAt(out.x, out.z)
      let p = 0
      if (m === MAT.fynbos) p = 0.78
      else if (m === MAT.grass) p = 0.12
      else if (m === MAT.dune) p = 0.14
      else if (m === MAT.rock || m === MAT.scree) p = 0.16
      else if (m === MAT.cliff) p = 0.06
      if (p <= 0 || h0 > p) return -1
      if (slopeAt(out.x, out.z) > 0.95 || onPath(out.x, out.z)) return -1
      out.y = world.heightAt(out.x, out.z)
      if (out.y < 2.2) return -1
      const h1 = hash(ix, iz, 104)
      out.s = (m === MAT.dune ? 0.6 : 0.75) + 0.6 * h1 * h1
      out.yaw = hash(ix, iz, 105) * Math.PI * 2
      out.tilt = 0
      const ci = Math.floor(hash(ix, iz, 106) * FYN.length)
      setCol(out, FYN[ci] ?? [0.5, 0.5, 0.35], 0.9 + 0.2 * hash(ix, iz, 107))
      return hash(ix, iz, 108) < 0.25 ? 2 : hash(ix, iz, 109) < 0.5 ? 0 : 1
    },
  })

  // proteas, in patches through the fynbos
  kind({
    name: 'protea',
    meshes: makeMeshes([proteaGeo(5), proteaGeo(9)], foliageMaterial('protea', 0.25, 0.4, 0), 900, true, 'protea'),
    cell: 4.5,
    radius: { high: 75, medium: 55, low: 35 },
    seed: 201,
    tumble: false,
    place(ix, iz, out) {
      out.x = (ix + 0.2 + 0.6 * hash(ix, iz, 202)) * this.cell
      out.z = (iz + 0.2 + 0.6 * hash(ix, iz, 203)) * this.cell
      const patch = Math.sin(out.x * 0.031 + 1.3) * Math.sin(out.z * 0.027 + 0.4) + Math.sin(out.x * 0.011 - out.z * 0.013) * 0.6
      if (patch < 0.35 || hash(ix, iz, this.seed) > 0.55) return -1
      if (matAt(out.x, out.z) !== MAT.fynbos || slopeAt(out.x, out.z) > 0.8 || onPath(out.x, out.z)) return -1
      out.y = world.heightAt(out.x, out.z)
      if (out.y < 3) return -1
      out.s = 0.8 + 0.45 * hash(ix, iz, 204)
      out.yaw = hash(ix, iz, 205) * Math.PI * 2
      out.tilt = 0
      setCol(out, [1, 1, 1], 0.92 + 0.12 * hash(ix, iz, 206))
      return hash(ix, iz, 207) < 0.5 ? 0 : 1
    },
  })

  // restios: by the lagoon, on the dunes, and scattered through the fynbos
  kind({
    name: 'restio',
    meshes: makeMeshes([restioGeo(3), restioGeo(17)], foliageMaterial('restio', 0.9, 0.3, 0), 2500, false, 'restio'),
    cell: 3.1,
    radius: { high: 70, medium: 50, low: 0 },
    seed: 301,
    tumble: false,
    place(ix, iz, out) {
      out.x = (ix + 0.1 + 0.8 * hash(ix, iz, 302)) * this.cell
      out.z = (iz + 0.1 + 0.8 * hash(ix, iz, 303)) * this.cell
      const m = matAt(out.x, out.z)
      const wet = wetAt(out.x, out.z)
      let p = m === MAT.fynbos ? 0.16 : m === MAT.dune ? 0.22 : m === MAT.grass ? 0.06 : 0
      p += wet * (m === MAT.lagoonBed || m === MAT.sand || m === MAT.grass || m === MAT.fynbos ? 0.6 : 0)
      if (p <= 0 || hash(ix, iz, this.seed) > p) return -1
      if (slopeAt(out.x, out.z) > 0.7 || onPath(out.x, out.z)) return -1
      out.y = world.heightAt(out.x, out.z)
      if (out.y < 0.9) return -1
      out.s = 0.8 + 0.5 * hash(ix, iz, 304)
      out.yaw = hash(ix, iz, 305) * Math.PI * 2
      out.tilt = 0
      setCol(out, [1, 1, 1], 0.85 + 0.25 * hash(ix, iz, 306))
      return hash(ix, iz, 307) < 0.5 ? 0 : 1
    },
  })

  // grass tufts: thick on the grassland, between the shrubs, dune grass on the sand
  kind({
    name: 'grass',
    meshes: makeMeshes([grassGeo(1), grassGeo(2)], foliageMaterial('grass', 1.6, 0.3, 0), 26000, false, 'grass'),
    cell: 0.62,
    radius: { high: 38, medium: 24, low: 0 },
    seed: 401,
    tumble: false,
    place(ix, iz, out) {
      out.x = (ix + hash(ix, iz, 402)) * this.cell
      out.z = (iz + hash(ix, iz, 403)) * this.cell
      const m = matAt(out.x, out.z)
      let p = 0
      let c: V3 = [0.6, 0.57, 0.4]
      if (m === MAT.grass) p = 0.75
      else if (m === MAT.fynbos) {
        p = 0.22
        c = [0.56, 0.54, 0.38]
      } else if (m === MAT.dune) {
        // dune grass grows in clumps, grey-green
        const clump = Math.sin(ix * 0.37 + iz * 0.11) * Math.sin(iz * 0.29 - ix * 0.07)
        p = clump > 0.2 ? 0.55 : 0.04
        c = [0.6, 0.62, 0.5]
      } else if (m === MAT.sand) {
        p = 0.03
        c = [0.62, 0.62, 0.5]
      } else if (m === MAT.rock || m === MAT.scree) p = 0.08
      if (p <= 0 || hash(ix, iz, this.seed) > p) return -1
      if (onPath(out.x, out.z) || slopeAt(out.x, out.z) > 0.9) return -1
      out.y = world.heightAt(out.x, out.z)
      if (out.y < 2.0) return -1
      out.s = 0.75 + 0.6 * hash(ix, iz, 404)
      out.yaw = hash(ix, iz, 405) * Math.PI * 2
      out.tilt = 0
      // patches: tawny, olive and grey-green
      const v = Math.sin(out.x * 0.07 + Math.sin(out.z * 0.03) * 2) * Math.sin(out.z * 0.05) * 0.5 + 0.5
      const w = Math.sin(out.x * 0.021 - 1.0) * Math.sin(out.z * 0.017 + 0.5) * 0.5 + 0.5
      setCol(out, [c[0] * (0.92 + 0.16 * v) * (1 - 0.1 * w), c[1] * (0.96 + 0.08 * (1 - v)), c[2] * (0.95 + 0.2 * w)], 0.9 + 0.2 * hash(ix, iz, 406))
      return hash(ix, iz, 407) < 0.5 ? 0 : 1
    },
  })

  // boulders and rubble: outcrops, scree, the shelf, stones in the fynbos, rubble on the cave floor
  const rockMat = rockMaterial()
  kind({
    name: 'rock',
    meshes: makeMeshes([rockGeo(1, 2), rockGeo(2, 2), rockGeo(3, 1), rockGeo(4, 1)], rockMat, 2500, true, 'rock'),
    cell: 4.2,
    radius: { high: 230, medium: 170, low: 110 },
    seed: 501,
    tumble: true,
    place(ix, iz, out) {
      out.x = (ix + 0.1 + 0.8 * hash(ix, iz, 502)) * this.cell
      out.z = (iz + 0.1 + 0.8 * hash(ix, iz, 503)) * this.cell
      const m = matAt(out.x, out.z)
      const h0 = hash(ix, iz, this.seed)
      const h1 = hash(ix, iz, 504)
      let p = 0
      let size = 1
      let c: V3 = [1, 1, 1]
      if (m === MAT.rock) {
        p = 0.45
        size = 0.6 + 2.2 * h1 * h1
      } else if (m === MAT.scree) {
        p = 0.5
        size = 0.3 + 0.9 * h1
      } else if (m === MAT.cliff) {
        p = 0.12
        size = 0.8 + 1.6 * h1
      } else if (m === MAT.shelf) {
        p = 0.16
        size = 0.7 + 2.0 * h1 * h1
        c = [0.8, 0.78, 0.76]
      } else if (m === MAT.fynbos || m === MAT.grass) {
        p = 0.035
        size = 0.4 + 1.1 * h1 * h1
      } else if (m === MAT.cave) {
        p = 0.5
        size = 0.25 + 0.5 * h1
        c = [0.82, 0.76, 0.7]
      } else if (m === MAT.sand) {
        p = 0.01
        size = 0.5 + 1.2 * h1
      }
      if (p <= 0 || h0 > p || onPath(out.x, out.z)) return -1
      if (m === MAT.cave && nearHearth(out.x, out.z, 2.2)) return -1
      out.y = world.heightAt(out.x, out.z)
      if (m !== MAT.shelf && out.y < 1.5 && m !== MAT.cave) return -1
      out.s = size
      out.y -= size * 0.25
      out.yaw = hash(ix, iz, 505) * Math.PI * 2
      out.tilt = hash(ix, iz, 506)
      setCol(out, c, 0.9 + 0.2 * hash(ix, iz, 507))
      // the big ones get the finer mesh
      return (size > 1.1 ? 0 : 2) + (hash(ix, iz, 508) < 0.5 ? 0 : 1)
    },
  })

  // ─── the static set: milkwoods, hearth stones and wood, path-edge stones ───────────────────────────────────
  const stat = new Group()
  stat.name = 'foliage-static'
  root.add(stat)
  const tmpM = new Matrix4()
  const tmpQ = new Quaternion()
  const tmpE = new Euler()
  const tmpS = new Vector3()
  const tmpP = new Vector3()
  const staticMesh = (geo: BufferGeometry, mat: MeshStandardMaterial, list: Place[], name: string, shadow: boolean, tumble: boolean) => {
    disposables.push(geo)
    const m = new InstancedMesh(geo, mat, Math.max(1, list.length))
    m.name = name
    m.castShadow = shadow
    m.receiveShadow = true
    m.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, list.length) * 3), 3)
    list.forEach((p, i) => {
      if (tumble) tmpE.set(p.tilt * 2.4, p.yaw, p.tilt * 1.7)
      else tmpE.set(0, p.yaw, 0)
      tmpQ.setFromEuler(tmpE)
      tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(p.s, p.s * (p.sy ?? 1), p.s))
      m.setMatrixAt(i, tmpM)
      m.instanceColor?.setXYZ(i, p.r, p.g, p.b)
    })
    m.count = list.length
    m.computeBoundingSphere()
    stat.add(m)
  }

  // milkwoods along the gully's flanks and round the lagoon's landward shore
  const trees: Place[] = []
  const tr = stream(911)
  for (let k = 0; k + 1 < GULLY.length; k++) {
    const a = GULLY[k]
    const b = GULLY[k + 1]
    if (!a || !b) continue
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const steps = Math.floor(len / 8)
    for (let s = 0; s < steps; s++) {
      const t = (s + tr()) / steps
      const x0 = a.x + (b.x - a.x) * t
      const z0 = a.z + (b.z - a.z) * t
      const nx = -(b.z - a.z) / len
      const nz = (b.x - a.x) / len
      for (const side of [-1, 1]) {
        if (tr() < 0.35) continue
        const off = side * (4 + 12 * tr())
        const x = x0 + nx * off
        const z = z0 + nz * off
        const m = matAt(x, z)
        if (m === MAT.path || m === MAT.riverBed || m === MAT.lagoonBed || slopeAt(x, z) > 1.1) continue
        trees.push({ x, z, y: world.heightAt(x, z) - 0.3, s: 0.7 + 0.5 * tr(), yaw: tr() * Math.PI * 2, r: 1, g: 1, b: 1, tilt: 0 })
      }
    }
  }
  for (let i = 0; i < 26; i++) {
    const a = tr() * Math.PI * 2
    const x = LAGOON.x + Math.cos(a) * (LAGOON.rx + 18 + tr() * 30)
    const z = LAGOON.z + Math.sin(a) * (LAGOON.rz + 18 + tr() * 30)
    const y = world.heightAt(x, z)
    if (y < 1.6 || slopeAt(x, z) > 0.8 || onPath(x, z) || z > LAGOON.z + LAGOON.rz * 0.6) continue
    trees.push({ x, z, y: y - 0.3, s: 0.6 + 0.4 * tr(), yaw: tr() * Math.PI * 2, r: 1, g: 1, b: 1, tilt: 0 })
  }
  const treeMat = foliageMaterial('milkwood', 0.05, 0.6, 2.6)
  disposables.push(treeMat)
  staticMesh(milkwoodGeo(41), treeMat, trees, 'milkwoods', true, false)

  // the sea stacks: a few big blocks each, standing out of the surf (the heightfield's mound under them keeps the foam)
  const stacks: Place[] = []
  const kr = stream(521)
  for (const [sx, sz, r, top] of STACKS) {
    const n = r > 10 ? 4 : r > 7 ? 3 : 2
    for (let i = 0; i < n; i++) {
      const a = kr() * Math.PI * 2
      const off = i === 0 ? 0 : r * (0.25 + 0.3 * kr())
      const s = r * (i === 0 ? 0.72 : 0.42 + 0.2 * kr())
      const h = (i === 0 ? top + 1.2 : top * (0.45 + 0.4 * kr())) + 3
      stacks.push({ x: sx + Math.cos(a) * off, z: sz + Math.sin(a) * off, y: -3, s, sy: h / (s * 0.62), yaw: kr() * 6.28, r: 1, g: 1, b: 1, tilt: 0 })
    }
  }
  const stackMat = rockMaterial(true)
  disposables.push(stackMat)
  staticMesh(rockGeo(31, 2), stackMat, stacks, 'stacks', true, false)

  // hearth stones in a ring, a few sticks of firewood, and a bed of ash
  const stones: Place[] = []
  const sticks: Place[] = []
  const sr = stream(313)
  for (const p of world.pois.filter((q) => q.kind === 'hearth')) {
    const n = 9 + Math.floor(sr() * 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + sr() * 0.3
      const rr = 0.62 + 0.1 * sr()
      const x = p.x + Math.cos(a) * rr
      const z = p.z + Math.sin(a) * rr
      const s = 0.13 + 0.07 * sr()
      const c = 0.62 + 0.16 * sr()
      stones.push({ x, z, y: world.heightAt(x, z) + s * 0.25, s, yaw: sr() * 6.28, r: srgb(c), g: srgb(c * 0.92), b: srgb(c * 0.85), tilt: sr() })
    }
    for (let i = 0; i < 4; i++) {
      const a = sr() * Math.PI * 2
      sticks.push({ x: p.x + Math.cos(a) * 0.15, z: p.z + Math.sin(a) * 0.15, y: world.heightAt(p.x, p.z) + 0.06, s: 1, yaw: a, r: srgb(0.3), g: srgb(0.22), b: srgb(0.15), tilt: 0.25 + 0.15 * sr() })
    }
  }
  staticMesh(rockGeo(7, 1), rockMat, stones, 'hearth-stones', true, true)
  const stickGeo = new CylinderGeometry(0.035, 0.045, 0.75, 5)
  stickGeo.translate(0, 0, 0)
  stickGeo.rotateZ(Math.PI / 2)
  const stickMat = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 })
  patchPaint(stickMat, { brush: 0.3, rim: 0.2 })
  disposables.push(stickMat)
  staticMesh(stickGeo, stickMat, sticks, 'firewood', false, true)

  // path edges: loose stones along both sides, more on the steep parts
  const edge: Place[] = []
  const er = stream(717)
  for (const path of g.paths) {
    const def = PATHS.find((d) => d.id === path.id)
    const half = def?.half ?? 1.5
    for (let k = 0; k + 1 < path.pts.length; k++) {
      const a = path.pts[k]
      const b = path.pts[k + 1]
      if (!a || !b) continue
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      if (len < 0.01) continue
      const grade = Math.abs(b.y - a.y) / len
      const nx = -(b.z - a.z) / len
      const nz = (b.x - a.x) / len
      const steps = Math.ceil(len / 1.5)
      for (let s = 0; s < steps; s++) {
        for (const side of [-1, 1]) {
          if (er() > 0.35 + grade * 1.5) continue
          const t = (s + er()) / steps
          const off = side * (half + 0.15 + er() * 0.5)
          const x = a.x + (b.x - a.x) * t + nx * off
          const z = a.z + (b.z - a.z) * t + nz * off
          const sz = 0.14 + 0.22 * er()
          const c = 0.88 + 0.16 * er()
          edge.push({ x, z, y: world.heightAt(x, z) - sz * 0.2, s: sz, yaw: er() * 6.28, r: srgb(c), g: srgb(c * 0.9), b: srgb(c * 0.8), tilt: er() })
        }
      }
    }
  }
  staticMesh(rockGeo(9, 1), rockMat, edge, 'path-stones', false, true)

  // ─── refill ────────────────────────────────────────────────────────────────────────────────────────────────
  const out: Place = { x: 0, z: 0, y: 0, s: 1, yaw: 0, r: 1, g: 1, b: 1, tilt: 0 }
  const fill = (k: Kind, fx: number, fz: number, q: Quality) => {
    const R = k.radius[q]
    k.cx = fx
    k.cz = fz
    k.q = q
    k.counts.fill(0)
    if (R > 0) {
      const i0 = Math.floor((fx - R) / k.cell)
      const i1 = Math.ceil((fx + R) / k.cell)
      const j0 = Math.floor((fz - R) / k.cell)
      const j1 = Math.ceil((fz + R) / k.cell)
      const R2 = R * R
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cx = (i + 0.5) * k.cell - fx
          const cz = (j + 0.5) * k.cell - fz
          const d2 = cx * cx + cz * cz
          if (d2 > R2) continue
          const v = k.place(i, j, out)
          if (v < 0) continue
          const mesh = k.meshes[v]
          const n = k.counts[v] ?? 0
          if (!mesh || n >= mesh.instanceMatrix.count) continue
          // shrink away toward the ring's edge
          const d = Math.sqrt(d2)
          const fade = smooth(R, R * 0.82, d)
          if (fade <= 0.02) continue
          const s = out.s * fade
          const e = mesh.instanceMatrix.array
          const o = n * 16
          if (k.tumble) {
            tmpE.set(out.tilt * 2.4, out.yaw, out.tilt * 1.7)
            tmpQ.setFromEuler(tmpE)
            tmpM.compose(tmpP.set(out.x, out.y, out.z), tmpQ, tmpS.setScalar(s))
            tmpM.toArray(e, o)
          } else {
            const c = Math.cos(out.yaw) * s
            const sn = Math.sin(out.yaw) * s
            e[o] = c
            e[o + 1] = 0
            e[o + 2] = -sn
            e[o + 3] = 0
            e[o + 4] = 0
            e[o + 5] = s
            e[o + 6] = 0
            e[o + 7] = 0
            e[o + 8] = sn
            e[o + 9] = 0
            e[o + 10] = c
            e[o + 11] = 0
            e[o + 12] = out.x
            e[o + 13] = out.y
            e[o + 14] = out.z
            e[o + 15] = 1
          }
          const ic = mesh.instanceColor
          if (ic) {
            const ca = ic.array
            ca[n * 3] = out.r
            ca[n * 3 + 1] = out.g
            ca[n * 3 + 2] = out.b
          }
          k.counts[v] = n + 1
        }
      }
    }
    k.meshes.forEach((m, v) => {
      m.count = k.counts[v] ?? 0
      m.instanceMatrix.clearUpdateRanges()
      m.instanceMatrix.addUpdateRange(0, m.count * 16)
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) {
        m.instanceColor.clearUpdateRanges()
        m.instanceColor.addUpdateRange(0, m.count * 3)
        m.instanceColor.needsUpdate = true
      }
      m.visible = m.count > 0
    })
  }

  return {
    root,
    update(focus: Vec3, camX: number, camZ: number, quality: Quality) {
      // centre between the camera and the focus, so the ground at your feet and ahead are both covered
      const fx = (focus.x + camX) * 0.5
      const fz = (focus.z + camZ) * 0.5
      // the stalest kind first; at most one refill a frame
      let pick: Kind | null = null
      let worst = 0
      for (const k of kinds) {
        const moved = Math.hypot(k.cx - fx, k.cz - fz)
        const need = k.q !== quality ? 1e9 : moved / Math.max(4, k.radius[quality] * 0.1)
        if (need > 1 && need > worst) {
          worst = need
          pick = k
        }
      }
      if (pick) fill(pick, fx, fz, quality)
    },
    dispose() {
      for (const d of disposables) d.dispose()
    },
  }
}

