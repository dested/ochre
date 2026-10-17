/**
 * Fires: painted flame tongues (additive billboards, banded like brushwork), embers that rise and wink out,
 * smoke wisps drifting with the wind, and a warm flickering point light per fire. One draw call each for the
 * flames, embers and smoke whatever the number of fires; always four lights (three recompiles when the count
 * changes), given to the four fires nearest the focus.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  NormalBlending,
  PointLight,
  Points,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three'
import type { FireState, Vec3, WorldData } from '../contracts'
import { LIGHT } from '../render/uniforms'

const MAX_FIRES = 8
const TONGUES = 6
const EMBERS = 28
const PUFFS = 7
const LIGHTS = 4

const FIRE_UNIFORMS = /* glsl */ `
uniform vec4 uFires[${MAX_FIRES}];
uniform float uTime;
uniform vec3 uWind;
`

const FLAME_VERT = /* glsl */ `
${FIRE_UNIFORMS}
attribute vec4 aFlame; // fire index, seed, corner x (-1..1), corner y (0..1)
varying vec2 vUv;
varying float vSeed;
varying float vHeat;
void main() {
	vec4 f = uFires[ int( aFlame.x ) ];
	float seed = aFlame.y;
	float k = f.w;
	// each tongue leans and breathes on its own
	float t = uTime * ( 1.6 + seed * 0.9 );
	// a hearth fire: knee-high tongues, the middle ones tallest, the outer ones low and quick
	vec2 off = ( vec2( fract( seed * 13.1 ), fract( seed * 29.7 ) ) - 0.5 ) * ( 0.25 + 0.35 * k );
	float mid = 1.0 - smoothstep( 0.05, 0.3, length( off ) );
	float hgt = ( 0.3 + 0.55 * k ) * ( 0.8 + 0.2 * sin( t * 2.3 + seed * 17.0 ) + 0.12 * sin( t * 5.1 + seed * 5.0 ) ) * ( 0.6 + 0.35 * fract( seed * 7.13 ) + 0.2 * mid );
	float wid = ( 0.2 + 0.2 * k ) * ( 0.75 + 0.5 * fract( seed * 3.7 ) );
	vec3 base = f.xyz + vec3( off.x, 0.0, off.y );
	// a billboard turning about the vertical axis toward the camera
	vec3 toCam = cameraPosition - base;
	vec3 right = normalize( vec3( toCam.z, 0.0, - toCam.x ) );
	float y = aFlame.w * hgt;
	vec3 lean = vec3( uWind.x, 0.0, uWind.z ) * uWind.y * 0.35 * aFlame.w * aFlame.w;
	lean += vec3( sin( t * 3.1 + seed * 9.0 ), 0.0, cos( t * 2.7 + seed * 4.0 ) ) * 0.06 * aFlame.w;
	vec3 wp = base + right * aFlame.z * wid * 0.5 + vec3( 0.0, y, 0.0 ) + lean * hgt;
	vUv = vec2( aFlame.z, aFlame.w );
	vSeed = seed;
	vHeat = k;
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`

const NOISE = /* glsl */ `
float fHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float fNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( fHash( i ), fHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( fHash( i + vec2( 0.0, 1.0 ) ), fHash( i + 1.0 ), u.x ), u.y );
}
`

