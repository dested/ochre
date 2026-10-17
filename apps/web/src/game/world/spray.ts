/**
 * Spray: white bursts where the swell meets rock. Sources sit along the seaward edges of the shelf, the rocky
 * points and the stacks; each fires on its own rhythm (every sixth or seventh wave hits hard, some barely), only
 * while the tide puts its rock at the waterline, and the wind carries the spume off. One draw call: every
 * particle's path is worked out in the vertex shader from the clock.
 */
import { BufferAttribute, BufferGeometry, Group, Mesh, NormalBlending, ShaderMaterial } from 'three'
import type { WeatherState, WorldData } from '../contracts'
import { NOISE_GLSL } from '../render/glsl'
import { LIGHT } from '../render/uniforms'
import { STACKS } from '../../world-gen/layout'
import { MAT, type TerrainGrid } from '../../world-gen/terrain'

const PER = 34
const MAX_SOURCES = 170

const VERT = /* glsl */ `
attribute vec4 aSrc;
attribute vec4 aOut;
attribute vec4 aRnd;
attribute vec2 aCorner;
uniform float uTime;
uniform float uSeaLevel;
uniform float uSurf;
uniform vec3 uWind;
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vAge;
float h11( float n ) { return fract( sin( n * 127.1 ) * 43758.5453 ); }
void main() {
	float period = 5.2 + 2.6 * h11( aSrc.w * 7.3 );
	float t = uTime / period + aSrc.w;
	float cyc = floor( t );
	float age = fract( t ) * period - aRnd.y * 0.3;
	// sets: most waves only slap, now and then one bursts high
	float hs = h11( cyc * 1.37 + aSrc.w * 91.0 );
	float strength = smoothstep( 0.2, 0.95, hs ) * uSurf;
	// only where the tide puts the rock at the waterline
	float wl = aSrc.y - uSeaLevel;
	strength *= smoothstep( - 1.6, - 0.5, wl ) * smoothstep( 3.2, 1.2, wl );
	// most of a burst is white water thrown up and falling back; a third is spume, which hangs and drifts
	float spume = step( aRnd.y, 0.33 );
	float life = mix( 0.9 + 0.8 * aRnd.x, 2.2 + 1.6 * aRnd.x, spume ) * ( 0.7 + 0.5 * strength );
	vA = 0.0;
	vUv = aCorner;
	vSeed = aRnd.z * 17.0 + aSrc.w * 5.0;
	vAge = 0.0;
	if ( age < 0.0 || age > life || strength < 0.04 ) {
		gl_Position = vec4( 0.0, 0.0, - 2.0, 1.0 );
		return;
	}
	vec2 o = aOut.xy;
	vec2 side = vec2( - o.y, o.x );
	// a fan: steep in the middle, leaning out to the sides
	float fan = aRnd.x - 0.5;
	float up = ( 4.0 + 10.0 * aRnd.w * aRnd.w ) * strength * aOut.z * ( 1.0 - abs( fan ) * 0.8 );
	vec2 hv = ( o * ( 0.5 + 2.2 * aRnd.z ) - o * 2.6 + side * fan * 7.0 ) * ( 0.4 + 0.7 * strength );
	// drag: velocity decays, gravity pulls; spume feels the air more
	float k = mix( 1.1, 2.2, spume );
	float dk = ( 1.0 - exp( - k * age ) ) / k;
	vec3 p = vec3( aSrc.x, uSeaLevel + 0.4, aSrc.z );
	p += vec3( hv.x, up, hv.y ) * dk;
	p.y -= mix( 5.5, 2.5, spume ) * ( age - dk ) / k;
	p.y = max( p.y, uSeaLevel + 0.1 );
	p.xz += uWind.xz * ( 0.6 + uWind.y * 4.0 ) * age * age * 0.5;
	float size = mix( 0.22 + 0.55 * age / life, 0.5 + 1.6 * age / life, spume ) * ( 0.7 + 0.5 * strength ) * ( 0.7 + 0.6 * aRnd.z );
	vec4 vp = viewMatrix * vec4( p, 1.0 );
	vp.xy += aCorner * size;
	gl_Position = projectionMatrix * vp;
	vA = smoothstep( 0.0, 0.08, age ) * ( 1.0 - smoothstep( life * 0.45, life, age ) ) * min( 1.0, strength * 1.6 ) * mix( 1.0, 0.45, spume );
	vAge = age / life;
}
`

const FRAG = /* glsl */ `
uniform vec3 uKeyColor;
uniform vec3 uKeyDir;
uniform vec3 uSkyAmb;
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vAge;
${NOISE_GLSL}
void main() {
	if ( vA < 0.01 ) discard;
	float d = length( vUv );
	float n = ocNoise( vUv * 2.4 + vSeed ) * 0.6 + ocNoise( vUv * 5.1 - vSeed ) * 0.4;
	// a ragged dab, crisp and dense young, broken up as it drifts
	float a = 1.0 - smoothstep( 0.5 - vAge * 0.15, 0.85, d + ( n - 0.5 ) * ( 0.45 + vAge * 0.6 ) );
	a *= vA * mix( 0.95, 0.45, vAge );
	if ( a < 0.01 ) discard;
	// white water: lit on top, a cool grey underneath
	vec3 col = vec3( 0.96, 0.95, 0.92 ) * ( uSkyAmb * 0.85 + uKeyColor * ( 0.24 + 0.12 * vUv.y ) );
	col *= 0.72 + 0.3 * ( vUv.y * 0.5 + 0.5 );
	gl_FragColor = vec4( col, a );
}
`

