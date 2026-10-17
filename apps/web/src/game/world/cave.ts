/**
 * The cave's rock shell: world-gen's density field polygonised with surface nets over the cave box, painted as
 * warm quartzite in blocky facets and strata, soot-black over the hearths, lichen where the rain reaches.
 * The floor is the heightfield's terrace; this mesh is the walls, the roof, the brow and the rock round the face.
 */
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Vector4 } from 'three'
import type { WorldData } from '../contracts'
import { patchPaint } from '../render/paint'
import { CAVE_BOX } from '../../world-gen/cave'
import type { TerrainGrid } from '../../world-gen/terrain'
import { sampleGrid } from '../../world-gen/terrain'

const STEP = 0.7

/** directions the occlusion is sampled along: 48 spread evenly round the sphere (a Fibonacci spiral) */
const AO_DIRS: readonly (readonly [number, number, number])[] = Array.from({ length: 48 }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / 48
  const r = Math.sqrt(1 - y * y)
  const a = i * Math.PI * (3 - Math.sqrt(5))
  return [Math.cos(a) * r, y, Math.sin(a) * r] as const
})
/** how far out each direction is probed, metres, and how much rock found there darkens */
const AO_REACH = [0.8, 1.6, 2.8, 4.5, 7.5, 11] as const
const AO_WEIGHT = [1, 0.85, 0.65, 0.45, 0.3, 0.2] as const

