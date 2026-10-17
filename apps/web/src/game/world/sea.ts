/**
 * The sea (the hero): a polar grid that rides with the camera, Gerstner swells that shoal and die in the
 * shallows, turquoise over sand, teal and deep blue beyond, the sky in its reflections, the sun's path in
 * sparkles, and painted foam: lace at the waterline and breaking bands that march in toward the shore. The
 * lagoon and the river use the same shader, calm and tea-green.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DataUtils,
  DoubleSide,
  FrontSide,
  HalfFloatType,
  LinearFilter,
  Mesh,
  RedFormat,
  RGFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
} from 'three'
import type { WeatherState, WorldData } from '../contracts'
import { NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL } from '../render/glsl'
import { LIGHT } from '../render/uniforms'
import { CELL, GRID_N, HALF, LAGOON, LAGOON_LEVEL } from '../../world-gen/layout'
import { distanceTransform } from '../../world-gen/shore'
import { FRESH_NONE, type TerrainGrid } from '../../world-gen/terrain'

const SHORE_TEX = 513

/** the height grid as a half-float texture, and the water-side distance to land with the fresh-water mask */
function buildTextures(world: WorldData, grid: TerrainGrid | null): { height: DataTexture; shore: DataTexture } {
  const N = GRID_N
  const hdata = new Uint16Array(N * N)
  const harr = grid?.h
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const i = iz * N + ix
      const hv = harr ? (harr[i] ?? 0) : world.heightAt(-HALF + ix * CELL, -HALF + iz * CELL)
      hdata[i] = DataUtils.toHalfFloat(hv)
    }
  }
  const height = new DataTexture(hdata, N, N, RedFormat, HalfFloatType)
  height.magFilter = LinearFilter
  height.minFilter = LinearFilter
  height.needsUpdate = true

  const S = SHORE_TEX
  const stride = (N - 1) / (S - 1)
  const land = new Uint8Array(S * S)
  const fresh = new Uint8Array(S * S)
  for (let iz = 0; iz < S; iz++) {
    for (let ix = 0; ix < S; ix++) {
      const gi = iz * stride * N + ix * stride
      const hv = harr ? (harr[gi] ?? 0) : world.heightAt(-HALF + ix * stride * CELL, -HALF + iz * stride * CELL)
      const fl = grid ? (grid.fresh[gi] ?? FRESH_NONE) : FRESH_NONE
      land[iz * S + ix] = hv > 0 && fl === FRESH_NONE ? 1 : 0
      fresh[iz * S + ix] = fl !== FRESH_NONE ? 1 : 0
    }
  }
  const dist = distanceTransform(land, S, stride * CELL)
  const sdata = new Uint16Array(S * S * 2)
  for (let i = 0; i < S * S; i++) {
    sdata[i * 2] = DataUtils.toHalfFloat(dist[i] ?? 0)
    sdata[i * 2 + 1] = DataUtils.toHalfFloat(fresh[i] ?? 0)
  }
  const shore = new DataTexture(sdata, S, S, RGFormat, HalfFloatType)
  shore.magFilter = LinearFilter
  shore.minFilter = LinearFilter
  shore.needsUpdate = true
  return { height, shore }
}