export type SprayView = {
  mesh: Mesh
  update(weather: WeatherState): void
  dispose(): void
}

/** rock at the sea's edge, facing open water: (x, z, rock height, outward x, outward z) */
function findSources(world: WorldData, g: TerrainGrid): number[][] {
  const N = g.n
  const out: number[][] = []
  const step = 3
  const h = (ix: number, iz: number) => g.h[Math.min(N - 1, Math.max(0, iz)) * N + Math.min(N - 1, Math.max(0, ix))] ?? 0
  for (let iz = 4; iz < N - 4; iz += step) {
    for (let ix = 4; ix < N - 4; ix += step) {
      const i = iz * N + ix
      const m = g.mat[i]
      if (m !== MAT.shelf && m !== MAT.rock && m !== MAT.cliff && m !== MAT.scree) continue
      const hv = g.h[i] ?? 0
      if (hv < -1.8 || hv > 3.5) continue
      // open water 6–10 m out on the swell side (it comes from the south)
      let best = -1
      let bx = 0
      let bz = 0
      for (let k = 0; k < 7; k++) {
        const a = Math.PI * 0.5 + (k - 3) * 0.32
        const dx = Math.cos(a)
        const dz = Math.sin(a)
        const w = h(ix + Math.round(dx * 4), iz + Math.round(dz * 4))
        const deep = hv - w
        if (w < -1.5 && deep > best) {
          best = deep
          bx = dx
          bz = dz
        }
      }
      if (best < 1.2) continue
      out.push([g.origin + ix * g.cell, g.origin + iz * g.cell, hv, bx, bz, best])
    }
  }
  for (const [sx, sz, r] of STACKS) {
    const n = Math.max(3, Math.round(r / 3))
    for (let k = 0; k < n; k++) {
      const a = Math.PI * 0.5 + (k / (n - 1) - 0.5) * 2.4
      const x = sx + Math.cos(a) * r * 0.8
      const z = sz + Math.sin(a) * r * 0.8
      out.push([x, z, Math.max(-0.5, world.heightAt(x, z) * 0.2), Math.cos(a), Math.sin(a), 4])
    }
  }
  return out
}

export function createSprayView(world: WorldData, grid: TerrainGrid | null): SprayView {
  const raw = grid ? findSources(world, grid) : []
  // spaced out, the most exposed first
  raw.sort((a, b) => (b[5] ?? 0) - (a[5] ?? 0))
  const picked: number[][] = []
  for (const s of raw) {
    if (picked.length >= MAX_SOURCES) break
    const sx = s[0] ?? 0
    const sz = s[1] ?? 0
    if (picked.some((p) => ((p[0] ?? 0) - sx) ** 2 + ((p[1] ?? 0) - sz) ** 2 < 14 * 14)) continue
    picked.push(s)
  }
  const n = picked.length * PER
  const src = new Float32Array(n * 4 * 4)
  const outA = new Float32Array(n * 4 * 4)
  const rnd = new Float32Array(n * 4 * 4)
  const corner = new Float32Array(n * 4 * 2)
  const index: number[] = []
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1]
  let q = 0
  let seed = 1
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  picked.forEach((s, si) => {
    const phase = rand()
    const exposed = Math.min(1.3, 0.6 + (s[5] ?? 1) * 0.15)
    for (let p = 0; p < PER; p++) {
      const r = [rand(), rand(), rand(), rand()]
      for (let c = 0; c < 4; c++) {
        const v = q * 4 + c
        src.set([s[0] ?? 0, s[2] ?? 0, s[1] ?? 0, phase + si * 0.0001], v * 4)
        outA.set([s[3] ?? 0, s[4] ?? 1, exposed, 0], v * 4)
        rnd.set(r, v * 4)
        corner.set([corners[c * 2] ?? 0, corners[c * 2 + 1] ?? 0], v * 2)
      }
      const b = q * 4
      index.push(b, b + 1, b + 2, b, b + 2, b + 3)
      q++
    }
  })
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 4 * 3), 3))
  geo.setAttribute('aSrc', new BufferAttribute(src, 4))
  geo.setAttribute('aOut', new BufferAttribute(outA, 4))
  geo.setAttribute('aRnd', new BufferAttribute(rnd, 4))
  geo.setAttribute('aCorner', new BufferAttribute(corner, 2))
  geo.setIndex(index)
  const surf = { value: 0.8 }
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: LIGHT.uTime,
      uSeaLevel: LIGHT.uSeaLevel,
      uWind: LIGHT.uWind,
      uKeyColor: LIGHT.uKeyColor,
      uKeyDir: LIGHT.uKeyDir,
      uSkyAmb: LIGHT.uSkyAmb,
      uSurf: surf,
    },
    blending: NormalBlending,
    transparent: true,
    depthWrite: false,
  })
  const mesh = new Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 18
  mesh.name = 'spray'
  mesh.visible = n > 0
  return {
    mesh,
    update(weather) {
      surf.value = Math.min(1.4, 0.7 + weather.wind * 0.5 + (weather.storm ? 0.5 : 0))
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}
