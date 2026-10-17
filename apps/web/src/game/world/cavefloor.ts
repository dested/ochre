/**
 * The cave floor's furniture: what generations of living leave on a floor. Shell midden heaps toward the back and
 * along the walls, grass bedding at each sleeping hollow (some with a hide over it), a firewood pile by the main
 * hearth, a knapping spot in the light of the mouth (a sitting stone, an anvil, the hammerstone, a core and a
 * scatter of flakes), ochre lumps by a grinding slab, charcoal and bits of bone round the hearths, and rocks fallen
 * against the walls. One merged mesh, one draw call, coloured per vertex; the material adds shell grit to the
 * middens and strands to the straw and the fur.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three'
import type { WorldData } from '../contracts'
import { CAVE, caveHalfWidth, caveWorld } from '../../world-gen/layout'
import { patchPaint } from '../render/paint'

type V3 = [number, number, number]

function hash(i: number, j: number, s: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(s | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function stream(seed: number): () => number {
  let k = 0
  return () => hash(seed, k++, 4211)
}

/** display colour to linear */
function lin(r: number, g: number, b: number): V3 {
  return [r ** 2.2, g ** 2.2, b ** 2.2]
}

function mixc(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function scale(c: V3, k: number): V3 {
  return [c[0] * k, c[1] * k, c[2] * k]
}

/** a value-noise-ish wobble round a ring, for ragged outlines */
function ring(angle: number, seed: number): number {
  let s = 0
  for (let k = 1; k <= 3; k++) s += Math.sin(angle * (k + 1) + hash(seed, k, 9) * 6.28) * (0.5 / k)
  return s
}

/** everything goes into one soup of triangles */
class Soup {
  readonly pos: number[] = []
  readonly nor: number[] = []
  readonly col: number[] = []
  readonly dress: number[] = []
  private readonly v = new Vector3()
  private readonly n = new Vector3()
  private readonly nm = new Matrix3()

  /**
   * Append a non-indexed geometry under a transform. `paint` colours each vertex from its local position and
   * normal's y (before the transform); `dress` is (shell grit, strands).
   */
  put(geo: BufferGeometry, m: Matrix4, paint: (lx: number, ly: number, lz: number, ny: number) => V3, dress: [number, number]): void {
    const p = geo.getAttribute('position')
    const nr = geo.getAttribute('normal')
    this.nm.getNormalMatrix(m)
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i)
      const ly = p.getY(i)
      const lz = p.getZ(i)
      this.v.set(lx, ly, lz).applyMatrix4(m)
      this.n.set(nr.getX(i), nr.getY(i), nr.getZ(i)).applyMatrix3(this.nm).normalize()
      this.pos.push(this.v.x, this.v.y, this.v.z)
      this.nor.push(this.n.x, this.n.y, this.n.z)
      const c = paint(lx, ly, lz, nr.getY(i))
      this.col.push(c[0], c[1], c[2])
      this.dress.push(dress[0], dress[1])
    }
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3))
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3))
    g.setAttribute('aDress', new BufferAttribute(new Float32Array(this.dress), 2))
    g.computeBoundingSphere()
    return g
  }
}

/** a stone: an icosahedron jittered and cut by a few planes, flat-shaded so it reads as knapped facets */
function stoneGeo(seed: number, detail: number, cuts: number, squash: number): BufferGeometry {
  const r = stream(seed)
  const planes: { n: V3; d: number }[] = []
  for (let k = 0; k < cuts; k++) {
    const a = r() * Math.PI * 2
    const y = (r() * 2 - 1) * 0.8
    const c = Math.sqrt(1 - y * y)
    planes.push({ n: [Math.cos(a) * c, y, Math.sin(a) * c], d: 0.55 + 0.35 * r() })
  }
  const g = new IcosahedronGeometry(1, detail).toNonIndexed()
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    let t = 1
    for (const pl of planes) {
      const dn = x * pl.n[0] + y * pl.n[1] + z * pl.n[2]
      if (dn > 1e-3) t = Math.min(t, pl.d / dn)
    }
    t *= 0.9 + 0.15 * hash(Math.round(x * 1000), Math.round(y * 1000) * 31 + Math.round(z * 1000), seed)
    p.setXYZ(i, x * t, Math.max(y * t * squash, -0.3 * squash), z * t)
  }
  g.computeVertexNormals()
  return g
}