const VERT = /* glsl */ `
uniform sampler2D tHeight;
uniform sampler2D tShore;
uniform float uFresh;
uniform vec3 uCenter;
uniform float uLevel;
uniform float uTime;
uniform float uWaveK;
uniform float uHalf;
varying vec3 vWorld;
varying float vWaveH;
varying float vRush;
vec2 ocUv( vec2 xz ) { return ( xz + uHalf ) / ( 2.0 * uHalf ); }
// Gerstner swells rolling in from the south-west
vec3 ocWave( vec2 p, vec2 dir, float len, float amp, float t ) {
	float k = 6.2831853 / len;
	float c = sqrt( 9.8 / k );
	float f = k * ( dot( dir, p ) - c * t );
	float q = 0.55 / ( k * amp * 4.0 + 1e-4 );
	q = min( q, 1.0 );
	return vec3( dir.x * q * amp * cos( f ), amp * sin( f ), dir.y * q * amp * cos( f ) );
}
void main() {
	vec3 wp = vec3( position.x + uCenter.x, uLevel, position.z + uCenter.z );
	float ground = texture2D( tHeight, ocUv( wp.xz ) ).r;
	float depth = uLevel - ground;
	float dist = length( position.xz );
	vRush = 0.0;
	// the surge: each swell runs up over the rocks and the sand, quick, and drains back slowly; every set its own
	// height, the coast never all at once
	if ( uFresh < 0.5 ) {
		float sd = texture2D( tShore, ocUv( wp.xz ) ).r;
		float ph = uTime / 10.5 - sd / 28.0 + sin( wp.x * 0.013 + wp.z * 0.007 ) * 1.3;
		float f = fract( ph );
		float set_ = 0.35 + 0.65 * fract( sin( floor( ph ) * 12.9898 + floor( wp.x / 90.0 ) * 4.1 ) * 43758.5453 );
		float surge = smoothstep( 0.0, 0.12, f ) * ( 1.0 - smoothstep( 0.12, 0.62, f ) ) * set_;
		float nearK = 1.0 - smoothstep( 4.0, 30.0, sd );
		wp.y += surge * 0.32 * uWaveK * nearK;
		// the uprush is white, churned water; it clears as it drains
		vRush = surge * ( 1.0 - smoothstep( 0.1, 0.4, f ) ) * nearK;
		depth = wp.y - ground;
	}
	float amp = smoothstep( 0.0, 4.0, depth ) * ( 1.0 - smoothstep( 120.0, 700.0, dist ) ) * uWaveK;
	vec3 w = ocWave( wp.xz, normalize( vec2( -0.18, -1.0 ) ), 41.0, 0.34, uTime );
	w += ocWave( wp.xz, normalize( vec2( 0.3, -1.0 ) ), 23.0, 0.17, uTime );
	w += ocWave( wp.xz, normalize( vec2( -0.5, -0.86 ) ), 13.0, 0.09, uTime );
	w += ocWave( wp.xz, normalize( vec2( 0.12, -1.0 ) ), 7.3, 0.045, uTime );
	wp += w * amp;
	vWaveH = w.y * amp;
	vWorld = wp;
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`

