/**
 * The terrain's meshes and its painted material: 2 m detail tiles round the playable coast (three LODs each,
 * skirted), an 8 m mesh for the rest of the world, and a far field out to the horizon (the base field's
 * coast running on west into headlands, and the mountain ranges to the north).
 */
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Sphere,
  Uint8BufferAttribute,
  Vector3,
  Vector4,
  type Camera,
} from 'three'
import type { Quality, WorldData } from '../contracts'
import { patchPaint } from '../render/paint'
import { LIGHT } from '../render/uniforms'
import { createBaseField, MAT, type TerrainGrid } from '../../world-gen/terrain'
import { CELL, GRID_N, HALF, RIVER } from '../../world-gen/layout'

const DETAIL = { x0: -640, x1: 640, z0: -768, z1: 512 } as const
const TILE = 256
const LODS = [2, 4, 8] as const
/** past the nearest edge of a tile: 2 m cells within the first distance, 4 m within the second, then 8 m */
const LOD_DIST: Record<Quality, readonly [number, number]> = { high: [120, 420], medium: [70, 300], low: [40, 220] }
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
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform vec3 uSunDir;
vec4 ocFacetT = vec4( 0.0 );
// small relief drawn rather than modelled (the shelf's ledges, mussels): the normal's lean, world space
vec3 ocBumpT = vec3( 0.0 );
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
// the shelf's bedding, in ledges. q is the strike frame (x along the beds, y across them, toward the sea), warped a
// little so nothing is ruled. Rows of beds 1.7 m wide step up or down 10-40 cm from one to the next (most step down
// toward the sea, a few are flush); along a row, joints cut it into blocks a few metres long, each a few cm proud
// or sunk. The heightfield can't hold relief this small, so it is drawn: the slope of each ledge's face, the rounded
// lip on top, the shadow the ledge throws over the bed below (from the key light's height), the damp at its foot
struct OcBed {
	vec2 tilt; // the surface normal's lean, world xz
	float lit; // 1 in the light, 0 in a ledge's shadow
	float foot; // near the foot of a ledge
	float lip; // on a ledge's rounded top edge
	float gapD; // metres to the nearest joint's crack
	float dj; // metres to the block's nearest edge
	float hollow; // 1 when the bed is lower than the rows either side
	vec3 id; // the block's hashes
};
const float OC_ROW = 1.7;
float ocRise( float r ) {
	float s = ocHash( vec2( r, 1.9 ) ) < 0.7 ? - 1.0 : 1.0;
	return s * ( 0.1 + 0.3 * ocHash( vec2( r, 2.7 ) ) ) * step( 0.15, ocHash( vec2( r, 5.5 ) ) );
}
float ocLift( float row, float qx ) {
	float len = 1.8 + 3.4 * ocHash( vec2( row, 3.1 ) );
	float col = floor( qx / len + ocHash( vec2( row, 7.7 ) ) );
	return ( ocHash( vec2( col, row ) + 6.1 ) - 0.5 ) * 0.12;
}
// one edge of the block: d metres away, dh the neighbour's height over this block's, n the way out, s the key
// light's way and v the way to the eye (strike frame, unit), cotE the light's elevation as a cotangent
void ocLedge( inout OcBed b, inout vec2 g, float d, float dh, vec2 n, vec2 s, vec2 v, float cotE ) {
	b.dj = min( b.dj, d );
	if ( dh > 0.0 ) {
		// under a ledge: its face is a steep band (only where it faces the eye: from above the ledge it is hidden
		// behind the lip), then the bed in its shadow, damp at the foot
		float w = dh * 0.5 * smoothstep( - 0.1, 0.25, dot( - n, v ) );
		float face = 1.0 - ocEdge( w, d );
		g += n * face * 1.9;
		b.lit = min( b.lit, ocEdge( clamp( dh * cotE * dot( s, n ), 0.0, 2.5 ), d ) );
		b.foot = max( b.foot, ( 1.0 - smoothstep( w, w + 0.5, d ) ) * smoothstep( 0.04, 0.2, dh ) );
		b.gapD = min( b.gapD, abs( d - w ) );
	} else {
		// on top of a ledge: the rounded lip falls away to the edge
		float lip = ( 1.0 - smoothstep( 0.0, 0.08, d ) ) * smoothstep( 0.03, 0.14, - dh );
		g -= n * lip * 1.3;
		b.lip = max( b.lip, lip );
		b.gapD = min( b.gapD, d - dh * 0.5 );
	}
}
OcBed ocBed( vec2 p, vec3 key, vec3 eye ) {
	OcBed b;
	b.lit = 1.0;
	b.foot = 0.0;
	b.lip = 0.0;
	b.gapD = 9.0;
	b.dj = 9.0;
	vec2 g = vec2( 0.0 );
	const vec2 AX = vec2( 0.91, 0.42 );
	const vec2 AY = vec2( - 0.42, 0.91 );
	vec2 q = vec2( dot( p, AX ), dot( p, AY ) );
	q += vec2( ocNoise( p * 0.11 ), ocNoise( p * 0.11 + 5.0 ) ) * 2.2 + vec2( ocNoise( p * 0.5 + 2.0 ), ocNoise( p * 0.5 + 9.0 ) ) * 0.35;
	float row = floor( q.y / OC_ROW );
	float fy = fract( q.y / OC_ROW );
	float len = 1.8 + 3.4 * ocHash( vec2( row, 3.1 ) );
	float qx = q.x / len + ocHash( vec2( row, 7.7 ) );
	vec2 id = vec2( floor( qx ), row );
	float fx = fract( qx );
	float me = ( ocHash( id + 6.1 ) - 0.5 ) * 0.12;
	vec2 kq = vec2( dot( key.xz, AX ), dot( key.xz, AY ) );
	float kl = length( kq );
	vec2 s = kq / max( kl, 1e-4 );
	float cotE = kl / max( key.y, 0.06 );
	vec2 v = vec2( dot( eye.xz, AX ), dot( eye.xz, AY ) );
	v /= max( length( v ), 1e-4 );
	float up = ocRise( row ) + ocLift( row + 1.0, q.x ) - me;
	float dn = - ocRise( row - 1.0 ) + ocLift( row - 1.0, q.x ) - me;
	ocLedge( b, g, ( 1.0 - fy ) * OC_ROW, up, vec2( 0.0, 1.0 ), s, v, cotE );
	ocLedge( b, g, fy * OC_ROW, dn, vec2( 0.0, - 1.0 ), s, v, cotE );
	ocLedge( b, g, fx * len, ( ocHash( id + vec2( - 1.0, 0.0 ) + 6.1 ) - 0.5 ) * 0.12 - me, vec2( - 1.0, 0.0 ), s, v, cotE );
	ocLedge( b, g, ( 1.0 - fx ) * len, ( ocHash( id + vec2( 1.0, 0.0 ) + 6.1 ) - 0.5 ) * 0.12 - me, vec2( 1.0, 0.0 ), s, v, cotE );
	b.hollow = step( 0.06, up ) * step( 0.06, dn );
	b.id = vec3( ocHash( id + 1.3 ), ocHash( id + 8.9 ), ocHash( id + 4.2 ) );
	// each block lies a little off level
	g += ( b.id.zy - 0.5 ) * 0.14;
	// the normal leans away from the uphill way
	b.tilt = - ( g.x * AX + g.y * AY );
	return b;
}
// a mussel bed: shells crowded every which way, each a small dome. xy the normal's lean (world xz), z cover
// (0 in the black gaps between shells), w the shell's tone
vec4 ocMussels( vec2 p ) {
	vec2 gp = p / 0.07;
	vec2 i = floor( gp );
	vec2 f = fract( gp );
	float best = 1.0;
	vec4 o = vec4( 0.0 );
	for ( int y = - 1; y <= 1; y ++ ) {
		for ( int x = - 1; x <= 1; x ++ ) {
			vec2 c = vec2( float( x ), float( y ) );
			vec2 r = f - ( c + 0.15 + 0.7 * ocHash2( i + c ) );
			float a = ocHash( i + c + 3.3 ) * 6.2832;
			vec2 ax = vec2( cos( a ), sin( a ) );
			vec2 l = vec2( dot( r, ax ), dot( r, vec2( - ax.y, ax.x ) ) ) / vec2( 0.66, 0.38 );
			float rr = dot( l, l );
			if ( rr < best ) {
				best = rr;
				vec2 lean = ( l.x / 0.66 ) * ax + ( l.y / 0.38 ) * vec2( - ax.y, ax.x );
				o = vec4( lean * 0.55, 1.0, ocHash( i + c + 9.7 ) );
			}
		}
	}
	o.z = 1.0 - smoothstep( 0.72, 1.0, best );
	return o;
}
// the sky as still water mirrors it: the dome's gradient and the glow round the sun
vec3 ocSkyMirror( vec3 d ) {
	float up = clamp( d.y, 0.0, 1.0 );
	vec3 c = mix( uHorizon, uZenith, pow( up, 0.5 ) );
	float m = max( dot( d, uSunDir ), 0.0 );
	return c + uSunGlow * ( pow( m, 6.0 ) * 0.3 + pow( m, 40.0 ) * 0.8 ) * smoothstep( - 0.2, 0.05, uSunDir.y );
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
		// the intertidal shelf: pale, dry calcarenite on the high beds, damp and darker low down, stepping to the sea in
		// ledges; weed and sea lettuce at the ledges' feet and on the low beds, mussels crowded in blue-black beds
		// lowest, pink coralline at the bottom, pools in the hollow beds holding the sky
		vec3 shelf = vec3( 0.0 );
		float weed = 0.0;
		float mus = 0.0;
		float pool = 0.0;
		float near = smoothstep( 0.2, 0.05, px );
		if ( wb.z > 0.01 ) {
			OcBed bd = ocBed( p, uKeyDirT, uCamPos - vOcWorld );
			float hi = smoothstep( - 0.3, 1.8, y );
			vec3 dry = mix( ocLin( vec3( 0.6, 0.55, 0.46 ) ), ocLin( vec3( 0.69, 0.63, 0.52 ) ), bd.id.x );
			vec3 damp = mix( ocLin( vec3( 0.35, 0.33, 0.29 ) ), ocLin( vec3( 0.43, 0.4, 0.34 ) ), bd.id.x );
			shelf = mix( damp, dry, hi );
			// broken colour within each bed, and the grain of the bedding along it
			shelf *= 0.88 + 0.2 * ocNoise( p * 1.4 + bd.id.yz * 7.0 ) + 0.06 * ocNoise( vec2( dot( p, vec2( 0.91, 0.42 ) ) * 0.6, dot( p, vec2( - 0.42, 0.91 ) ) * 6.0 ) );
			// the lips dry and pale, the feet damp and dark
			shelf = mix( shelf, shelf * 1.2 + ocLin( vec3( 0.05, 0.045, 0.04 ) ), bd.lip * 0.8 );
			shelf *= 1.0 - 0.22 * bd.foot;
			// pits weathered into the high beds, a grey crust of barnacles in the middle zone
			float pit = ocEdge( 0.78, ocNoise( p * 15.0 + 3.0 ) * 0.7 + ocNoise( p * 37.0 ) * 0.3 ) * hi * near;
			shelf *= 1.0 - 0.22 * pit;
			float barn = ocEdge( 0.62, ocNoise( p * 17.0 + 1.0 ) * 0.6 + ocNoise( p * 0.8 + 4.0 ) * 0.4 ) * smoothstep( - 0.4, 0.4, y ) * smoothstep( 1.6, 0.8, y );
			shelf = mix( shelf, ocLin( vec3( 0.62, 0.61, 0.57 ) ), barn * 0.45 );
			// weed: brown and olive wrack in a broken fringe along each ledge's foot, spreading over the beds lowest down;
			// a little sea lettuce at the water
			float low = smoothstep( 0.4, - 1.0, y );
			weed = ocEdge( 0.66, ocNoise( p * 3.0 + bd.id.yz * 5.0 ) * 0.4 + ocNoise( p * 9.0 ) * 0.15 + bd.foot * 0.55 * smoothstep( 1.6, 0.2, y ) + low * 0.4 );
			vec3 wrack = mix( ocLin( vec3( 0.29, 0.26, 0.14 ) ), ocLin( vec3( 0.36, 0.28, 0.16 ) ), bd.id.y );
			shelf = mix( shelf, wrack * ( 0.85 + 0.3 * ocNoise( p * 13.0 ) ), weed * 0.85 );
			float ulva = ocEdge( 0.8, ocNoise( p * 3.1 + 7.0 ) * 0.7 + ocNoise( p * 11.0 ) * 0.3 ) * smoothstep( - 0.4, - 1.2, y );
			shelf = mix( shelf, ocLin( vec3( 0.27, 0.37, 0.15 ) ), ulva * 0.6 );
			shelf = mix( shelf, ocLin( vec3( 0.66, 0.46, 0.48 ) ), smoothstep( - 0.7, - 1.4, y ) * step( 0.5, bd.id.y ) * 0.5 * ( 1.0 - weed ) );
			// the joints: thin cracks in shadow
			float gapW = 0.011 + 0.012 * bd.id.z;
			float gap = 1.0 - ocEdge( gapW, bd.gapD + ( ocNoise( p * 3.0 ) - 0.5 ) * 0.03 );
			vec2 lean = bd.tilt;
			// mussels in clustered beds, low down, thickest along the joints and at the ledges' feet
			float mz = smoothstep( 0.55, - 0.25, y );
			if ( mz > 0.01 ) {
				mus = ocEdge( 0.62, ocNoise( p * 1.2 + 5.0 ) * 0.55 + ocNoise( p * 4.1 ) * 0.2 + bd.foot * 0.3 + ( 1.0 - smoothstep( 0.0, 0.35, bd.gapD ) ) * 0.25 ) * mz;
				if ( mus > 0.01 ) {
					float crisp = smoothstep( 0.035, 0.012, px );
					vec4 ms = ocMussels( p );
					vec3 shell = mix( ocLin( vec3( 0.07, 0.08, 0.11 ) ), ocLin( vec3( 0.15, 0.17, 0.22 ) ), ms.w );
					vec3 bed = mix( ocLin( vec3( 0.03, 0.03, 0.035 ) ), shell, mix( 0.8, ms.z, crisp ) );
					shelf = mix( shelf, bed, mus );
					lean = mix( lean, ms.xy * ms.z, mus * crisp );
				}
			}
			shelf *= 1.0 - 0.6 * gap * ( 1.0 - mus );
			// pools: the hollow beds and a few others hold water, out of the sea, with ragged rims
			float poolEdge = bd.dj + ( ocNoise( p * 2.2 ) - 0.5 ) * 0.35;
			pool = ocEdge( 0.3, poolEdge ) * max( bd.hollow * step( bd.id.z, 0.55 ), step( bd.id.z, 0.08 ) ) * step( uSeaLevel + 0.12, y ) * smoothstep( 1.9, 1.0, y );
			lean *= 1.0 - pool;
			ocBumpT = vec3( lean.x, 0.0, lean.y ) * wb.z;
			// light bounced off the sunlit rock round it keeps a ledge's shadow from going black
			ocKeyOcc = mix( 1.0, 0.35 + 0.65 * bd.lit, wb.z * ( 1.0 - pool ) );
			pool *= wb.z;
		}
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
				// ash spread round each hearth: pale grey powder, darker toward the stones, kicked out in tongues
				float ash = ( 1.0 - smoothstep( 0.9, 2.7, dh ) ) * smoothstep( 0.25, 0.6, ocNoise( p * 2.6 + 1.0 ) * 0.45 + ( 1.0 - smoothstep( 0.9, 2.7, dh ) ) * 0.6 );
				mid = mix( mid, ocLin( vec3( 0.52, 0.5, 0.48 ) ), ash * 0.75 );
				mid = mix( mid, ocLin( vec3( 0.3, 0.29, 0.28 ) ), ( 1.0 - smoothstep( 0.55, 1.3, dh ) ) * 0.75 );
				// the fire's bed inside the stones: charcoal black, so the coals glow out of it
				float bed = min( length( p - uHearths.xy ), length( p - uHearths.zw ) );
				mid = mix( mid, ocLin( vec3( 0.06, 0.05, 0.045 ) ), ( 1.0 - smoothstep( 0.3, 0.62, bed + ( ocNoise( p * 6.0 ) - 0.5 ) * 0.12 ) ) * 0.92 );
				float coal = ocEdge( 0.66, ocNoise( p * 13.0 + 3.0 ) * 0.7 + ocNoise( p * 31.0 ) * 0.3 ) * ( 1.0 - smoothstep( 0.5, 1.4, dh ) );
				mid = mix( mid, ocLin( vec3( 0.1, 0.08, 0.07 ) ), coal * 0.7 );
				float och = ocEdge( 0.8, ocNoise( p * 0.9 + 17.0 ) * 0.7 + ocNoise( p * 4.0 ) * 0.3 );
				mid = mix( mid, ocLin( vec3( 0.55, 0.27, 0.16 ) ), och * 0.26 );
				earth = mix( earth, mid, inCave );
				// gentle unevenness: trodden hollows and low rises, drawn (darker in the hollows)
				vec2 eq = p * 0.7;
				float e0 = ocNoise( eq );
				vec2 eg = vec2( ocNoise( eq + vec2( 0.05, 0.0 ) ) - e0, ocNoise( eq + vec2( 0.0, 0.05 ) ) - e0 ) / 0.05 * 0.7 * 0.24;
				vec2 fq = p * 2.4 + 5.0;
				float f0 = ocNoise( fq );
				eg += vec2( ocNoise( fq + vec2( 0.05, 0.0 ) ) - f0, ocNoise( fq + vec2( 0.0, 0.05 ) ) - f0 ) / 0.05 * 2.4 * 0.025;
				ocBumpT += vec3( - eg.x, 0.0, - eg.y ) * inCave;
				earth *= 1.0 - ( 0.1 - 0.2 * e0 ) * inCave;
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
		// wet: the swash zone and everything the sea covers; the shelf dark and glossy for 2 m above the water, and
		// below the high-water line it never quite dries, its weed and mussels glistening
		float wet = smoothstep( uSeaLevel + 1.1, uSeaLevel + 0.15, y );
		wet = max( wet, wb.z * smoothstep( uSeaLevel + 2.0, uSeaLevel + 1.0, y ) );
		wet = max( wet, wb.z * smoothstep( 1.4, - 0.6, y ) * ( 0.4 + 0.35 * weed + 0.25 * mus ) );
		col = mix( col, col * vec3( 0.5, 0.52, 0.55 ), wet * 0.85 );
		vec3 vv = normalize( uCamPos - vOcWorld );
		// wet ground mirrors the sky, blurred, most at a grazing look; wet rock glints in each light
		vec3 nB = normalize( nW + ocBumpT );
		float fr = pow( 1.0 - clamp( dot( vv, nB ), 0.0, 1.0 ), 5.0 );
		totalEmissiveRadiance += mix( uSkyAmb, ocSkyMirror( reflect( - vv, nB ) ), 0.6 ) * wet * ( 0.03 + 0.28 * fr ) * ocCaveSky( vOcWorld );
		ocSheen = wet * wb.z * ( 0.5 + 0.5 * mus ) * 0.6;
		// rain: puddles in the flat, trodden places, holding the sky
		if ( uWeather.y > 0.01 ) {
			float flatK = smoothstep( 0.94, 0.99, nW.y ) * ( wb.w + wa.x * 0.4 + wa.w * 0.3 ) * smoothstep( 0.6, 0.95, ocCaveSky( vOcWorld ) );
			float pud = smoothstep( 0.6, 0.7, ocNoise( p * 0.28 ) * 0.75 + ocNoise( p * 1.3 ) * 0.25 ) * flatK * smoothstep( 0.15, 0.6, uWeather.y );
			pool = max( pool, pud * 0.85 );
		}
		// pools: clear water over the dark floor of the bed, mirroring the sky, more of it the flatter the look
		if ( pool > 0.001 ) {
			vec2 rip = ( vec2( ocNoise( p * 3.0 + uTime * 0.35 ), ocNoise( p * 3.0 - uTime * 0.3 + 3.0 ) ) - 0.5 ) * 0.05;
			vec3 pn = normalize( vec3( rip.x, 1.0, rip.y ) );
			float pf = 0.02 + 0.98 * pow( 1.0 - clamp( dot( vv, pn ), 0.0, 1.0 ), 5.0 );
			col = mix( col, ( col * vec3( 0.42, 0.52, 0.55 ) + ocLin( vec3( 0.03, 0.07, 0.08 ) ) ) * ( 1.0 - pf ), pool );
			totalEmissiveRadiance += ocSkyMirror( reflect( - vv, pn ) ) * pf * pool * ocCaveSky( vOcWorld );
			ocSheen = max( ocSheen, pool );
		}
		diffuseColor.rgb = col;
	}
