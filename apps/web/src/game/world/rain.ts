/**
 * Rain: streaks falling round the camera, slanted by the wind, in one draw call. Every streak's path is worked out
 * in the vertex shader from the clock: it falls through a box that wraps round the camera (so the rain stays put in
 * the world as you walk through it), and none fall under the cave's roof. The rain amount picks how many fall.
 */
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, NormalBlending, ShaderMaterial } from 'three'
import type { WeatherState } from '../contracts'
import { LIGHT } from '../render/uniforms'

const COUNT = 9000

const VERT = /* glsl */ `
attribute vec4 aSeed; // x, z, height in the box (0..1), share (0..1: falls when the rain amount is over it)
attribute vec2 aCorner; // across the streak (-1..1), along it (0 head .. 1 tail)
uniform float uTime;
uniform vec3 uWind;
uniform vec4 uWeather;
uniform vec4 uCave;
uniform vec4 uCave2;
varying float vA;
varying vec2 vUv;
const float BOX = 34.0;
const float HGT = 26.0;
void main() {
	vA = 0.0;
	vUv = aCorner;
	if ( aSeed.w > uWeather.y ) {
		gl_Position = vec4( 0.0, 0.0, - 2.0, 1.0 );
		return;
	}
	float speed = 8.5 + 2.5 * fract( aSeed.z * 7.31 );
	vec3 vel = vec3( uWind.x, 0.0, uWind.z ) * ( 1.0 + uWind.y * 9.0 ) + vec3( 0.0, - speed, 0.0 );
	// world position: drifting with the wind and falling, wrapped into a box round the camera
	vec3 w = vec3( aSeed.x * 2.0 * BOX, aSeed.z * HGT, aSeed.y * 2.0 * BOX ) + vel * uTime;
	vec3 cam = cameraPosition;
	vec3 rel;
	rel.xz = mod( w.xz - cam.xz + BOX, 2.0 * BOX ) - BOX;
	rel.y = mod( w.y - cam.y + HGT * 0.4, HGT ) - HGT * 0.4;
	vec3 head = cam + rel;
	// none under the cave's roof
	vec2 cd = head.xz - uCave.xy;
	float ca = cd.x * uCave.z + cd.y * uCave.w;
	float cb = cd.x * uCave.w - cd.y * uCave.z;
	if ( ca < 1.5 && ca > - uCave2.y - 4.0 && abs( cb ) < uCave2.z + 2.0 && head.y < uCave2.x + uCave2.w + 3.0 ) {
		gl_Position = vec4( 0.0, 0.0, - 2.0, 1.0 );
		return;
	}
	vec3 dir = normalize( vel );
	// a streak is the drop's path over a sixtieth of a second or so, drawn long, as a painter would
	float len = 0.9 + 0.8 * fract( aSeed.x * 91.7 );
	vec3 p = head - dir * len * aCorner.y;
	vec3 toCam = cam - p;
	float dist = length( toCam );
	// a screen-facing ribbon, never thinner than about a pixel
	vec3 side = normalize( cross( dir, toCam ) );
	float wid = max( 0.009, dist * 0.0021 );
	p += side * aCorner.x * wid;
	gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
	vA = smoothstep( 0.8, 2.5, dist ) * ( 1.0 - smoothstep( BOX * 0.55, BOX, dist ) );
}
`

const FRAG = /* glsl */ `
uniform vec3 uSkyAmb;
uniform vec3 uKeyColor;
uniform vec4 uWeather;
varying float vA;
varying vec2 vUv;
void main() {
	if ( vA < 0.01 ) discard;
	float across = 1.0 - abs( vUv.x );
	float along = ( 1.0 - vUv.y ) * smoothstep( 0.0, 0.15, vUv.y );
	float a = vA * across * along * ( 0.26 + 0.2 * uWeather.y );
	if ( a < 0.003 ) discard;
	// grey water lit by the sky, a little brighter than what it falls in front of
	vec3 col = uSkyAmb * 1.25 + uKeyColor * 0.12 + vec3( 0.03, 0.032, 0.036 );
	gl_FragColor = vec4( col, a );
}
`

export type RainView = {
  mesh: Mesh
  update(weather: WeatherState): void
  dispose(): void
}

export function createRainView(): RainView {
  const seed = new Float32Array(COUNT * 4 * 4)
  const corner = new Float32Array(COUNT * 4 * 2)
  const index = new Uint32Array(COUNT * 6)
  const cs = [-1, 0, 1, 0, 1, 1, -1, 1]
  let s = 7
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  for (let i = 0; i < COUNT; i++) {
    const r = [rand(), rand(), rand(), (i + 0.5) / COUNT]
    for (let c = 0; c < 4; c++) {
      seed.set(r, (i * 4 + c) * 4)
      corner.set([cs[c * 2] ?? 0, cs[c * 2 + 1] ?? 0], (i * 4 + c) * 2)
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(COUNT * 4 * 3), 3))
  geo.setAttribute('aSeed', new BufferAttribute(seed, 4))
  geo.setAttribute('aCorner', new BufferAttribute(corner, 2))
  geo.setIndex(new BufferAttribute(index, 1))
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: LIGHT.uTime,
      uWind: LIGHT.uWind,
      uWeather: LIGHT.uWeather,
      uCave: LIGHT.uCave,
      uCave2: LIGHT.uCave2,
      uSkyAmb: LIGHT.uSkyAmb,
      uKeyColor: LIGHT.uKeyColor,
    },
    blending: NormalBlending,
    transparent: true,
    depthWrite: false,
    // the ribbon's winding flips with the view
    side: DoubleSide,
  })
  const mesh = new Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 22
  mesh.name = 'rain'
  mesh.visible = false
  return {
    mesh,
    update(weather) {
      mesh.visible = weather.rain > 0.01
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}