const FRAG = /* glsl */ `
uniform sampler2D tHeight;
uniform sampler2D tShore;
uniform float uLevel;
uniform float uHalf;
uniform vec3 uCamPos;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uSkyAmb;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform float uFresh;
uniform float uFoamK;
varying vec3 vWorld;
varying float vWaveH;
varying float vRush;
${SKY_UNIFORMS_GLSL}
${NOISE_GLSL}
${SKY_GLSL}
vec2 ocUv( vec2 xz ) { return ( xz + uHalf ) / ( 2.0 * uHalf ); }
void main() {
	vec2 uv = ocUv( vWorld.xz );
	vec2 sh = texture2D( tShore, uv ).rg;
	if ( uFresh < 0.5 && sh.g > 0.5 ) discard;
	float ground = texture2D( tHeight, uv ).r;
	float depth = vWorld.y - ground;
	vec3 toCam = uCamPos - vWorld;
	float camDist = length( toCam );
	vec3 V = toCam / camDist;
	// the surface normal: swells from the screen-space slope, ripples from scrolling noise
	vec3 dx = dFdx( vWorld );
	vec3 dy = dFdy( vWorld );
	vec3 N = normalize( cross( dy, dx ) );
	if ( N.y < 0.0 ) N = - N;
	float far = smoothstep( 40.0, 900.0, camDist );
	vec2 rp = vWorld.xz * 0.35 + uTime * vec2( 0.05, -0.11 );
	vec2 rp2 = vWorld.xz * 0.9 - uTime * vec2( 0.13, 0.04 );
	float e = 0.12;
	float r0 = ocNoise( rp ) + 0.5 * ocNoise( rp2 );
	float rx = ocNoise( rp + vec2( e, 0.0 ) ) + 0.5 * ocNoise( rp2 + vec2( e, 0.0 ) );
	float rz = ocNoise( rp + vec2( 0.0, e ) ) + 0.5 * ocNoise( rp2 + vec2( 0.0, e ) );
	vec3 rip = vec3( r0 - rx, 0.0, r0 - rz ) / e;
	// rain roughens the surface into a dimpled grey
	float rainK = uWeather.y;
	if ( rainK > 0.01 ) {
		vec2 dp = vWorld.xz * 3.1 + uTime * vec2( 0.7, - 1.9 );
		float d0 = ocNoise( dp );
		rip += vec3( d0 - ocNoise( dp + vec2( 0.08, 0.0 ) ), 0.0, d0 - ocNoise( dp + vec2( 0.0, 0.08 ) ) ) / 0.08 * 0.35 * rainK * ( 1.0 - far );
	}
	N = normalize( N + rip * mix( 0.16, 0.05, far ) * ( uFresh > 0.5 ? 0.4 : 1.0 ) * ( 1.0 + rainK * 0.8 ) );
	N = normalize( mix( N, vec3( 0.0, 1.0, 0.0 ), far * 0.6 ) );
	float ndv = max( dot( N, V ), 0.0 );
	float fres = 0.02 + 0.98 * pow( 1.0 - ndv, 5.0 );
	// a painter's sea keeps its colour at a grazing look: the sky only ever takes part of it
	fres = min( fres, 0.5 );
	vec3 R = reflect( - V, N );
	R.y = abs( R.y );
	vec3 refl = ocSkyBase( normalize( R ) );
	vec4 cl = ocClouds( normalize( R ) );
	refl = mix( refl, cl.rgb, cl.a * 0.8 );
	// body colour by depth: turquoise over sand, teal, then deep blue; quantised a little, like paint
	float dd = depth / max( V.y, 0.25 );
	float b1 = 1.0 - exp( - dd * 0.55 );
	float b2 = 1.0 - exp( - max( depth - 1.5, 0.0 ) * 0.08 );
	b1 = mix( b1, floor( b1 * 5.0 + 0.5 ) / 5.0, 0.3 );
	vec3 body = mix( uShallow, uMid, b1 );
	body = mix( body, uDeep, b2 );
	float ndl = max( dot( N, uKeyDir ), 0.0 );
	vec3 lightIn = uSkyAmb * 0.9 + uKeyColor * ( 0.25 + 0.35 * ndl );
	lightIn = mix( vec3( dot( lightIn, vec3( 0.3, 0.55, 0.15 ) ) ), lightIn, 0.45 );
	body *= lightIn;
	// a storm sea goes slate
	body = mix( body, vec3( dot( body, vec3( 0.3, 0.55, 0.15 ) ) ) * vec3( 0.86, 0.95, 1.0 ), uWeather.w * 0.55 + rainK * 0.2 );
	// light through the crest of the swell
	body += uShallow * uKeyColor * clamp( vWaveH * 1.4, 0.0, 1.0 ) * 0.12 * ( 1.0 - b2 );
	// by night the water's own colour goes: what's left is ink-blue, and the sky in it
	float nightK = uSkyState.z;
	body = mix( body, vec3( dot( body, vec3( 0.3, 0.55, 0.15 ) ) ) * vec3( 0.62, 0.68, 1.0 ) * 0.7, nightK * 0.8 );
	vec3 col = mix( body, refl, min( fres + nightK * 0.15, 0.6 ) );
	// the sun's path: sparkles and a broad sheen
	float spk = pow( max( dot( R, uKeyDir ), 0.0 ), 260.0 );
	float sheen = pow( max( dot( R, uKeyDir ), 0.0 ), 60.0 );
	float glint = step( 0.72, ocNoise( vWorld.xz * 2.2 + uTime * 0.6 ) ) * step( 0.6, ocNoise( vWorld.xz * 5.3 - uTime * 0.9 ) );
	// the sun's own image is broken into glints by the chop, never a solid disc
	float chop = step( 0.55, ocNoise( vWorld.xz * vec2( 1.1, 3.3 ) + uTime * vec2( 0.4, -1.3 ) ) );
	col += uKeyColor * ( spk * 9.0 * ( 0.1 + 0.9 * chop ) + sheen * 0.35 + sheen * glint * 6.0 * ( 0.4 + far ) );
	// foam
	float foam = 0.0;
	if ( uFoamK > 0.0 ) {
		float lace = ocNoise( vWorld.xz * 0.8 + uTime * 0.2 ) * 0.6 + ocNoise( vWorld.xz * 2.4 - uTime * 0.3 ) * 0.4;
		// at the waterline, breathing with the swash
		float swash = 0.18 + 0.16 * sin( uTime * 0.9 + vWorld.x * 0.05 + vWorld.z * 0.03 );
		float edge = 1.0 - smoothstep( swash * 0.25, swash * 0.5 + 0.1, depth );
		foam = max( foam, edge * smoothstep( 0.3, 0.6, lace + edge * 0.35 ) );
		// breaking bands marching in toward the shore
		float d = sh.r;
		float phase = d / 13.0 + uTime * 0.085 + ocNoise( vWorld.xz * 0.02 ) * 1.5;
		float band = smoothstep( 0.8, 0.97, fract( phase ) ) * ( 1.0 - smoothstep( 0.97, 1.0, fract( phase ) ) * 0.5 );
		float zone = smoothstep( 3.2, 1.1, depth ) * smoothstep( 0.05, 0.4, depth );
		foam = max( foam, band * zone * smoothstep( 0.32, 0.62, lace ) );
		// the wash left behind a breaker
		float trail = smoothstep( 0.45, 0.95, fract( phase ) ) * zone * 0.5 * smoothstep( 0.5, 0.8, lace );
		foam = max( foam, trail );
		// foam round the rocks of the shelf
		foam = max( foam, smoothstep( 0.3, 0.0, depth ) * smoothstep( 0.5, 0.72, lace ) * 0.6 );
		// the surge's churned uprush, in lace
		foam = max( foam, vRush * smoothstep( 0.6, 0.05, depth ) * smoothstep( 0.35, 0.65, lace ) );
		// whitecaps on open water when it blows
		float gale = clamp( ( uWind.y - 0.45 ) * 1.8 + uWeather.w * 0.75, 0.0, 1.0 );
		if ( gale > 0.01 ) {
			float wc = ocNoise( vWorld.xz * 0.07 + uTime * vec2( 0.015, - 0.04 ) ) * 0.55 + ocNoise( vWorld.xz * 0.45 - uTime * vec2( 0.05, 0.12 ) ) * 0.45;
			float cap = smoothstep( 0.66, 0.8, wc + vWaveH * 0.35 ) * gale * smoothstep( 3.0, 9.0, depth );
			foam = max( foam, cap * 0.8 );
		}
		foam *= uFoamK * ( 1.0 - far * 0.7 );
	}
	vec3 foamCol = vec3( 0.93, 0.89, 0.8 ) * ( uSkyAmb * 0.9 + uKeyColor * ( 0.35 + 0.5 * ndl ) );
	foamCol = mix( foamCol * vec3( 0.75, 0.78, 0.95 ), foamCol, smoothstep( 0.3, 0.8, ocNoise( vWorld.xz * 1.3 ) ) );
	col = mix( col, foamCol, clamp( foam, 0.0, 1.0 ) );
	// transparency over the shallows (the ground shows through), opaque once it's deep
	float alpha = clamp( 1.0 - exp( - dd * 1.1 ), 0.0, 1.0 );
	alpha = max( alpha, fres * 0.9 );
	alpha = max( alpha, foam );
	// a thin wash over the rock is glassy: mostly the sky in it, the rock clear beneath
	alpha *= mix( 0.5, 1.0, smoothstep( 0.04, 0.5, depth ) );
	alpha *= smoothstep( - 0.05, 0.06, depth );
	gl_FragColor = vec4( col, alpha );
}
`