const FLAME_FRAG = /* glsl */ `
${FIRE_UNIFORMS}
${NOISE}
varying vec2 vUv;
varying float vSeed;
varying float vHeat;
void main() {
	if ( vHeat < 0.01 ) discard;
	float y = vUv.y;
	// a teardrop, broad and round low down, swaying more the higher it goes, its tip torn into licks that break away
	float n = fNoise( vec2( vUv.x * 2.5 + vSeed * 31.0, y * 3.0 - uTime * 3.2 ) ) * 0.6 + fNoise( vec2( vUv.x * 5.0, y * 6.0 - uTime * 5.5 + vSeed * 7.0 ) ) * 0.4;
	float x = vUv.x + ( fNoise( vec2( y * 2.2 - uTime * 1.9, vSeed * 9.0 ) ) - 0.5 ) * 0.9 * y;
	float w = pow( 1.0 - y, 0.8 ) * ( 0.6 + 0.4 * smoothstep( 0.0, 0.2, y ) );
	float d = abs( x ) / max( w, 1e-3 );
	float body = 1.0 - smoothstep( 0.55, 1.0, d + ( n - 0.5 ) * 0.8 * ( 0.25 + y ) );
	float tear = smoothstep( 0.4, 0.75, y ) * smoothstep( 0.42, 0.62, fNoise( vec2( x * 3.0 + vSeed * 17.0, y * 4.5 - uTime * 4.2 ) ) );
	body *= ( 1.0 - tear ) * smoothstep( 0.0, 0.07, y );
	body *= 1.0 - smoothstep( 0.6, 1.0, y + ( n - 0.5 ) * 0.5 );
	if ( body < 0.02 ) discard;
	// banded heat: a white-gold heart, orange, a red edge (a few flat steps, like paint)
	float heat = body * ( 1.0 - y * 0.75 ) * ( 0.75 + 0.35 * n );
	vec3 col = vec3( 0.6, 0.09, 0.02 );
	col = mix( col, vec3( 1.0, 0.38, 0.07 ), step( 0.3, heat ) );
	col = mix( col, vec3( 1.0, 0.66, 0.24 ), step( 0.55, heat ) );
	col = mix( col, vec3( 1.0, 0.88, 0.6 ), step( 0.82, heat ) );
	// the red edge is thin and see-through; overlapping tongues build the white heart
	float a = smoothstep( 0.02, 0.2, body ) * mix( 0.35, 1.0, smoothstep( 0.1, 0.5, heat ) );
	gl_FragColor = vec4( col * a * ( 0.45 + 0.35 * vHeat ), 1.0 );
}
`

const EMBER_VERT = /* glsl */ `
${FIRE_UNIFORMS}
uniform vec2 uViewport;
attribute vec2 aEmber; // fire index, seed
varying float vLife;
varying float vSeedE;
void main() {
	vec4 f = uFires[ int( aEmber.x ) ];
	float seed = aEmber.y;
	float rate = 0.22 + 0.25 * fract( seed * 5.3 );
	float life = fract( uTime * rate + seed );
	float rise = life * ( 1.5 + 2.8 * f.w ) * ( 0.7 + 0.6 * fract( seed * 11.0 ) );
	float swirl = life * 6.0 + seed * 40.0;
	vec3 p = f.xyz + vec3( sin( swirl ) * 0.25 * life, 0.25 + rise, cos( swirl * 1.3 ) * 0.25 * life );
	p.xz += vec2( uWind.x, uWind.z ) * uWind.y * rise * 0.8;
	p.xz += ( vec2( fract( seed * 3.1 ), fract( seed * 7.7 ) ) - 0.5 ) * 0.5;
	vLife = life;
	vSeedE = seed;
	vec4 mv = viewMatrix * vec4( p, 1.0 );
	gl_Position = projectionMatrix * mv;
	float alive = step( 0.05, f.w ) * step( fract( seed * 17.3 ), f.w * 1.2 + 0.1 );
	gl_PointSize = alive * clamp( ( 2.0 + 2.0 * fract( seed * 23.0 ) ) * ( 1.0 - life * 0.6 ) * 5.0 * uViewport.y / 1080.0 / max( - mv.z, 0.5 ), 1.0, 6.0 );
}
`

const EMBER_FRAG = /* glsl */ `
varying float vLife;
varying float vSeedE;
void main() {
	vec2 c = gl_PointCoord - 0.5;
	float d = length( c );
	if ( d > 0.5 ) discard;
	float blink = 0.6 + 0.4 * sin( vLife * 40.0 + vSeedE * 60.0 );
	float a = ( 1.0 - smoothstep( 0.15, 0.5, d ) ) * ( 1.0 - vLife ) * blink;
	vec3 col = mix( vec3( 1.0, 0.62, 0.22 ), vec3( 0.85, 0.2, 0.04 ), vLife );
	gl_FragColor = vec4( col * a * 1.6, 1.0 );
}
`

