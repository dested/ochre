/**
 * The terrain's meshes and its painted material: 2 m detail tiles round the playable coast (three LODs each,
 * skirted), an 8 m mesh for the rest of the world, and a far field out to the horizon (the base field's
 * coast running on west into headlands, and the mountain ranges to the north).
 */
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Uint8BufferAttribute,
  Vector3,
  Vector4,
  type Camera,
} from 'three'
import type { WorldData } from '../contracts'
import { patchPaint } from '../render/paint'
import { LIGHT } from '../render/uniforms'
import { createBaseField, MAT, type TerrainGrid } from '../../world-gen/terrain'
import { CELL, GRID_N, HALF, RIVER } from '../../world-gen/layout'

const DETAIL = { x0: -640, x1: 640, z0: -768, z1: 512 } as const
const TILE = 256
const LODS = [2, 4, 8] as const
const LOD_DIST = [380, 900] as const
const SKIRT = 5

/** per grid vertex: splat weights A = sand, dune, fynbos, grass; B = rock, cliff, shelf, earth */
function buildSplat(g: TerrainGrid): { a: Uint8Array; b: Uint8Array } {
  const N = g.n
  const raw = new Float32Array(N * N * 8)
  const slot = (m: number): number => {
    switch (m) {
      case MAT.seabed:
      case MAT.sand:
        return 0
      case MAT.dune:
        return 1
      case MAT.fynbos:
        return 2
      case MAT.grass:
        return 3
      case MAT.rock:
      case MAT.scree:
        return 4
      case MAT.cliff:
        return 5
      case MAT.shelf:
      case MAT.riverBed:
        return 6
      default:
        return 7
    }
  }
  for (let i = 0; i < N * N; i++) raw[i * 8 + slot(g.mat[i] ?? 0)] = 1
  // a 3×3 blur so borders soften (the shader then roughens them with noise)
  const a = new Uint8Array(N * N * 4)
  const b = new Uint8Array(N * N * 4)
  const acc = new Float32Array(8)
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      acc.fill(0)
      let wsum = 0
      for (let dz = -1; dz <= 1; dz++) {
        const z = Math.min(N - 1, Math.max(0, iz + dz))
        for (let dx = -1; dx <= 1; dx++) {
          const x = Math.min(N - 1, Math.max(0, ix + dx))
          const w = dx === 0 && dz === 0 ? 2 : 1
          const j = (z * N + x) * 8
          for (let k = 0; k < 8; k++) acc[k] = (acc[k] ?? 0) + (raw[j + k] ?? 0) * w
          wsum += w
        }
      }
      const i = iz * N + ix
      for (let k = 0; k < 4; k++) {
        a[i * 4 + k] = Math.round(((acc[k] ?? 0) / wsum) * 255)
        b[i * 4 + k] = Math.round(((acc[k + 4] ?? 0) / wsum) * 255)
      }
    }
  }
  return { a, b }
}

type GridSource = {
  h: (ix: number, iz: number) => number
  splat: { a: Uint8Array; b: Uint8Array }
}