/** polygonise the density over the cave box (surface nets: one vertex per crossing cell, one quad per crossing edge) */
export function buildCaveGeometry(grid: TerrainGrid): BufferGeometry {
  const rock = grid.cave
  const nx = Math.ceil((CAVE_BOX.x1 - CAVE_BOX.x0) / STEP) + 1
  const nz = Math.ceil((CAVE_BOX.z1 - CAVE_BOX.z0) / STEP) + 1
  const ny = Math.ceil((CAVE_BOX.y1 - CAVE_BOX.y0) / STEP) + 1
  const f = new Float32Array(nx * ny * nz)
  const at = (i: number, j: number, k: number) => (k * nx + i) * ny + j
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const x = CAVE_BOX.x0 + i * STEP
      const z = CAVE_BOX.z0 + k * STEP
      const col = rock.column(x, z)
      const top = Math.max(col.top0, col.topOver, col.topBrow)
      const lo = col.hFinal - 4
      const hi = top + 1.5
      for (let j = 0; j < ny; j++) {
        const y = CAVE_BOX.y0 + j * STEP
        // only the band where the surface can be pays for noise
        let d = y < lo || y > hi ? Math.min(top - y, y - (col.hFinal - 2.5)) : rock.density(col, y)
        // closed at the box: the faces there are under the terrain anyway
        if (i === 0 || k === 0 || i === nx - 1 || k === nz - 1 || j === 0 || j === ny - 1) d = Math.min(d, -0.01)
        f[at(i, j, k)] = d
      }
    }
  }

  const cellIdx = new Int32Array(nx * ny * nz).fill(-1)
  const pos: number[] = []
  const nor: number[] = []
  const v = (i: number, j: number, k: number) => f[at(i, j, k)] ?? 0
  for (let k = 0; k < nz - 1; k++) {
    for (let i = 0; i < nx - 1; i++) {
      for (let j = 0; j < ny - 1; j++) {
        let mask = 0
        const c: number[] = []
        for (let q = 0; q < 8; q++) {
          const di = q & 1
          const dj = (q >> 1) & 1
          const dk = (q >> 2) & 1
          const val = v(i + di, j + dj, k + dk)
          c.push(val)
          if (val > 0) mask |= 1 << q
        }
        if (mask === 0 || mask === 255) continue
        // the average of the edge crossings
        let sx = 0
        let sy = 0
        let sz = 0
        let n = 0
        for (let q = 0; q < 8; q++) {
          for (const axis of [1, 2, 4]) {
            if (q & axis) continue
            const r = q | axis
            const a = c[q] ?? 0
            const b = c[r] ?? 0
            if (a > 0 === b > 0) continue
            const t = a / (a - b)
            const ax = q & 1
            const ay = (q >> 1) & 1
            const az = (q >> 2) & 1
            sx += ax + (axis === 1 ? t : 0)
            sy += ay + (axis === 2 ? t : 0)
            sz += az + (axis === 4 ? t : 0)
            n++
          }
        }
        const px = CAVE_BOX.x0 + (i + sx / n) * STEP
        const py = CAVE_BOX.y0 + (j + sy / n) * STEP
        const pz = CAVE_BOX.z0 + (k + sz / n) * STEP
        // the gradient from the corners: the normal points out of the rock
        const c0 = c[0] ?? 0
        const c1 = c[1] ?? 0
        const c2 = c[2] ?? 0
        const c3 = c[3] ?? 0
        const c4 = c[4] ?? 0
        const c5 = c[5] ?? 0
        const c6 = c[6] ?? 0
        const c7 = c[7] ?? 0
        const gx = c1 - c0 + c3 - c2 + c5 - c4 + c7 - c6
        const gy = c2 - c0 + c3 - c1 + c6 - c4 + c7 - c5
        const gz = c4 - c0 + c5 - c1 + c6 - c2 + c7 - c3
        const gl = Math.hypot(gx, gy, gz) || 1
        cellIdx[at(i, j, k)] = pos.length / 3
        pos.push(px, py, pz)
        nor.push(-gx / gl, -gy / gl, -gz / gl)
      }
    }
  }

  // quads across every crossing edge; skip the ones buried under the terrain
  const idx: number[] = []
  const hArr = grid.h
  const buried = (a: number, b: number, c: number, d: number): boolean => {
    let under = 0
    for (const vi of [a, b, c, d]) {
      const x = pos[vi * 3] ?? 0
      const y = pos[vi * 3 + 1] ?? 0
      const z = pos[vi * 3 + 2] ?? 0
      if (y < sampleGrid(hArr, x, z) - 0.6) under++
    }
    return under === 4
  }
  // wound so the face agrees with the density gradient at its corners
  const P = (vi: number, o: number) => pos[vi * 3 + o] ?? 0
  const Nn = (vi: number, o: number) => nor[vi * 3 + o] ?? 0
  const quad = (a: number, b: number, c: number, d: number) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (buried(a, b, c, d)) return
    const ux = P(c, 0) - P(a, 0)
    const uy = P(c, 1) - P(a, 1)
    const uz = P(c, 2) - P(a, 2)
    const wx = P(d, 0) - P(b, 0)
    const wy = P(d, 1) - P(b, 1)
    const wz = P(d, 2) - P(b, 2)
    // the quad's normal from its diagonals (a→c × b→d points along a,b,c,d's winding)
    const qx = uy * wz - uz * wy
    const qy = uz * wx - ux * wz
    const qz = ux * wy - uy * wx
    let dot = 0
    for (const vi of [a, b, c, d]) dot += qx * Nn(vi, 0) + qy * Nn(vi, 1) + qz * Nn(vi, 2)
    if (dot < 0) idx.push(a, c, b, a, d, c)
    else idx.push(a, b, c, a, c, d)
  }
  const ci = (i: number, j: number, k: number) => cellIdx[at(i, j, k)] ?? -1
  for (let k = 1; k < nz - 1; k++) {
    for (let i = 1; i < nx - 1; i++) {
      for (let j = 1; j < ny - 1; j++) {
        const s0 = v(i, j, k) > 0
        // x edge (i,j,k)-(i+1,j,k): the cells sharing it vary in j and k
        if (s0 !== v(i + 1, j, k) > 0) quad(ci(i, j - 1, k - 1), ci(i, j, k - 1), ci(i, j, k), ci(i, j - 1, k))
        // y edge: cells vary in i and k
        if (s0 !== v(i, j + 1, k) > 0) quad(ci(i - 1, j, k - 1), ci(i - 1, j, k), ci(i, j, k), ci(i, j, k - 1))
        // z edge: cells vary in i and j
        if (s0 !== v(i, j, k + 1) > 0) quad(ci(i - 1, j - 1, k), ci(i, j - 1, k), ci(i, j, k), ci(i - 1, j, k))
      }
    }
  }
  // baked ambient occlusion: how much of the sky each vertex's hemisphere keeps once the rock and the floor round
  // it are counted, so creases, the wall's foot and the roof's corners go dark the way a painter would put them
  // the floor counts only close by (the wall's foot): further off it is the bounce, which the ambient already has
  const solid = (x: number, y: number, z: number, near: boolean): boolean => {
    if (near && y < sampleGrid(hArr, x, z) - 0.15) return true
    const i = Math.round((x - CAVE_BOX.x0) / STEP)
    const j = Math.round((y - CAVE_BOX.y0) / STEP)
    const k = Math.round((z - CAVE_BOX.z0) / STEP)
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return false
    return (f[at(i, j, k)] ?? 0) > 0
  }
  const vcount = pos.length / 3
  const ao = new Float32Array(vcount)
  for (let vi = 0; vi < vcount; vi++) {
    const nx0 = Nn(vi, 0)
    const ny0 = Nn(vi, 1)
    const nz0 = Nn(vi, 2)
    // start a little off the surface so a vertex never finds its own rock
    const ox = P(vi, 0) + nx0 * 0.3
    const oy = P(vi, 1) + ny0 * 0.3
    const oz = P(vi, 2) + nz0 * 0.3
    let occ = 0
    let sum = 0
    for (const [dx, dy, dz] of AO_DIRS) {
      const c = dx * nx0 + dy * ny0 + dz * nz0
      if (c < 0.1) continue
      sum += c
      for (let r = 0; r < AO_REACH.length; r++) {
        const d = AO_REACH[r] ?? 0
        if (solid(ox + dx * d, oy + dy * d, oz + dz * d, r < 2)) {
          occ += c * (AO_WEIGHT[r] ?? 0)
          break
        }
      }
    }
    ao[vi] = sum > 0 ? 1 - occ / sum : 1
  }

  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('aAO', new BufferAttribute(ao, 1))
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1))
  g.computeBoundingSphere()
  g.computeBoundingBox()
  return g
}