const SMOKE_VERT = /* glsl */ `
${FIRE_UNIFORMS}
attribute vec4 aPuff; // fire index, seed, corner x, corner y (-1..1)
varying vec2 vUvS;
varying float vLifeS;
varying float vSeedS;
varying float vK;
void main() {
	vec4 f = uFires[ int( aPuff.x ) ];
	float seed = aPuff.y;
	float life = fract( uTime * 0.07 + seed );
	float rise = 0.9 + life * ( 3.5 + 2.0 * f.w );
	vec3 c = f.xyz + vec3( 0.0, rise, 0.0 );
	c.xz += vec2( uWind.x, uWind.z ) * ( 0.4 + uWind.y * 2.5 ) * life * life * 3.0;
	c.xz += vec2( sin( seed * 19.0 + life * 3.0 ), cos( seed * 13.0 + life * 2.0 ) ) * 0.6 * life;
	float size = ( 0.3 + life * 1.3 ) * ( 0.6 + 0.6 * f.w );
	vec3 toCam = normalize( cameraPosition - c );
	vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), toCam ) );
	vec3 up = cross( toCam, right );
	float ang = seed * 6.28 + life * 0.8;
	vec2 q = vec2( cos( ang ) * aPuff.z - sin( ang ) * aPuff.w, sin( ang ) * aPuff.z + cos( ang ) * aPuff.w );
	vec3 wp = c + ( right * q.x + up * q.y ) * size;
	vUvS = aPuff.zw;
	vLifeS = life;
	vSeedS = seed;
	vK = f.w;
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`

const SMOKE_FRAG = /* glsl */ `
${FIRE_UNIFORMS}
${NOISE}
uniform vec3 uSmokeLit;
varying vec2 vUvS;
varying float vLifeS;
varying float vSeedS;
varying float vK;
void main() {
	if ( vK < 0.02 ) discard;
	float d = length( vUvS );
	float n = fNoise( vUvS * 2.2 + vSeedS * 13.0 + uTime * 0.1 );
	float a = 1.0 - smoothstep( 0.3, 1.0, d + ( n - 0.5 ) * 0.6 );
	a *= smoothstep( 0.0, 0.15, vLifeS ) * ( 1.0 - smoothstep( 0.4, 1.0, vLifeS ) ) * 0.045 * min( 1.0, vK * 1.5 );
	if ( a < 0.004 ) discard;
	// the sky's grey, warmed from below by the fire while it is young
	vec3 col = uSmokeLit + vec3( 0.42, 0.18, 0.06 ) * vK * ( 1.0 - smoothstep( 0.0, 0.45, vLifeS ) );
	gl_FragColor = vec4( col, a );
}
`

export type FiresView = {
  root: Group
  update(fires: readonly FireState[], focus: Vec3): void
  dispose(): void
}

