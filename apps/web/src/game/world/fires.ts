/**
 * Fires: painted flame tongues in layers (additive billboards: orange-red outside, yellow within, a white core at
 * the root), a bed of glowing coals under the wood, embers that rise and wink out, smoke wisps drifting with the
 * wind, and a warm flickering point light per fire. One draw call each for the flames, coals, embers and smoke
 * whatever the number of fires; always four lights (three recompiles when the count
 * changes), given to the four fires nearest the focus.
 */
import {
  AddEquation,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  Group,
  Mesh,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PointLight,
  Points,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three'
import type { FireState, Vec3, WorldData } from '../contracts'
import { LIGHT } from '../render/uniforms'

const MAX_FIRES = 8
/** per fire: four outer tongues, four inner, two for the core */
const TONGUES = 10
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
attribute float aLayer; // 0 the outer orange-red tongues, 1 the yellow ones inside them, 2 the white core at the root
varying vec2 vUv;
varying float vSeed;
varying float vHeat;
varying float vLayer;
void main() {
	vec4 f = uFires[ int( aFlame.x ) ];
	float seed = aFlame.y;
	float k = f.w;
	// each tongue leans and breathes on its own
	float t = uTime * ( 1.6 + seed * 0.9 );
	// a hearth fire, knee high: the outer tongues spread round it, the yellow ones close in, the core at the heart
	float outer = step( aLayer, 0.5 );
	float core = step( 1.5, aLayer );
	float spread = mix( mix( 0.55, 1.0, outer ), 0.18, core );
	vec2 off = ( vec2( fract( seed * 13.1 ), fract( seed * 29.7 ) ) - 0.5 ) * ( 0.26 + 0.3 * k ) * spread;
	float tall = mix( mix( 0.8, 1.0, outer ), 0.36, core );
	float hgt = ( 0.32 + 0.6 * k ) * tall * ( 0.82 + 0.18 * sin( t * 2.3 + seed * 17.0 ) + 0.1 * sin( t * 5.1 + seed * 5.0 ) ) * ( 0.8 + 0.3 * fract( seed * 7.13 ) );
	float wid = ( 0.22 + 0.2 * k ) * mix( mix( 0.7, 1.15, outer ), 0.6, core ) * ( 0.8 + 0.4 * fract( seed * 3.7 ) );
	// the root sits down among the coals, so the flame grows out of them with no gap
	vec3 base = f.xyz + vec3( off.x, - 0.12, off.y );
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
	vLayer = aLayer;
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
varying float vLayer;
void main() {
	if ( vHeat < 0.01 ) discard;
	float y = vUv.y;
	// a teardrop, round at the root and whole, swaying more the higher it goes; only its tip tears into licks
	float n = fNoise( vec2( vUv.x * 2.5 + vSeed * 31.0, y * 3.0 - uTime * 3.2 ) ) * 0.6 + fNoise( vec2( vUv.x * 5.0, y * 6.0 - uTime * 5.5 + vSeed * 7.0 ) ) * 0.4;
	float x = vUv.x + ( fNoise( vec2( y * 2.2 - uTime * 1.9, vSeed * 9.0 ) ) - 0.5 ) * 0.8 * y;
	float w = pow( 1.0 - y, 0.75 ) * ( 0.62 + 0.38 * smoothstep( 0.0, 0.22, y ) );
	float edge = abs( x ) / max( w, 1e-3 ) + ( n - 0.5 ) * 0.7 * ( 0.2 + y );
	// the root rounded off (it sits down among the coals, so no straight cut shows)
	if ( y < 0.2 ) edge = max( edge, length( vec2( abs( x ) / 0.7, ( 0.2 - y ) / 0.2 ) ) );
	float body = 1.0 - smoothstep( 0.6, 1.0, edge );
	float lick = smoothstep( 0.62, 0.85, y ) * smoothstep( 0.45, 0.65, fNoise( vec2( x * 3.0 + vSeed * 17.0, y * 4.5 - uTime * 4.2 ) ) );
	body *= ( 1.0 - lick ) * ( 1.0 - smoothstep( 0.75, 1.0, y + ( n - 0.5 ) * 0.4 ) );
	if ( body < 0.02 ) discard;
	// colour by layer, each a flat wash with a darker rim: orange going red at the edge and the tip outside,
	// yellow within, a white core at the root. Added up they make the gold heart without washing out to white
	float rim = smoothstep( 0.35, 0.95, edge );
	vec3 col;
	float e;
	// each wash also covers a little of what is behind it, as paint would, so the colours stay rich over the lit
	// floor instead of fading to a pale glow
	float cover;
	if ( vLayer < 0.5 ) {
		col = mix( vec3( 1.0, 0.3, 0.04 ), vec3( 0.78, 0.09, 0.02 ), max( rim, smoothstep( 0.45, 0.9, y ) ) );
		e = 0.42;
		cover = 0.65;
	} else if ( vLayer < 1.5 ) {
		col = mix( vec3( 1.0, 0.66, 0.16 ), vec3( 1.0, 0.4, 0.06 ), max( rim, smoothstep( 0.4, 0.85, y ) ) );
		e = 0.4;
		cover = 0.45;
	} else {
		col = mix( vec3( 1.0, 0.94, 0.78 ), vec3( 1.0, 0.74, 0.34 ), rim );
		e = 0.75;
		cover = 0.3;
	}
	float a = smoothstep( 0.02, 0.25, body );
	gl_FragColor = vec4( col * a * e * ( 0.6 + 0.4 * vHeat ), a * cover );
}
`

const COAL_VERT = /* glsl */ `
${FIRE_UNIFORMS}
attribute vec3 aCoal; // fire index, corner x, corner z (-1..1)
varying vec2 vP;
varying vec2 vW;
varying float vK;
void main() {
	vec4 f = uFires[ int( aCoal.x ) ];
	float r = 0.44 * ( 0.7 + 0.3 * f.w );
	vec3 wp = f.xyz + vec3( aCoal.y * r, - 0.025, aCoal.z * r );
	vP = aCoal.yz;
	vW = wp.xz;
	vK = f.w;
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`

const COAL_FRAG = /* glsl */ `
${FIRE_UNIFORMS}
${NOISE}
varying vec2 vP;
varying vec2 vW;
varying float vK;
void main() {
	if ( vK < 0.01 ) discard;
	float d = length( vP ) + ( fNoise( vW * 9.0 ) - 0.5 ) * 0.3;
	if ( d > 1.0 ) discard;
	// a bed of coals: each lump glowing and dimming on its own, the cracks between them dark
	vec2 g = vW / 0.065;
	vec2 i = floor( g );
	vec2 fr = fract( g );
	float f1 = 9.0;
	float f2 = 9.0;
	float id = 0.0;
	for ( int y = - 1; y <= 1; y ++ ) {
		for ( int x = - 1; x <= 1; x ++ ) {
			vec2 o = vec2( float( x ), float( y ) );
			vec2 c = o + vec2( fHash( i + o ), fHash( i + o + 7.3 ) ) - fr;
			float dd = dot( c, c );
			if ( dd < f1 ) { f2 = f1; f1 = dd; id = fHash( i + o + 3.1 ); }
			else if ( dd < f2 ) f2 = dd;
		}
	}
	float crack = smoothstep( 0.02, 0.25, sqrt( f2 ) - sqrt( f1 ) );
	float pulse = 0.55 + 0.45 * sin( uTime * ( 0.6 + id * 1.4 ) + id * 20.0 );
	float heat = ( 1.0 - smoothstep( 0.15, 1.0, d ) ) * ( 0.35 + 0.65 * id ) * pulse * crack;
	vec3 col = mix( vec3( 0.55, 0.07, 0.01 ), vec3( 1.0, 0.48, 0.1 ), smoothstep( 0.25, 0.75, heat ) );
	gl_FragColor = vec4( col * heat * ( 0.7 + 0.9 * vK ), 1.0 );
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
  const fla: number[] = []
  const fi: number[] = []
  for (let f = 0; f < MAX_FIRES; f++) {
    for (let t = 0; t < TONGUES; t++) {
      const seed = ((f * 7 + t * 13) % 31) / 31 + t * 0.07
      const layer = t < 4 ? 0 : t < 8 ? 1 : 2
      const b = fl.length / 4
      fl.push(f, seed, -1, 0, f, seed, 1, 0, f, seed, 1, 1, f, seed, -1, 1)
      fla.push(layer, layer, layer, layer)
      fi.push(b, b + 1, b + 2, b, b + 2, b + 3)
    }
  }
  const flameGeo = new BufferGeometry()
  flameGeo.setAttribute('aFlame', new BufferAttribute(new Float32Array(fl), 4))
  flameGeo.setAttribute('aLayer', new BufferAttribute(new Float32Array(fla), 1))
  flameGeo.setAttribute('position', new BufferAttribute(new Float32Array(fl.length / 4 * 3), 3))
  flameGeo.setIndex(fi)
  const flameMat = new ShaderMaterial({
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    uniforms: shared,
    // added light that also covers part of what is behind (premultiplied)
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    transparent: true,
    depthWrite: false,
  })
  const flames = new Mesh(flameGeo, flameMat)
  flames.frustumCulled = false
  flames.renderOrder = 20
  flames.name = 'flames'
  root.add(flames)

  // the coal beds: one flat quad per fire, glowing between the sticks and the stones
  const co: number[] = []
  const ci: number[] = []
  for (let f = 0; f < MAX_FIRES; f++) {
    const b = co.length / 3
    co.push(f, -1, -1, f, 1, -1, f, 1, 1, f, -1, 1)
    ci.push(b, b + 2, b + 1, b, b + 3, b + 2)
  }
  const coalGeo = new BufferGeometry()
  coalGeo.setAttribute('aCoal', new BufferAttribute(new Float32Array(co), 3))
  coalGeo.setAttribute('position', new BufferAttribute(new Float32Array(co.length), 3))
  coalGeo.setIndex(ci)
  const coalMat = new ShaderMaterial({
    vertexShader: COAL_VERT,
    fragmentShader: COAL_FRAG,
    uniforms: shared,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const coals = new Mesh(coalGeo, coalMat)
  coals.frustumCulled = false
  coals.renderOrder = 18
  coals.name = 'coals'
  root.add(coals)

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
      coalGeo.dispose()
      coalMat.dispose()
      emberGeo.dispose()
      emberMat.dispose()
      smokeGeo.dispose()
      smokeMat.dispose()
      for (const l of lights) l.dispose()
    },
  }
}