/**
 * A low mound on a polar grid: `height(r, angle)` over the unit disc (r 0 at the top, 1 at the rim), the rim
 * ragged by `rag`. Flat-shaded.
 */
function moundGeo(rings: number, segs: number, seed: number, rag: number, height: (r: number) => number): BufferGeometry {
  const pts: V3[][] = []
  for (let i = 0; i <= rings; i++) {
    const row: V3[] = []
    const rr = i / rings
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const edge = 1 + rag * ring(a, seed)
      const jit = i > 0 && i < rings ? (hash(i, j, seed) - 0.5) * 0.25 / rings : 0
      const r = (rr + jit) * edge
      row.push([Math.cos(a) * r, height(rr) * (0.85 + 0.3 * hash(i, j, seed + 1)), Math.sin(a) * r])
    }
    pts.push(row)
  }
  const pos: number[] = []
  const tri = (a: V3, b: V3, c: V3) => pos.push(...a, ...b, ...c)
  for (let i = 0; i < rings; i++) {
    const r0 = pts[i]
    const r1 = pts[i + 1]
    if (!r0 || !r1) continue
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs
      const a = r0[j]
      const b = r0[j1]
      const c = r1[j]
      const d = r1[j1]
      if (!a || !b || !c || !d) continue
      if (i > 0) tri(a, b, c)
      tri(b, d, c)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.computeVertexNormals()
  return g
}

const DRESS_VERT_HEAD = /* glsl */ `
attribute vec2 aDress;
varying vec2 vDress;
`
const DRESS_VERT_MAIN = /* glsl */ `
	vDress = aDress;
`
const DRESS_FRAG_HEAD = /* glsl */ `
varying vec2 vDress;
vec3 ocLinD( vec3 c ) { return pow( c, vec3( 2.2 ) ); }
`
const DRESS_ALBEDO = /* glsl */ `
	{
		vec3 wp = vOcWorld;
		// shell grit on the middens: cream limpet and blue-black mussel, crushed small
		float g1 = ocNoise( wp.xz * 29.0 + wp.y * 9.0 );
		float g2 = ocNoise( wp.xz * 43.0 - wp.y * 7.0 + 3.0 );
		diffuseColor.rgb = mix( diffuseColor.rgb, ocLinD( vec3( 0.82, 0.78, 0.7 ) ), smoothstep( 0.68, 0.74, g1 ) * vDress.x * 0.85 );
		diffuseColor.rgb = mix( diffuseColor.rgb, ocLinD( vec3( 0.13, 0.14, 0.18 ) ), smoothstep( 0.72, 0.78, g2 ) * vDress.x * 0.75 );
		// straw and fur: strands
		float st = ocNoise( vec2( ( wp.x + wp.z ) * 34.0, ( wp.x - wp.z ) * 3.0 ) ) * 0.7 + ocNoise( wp.xz * 11.0 ) * 0.3;
		diffuseColor.rgb *= 1.0 + ( st - 0.5 ) * 0.8 * vDress.y;
	}
`

export type CaveFloorView = { mesh: Mesh; dispose(): void }