/** a terrain patch on the grid: [ix0, ix1] × [iz0, iz1] sampled every `step` grid cells, with skirts */
function buildPatch(src: GridSource, ix0: number, iz0: number, ix1: number, iz1: number, step: number, skirt: boolean): BufferGeometry {
  const nx = Math.floor((ix1 - ix0) / step) + 1
  const nz = Math.floor((iz1 - iz0) / step) + 1
  const edgeCount = skirt ? 2 * (nx + nz) : 0
  const vcount = nx * nz + edgeCount
  const pos = new Float32Array(vcount * 3)
  const nor = new Float32Array(vcount * 3)
  const sa = new Uint8Array(vcount * 4)
  const sb = new Uint8Array(vcount * 4)
  const N = GRID_N
  const put = (v: number, ix: number, iz: number, drop: number) => {
    const cx = Math.min(N - 1, Math.max(0, ix))
    const cz = Math.min(N - 1, Math.max(0, iz))
    const hv = src.h(cx, cz)
    pos[v * 3] = -HALF + ix * CELL
    pos[v * 3 + 1] = hv - drop
    pos[v * 3 + 2] = -HALF + iz * CELL
    const s = Math.max(1, step)
    const hl = src.h(Math.max(0, cx - s), cz)
    const hr = src.h(Math.min(N - 1, cx + s), cz)
    const hu = src.h(cx, Math.max(0, cz - s))
    const hd = src.h(cx, Math.min(N - 1, cz + s))
    const nxv = (hl - hr) / (2 * s * CELL)
    const nzv = (hu - hd) / (2 * s * CELL)
    const len = Math.hypot(nxv, 1, nzv)
    nor[v * 3] = nxv / len
    nor[v * 3 + 1] = 1 / len
    nor[v * 3 + 2] = nzv / len
    const gi = cz * N + cx
    for (let k = 0; k < 4; k++) {
      sa[v * 4 + k] = src.splat.a[gi * 4 + k] ?? 0
      sb[v * 4 + k] = src.splat.b[gi * 4 + k] ?? 0
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) put(j * nx + i, ix0 + i * step, iz0 + j * step, 0)
  const idx: number[] = []
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      const b = a + 1
      const c = a + nx
      const d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  }
  if (skirt) {
    let v = nx * nz
    const ring: [number, number][] = []
    for (let i = 0; i < nx; i++) ring.push([i, 0])
    for (let j = 0; j < nz; j++) ring.push([nx - 1, j])
    for (let i = nx - 1; i >= 0; i--) ring.push([i, nz - 1])
    for (let j = nz - 1; j >= 0; j--) ring.push([0, j])
    const top: number[] = []
    const bot: number[] = []
    for (const [i, j] of ring) {
      put(v, ix0 + i * step, iz0 + j * step, SKIRT)
      top.push(j * nx + i)
      bot.push(v)
      v++
    }
    for (let k = 0; k < ring.length - 1; k++) {
      const t0 = top[k] ?? 0
      const t1 = top[k + 1] ?? 0
      const b0 = bot[k] ?? 0
      const b1 = bot[k + 1] ?? 0
      idx.push(t0, b0, t1, t1, b0, b1, t0, t1, b0, t1, b1, b0)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('normal', new BufferAttribute(nor, 3))
  g.setAttribute('aSplatA', new Uint8BufferAttribute(sa, 4, true))
  g.setAttribute('aSplatB', new Uint8BufferAttribute(sb, 4, true))
  g.setIndex(vcount > 65535 ? new BufferAttribute(new Uint32Array(idx), 1) : new BufferAttribute(new Uint16Array(idx), 1))
  g.computeBoundingSphere()
  g.computeBoundingBox()
  return g
}

const TERRAIN_VERT_HEAD = /* glsl */ `
attribute vec4 aSplatA;
attribute vec4 aSplatB;
varying vec4 vSplatA;
varying vec4 vSplatB;
`
const TERRAIN_VERT_MAIN = /* glsl */ `
	vSplatA = aSplatA;
	vSplatB = aSplatB;
`

const TERRAIN_FRAG_HEAD = /* glsl */ `
varying vec4 vSplatA;
varying vec4 vSplatB;
uniform vec3 uKeyDirT;
uniform vec4 uOchre;
uniform vec4 uHearths;
vec4 ocFacetT = vec4( 0.0 );
vec3 ocLin( vec3 c ) { return pow( c, vec3( 2.2 ) ); }
// a hard painted edge at threshold t of a field n, antialiased to a pixel however close the camera is
float ocEdge( float t, float n ) {
	float w = max( fwidth( n ) * 0.75, 1e-4 );
	return smoothstep( t - w, t + w, n );
}
// fynbos from above: two layers of rounded shrubs (big and small) in greens, rust and blond, each lit on the
// key light's side with a shadowed crescent opposite, over dry soil speckled with litter
vec4 ocBushLayer( vec2 p, float cs, float seed ) {
	vec2 g = p / cs;
	vec2 i = floor( g );
	vec2 f = fract( g );
	float d1 = 9.0;
	vec2 rel = vec2( 0.0 );
	vec2 id = vec2( 0.0 );
	for ( int y = - 1; y <= 1; y ++ ) {
		for ( int x = - 1; x <= 1; x ++ ) {
			vec2 o = vec2( float( x ), float( y ) );
			vec2 r = o + 0.1 + 0.8 * ocHash2( i + o + seed ) - f;
			float d = dot( r, r );
			if ( d < d1 ) { d1 = d; rel = r; id = i + o; }
		}
	}
	float size = 0.4 + 0.26 * ocHash( id + 9.1 + seed );
	float dist = sqrt( d1 );
	float present = step( 0.12, ocHash( id + 4.4 + seed ) );
	// ragged, twiggy outlines instead of discs
	float ang = atan( rel.y, rel.x );
	float rag = ( ocNoise( vec2( ang * 2.5, id.x * 3.1 + id.y ) ) - 0.5 ) * 0.35 + ( ocNoise( p * 7.0 ) - 0.5 ) * 0.3;
	float bush = ( 1.0 - ocEdge( size * 0.9, dist + rag * size ) ) * present;
	vec2 sd = normalize( uKeyDirT.xz + 1e-4 );
	float side = clamp( dot( - rel / max( dist, 1e-3 ), sd ) * ( dist / size ), - 1.0, 1.0 );
	return vec4( bush, side, ocHash( id + 3.7 + seed ), ocHash( id + 21.0 + seed ) );
}
// the shelf's bedding: rows across the strike, blocks along it (joints warped a little so they aren't ruled);
// x = distance to the nearest joint in metres, yzw = the block's hashes
vec4 ocBlocks( vec2 p ) {
	vec2 q = vec2( dot( p, vec2( 0.91, 0.42 ) ), dot( p, vec2( - 0.42, 0.91 ) ) );
	q += vec2( ocNoise( p * 0.11 ), ocNoise( p * 0.11 + 5.0 ) ) * 2.2 + vec2( ocNoise( p * 0.5 + 2.0 ), ocNoise( p * 0.5 + 9.0 ) ) * 0.35;
	float rowW = 1.7;
	float row = floor( q.y / rowW );
	float fy = fract( q.y / rowW );
	float len = 1.8 + 3.4 * ocHash( vec2( row, 3.1 ) );
	float qx = q.x / len + ocHash( vec2( row, 7.7 ) );
	float col = floor( qx );
	float fx = fract( qx );
	float dj = min( min( fy, 1.0 - fy ) * rowW, min( fx, 1.0 - fx ) * len );
	vec2 id = vec2( col, row );
	return vec4( dj, ocHash( id + 1.3 ), ocHash( id + 8.9 ), ocHash( id + 4.2 ) );
}
vec3 ocBushTone( float h ) {
	if ( h < 0.3 ) return ocLin( vec3( 0.44, 0.5, 0.31 ) );
	if ( h < 0.5 ) return ocLin( vec3( 0.36, 0.41, 0.25 ) );
	if ( h < 0.62 ) return ocLin( vec3( 0.55, 0.36, 0.22 ) );
	if ( h < 0.8 ) return ocLin( vec3( 0.62, 0.56, 0.36 ) );
	if ( h < 0.9 ) return ocLin( vec3( 0.47, 0.5, 0.44 ) );
	return ocLin( vec3( 0.52, 0.43, 0.27 ) );
}
vec3 ocBushes( vec2 p, float px, vec3 soil ) {
	vec3 ground = soil * ( 0.85 + 0.3 * ocNoise( p * 3.1 ) );
	ground = mix( ground, ocLin( vec3( 0.62, 0.55, 0.36 ) ), smoothstep( 0.55, 0.8, ocNoise( p * 1.3 + 2.0 ) ) * 0.5 );
	vec4 a = ocBushLayer( p, 1.7, 0.0 );
	vec4 b = ocBushLayer( p + 0.6, 0.95, 17.0 );
	vec3 ca = ocBushTone( a.z ) * ( 0.84 + 0.3 * a.y );
	vec3 cb = ocBushTone( b.z ) * ( 0.88 + 0.26 * b.y ) * 1.04;
	// a protea's pink head now and then on the big bushes
	ca = mix( ca, ocLin( vec3( 0.8, 0.5, 0.54 ) ), step( 0.975, a.w ) * smoothstep( 0.45, 0.15, abs( a.y - 0.4 ) ) );
	vec3 o = mix( ground, cb, b.x );
	o = mix( o, ca, a.x );
	// far away: the veld's own patchwork, old dark stands, young pale ones after a fire, restio tan in the damp
	float v1 = ocNoise( p * 0.035 + 3.0 );
	float v2 = ocNoise( p * 0.13 + 7.0 );
	float v3 = ocNoise( p * 0.5 + 1.0 );
	vec3 avg = mix( ocLin( vec3( 0.35, 0.37, 0.31 ) ), ocLin( vec3( 0.5, 0.49, 0.38 ) ), smoothstep( 0.3, 0.7, v1 ) );
	avg = mix( avg, ocLin( vec3( 0.28, 0.3, 0.27 ) ), smoothstep( 0.55, 0.8, v2 ) * 0.7 );
	avg = mix( avg, ocLin( vec3( 0.6, 0.55, 0.42 ) ), smoothstep( 0.66, 0.85, v2 * 0.6 + v1 * 0.4 ) * 0.6 );
	avg = mix( avg * ( 0.86 + 0.28 * v3 ), soil, 0.15 );
	return mix( avg, o, smoothstep( 1.4, 0.45, px * 3.0 ) );
}
`

const TERRAIN_ALBEDO = /* glsl */ `
	{
		vec2 p = vOcWorld.xz;
		float y = vOcWorld.y;
		float px = length( fwidth( p ) );
		vec4 wa = vSplatA;
		vec4 wb = vSplatB;
		// ragged, painted borders between the washes
		float r1 = ocNoise( p * 0.23 );
		float r2 = ocNoise( p * 0.71 + 13.1 );
		float rr = r1 * 0.65 + r2 * 0.35;
		wa *= vec4( 0.55 + 0.9 * rr, 0.55 + 0.9 * ( 1.0 - rr ), 0.55 + 0.9 * rr, 0.55 + 0.9 * ( 1.0 - rr ) );
		wb *= vec4( 0.55 + 0.9 * ( 1.0 - rr ), 0.8 + 0.4 * rr, 0.55 + 0.9 * rr, 0.6 + 0.8 * ( 1.0 - rr ) );
		// shrubs and grass don't hold on steep ground: it goes to bare rock
		vec3 nW = normalize( vOcNormalW );
		float steepF = smoothstep( 0.84, 0.6, nW.y );
		wb.x += ( wa.z + wa.w ) * steepF;
		wa.zw *= 1.0 - steepF;
		wa = pow( max( wa, 0.0 ), vec4( 1.6 ) );
		wb = pow( max( wb, 0.0 ), vec4( 1.6 ) );
		float ws = dot( wa, vec4( 1.0 ) ) + dot( wb, vec4( 1.0 ) ) + 1e-4;
		wa /= ws;
		wb /= ws;
		float drift = ocNoise( p * 0.031 );
		float fine = ocNoise( p * 1.9 );
		// sand: warm cream, darker where wet
		vec3 sand = mix( ocLin( vec3( 0.90, 0.81, 0.63 ) ), ocLin( vec3( 0.84, 0.72, 0.54 ) ), drift );
		sand *= 0.95 + 0.08 * fine;
		vec3 dune = mix( ocLin( vec3( 0.92, 0.84, 0.68 ) ), ocLin( vec3( 0.86, 0.78, 0.6 ) ), drift );
		float tuft = smoothstep( 0.62, 0.8, ocNoise( p * 0.6 + 4.0 ) ) * smoothstep( 0.4, 0.7, ocNoise( p * 2.7 ) );
		dune = mix( dune, ocLin( vec3( 0.6, 0.6, 0.36 ) ), tuft * 0.8 );
		vec3 soil = mix( ocLin( vec3( 0.44, 0.36, 0.25 ) ), ocLin( vec3( 0.55, 0.43, 0.29 ) ), drift );
		vec3 fyn = ocBushes( p, px, soil );
		vec3 grass = mix( ocLin( vec3( 0.66, 0.6, 0.42 ) ), ocLin( vec3( 0.5, 0.53, 0.37 ) ), ocNoise( p * 0.05 + 2.0 ) );
		grass = mix( grass, ocLin( vec3( 0.74, 0.66, 0.47 ) ), smoothstep( 0.55, 0.8, ocNoise( p * 0.18 + 9.0 ) ) * 0.7 );
		grass = mix( grass, ocLin( vec3( 0.52, 0.54, 0.47 ) ), smoothstep( 0.6, 0.85, ocNoise( p * 0.09 + 4.0 ) ) * 0.6 );
		grass *= 0.9 + 0.18 * ocNoise( vec2( p.x * 3.0, p.y * 0.8 ) + 5.0 );
		// rock: limestone in blocky facets, ledges along the strata, orange lichen
		ocFacetT = ocFacet( vOcWorld, nW, 2.1 );
		float facet = ocFacetT.w;
		vec3 rock = mix( ocLin( vec3( 0.58, 0.5, 0.4 ) ), ocLin( vec3( 0.76, 0.65, 0.5 ) ), facet );
		rock = mix( rock, ocLin( vec3( 0.55, 0.52, 0.5 ) ), step( 0.8, facet ) * 0.6 );
		float lichen = ocEdge( 0.74, ocNoise( p * 0.9 + y * 0.5 ) * 0.75 + ocNoise( p * 3.7 ) * 0.25 ) * smoothstep( 0.2, 0.7, nW.y + 0.5 );
		rock = mix( rock, ocLin( vec3( 0.74, 0.52, 0.3 ) ), lichen * 0.4 );
		vec3 cliff = mix( rock, rock * vec3( 0.86, 0.82, 0.8 ), smoothstep( 0.4, 0.8, ocNoise( vec2( p.x + p.y, y * 0.25 ) * 0.4 ) ) );
		// rock the sea reaches stays dark and wet
		float seaRock = smoothstep( 14.0, 1.5, y ) * 0.8 + smoothstep( 4.0, 1.2, y ) * 0.2;
		rock = mix( rock, rock * vec3( 0.55, 0.52, 0.5 ), seaRock );
		cliff = mix( cliff, cliff * vec3( 0.55, 0.52, 0.5 ), seaRock );
		// the intertidal shelf: bedded blocks split by joints, each block its own tone and tilt; mussels crowd the
		// joints low down, olive weed and pink coralline cover the lower blocks, and some blocks hold pools
		vec4 bk = ocBlocks( p );
		vec4 sf = ocFacet( vOcWorld + 13.0, nW, 0.7 );
		float near = smoothstep( 0.2, 0.05, px );
		vec3 shelf = mix( ocLin( vec3( 0.26, 0.23, 0.2 ) ), ocLin( vec3( 0.46, 0.41, 0.34 ) ), bk.y * 0.7 + sf.w * 0.3 );
		shelf = mix( shelf, ocLin( vec3( 0.42, 0.42, 0.4 ) ), step( 0.86, bk.y ) * 0.5 );
		float joint = 1.0 - ocEdge( 0.07 + 0.05 * bk.z, bk.x + ( ocNoise( p * 3.0 ) - 0.5 ) * 0.05 );
		float lowY = smoothstep( 1.0, -0.6, y );
		// mussels along the joints and on the seaward blocks
		float mus = ocEdge( 0.66, ocNoise( p * 2.6 + 1.0 ) * 0.75 + ( 1.0 - smoothstep( 0.0, 0.1, bk.x ) ) * 0.3 ) * lowY;
		shelf = mix( shelf, ocLin( vec3( 0.1, 0.11, 0.13 ) ), mus * 0.75 );
		// weed and coralline on whole blocks, ragged inside
		float wcov = smoothstep( 1.0, -0.8, y ) * 0.6;
		float weed = step( bk.w, wcov ) * ocEdge( 0.5, ocNoise( p * 1.9 + bk.zw * 9.0 ) * 0.7 + smoothstep( 0.0, 0.6, bk.x ) * 0.3 );
		shelf = mix( shelf, mix( ocLin( vec3( 0.27, 0.27, 0.15 ) ), ocLin( vec3( 0.36, 0.3, 0.17 ) ), bk.z ), weed * 0.8 );
		shelf = mix( shelf, ocLin( vec3( 0.66, 0.46, 0.48 ) ), smoothstep( -0.7, -1.4, y ) * step( 0.5, bk.z ) * 0.55 );
		shelf *= 1.0 - 0.3 * joint * near;
		// pools: whole blocks of water (only out of the sea), with ragged rims
		float poolEdge = bk.x + ( ocNoise( p * 2.2 ) - 0.5 ) * 0.35;
		float pool = ocEdge( 0.28, poolEdge ) * step( bk.z, 0.13 ) * step( uSeaLevel + 0.12, y ) * smoothstep( 1.9, 1.0, y ) * wb.z;
		// each block tilts a little, for the knife
		ocFacetT.xz += ( vec2( bk.w, bk.z ) - 0.5 ) * 0.7 * wb.z * ( 1.0 - pool );
		// earth, trodden floors and the cave: dust over rubble, each stone its own tone, darker in the cracks
		vec3 earth = mix( ocLin( vec3( 0.54, 0.43, 0.31 ) ), ocLin( vec3( 0.44, 0.34, 0.25 ) ), drift );
		if ( wb.w > 0.02 ) {
			vec4 st = ocFacet( vOcWorld, vec3( 0.0, 1.0, 0.0 ), 0.42 );
			vec4 bl = ocFacet( vOcWorld + 7.1, vec3( 0.0, 1.0, 0.0 ), 1.3 );
			float stone = smoothstep( 0.35, 0.75, ocNoise( p * 0.45 + 3.3 ) );
			vec3 rub = mix( ocLin( vec3( 0.47, 0.38, 0.29 ) ), ocLin( vec3( 0.66, 0.55, 0.42 ) ), st.w );
			rub = mix( rub, ocLin( vec3( 0.5, 0.48, 0.45 ) ), step( 0.82, st.w ) * 0.7 );
			earth = mix( earth * ( 0.86 + 0.28 * bl.w ), rub, stone * 0.75 );
			earth *= 0.92 + 0.16 * fine;
			// the cave floor is a midden: trodden dark, shell grit and bits of bone, ash and charcoal round the
			// hearths, a smear of ground ochre here and there
			vec2 cRel = p - uCave.xy;
			float ca = dot( cRel, uCave.zw );
			float cb = cRel.x * uCave.w - cRel.y * uCave.z;
			float inCave = ( 1.0 - smoothstep( 2.0, 6.0, ca ) ) * smoothstep( - uCave2.y - 3.0, - uCave2.y, ca ) * ( 1.0 - smoothstep( uCave2.z - 1.0, uCave2.z + 2.0, abs( cb ) ) );
			if ( inCave > 0.01 ) {
				vec3 mid = earth * vec3( 0.82, 0.78, 0.74 );
				// grit, not spatter: fine flecks, low contrast, thickest where people sit near the walls
				float gritK = 0.25 + 0.2 * smoothstep( 4.0, 9.0, abs( cb ) );
				float shellA = ocEdge( 0.8, ocNoise( p * 23.0 ) * 0.6 + ocNoise( p * 57.0 ) * 0.4 );
				float shellB = ocEdge( 0.82, ocNoise( p * 37.0 + 4.0 ) * 0.6 + ocNoise( p * 83.0 ) * 0.4 );
				mid = mix( mid, ocLin( vec3( 0.76, 0.71, 0.62 ) ), shellA * gritK );
				mid = mix( mid, ocLin( vec3( 0.56, 0.54, 0.55 ) ), shellB * gritK );
				float dh = min( length( p - uHearths.xy ), length( p - uHearths.zw ) ) + ( ocNoise( p * 1.6 ) - 0.5 ) * 0.9;
				float ash = 1.0 - smoothstep( 0.8, 2.8, dh );
				mid = mix( mid, ocLin( vec3( 0.42, 0.4, 0.38 ) ), ash * 0.7 );
				float coal = ocEdge( 0.66, ocNoise( p * 13.0 + 3.0 ) * 0.7 + ocNoise( p * 31.0 ) * 0.3 ) * ( 1.0 - smoothstep( 0.5, 1.4, dh ) );
				mid = mix( mid, ocLin( vec3( 0.1, 0.08, 0.07 ) ), coal * 0.7 );
				float och = ocEdge( 0.8, ocNoise( p * 0.9 + 17.0 ) * 0.7 + ocNoise( p * 4.0 ) * 0.3 );
				mid = mix( mid, ocLin( vec3( 0.55, 0.27, 0.16 ) ), och * 0.26 );
				earth = mix( earth, mid, inCave );
			}
		}
		vec3 col = sand * wa.x + dune * wa.y + fyn * wa.z + grass * wa.w + rock * wb.x + cliff * wb.y + shelf * wb.z + earth * wb.w;
		// the far ranges: Table Mountain sandstone, grey and cool under dark fynbos
		float mtn = smoothstep( 1100.0, 2600.0, - p.y ) + smoothstep( 1500.0, 4000.0, abs( p.x ) ) * smoothstep( 300.0, 900.0, - p.y );
		col = mix( col, mix( ocLin( vec3( 0.36, 0.38, 0.33 ) ), ocLin( vec3( 0.55, 0.54, 0.5 ) ), wb.x + wb.y ), clamp( mtn, 0.0, 1.0 ) * 0.75 );
		// the red ochre seam in the gully
		float od = length( p - uOchre.xy );
		if ( od < uOchre.z ) {
			float seam = smoothstep( 0.55, 0.85, sin( y * 2.4 + ocNoise( p * 0.5 ) * 2.0 ) * 0.5 + 0.5 ) * ( 1.0 - smoothstep( uOchre.z * 0.5, uOchre.z, od ) );
			col = mix( col, ocLin( vec3( 0.61, 0.24, 0.13 ) ), seam * smoothstep( 0.2, 0.5, 1.0 - nW.y ) );
		}
		// wet: the swash zone and everything the sea covers, with a sheen of sky
		float wet = smoothstep( uSeaLevel + 1.1, uSeaLevel + 0.15, y );
		col = mix( col, col * vec3( 0.58, 0.6, 0.62 ), wet * ( 0.85 - 0.3 * wb.z ) );
		vec3 vv = normalize( uCamPos - vOcWorld );
		float grazing = pow( 1.0 - clamp( vv.y, 0.0, 1.0 ), 4.0 );
		totalEmissiveRadiance += uSkyAmb * grazing * wet * 0.35;
		// rain: puddles in the flat, trodden places, holding the sky
		if ( uWeather.y > 0.01 ) {
			float flatK = smoothstep( 0.94, 0.99, nW.y ) * ( wb.w + wa.x * 0.4 + wa.w * 0.3 ) * smoothstep( 0.6, 0.95, ocCaveSky( vOcWorld ) );
			float pud = smoothstep( 0.6, 0.7, ocNoise( p * 0.28 ) * 0.75 + ocNoise( p * 1.3 ) * 0.25 ) * flatK * smoothstep( 0.15, 0.6, uWeather.y );
			pool = max( pool, pud * 0.85 );
		}
		// the pools: clear water over the dark, weedy floor of the block, holding the sky only at a grazing look
		col = mix( col, col * vec3( 0.42, 0.52, 0.55 ) + ocLin( vec3( 0.03, 0.07, 0.08 ) ), pool );
		totalEmissiveRadiance += ( uSkyAmb * 0.75 + uKeyColor * 0.05 ) * pool * ( 0.06 + 0.55 * grazing * grazing );
		diffuseColor.rgb = col;
	}
`

const TERRAIN_NORMAL = /* glsl */ `
	{
		// bend the normal on rock so cliffs read as faceted stone
		vec4 wbn = vSplatB;
		float rk = clamp( wbn.x + wbn.y + wbn.z * 0.6, 0.0, 1.0 );
		if ( rk > 0.05 ) {
			vec3 gv = ( viewMatrix * vec4( ocFacetT.xyz, 0.0 ) ).xyz;
			normal = normalize( normal + gv * 0.5 * rk );
		}
	}
`

export type TerrainView = {
  root: Group
  material: MeshStandardMaterial
  update(camera: Camera): void
  dispose(): void
}

type Tile = { lods: Mesh[]; cx: number; cz: number }

/** the river valley carried on past the world's north edge (the far field has no stamps) */
function farRiver(x: number, z: number, h: number): number {
  if (z > -1000) return h
  const last = RIVER[RIVER.length - 1]
  const rx = (last?.x ?? 330) + Math.sin(z / 260) * 60
  const d = Math.abs(x - rx)
  const floor = 39 + (-1024 - z) * 0.03
  return Math.min(h, floor + Math.max(0, d - 22) * 0.52)
}

export function createTerrainView(world: WorldData, grid: TerrainGrid | null): TerrainView {
  const root = new Group()
  root.name = 'terrain'
  const N = GRID_N
  // a grid source: the real grid, or one sampled from heightAt (a stub world)
  let hArr: Float32Array
  let splat: { a: Uint8Array; b: Uint8Array }
  if (grid) {
    hArr = grid.h
    splat = buildSplat(grid)
  } else {
    hArr = new Float32Array(N * N)
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) hArr[iz * N + ix] = world.heightAt(-HALF + ix * CELL, -HALF + iz * CELL)
    splat = { a: new Uint8Array(N * N * 4).fill(0), b: new Uint8Array(N * N * 4).fill(0) }
    for (let i = 0; i < N * N; i++) splat.a[i * 4 + 2] = 255
  }
  const src: GridSource = { h: (ix, iz) => hArr[iz * N + ix] ?? 0, splat }

  const ochre = world.pois.find((p) => p.id === 'ochre-seam')
  const ochreU = { value: ochre ? new Vector4(ochre.x + 6, ochre.z, 9, 0) : new Vector4(0, 0, 0, 0) }
  const hs = world.pois.filter((p) => p.kind === 'hearth')
  const h0 = hs[0]
  const h1 = hs[1] ?? h0
  const hearthU = { value: new Vector4(h0?.x ?? -9999, h0?.z ?? -9999, h1?.x ?? -9999, h1?.z ?? -9999) }
  const material = new MeshStandardMaterial({ roughness: 0.92, metalness: 0 })
  patchPaint(material, { brush: 0.35, rim: 0.15 }, {
    key: 'terrain',
    vertexHead: TERRAIN_VERT_HEAD,
    vertexMain: TERRAIN_VERT_MAIN,
    fragmentHead: TERRAIN_FRAG_HEAD,
    albedo: TERRAIN_ALBEDO,
    normal: TERRAIN_NORMAL,
    uniforms: { uKeyDirT: LIGHT.uKeyDir, uOchre: ochreU, uHearths: hearthU },
  })

  // detail tiles
  const tiles: Tile[] = []
  const toIx = (x: number) => Math.round((x + HALF) / CELL)
  for (let z0 = DETAIL.z0; z0 < DETAIL.z1; z0 += TILE) {
    for (let x0 = DETAIL.x0; x0 < DETAIL.x1; x0 += TILE) {
      const lods: Mesh[] = []
      for (const lod of LODS) {
        const step = lod / CELL
        const geo = buildPatch(src, toIx(x0), toIx(z0), toIx(x0 + TILE), toIx(z0 + TILE), step, true)
        const m = new Mesh(geo, material)
        m.castShadow = lod === 2
        m.receiveShadow = true
        m.visible = false
        m.name = `terrain-${x0}-${z0}-${lod}`
        root.add(m)
        lods.push(m)
      }
      tiles.push({ lods, cx: x0 + TILE / 2, cz: z0 + TILE / 2 })
    }
  }

  // the rest of the world at 8 m, the detail region cut out
  {
    const step = 8 / CELL
    const geo = buildPatch(src, 0, 0, N - 1, N - 1, step, true)
    const index = geo.getIndex()
    const pos = geo.getAttribute('position')
    if (index) {
      const keep: number[] = []
      const arr = index.array
      for (let t = 0; t < arr.length; t += 3) {
        const a = arr[t] ?? 0
        const b = arr[t + 1] ?? 0
        const c = arr[t + 2] ?? 0
        const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3
        const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3
        if (cx > DETAIL.x0 && cx < DETAIL.x1 && cz > DETAIL.z0 && cz < DETAIL.z1) continue
        keep.push(a, b, c)
      }
      geo.setIndex(new BufferAttribute(new Uint32Array(keep), 1))
    }
    const m = new Mesh(geo, material)
    m.receiveShadow = true
    m.name = 'terrain-coarse'
    root.add(m)
  }

  // the far field: a tensor grid growing outward, the world square cut out
  {
    const base = createBaseField(world.seed)
    const coords: number[] = []
    let s = 64
    let v = HALF
    const outer: number[] = []
    while (v < 26000) {
      v += s
      outer.push(v)
      s *= 1.13
    }
    for (let i = outer.length - 1; i >= 0; i--) coords.push(-(outer[i] ?? 0))
    for (let c = -HALF; c <= HALF; c += 64) coords.push(c)
    for (const o of outer) coords.push(o)
    const n = coords.length
    const pos = new Float32Array(n * n * 3)
    const nor = new Float32Array(n * n * 3)
    const sa = new Uint8Array(n * n * 4)
    const sb = new Uint8Array(n * n * 4)
    const hf = (x: number, z: number) => farRiver(x, z, base.heightAt(x, z))
    for (let j = 0; j < n; j++) {
      const z = coords[j] ?? 0
      for (let i = 0; i < n; i++) {
        const x = coords[i] ?? 0
        const k = j * n + i
        const hv = hf(x, z)
        pos[k * 3] = x
        pos[k * 3 + 1] = hv
        pos[k * 3 + 2] = z
        const e = Math.max(8, Math.abs(x) * 0.01 + Math.abs(z) * 0.01)
        const dx = hf(x + e, z) - hf(x - e, z)
        const dz = hf(x, z + e) - hf(x, z - e)
        const nx = -dx / (2 * e)
        const nz = -dz / (2 * e)
        const len = Math.hypot(nx, 1, nz)
        nor[k * 3] = nx / len
        nor[k * 3 + 1] = 1 / len
        nor[k * 3 + 2] = nz / len
        const slope = Math.hypot(nx, nz)
        // the ranges: grey sandstone in the steeps, dark fynbos over the rest, grass only in the low valleys
        if (hv < 2.5) sa[k * 4] = 255
        else if (slope > 0.75) sb[k * 4 + 1] = 255
        else if (slope > 0.45 || hv > 420) {
          sb[k * 4] = 150
          sa[k * 4 + 2] = 105
        } else if (hv > 40 && hv < 120 && slope < 0.15) {
          // the inland grass, never a lawn: the veld runs through it
          sa[k * 4 + 3] = 150
          sa[k * 4 + 2] = 105
        } else sa[k * 4 + 2] = 255
      }
    }
    const idx: number[] = []
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const cx = ((coords[i] ?? 0) + (coords[i + 1] ?? 0)) / 2
        const cz = ((coords[j] ?? 0) + (coords[j + 1] ?? 0)) / 2
        if (Math.abs(cx) < HALF && Math.abs(cz) < HALF) continue
        const a = j * n + i
        const b = a + 1
        const c = a + n
        const d = c + 1
        idx.push(a, c, b, b, c, d)
      }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    geo.setAttribute('normal', new BufferAttribute(nor, 3))
    geo.setAttribute('aSplatA', new Uint8BufferAttribute(sa, 4, true))
    geo.setAttribute('aSplatB', new Uint8BufferAttribute(sb, 4, true))
    geo.setIndex(new BufferAttribute(new Uint32Array(idx), 1))
    geo.computeBoundingSphere()
    const m = new Mesh(geo, material)
    m.receiveShadow = false
    m.frustumCulled = false
    m.name = 'terrain-far'
    root.add(m)
  }

  const camPos = new Vector3()
  return {
    root,
    material,
    update(camera: Camera) {
      camPos.setFromMatrixPosition(camera.matrixWorld)
      const camH = Math.max(0, camPos.y - world.heightAt(camPos.x, camPos.z))
      const bias = camH * 0.8
      for (const t of tiles) {
        const d = Math.max(0, Math.hypot(camPos.x - t.cx, camPos.z - t.cz) - TILE * 0.6) + bias
        const lod = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : 2
        for (let k = 0; k < t.lods.length; k++) {
          const m = t.lods[k]
          if (m) m.visible = k === lod
        }
      }
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose()
      })
      material.dispose()
    },
  }
}