export type SeaView = {
  sea: Mesh
  lagoon: Mesh
  river: Mesh | null
  update(camera: Camera, seaLevel: number, weather: WeatherState): void
  dispose(): void
}

function polarGrid(): BufferGeometry {
  const seg = 192
  const radii: number[] = [0]
  let r = 0.6
  let s = 0.6
  while (r < 14000) {
    radii.push(r)
    s *= 1.062
    r += s
  }
  const n = radii.length
  const pos = new Float32Array((1 + (n - 1) * seg) * 3)
  pos.set([0, 0, 0], 0)
  let v = 1
  for (let i = 1; i < n; i++) {
    const rr = radii[i] ?? 0
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2
      pos[v * 3] = Math.cos(a) * rr
      pos[v * 3 + 1] = 0
      pos[v * 3 + 2] = Math.sin(a) * rr
      v++
    }
  }
  const idx: number[] = []
  for (let k = 0; k < seg; k++) idx.push(0, 1 + ((k + 1) % seg), 1 + k)
  for (let i = 1; i < n - 1; i++) {
    const a0 = 1 + (i - 1) * seg
    const b0 = 1 + i * seg
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg
      idx.push(a0 + k, a0 + k1, b0 + k, a0 + k1, b0 + k1, b0 + k)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1))
  return g
}

function waterMaterial(height: DataTexture, shore: DataTexture, fresh: boolean): ShaderMaterial {
  const lin = (r: number, g: number, b: number) => new Vector3(r ** 2.2, g ** 2.2, b ** 2.2)
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tHeight: { value: height },
      tShore: { value: shore },
      uCenter: { value: new Vector3() },
      uLevel: { value: fresh ? LAGOON_LEVEL : 0 },
      uHalf: { value: HALF },
      uWaveK: { value: fresh ? 0.08 : 1 },
      uFresh: { value: fresh ? 1 : 0 },
      uFoamK: { value: fresh ? 0.25 : 1 },
      uShallow: { value: fresh ? lin(0.36, 0.5, 0.38) : lin(0.2, 0.74, 0.7) },
      uMid: { value: fresh ? lin(0.2, 0.32, 0.26) : lin(0.14, 0.52, 0.55) },
      uDeep: { value: fresh ? lin(0.12, 0.2, 0.18) : lin(0.09, 0.3, 0.42) },
      uCamPos: LIGHT.uCamPos,
      uKeyDir: LIGHT.uKeyDir,
      uKeyColor: LIGHT.uKeyColor,
      uSkyAmb: LIGHT.uSkyAmb,
      uSunDir: LIGHT.uSunDir,
      uMoonDir: LIGHT.uMoonDir,
      uZenith: LIGHT.uZenith,
      uHorizon: LIGHT.uHorizon,
      uSunGlow: LIGHT.uSunGlow,
      uSunDisc: LIGHT.uSunDisc,
      uSkyState: LIGHT.uSkyState,
      uWeather: LIGHT.uWeather,
      uCloudLit: LIGHT.uCloudLit,
      uCloudShade: LIGHT.uCloudShade,
      uWind: LIGHT.uWind,
      uStarSpin: LIGHT.uStarSpin,
      uTime: LIGHT.uTime,
    },
    transparent: true,
    depthWrite: true,
    side: fresh ? DoubleSide : FrontSide,
  })
}