`

const TERRAIN_NORMAL = /* glsl */ `
	{
		// bend the normal on rock so cliffs read as faceted stone
		vec4 wbn = vSplatB;
		float rk = clamp( wbn.x + wbn.y + wbn.z * 0.15, 0.0, 1.0 );
		if ( rk > 0.05 ) {
			vec3 gv = ( viewMatrix * vec4( ocFacetT.xyz, 0.0 ) ).xyz;
			normal = normalize( normal + gv * 0.5 * rk );
		}
		// the drawn relief
		normal = normalize( normal + ( viewMatrix * vec4( ocBumpT, 0.0 ) ).xyz );
	}
`

export type TerrainView = {
  root: Group
  material: MeshStandardMaterial
  update(camera: Camera, quality: Quality): void
  dispose(): void
}

/** a detail tile: per LOD its meshes (the finer levels in quarters, so the camera and the shadow box cull them) */
type Tile = { lods: Mesh[][]; cx: number; cz: number; quads: { x: number; z: number }[] }

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
    uniforms: {
      uKeyDirT: LIGHT.uKeyDir,
      uOchre: ochreU,
      uHearths: hearthU,
      uZenith: LIGHT.uZenith,
      uHorizon: LIGHT.uHorizon,
      uSunGlow: LIGHT.uSunGlow,
      uSunDir: LIGHT.uSunDir,
    },
  })

  // detail tiles
  const tiles: Tile[] = []
  const toIx = (x: number) => Math.round((x + HALF) / CELL)
  for (let z0 = DETAIL.z0; z0 < DETAIL.z1; z0 += TILE) {
    for (let x0 = DETAIL.x0; x0 < DETAIL.x1; x0 += TILE) {
      const lods: Mesh[][] = []
      for (const lod of LODS) {
        const step = lod / CELL
        const parts: Mesh[] = []
        const n = lod === 8 ? 1 : 2
        const sub = TILE / n
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const sx = x0 + i * sub
            const sz = z0 + j * sub
            const geo = buildPatch(src, toIx(sx), toIx(sz), toIx(sx + sub), toIx(sz + sub), step, true)
            const m = new Mesh(geo, material)
            // the 8 m level is far enough out that its shadows fall outside the shadow box
            m.castShadow = lod !== 8
            m.receiveShadow = true
            m.visible = false
            m.name = `terrain-${sx}-${sz}-${lod}`
            root.add(m)
            parts.push(m)
          }
        }
        lods.push(parts)
      }
      const quads = [0, 1, 2, 3].map((i) => ({ x: x0 + ((i % 2) + 0.5) * (TILE / 2), z: z0 + (Math.floor(i / 2) + 0.5) * (TILE / 2) }))
      tiles.push({ lods, cx: x0 + TILE / 2, cz: z0 + TILE / 2, quads })
    }
  }

  // the rest of the world at 8 m, the detail region cut out, in 512 m squares so the ones out of view are culled;
  // the deep seabed far out under opaque water is left out
  {
    const step = 8 / CELL
    const h = (N - 1) / 4
    for (let qz = 0; qz < N - 1; qz += h) {
      for (let qx = 0; qx < N - 1; qx += h) {
        const geo = buildPatch(src, qx, qz, qx + h, qz + h, step, true)
        const index = geo.getIndex()
        const pos = geo.getAttribute('position')
        if (!index) continue
        const keep: number[] = []
        const arr = index.array
        for (let t = 0; t < arr.length; t += 3) {
          const a = arr[t] ?? 0
          const b = arr[t + 1] ?? 0
          const c = arr[t + 2] ?? 0
          const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3
          const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3
          if (cx > DETAIL.x0 && cx < DETAIL.x1 && cz > DETAIL.z0 && cz < DETAIL.z1) continue
          if (Math.max(pos.getY(a), pos.getY(b), pos.getY(c)) < -12) continue
          keep.push(a, b, c)
        }
        if (keep.length === 0) {
          geo.dispose()
          continue
        }
        geo.setIndex(new BufferAttribute(new Uint32Array(keep), 1))
        // bounds round what is kept, not the whole square
        let x0 = Infinity
        let y0 = Infinity
        let z0 = Infinity
        let x1 = -Infinity
        let y1 = -Infinity
        let z1 = -Infinity
        for (const v of keep) {
          x0 = Math.min(x0, pos.getX(v))
          y0 = Math.min(y0, pos.getY(v))
          z0 = Math.min(z0, pos.getZ(v))
          x1 = Math.max(x1, pos.getX(v))
          y1 = Math.max(y1, pos.getY(v))
          z1 = Math.max(z1, pos.getZ(v))
        }
        const box = new Box3(new Vector3(x0, y0, z0), new Vector3(x1, y1, z1))
        geo.boundingBox = box
        geo.boundingSphere = box.getBoundingSphere(new Sphere())
        const m = new Mesh(geo, material)
        m.receiveShadow = true
        m.name = `terrain-coarse-${qx}-${qz}`
        root.add(m)
      }
    }
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
    update(camera: Camera, quality: Quality) {
      const ld = LOD_DIST[quality]
      camPos.setFromMatrixPosition(camera.matrixWorld)
      const camH = Math.max(0, camPos.y - world.heightAt(camPos.x, camPos.z))
      const bias = camH * 0.8
      const near = (x: number, z: number, size: number) => Math.max(0, Math.hypot(camPos.x - x, camPos.z - z) - size * 0.6) + bias
      for (const t of tiles) {
        const far = near(t.cx, t.cz, TILE) >= ld[1]
        for (let k = 0; k < t.lods.length; k++) {
          const parts = t.lods[k] ?? []
          for (let i = 0; i < parts.length; i++) {
            const m = parts[i]
            if (!m) continue
            // the 2 m and 4 m levels are picked per quarter, so only the quarters round the camera are fine
            const q = t.quads[i]
            const lod = far ? 2 : q && near(q.x, q.z, TILE / 2) < ld[0] ? 0 : 1
            m.visible = k === lod
            // the 4 m level casts only on high
            m.castShadow = k === 0 || (k === 1 && quality === 'high')
          }
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
