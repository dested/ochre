/**
 * Fires: painted flame tongues (narrow soft-edged billboards at their own tilts, white-gold at the root of the heart,
 * yellow in the body, orange out to a red rim) inside a camera-facing glow, a bed of glowing coals under the wood,
 * embers that rise and wink out, smoke wisps drifting with the wind, and a warm flickering point light per fire. One draw call each for the flames, coals, embers and smoke
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
/** per fire: four outer tongues, two taller ones at the heart, and the glow round them */
const TONGUES = 7
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
attribute float aLayer; // 0 the outer tongues, 1 the taller ones at the heart, 3 the glow round the whole fire
varying vec2 vUv;
varying float vSeed;
varying float vHeat;
varying float vLayer;
void main() {
	vec4 f = uFires[ int( aFlame.x ) ];
	float seed = aFlame.y;
	float k = f.w;
	vUv = vec2( aFlame.z, aFlame.w );
	vSeed = seed;
	vHeat = k;
	vLayer = aLayer;
	float t = uTime * ( 1.6 + seed * 0.9 );
	float hgt0 = 0.32 + 0.6 * k;
	if ( aLayer > 2.5 ) {
		// the glow: a soft disc facing the camera full on, round the lower flame, so no tongue's edge is ever
		// seen against the dark
		vec3 cr = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
		vec3 cu = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
		// small and high enough that it has faded to nothing where it would cut into the floor
		float r = ( 0.3 + 0.4 * k ) * ( 0.96 + 0.04 * sin( uTime * 7.0 ) );
		vec3 c = f.xyz + vec3( 0.0, hgt0 * 0.5, 0.0 );
		vec3 wp = c + ( cr * aFlame.z + cu * ( aFlame.w * 2.0 - 1.0 ) ) * r;
		gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
		return;
	}
	// a hearth fire, knee high: narrow tongues spread round the wood, the heart ones closer in and taller
	float heart = step( 0.5, aLayer );
	vec2 off = ( vec2( fract( seed * 13.1 ), fract( seed * 29.7 ) ) - 0.5 ) * ( 0.2 + 0.2 * k ) * mix( 1.0, 0.4, heart );
	float flick = 0.82 + 0.18 * sin( t * 2.3 + seed * 17.0 ) + 0.1 * sin( t * 5.1 + seed * 5.0 );
	float hgt = hgt0 * mix( 0.95, 1.25, heart ) * flick * ( 0.8 + 0.3 * fract( seed * 7.13 ) );
	float wid = hgt * mix( 0.62, 0.5, heart ) * ( 0.85 + 0.3 * fract( seed * 3.7 ) );
	// the root sits down among the coals, so the flame grows out of them with no gap
	vec3 base = f.xyz + vec3( off.x, - 0.1, off.y );
	// turning about the vertical axis toward the camera
	vec3 toCam = cameraPosition - base;
	vec3 right = normalize( vec3( toCam.z, 0.0, - toCam.x ) );
	float y = aFlame.w * hgt;
	// each tongue tilts its own way, the ones at the sides leaning out from the fire as flames do
	float side = dot( vec3( off.x, 0.0, off.y ), right ) / max( 0.1 + 0.1 * k, 1e-3 );
	float tilt = side * 0.22 + ( fract( seed * 5.31 ) - 0.5 ) * 0.3;
	vec3 lean = vec3( uWind.x, 0.0, uWind.z ) * uWind.y * 0.35 * aFlame.w * aFlame.w;
	lean += vec3( sin( t * 3.1 + seed * 9.0 ), 0.0, cos( t * 2.7 + seed * 4.0 ) ) * 0.06 * aFlame.w;
	lean += right * tilt * aFlame.w * aFlame.w;
	vec3 wp = base + right * aFlame.z * wid * 0.5 + vec3( 0.0, y, 0.0 ) + lean * hgt;
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
	if ( vLayer > 2.5 ) {
		// the glow: warm air lit by the fire, brightest low in the heart, gone well before the quad's edge
		vec2 q = vec2( vUv.x, vUv.y * 2.0 - 1.0 );
		float r2 = dot( q, q );
		float g = exp( - r2 * 5.0 ) * ( 1.0 - smoothstep( 0.3, 0.8, r2 ) );
		gl_FragColor = vec4( vec3( 1.0, 0.38, 0.08 ) * g * 0.3 * ( 0.5 + 0.5 * vHeat ), 0.0 );
		return;
	}
	float y = vUv.y;
	// a narrow tongue, round at the root, swaying more the higher it goes, its tip tearing into licks
	float n = fNoise( vec2( vUv.x * 2.5 + vSeed * 31.0, y * 3.0 - uTime * 3.2 ) ) * 0.6 + fNoise( vec2( vUv.x * 5.0, y * 6.0 - uTime * 5.5 + vSeed * 7.0 ) ) * 0.4;
	float x = vUv.x + ( fNoise( vec2( y * 2.2 - uTime * 1.9, vSeed * 9.0 ) ) - 0.5 ) * 0.6 * y;
	float w = pow( 1.0 - y, 0.85 ) * ( 0.68 + 0.32 * smoothstep( 0.0, 0.22, y ) );
	float edge = abs( x ) / max( w, 1e-3 ) + ( n - 0.5 ) * 0.6 * ( 0.25 + y );
	// soft all round: the alpha falls away over the outer half of the tongue, so no edge of the quad can show
	float body = 1.0 - smoothstep( 0.42, 1.0, edge );
	float lick = smoothstep( 0.55, 0.85, y ) * smoothstep( 0.45, 0.7, fNoise( vec2( x * 3.0 + vSeed * 17.0, y * 4.5 - uTime * 4.2 ) ) );
	body *= ( 1.0 - lick * 0.85 ) * ( 1.0 - smoothstep( 0.55, 1.0, y + ( n - 0.5 ) * 0.4 ) );
	// the root fades into the coals rather than starting on a line
	body *= smoothstep( 0.0, 0.12, y );
	if ( body < 0.01 ) discard;
	// colour by heat: white-gold at the root of the heart, yellow in the body, orange out to a red rim and tip
	float heat = clamp( 1.05 - edge * 1.05 - y * 0.95 + vLayer * 0.12, 0.0, 1.0 );
	vec3 col = mix( vec3( 0.72, 0.08, 0.02 ), vec3( 1.0, 0.32, 0.04 ), smoothstep( 0.0, 0.3, heat ) );
	col = mix( col, vec3( 1.0, 0.62, 0.14 ), smoothstep( 0.42, 0.75, heat ) );
	col = mix( col, vec3( 1.0, 0.92, 0.72 ), smoothstep( 0.8, 1.0, heat ) * ( 1.0 - smoothstep( 0.08, 0.35, y ) ) );
	float e = mix( 0.5, 0.9, smoothstep( 0.45, 0.95, heat ) );
	// added light that also covers a little of what is behind it, as paint would, so the colour stays rich
	// over the lit floor; the cover is soft-edged with the body, so overlaps never draw a card's outline
	float a = body * body * ( 3.0 - 2.0 * body );
	gl_FragColor = vec4( col * a * e * ( 0.6 + 0.4 * vHeat ), a * 0.35 );
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
	float core = 1.0 - smoothstep( 0.1, 0.95, d );
	// the glow under the ash: soft, broken patches that breathe as the air moves over them (no cells, no cracks)
	float n1 = fNoise( vW * 7.0 + vec2( 0.0, uTime * 0.05 ) );
	float n2 = fNoise( vW * 17.0 - vec2( uTime * 0.08, 0.0 ) + 4.0 );
	float breath = 0.75 + 0.25 * sin( uTime * 0.9 + n1 * 6.0 );
	float glow = smoothstep( 0.35, 0.85, n1 * 0.65 + n2 * 0.35 + core * 0.35 ) * core * breath;
	// ember flecks: grains of live coal showing through the ash, each brightening and fading on its own; far off
	// they melt into the glow rather than sparkle
	vec2 g = vW / 0.03;
	vec2 i = floor( g );
	vec2 c = vec2( fHash( i ), fHash( i + 7.3 ) );
	float r = length( fract( g ) - 0.2 - 0.6 * c );
	float sz = 0.16 + 0.2 * fHash( i + 9.1 );
	float ph = fHash( i + 3.1 );
	float pulse = 0.5 + 0.5 * sin( uTime * ( 0.7 + ph * 1.8 ) + ph * 40.0 );
	pulse *= pulse;
	float px = fwidth( g.x ) + fwidth( g.y );
	float dot_ = 1.0 - smoothstep( sz * 0.4, sz + px * 0.5, r );
	float fleck = step( 0.55, fHash( i + 1.7 ) ) * mix( dot_, 0.06, smoothstep( 0.3, 0.9, px ) ) * pulse * smoothstep( 0.05, 0.6, core );
	vec3 col = vec3( 0.6, 0.07, 0.01 ) * glow * 1.1 + vec3( 1.0, 0.3, 0.04 ) * smoothstep( 0.5, 1.0, glow ) * 0.55;
	col += mix( vec3( 0.9, 0.18, 0.02 ), vec3( 1.0, 0.5, 0.12 ), pulse ) * fleck * 1.2;
	gl_FragColor = vec4( col * ( 0.7 + 0.9 * vK ), 1.0 );
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
      const layer = t < 4 ? 0 : t < 6 ? 1 : 3
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