export function createFiresView(world: WorldData): FiresView {
  const root = new Group()
  root.name = 'fires'
  const fireU = { value: Array.from({ length: MAX_FIRES }, () => new Vector4(0, -100, 0, 0)) }
  const smokeLit = { value: new Vector3(0.5, 0.5, 0.52) }
  const shared = { uFires: fireU, uTime: LIGHT.uTime, uWind: LIGHT.uWind }

  // flames: TONGUES quads per fire
  const fl: number[] = []
  const fi: number[] = []
  for (let f = 0; f < MAX_FIRES; f++) {
    for (let t = 0; t < TONGUES; t++) {
      const seed = ((f * 7 + t * 13) % 31) / 31 + t * 0.07
      const b = fl.length / 4
      fl.push(f, seed, -1, 0, f, seed, 1, 0, f, seed, 1, 1, f, seed, -1, 1)
      fi.push(b, b + 1, b + 2, b, b + 2, b + 3)
    }
  }
  const flameGeo = new BufferGeometry()
  flameGeo.setAttribute('aFlame', new BufferAttribute(new Float32Array(fl), 4))
  flameGeo.setAttribute('position', new BufferAttribute(new Float32Array(fl.length / 4 * 3), 3))
  flameGeo.setIndex(fi)
  const flameMat = new ShaderMaterial({
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    uniforms: shared,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
  const flames = new Mesh(flameGeo, flameMat)
  flames.frustumCulled = false
  flames.renderOrder = 20
  flames.name = 'flames'
  root.add(flames)

  const em: number[] = []
  for (let f = 0; f < MAX_FIRES; f++) for (let e = 0; e < EMBERS; e++) em.push(f, (e * 0.618034 + f * 0.137) % 1)
  const emberGeo = new BufferGeometry()
  emberGeo.setAttribute('aEmber', new BufferAttribute(new Float32Array(em), 2))
  emberGeo.setAttribute('position', new BufferAttribute(new Float32Array((em.length / 2) * 3), 3))
  const emberMat = new ShaderMaterial({
    vertexShader: EMBER_VERT,
    fragmentShader: EMBER_FRAG,
    uniforms: { ...shared, uViewport: LIGHT.uViewport },
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
  const embers = new Points(emberGeo, emberMat)
  embers.frustumCulled = false
  embers.renderOrder = 21
  embers.name = 'embers'
  root.add(embers)

  const sp: number[] = []
  const si: number[] = []
  for (let f = 0; f < MAX_FIRES; f++) {
    for (let p = 0; p < PUFFS; p++) {
      const seed = p / PUFFS + f * 0.091
      const b = sp.length / 4
      sp.push(f, seed, -1, -1, f, seed, 1, -1, f, seed, 1, 1, f, seed, -1, 1)
      si.push(b, b + 1, b + 2, b, b + 2, b + 3)
    }
  }
  const smokeGeo = new BufferGeometry()
  smokeGeo.setAttribute('aPuff', new BufferAttribute(new Float32Array(sp), 4))
  smokeGeo.setAttribute('position', new BufferAttribute(new Float32Array((sp.length / 4) * 3), 3))
  smokeGeo.setIndex(si)
  const smokeMat = new ShaderMaterial({
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    uniforms: { ...shared, uSmokeLit: smokeLit },
    blending: NormalBlending,
    transparent: true,
    depthWrite: false,
  })
  const smoke = new Mesh(smokeGeo, smokeMat)
  smoke.frustumCulled = false
  smoke.renderOrder = 19
  smoke.name = 'smoke'
  root.add(smoke)

  const lights: PointLight[] = []
  for (let i = 0; i < LIGHTS; i++) {
    const l = new PointLight(0xff8a40, 0, 16, 1.5)
    l.castShadow = false
    l.name = `fire-light-${i}`
    root.add(l)
    lights.push(l)
  }

  const order: { f: FireState; d: number; y: number }[] = []
  return {
    root,
    update(fires, focus) {
      const t = LIGHT.uTime.value
      order.length = 0
      for (const f of fires.slice(0, MAX_FIRES)) {
        order.push({ f, d: Math.hypot(f.x - focus.x, f.z - focus.z), y: world.heightAt(f.x, f.z) })
      }
      for (let i = 0; i < MAX_FIRES; i++) {
        const o = order[i]
        const v = fireU.value[i]
        if (!v) continue
        if (o) v.set(o.f.x, o.y + 0.05, o.f.z, Math.max(0, Math.min(1, o.f.intensity)))
        else v.set(0, -100, 0, 0)
      }
      const near = order.filter((o) => o.f.intensity > 0.01).sort((a, b) => a.d - b.d)
      const glows = [LIGHT.uFireGlow.value, LIGHT.uFireGlow2.value]
      lights.forEach((l, i) => {
        const o = near[i]
        const g = glows[i]
        if (!o) {
          l.intensity = 0
          if (g) g.set(0, -1000, 0, 0)
          return
        }
        const k = o.f.intensity
        // a slow breathing with a little quick life in it; the light lifts and sways with the flames
        const flick = 0.86 + 0.07 * Math.sin(t * 1.7 + i * 2) + 0.05 * Math.sin(t * 3.9 + i) + 0.025 * Math.sin(t * 8.3 + i * 5)
        l.position.set(o.f.x + Math.sin(t * 1.3 + i) * 0.08, o.y + 0.55 + 0.3 * k, o.f.z + Math.cos(t * 1.1 + i) * 0.08)
        // reaches about 8 m with a soft fall-off (decay 1.5), even from a fire burned down to coals
        l.intensity = 10 * (0.35 + 0.65 * k) * flick
        l.distance = 20 + 6 * k
        if (g) g.set(l.position.x, l.position.y, l.position.z, 0.44 * (0.35 + 0.65 * k) * flick)
      })
      const sky = LIGHT.uSkyAmb.value
      const keyC = LIGHT.uKeyColor.value
      smokeLit.value.set(sky.r * 0.6 + keyC.r * 0.08, sky.g * 0.6 + keyC.g * 0.08, sky.b * 0.6 + keyC.b * 0.08)
    },
    dispose() {
      flameGeo.dispose()
      flameMat.dispose()
      emberGeo.dispose()
      emberMat.dispose()
      smokeGeo.dispose()
      smokeMat.dispose()
      for (const l of lights) l.dispose()
    },
  }
}