export function createCaveFloor(world: WorldData): CaveFloorView {
  const soup = new Soup()
  const r = stream(808)
  const m = new Matrix4()
  const q = new Quaternion()
  const e = new Euler()
  const pv = new Vector3()
  const sv = new Vector3()
  // the cave's frame: a out toward the sea, b to the right looking out; yaw 0 lies along a
  const caveYaw = CAVE.heading
  const at = (a: number, b: number) => {
    const p = caveWorld(a, b)
    return { x: p.x, z: p.z, y: world.heightAt(p.x, p.z) }
  }
  const place = (x: number, y: number, z: number, yaw: number, s: V3, tiltX = 0, tiltZ = 0) => {
    e.set(tiltX, yaw, tiltZ, 'YXZ')
    q.setFromEuler(e)
    return m.compose(pv.set(x, y, z), q, sv.set(s[0], s[1], s[2]))
  }
  const keep: { x: number; z: number; r: number }[] = world.pois
    .filter((p) => p.kind === 'hearth' || p.kind === 'sleep-spot')
    .map((p) => ({ x: p.x, z: p.z, r: p.kind === 'hearth' ? 1.5 : 1.3 }))
  const clear = (x: number, z: number, r: number) => keep.every((k) => Math.hypot(k.x - x, k.z - z) > k.r + r)
  const heaps: [number, number, number, number][] = [
    [-19.4, -2.4, 1.9, 0.46],
    [-18.9, 3.3, 1.6, 0.38],
    [-7.5, -10.4, 1.4, 0.32],
    // the two nearest the mouth stand higher, so they read from the hearth looking out
    [-1.6, 7.6, 1.4, 0.42],
    [-3.6, -8.6, 1.15, 0.34],
  ]
  const wood = at(-4.2, 4.7)
  const knap = at(-1.7, -3.7)
  const slabAt = at(-2.2, 3.0)
  // a day bed in the mouth's light, where the view from the hearth falls on it
  const rest = at(-2.6, -1.4)
  for (const [a, b, rad] of heaps) {
    const p = at(a, b)
    keep.push({ x: p.x, z: p.z, r: rad })
  }
  keep.push({ x: wood.x, z: wood.z, r: 0.9 }, { x: knap.x, z: knap.z, r: 1.0 }, { x: slabAt.x, z: slabAt.z, r: 0.6 }, { x: rest.x, z: rest.z, r: 1.0 })
  const disposables: BufferGeometry[] = []
  const geo = (g: BufferGeometry) => {
    disposables.push(g)
    return g
  }

  // ─── rocks fallen against the walls, and against the back ─────────────────────────────────────────────────
  const rockGeos = [0, 1, 2, 3].map((k) => geo(stoneGeo(31 + k, 1, 7, 0.62)))
  const quartzite = (k: number): V3 => mixc(lin(0.5, 0.41, 0.32), lin(0.66, 0.55, 0.42), k)
  const rock = (x: number, z: number, s: number, seed: number) => {
    const y = world.heightAt(x, z)
    const g = rockGeos[seed % rockGeos.length]
    if (!g) return
    const tone = quartzite(r())
    place(x, y + s * 0.12, z, r() * 6.28, [s * (0.9 + 0.4 * r()), s, s * (0.8 + 0.3 * r())], (r() - 0.5) * 0.3, (r() - 0.5) * 0.3)
    // darker low down, where the floor's dust and the dark of the wall meet it
    soup.put(g, m, (_x, ly) => scale(tone, 0.6 + 0.4 * Math.min(1, Math.max(0, ly * 2 + 0.5))), [0, 0])
    keep.push({ x, z, r: s * 0.8 })
  }
  for (let a = -CAVE.depth + 2; a < 1.5; a += 0.9 + r() * 0.9) {
    for (const side of [-1, 1]) {
      if (r() < 0.35) continue
      const s = 0.22 + 0.5 * r() * r()
      const b = side * (caveHalfWidth(a) - 0.25 - s * 0.6)
      const p = at(a, b)
      if (!clear(p.x, p.z, s)) continue
      rock(p.x, p.z, s, Math.floor(r() * 4))
    }
  }
  for (let b = -4.5; b < 4.6; b += 1.1 + r()) {
    const s = 0.25 + 0.45 * r()
    const a = -CAVE.depth + 0.6 + s * 0.6
    const p = at(a, b)
    if (clear(p.x, p.z, s)) rock(p.x, p.z, s, Math.floor(r() * 4))
  }

  // ─── shell middens: low grey heaps of shell and ash and soil, pale with shell on top ─────────────────────
  const shellGeo = geo(stoneGeo(77, 0, 3, 0.4))
  const shell = (x: number, z: number, y: number, s: number) => {
    const kind = r()
    const c: V3 = kind < 0.45 ? lin(0.14, 0.15, 0.2) : kind < 0.8 ? lin(0.82, 0.77, 0.66) : lin(0.52, 0.5, 0.42)
    place(x, y + s * 0.2, z, r() * 6.28, [s, s * (kind < 0.45 ? 0.5 : 0.9), s * (kind < 0.45 ? 0.55 : 1)], (r() - 0.5) * 0.8, (r() - 0.5) * 0.8)
    soup.put(shellGeo, m, () => scale(c, 0.9 + 0.2 * r()), [0, 0])
  }
  heaps.forEach(([a, b, rad, h], i) => {
    const p = at(a, b)
    const g = geo(moundGeo(9, 26, 40 + i, 0.18, (t) => h * Math.pow(Math.max(0, 1 - t * t), 1.4) - 0.04))
    const soil = lin(0.36, 0.31, 0.26)
    const top = lin(0.66, 0.62, 0.55)
    place(p.x, p.y, p.z, r() * 6.28, [rad, 1, rad * (0.75 + 0.2 * r())])
    soup.put(g, m, (_x, ly) => mixc(soil, top, Math.min(1, Math.max(0, ly / h)) ** 0.8), [1, 0])
    // whole shells on and round the heap
    for (let k = 0; k < 26; k++) {
      const ang = r() * 6.28
      const d = rad * Math.sqrt(r()) * 1.15
      const x = p.x + Math.cos(ang) * d
      const z = p.z + Math.sin(ang) * d
      const t = Math.min(1, d / rad)
      shell(x, z, world.heightAt(x, z) + Math.max(0, h * Math.pow(Math.max(0, 1 - t * t), 1.4) - 0.05), 0.025 + 0.025 * r())
    }
  })

  // ─── bedding: a mat of grass at each sleeping hollow, a hide over some ────────────────────────────────────
  const bed = (x: number, z: number, yaw: number, seed: number, withHide: boolean) => {
    const y = world.heightAt(x, z)
    const grass = geo(moundGeo(5, 26, 60 + seed, 0.24, (t) => 0.09 * Math.pow(Math.max(0, 1 - t * t * t), 0.6) - 0.01))
    const straw = lin(0.56, 0.47, 0.3)
    const dryer = lin(0.44, 0.36, 0.23)
    place(x, y, z, yaw, [0.62, 1, 1.05])
    soup.put(grass, m, (lx, _ly, lz) => mixc(straw, dryer, Math.min(1, Math.hypot(lx, lz)) * 0.8 + 0.2 * r()), [0, 1])
    if (!withHide) return
    // an eland hide: four leg lobes and a neck, draped a little over the grass
    const hide = geo(moundGeo(4, 32, 80 + seed, 0.0, (t) => 0.105 - 0.075 * t * t * t))
    const hp = hide.getAttribute('position')
    for (let k = 0; k < hp.count; k++) {
      const hx = hp.getX(k)
      const hz = hp.getZ(k)
      const a = Math.atan2(hz, hx)
      const lobes = 1 + 0.18 * Math.max(0, Math.cos(a * 4 + 0.6)) ** 3 + 0.08 * Math.cos(a * 2) + 0.05 * ring(a, 90 + seed)
      hp.setXYZ(k, hx * lobes * 0.55, hp.getY(k), hz * lobes * 0.78)
    }
    // a hide lies smooth: normals of a low dome, not the mound's facets (whose peak would draw a star of creases)
    const hn = hide.getAttribute('normal')
    for (let k = 0; k < hn.count; k++) {
      const nx = hp.getX(k) * 0.5
      const nz = hp.getZ(k) * 0.35
      const l = Math.hypot(nx, 1, nz)
      hn.setXYZ(k, nx / l, 1 / l, nz / l)
    }
    const tan = lin(0.5, 0.34, 0.21)
    const pale = lin(0.66, 0.52, 0.36)
    place(x, y, z, yaw + (r() - 0.5) * 0.3, [1, 1, 1])
    soup.put(hide, m, (lx, _ly, lz) => {
      const rr = Math.hypot(lx / 0.55, lz / 0.78)
      // darker along the spine, the belly's paler fringe at the edge
      return mixc(scale(tan, 0.8 + 0.4 * Math.min(1, Math.abs(lx) * 4)), pale, Math.max(0, rr - 0.75) * 2.5)
    }, [0, 0.5])
  }
  const centre = at(-9, 0)
  world.pois
    .filter((p) => p.kind === 'sleep-spot')
    .forEach((p, i) => {
      // the long side along the wall
      const yaw = Math.atan2(p.x - centre.x, p.z - centre.z) + Math.PI / 2 + (r() - 0.5) * 0.4
      bed(p.x, p.z, yaw, i, i % 2 === 0)
    })
  bed(rest.x, rest.z, caveYaw + 1.2, 7, true)

  // ─── ostrich-eggshell water flasks by the wood, each with its small drinking hole ──────────────────────────
  const eggGeo = geo(new IcosahedronGeometry(1, 2).toNonIndexed())
  const eggCream = lin(0.84, 0.78, 0.64)
  for (const [a, b, yaw] of [
    [-5.0, 5.7, 0.4],
    [-5.35, 5.35, 1.9],
    [-1.9, 3.7, 2.8],
  ] as const) {
    const p = at(a, b)
    place(p.x, p.y + 0.055, p.z, yaw, [0.075, 0.062, 0.062], 0, Math.PI / 2 - 0.15)
    // the hole at one end, the shell a little stained low down where it lies on the floor
    soup.put(eggGeo, m, (lx, ly) => (ly > 0.93 ? lin(0.12, 0.1, 0.08) : scale(eggCream, 0.85 + 0.15 * Math.min(1, lx * 0.5 + 0.75))), [0, 0])
    keep.push({ x: p.x, z: p.z, r: 0.15 })
  }

  // ─── the firewood pile beside the main hearth ─────────────────────────────────────────────────────────────
  const woodYaw = caveYaw + 0.15
  const bark = lin(0.36, 0.3, 0.23)
  const heart = lin(0.72, 0.6, 0.42)
  for (let k = 0; k < 18; k++) {
    const len = 0.8 + 0.7 * r()
    const rad = 0.025 + 0.035 * r()
    const g = geo(new CylinderGeometry(rad * 0.8, rad, len, 6, 1).toNonIndexed())
    const layer = Math.floor(k / 7)
    const off = (r() - 0.5) * 0.7
    const along = (r() - 0.5) * 0.3
    const fx = Math.sin(woodYaw)
    const fz = Math.cos(woodYaw)
    const x = wood.x + fz * off + fx * along
    const z = wood.z - fx * off + fz * along
    const y = world.heightAt(x, z) + rad + layer * 0.07 + 0.01
    // logs lie along the pile, a few across
    const cross = r() < 0.18 ? Math.PI / 2 : (r() - 0.5) * 0.35
    place(x, y, z, woodYaw + cross, [1, 1, 1], Math.PI / 2, (r() - 0.5) * 0.12)
    const tone = 0.8 + 0.4 * r()
    soup.put(g, m, (_x, _y, _z, ny) => (Math.abs(ny) > 0.9 ? heart : scale(bark, tone)), [0, 0.25])
  }

  // ─── the knapping spot, in the mouth's light ──────────────────────────────────────────────────────────────
  const seat = geo(stoneGeo(91, 1, 6, 0.45))
  place(knap.x, knap.y + 0.04, knap.z, r() * 6.28, [0.42, 0.42, 0.34])
  const seatTone = quartzite(0.6)
  soup.put(seat, m, (_x, ly) => scale(seatTone, 0.7 + 0.3 * Math.min(1, ly + 0.6)), [0, 0])
  const work = at(-1.15, -3.2)
  const anvil = geo(stoneGeo(92, 1, 6, 0.4))
  place(work.x, work.y + 0.02, work.z, r() * 6.28, [0.2, 0.2, 0.17])
  soup.put(anvil, m, () => quartzite(0.4), [0, 0])
  const cobble = geo(stoneGeo(93, 1, 0, 0.8))
  const hs = at(-0.85, -2.95)
  place(hs.x, hs.y + 0.04, hs.z, 0.4, [0.06, 0.05, 0.045])
  soup.put(cobble, m, () => lin(0.62, 0.58, 0.5), [0, 0])
  const coreGeo = geo(stoneGeo(94, 0, 5, 0.8))
  const silcrete = (k: number): V3 => mixc(lin(0.55, 0.4, 0.33), lin(0.72, 0.66, 0.6), k)
  const core = at(-1.35, -2.8)
  place(core.x, core.y + 0.04, core.z, 1.1, [0.07, 0.06, 0.06])
  soup.put(coreGeo, m, () => silcrete(0.2), [0, 0])
  // flakes: thin sharp slivers lying flat, thickest at the knapper's feet
  const flakeGeo = geo(stoneGeo(95, 0, 4, 0.12))
  for (let k = 0; k < 60; k++) {
    const ang = r() * 6.28
    const d = 0.05 + 0.75 * r() * r()
    const x = work.x + Math.cos(ang) * d
    const z = work.z + Math.sin(ang) * d
    const s = 0.012 + 0.02 * r()
    place(x, world.heightAt(x, z) + 0.004, z, r() * 6.28, [s * 1.4, s, s], (r() - 0.5) * 0.3, (r() - 0.5) * 0.3)
    const c = silcrete(r() < 0.6 ? r() * 0.4 : 0.7 + 0.3 * r())
    soup.put(flakeGeo, m, () => c, [0, 0])
  }

  // ─── ochre: a grinding slab with a red smear and lumps of the red stone by the main hearth ───────────────
  const slab = geo(stoneGeo(96, 1, 8, 0.25))
  const slabYaw = r() * 6.28
  place(slabAt.x, slabAt.y + 0.02, slabAt.z, slabYaw, [0.26, 0.26, 0.2])
  const red = lin(0.55, 0.2, 0.11)
  const slabTone = quartzite(0.75)
  soup.put(slab, m, (lx, ly, lz) => (ly > 0.05 && Math.hypot(lx - 0.15, lz) < 0.55 ? mixc(slabTone, red, 0.7) : slabTone), [0, 0])
  const lumpGeo = geo(stoneGeo(97, 0, 6, 0.8))
  for (let k = 0; k < 7; k++) {
    const ang = r() * 6.28
    const d = 0.25 + 0.35 * r()
    const x = slabAt.x + Math.cos(ang) * d
    const z = slabAt.z + Math.sin(ang) * d
    const s = 0.018 + 0.025 * r()
    place(x, world.heightAt(x, z) + s * 0.4, z, r() * 6.28, [s * 1.3, s, s], r(), r())
    const c = mixc(lin(0.48, 0.16, 0.09), lin(0.64, 0.28, 0.15), r())
    soup.put(lumpGeo, m, () => c, [0, 0])
  }

  // ─── charcoal and bone round the hearths ──────────────────────────────────────────────────────────────────
  const charGeo = geo(stoneGeo(98, 0, 5, 0.6))
  const boneGeo = geo(new CylinderGeometry(0.012, 0.016, 1, 5, 1).toNonIndexed())
  for (const h of world.pois.filter((p) => p.kind === 'hearth')) {
    for (let k = 0; k < 18; k++) {
      const ang = r() * 6.28
      const d = 0.8 + 0.9 * r()
      const x = h.x + Math.cos(ang) * d
      const z = h.z + Math.sin(ang) * d
      const s = 0.015 + 0.025 * r()
      place(x, world.heightAt(x, z) + s * 0.3, z, r() * 6.28, [s * 1.6, s, s], r(), r())
      soup.put(charGeo, m, () => lin(0.09, 0.08, 0.075), [0, 0])
    }
    for (let k = 0; k < 4; k++) {
      const ang = r() * 6.28
      const d = 1.1 + 1.2 * r()
      const x = h.x + Math.cos(ang) * d
      const z = h.z + Math.sin(ang) * d
      const len = 0.12 + 0.16 * r()
      place(x, world.heightAt(x, z) + 0.014, z, r() * 6.28, [1, len, 1], Math.PI / 2, (r() - 0.5) * 0.2)
      soup.put(boneGeo, m, () => lin(0.8, 0.75, 0.64), [0, 0])
    }
  }

  // ─── shells dropped round the main hearth and toward the mouth: limpets cream, mussels blue-black ─────────
  const mainHearth = world.pois.find((p) => p.id === 'hearth-main')
  if (mainHearth) {
    for (let k = 0; k < 34; k++) {
      const ang = r() * 6.28
      const d = 1.2 + 1.6 * r()
      const x = mainHearth.x + Math.cos(ang) * d
      const z = mainHearth.z + Math.sin(ang) * d
      if (!clear(x, z, 0.05)) continue
      shell(x, z, world.heightAt(x, z) - 0.01, 0.025 + 0.02 * r())
    }
  }

  // ─── loose cobbles across the floor ───────────────────────────────────────────────────────────────────────
  for (let k = 0; k < 26; k++) {
    const a = -CAVE.depth + 2 + r() * (CAVE.depth + 1)
    const b = (r() * 2 - 1) * (caveHalfWidth(a) - 1)
    const p = at(a, b)
    const s = 0.06 + 0.12 * r()
    if (!clear(p.x, p.z, s + 0.3)) continue
    const g = rockGeos[k % rockGeos.length]
    if (!g) continue
    place(p.x, p.y + s * 0.05, p.z, r() * 6.28, [s, s * 0.8, s * 0.9], r() - 0.5, r() - 0.5)
    const c = quartzite(r())
    soup.put(g, m, () => c, [0, 0])
  }

  const geometry = soup.geometry()
  for (const g of disposables) g.dispose()
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
  patchPaint(material, { brush: 0.35, rim: 0.25 }, {
    key: 'cave-floor',
    vertexHead: DRESS_VERT_HEAD,
    vertexMain: DRESS_VERT_MAIN,
    fragmentHead: DRESS_FRAG_HEAD,
    albedo: DRESS_ALBEDO,
  })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'cave-floor'
  mesh.castShadow = true
  mesh.receiveShadow = true
  return {
    mesh,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