export function createSeaView(world: WorldData, grid: TerrainGrid | null): SeaView {
  const { height, shore } = buildTextures(world, grid)
  const seaMat = waterMaterial(height, shore, false)
  const sea = new Mesh(polarGrid(), seaMat)
  sea.frustumCulled = false
  sea.renderOrder = 10
  sea.name = 'sea'

  // the lagoon: a disc at its level (the banks rise through it)
  const lagMat = waterMaterial(height, shore, true)
  const lg = new BufferGeometry()
  {
    const seg = 64
    const pos: number[] = [LAGOON.x, LAGOON_LEVEL, LAGOON.z]
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2
      pos.push(LAGOON.x + Math.cos(a) * LAGOON.rx * 1.45, LAGOON_LEVEL, LAGOON.z + Math.sin(a) * LAGOON.rz * 1.6 + 20)
    }
    const idx: number[] = []
    for (let k = 1; k <= seg; k++) idx.push(0, k + 1, k)
    lg.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    lg.setIndex(idx)
  }
  const lagoon = new Mesh(lg, lagMat)
  lagoon.renderOrder = 10
  lagoon.frustumCulled = false
  lagoon.name = 'lagoon'

  // the river: a ribbon along its centreline at its level
  let river: Mesh | null = null
  if (grid && grid.river.length > 2) {
    const rMat = waterMaterial(height, shore, true)
    const rv = rMat.uniforms.uLevel
    if (rv) rv.value = 0
    const pts = grid.river
    const pos: number[] = []
    const idx: number[] = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const q = pts[Math.min(pts.length - 1, i + 1)]
      const o = pts[Math.max(0, i - 1)]
      if (!p || !q || !o) continue
      const tx = q.x - o.x
      const tz = q.z - o.z
      const tl = Math.hypot(tx, tz) || 1
      const nx = -tz / tl
      const nz = tx / tl
      const w = 9.5
      pos.push(p.x + nx * w, p.level, p.z + nz * w, p.x - nx * w, p.level, p.z - nz * w)
      if (i > 0) {
        const a = (i - 1) * 2
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setIndex(idx)
    g.computeBoundingSphere()
    river = new Mesh(g, rMat)
    river.renderOrder = 9
    river.name = 'river'
    // the ribbon carries its own height: the vertex shader's uLevel is replaced by the position's y
    rMat.vertexShader = rMat.vertexShader.replace('vec3 wp = vec3( position.x + uCenter.x, uLevel, position.z + uCenter.z );', 'vec3 wp = position;')
  }

  const cam = new Vector3()
  const center = new Vector2()
  return {
    sea,
    lagoon,
    river,
    update(camera: Camera, seaLevel: number, weather: WeatherState) {
      // a gale heaps the swell up
      const wk = seaMat.uniforms.uWaveK
      if (wk) wk.value = 1 + Math.max(0, weather.wind - 0.3) * 0.7 + (weather.storm ? 0.8 : 0)
      cam.setFromMatrixPosition(camera.matrixWorld)
      center.set(Math.round(cam.x / 4) * 4, Math.round(cam.z / 4) * 4)
      const c = seaMat.uniforms.uCenter?.value
      if (c instanceof Vector3) c.set(center.x, 0, center.y)
      const lv = seaMat.uniforms.uLevel
      if (lv) lv.value = seaLevel
    },
    dispose() {
      height.dispose()
      shore.dispose()
      sea.geometry.dispose()
      seaMat.dispose()
      lagoon.geometry.dispose()
      lagMat.dispose()
      if (river) {
        river.geometry.dispose()
        if (river.material instanceof ShaderMaterial) river.material.dispose()
      }
    },
  }
}