const ROCK_VERT_HEAD = /* glsl */ `
attribute float aAO;
varying float vOcAO;
`

const ROCK_HEAD = /* glsl */ `
uniform vec4 uHearthSoot;
varying float vOcAO;
vec4 ocFacetT = vec4( 0.0 );
vec4 ocFacetS = vec4( 0.0 );
vec3 ocLinR( vec3 c ) { return pow( c, vec3( 2.2 ) ); }
// near the eye: small chips split by thin cracks, so rock a metre off has grain rather than flat blobs
vec4 ocChipT = vec4( 0.0 );
float ocChipNear = 0.0;
vec4 ocChip( vec3 wp, vec3 nw, float size, out float edge ) {
	vec3 an = abs( nw );
	vec3 U = vec3( 1.0, 0.0, 0.0 );
	vec3 V = vec3( 0.0, 1.0, 0.0 );
	if ( an.y > 0.72 ) V = vec3( 0.0, 0.0, 1.0 );
	else if ( an.x > an.z ) U = vec3( 0.0, 0.0, 1.0 );
	vec2 p = vec2( dot( wp, U ) / ( size * 1.7 ), dot( wp, V ) / size );
	vec2 i = floor( p );
	vec2 f = fract( p );
	float d1 = 9.0;
	float d2 = 9.0;
	vec2 id = vec2( 0.0 );
	for ( int y = - 1; y <= 1; y ++ ) {
		for ( int x = - 1; x <= 1; x ++ ) {
			vec2 o = vec2( float( x ), float( y ) );
			vec2 r = o + ocHash2( i + o ) - f;
			float d = dot( r, r );
			if ( d < d1 ) { d2 = d1; d1 = d; id = i + o; } else if ( d < d2 ) { d2 = d; }
		}
	}
	edge = sqrt( d2 ) - sqrt( d1 );
	vec2 h = ocHash2( id + 31.0 ) - 0.5;
	return vec4( U * h.x + V * h.y, ocHash( id + 9.1 ) );
}
`

const ROCK_ALBEDO = /* glsl */ `
	{
		vec3 wp = vOcWorld;
		vec3 nW = normalize( vOcNormalW );
		// blocky facets: quantised 3D noise picks a tone per chunk, like knife-laid paint
		ocFacetT = ocFacet( wp, nW, 1.5 );
		ocFacetS = ocFacet( wp + 3.7, nW, 0.55 );
		float facet = ocFacetT.w * 0.75 + ocFacetS.w * 0.25;
		float facet2 = ocFacetS.w;
		vec3 warm = mix( ocLinR( vec3( 0.62, 0.46, 0.33 ) ), ocLinR( vec3( 0.76, 0.62, 0.47 ) ), facet );
		warm = mix( warm, ocLinR( vec3( 0.52, 0.48, 0.47 ) ), smoothstep( 0.6, 0.9, facet2 ) * 0.5 );
		// iron-red seams
		warm = mix( warm, ocLinR( vec3( 0.66, 0.33, 0.17 ) ), smoothstep( 0.6, 0.85, ocNoise( vec2( wp.x + wp.z, wp.y * 3.0 ) * 0.21 ) ) * 0.35 );
		// lichen on the tops that see the sky
		float sky = ocCaveSky( wp );
		float lichen = smoothstep( 0.7, 0.82, ocNoise( wp.xz * 0.9 + wp.y * 0.5 ) ) * smoothstep( 0.1, 0.7, nW.y ) * sky;
		warm = mix( warm, ocLinR( vec3( 0.76, 0.54, 0.3 ) ), lichen * 0.4 );
		warm = mix( warm, ocLinR( vec3( 0.55, 0.58, 0.48 ) ), smoothstep( 0.7, 0.85, ocNoise( wp.xz * 0.27 + 3.0 ) ) * smoothstep( 0.3, 0.9, nW.y ) * sky * 0.4 );
		// soot over the hearths, darkest on the ceiling
		float dh = length( wp.xz - uHearthSoot.xy );
		float soot = ( 1.0 - smoothstep( 1.5, uHearthSoot.z, dh ) ) * smoothstep( uHearthSoot.w + 1.5, uHearthSoot.w + 5.0, wp.y );
		soot *= ( 0.75 + 0.25 * ocNoise( wp.xz * 1.7 ) ) * smoothstep( 0.95, 0.5, sky );
		// (kept short of black so the ceiling still catches the firelight)
		warm = mix( warm, ocLinR( vec3( 0.2, 0.16, 0.13 ) ), clamp( soot, 0.0, 1.0 ) * 0.7 );
		// within a few metres of the eye: chips with their own tone, thin dark cracks, fine grit
		ocChipNear = 1.0 - smoothstep( 5.0, 22.0, length( wp - cameraPosition ) );
		if ( ocChipNear > 0.0 ) {
			float edge = 1.0;
			ocChipT = ocChip( wp, nW, 0.24, edge );
			// only some joints open into cracks, the rest are just a change of tone
			float crack = 1.0 - smoothstep( 0.015, 0.06, edge + ( ocNoise( wp.xy * 9.0 + wp.z * 5.0 ) - 0.5 ) * 0.04 );
			crack *= smoothstep( 0.42, 0.62, ocNoise( vec2( wp.x - wp.z, wp.y ) * 1.9 + 7.0 ) );
			float grit = ocNoise( vec2( wp.x + wp.z * 0.7, wp.y ) * 31.0 ) - 0.5;
			vec3 near = warm * ( 0.93 + 0.14 * ocChipT.w + grit * 0.12 );
			near *= 1.0 - crack * 0.45;
			warm = mix( warm, near, ocChipNear );
		}
		// damp, darker toward the back
		warm *= mix( 0.8, 1.0, sky );
		// the creases darker in their own colour too, a painter's accent where the rock folds
		warm *= mix( 0.62, 1.0, smoothstep( 0.1, 0.85, vOcAO ) );
		diffuseColor.rgb = warm;
	}
`

/** a little extra relief: the facets tilt the normal */
const ROCK_NORMAL = /* glsl */ `
	{
		vec3 g = ocFacetT.xyz * 0.55 + ocFacetS.xyz * 0.3 + ocChipT.xyz * 0.28 * ocChipNear;
		vec3 gv = ( viewMatrix * vec4( g, 0.0 ) ).xyz;
		normal = normalize( normal + gv );
	}
`

export type CaveView = { mesh: Mesh; dispose(): void }

export function createCaveView(world: WorldData, grid: TerrainGrid): CaveView {
  const geo = buildCaveGeometry(grid)
  const hearth = world.pois.find((p) => p.id === 'hearth-main')
  const floor = hearth ? world.heightAt(hearth.x, hearth.z) : 33.5
  const material = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 })
  patchPaint(material, { brush: 0.4, rim: 0.2 }, {
    key: 'cave-rock',
    vertexHead: ROCK_VERT_HEAD,
    vertexMain: 'vOcAO = aAO;',
    fragmentHead: ROCK_HEAD,
    // baked occlusion: the creases, the wall's foot and the roof's corners take less of the sky, the bounce and
    // the hearth's fill
    ambient: 'irradiance *= mix( 0.15, 1.0, smoothstep( 0.05, 0.95, vOcAO ) );',
    albedo: ROCK_ALBEDO,
    normal: ROCK_NORMAL,
    uniforms: { uHearthSoot: { value: new Vector4(hearth?.x ?? 0, hearth?.z ?? 0, 9, floor) } },
  })
  const mesh = new Mesh(geo, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'cave-rock'
  return {
    mesh,
    dispose() {
      geo.dispose()
      material.dispose()
    },
  }
}
