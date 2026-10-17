/**
 * Spoor: eland hoof prints pressed into the ground, for the tracking skill. Each `add` is one stride: a left print
 * where the animal stood and a right one a step ahead. A print is the cloven hoof (two toes, round at the heel,
 * pointed at the tip, drawn twice life size so it reads from a few strides off) with the hind foot landing just
 * in the fore print, in a scuff of trodden ground, drawn as a dimple: the wall facing the
 * light catches it, the far wall falls into shade, the floor is damper and darker, the pushed-up rim a touch paler.
 * The prints multiply the ground under them, so they sit in whatever light the ground is in (dawn, noon, firelight,
 * moonlight). Fresh prints are crisp; old ones are softened and faint. One instanced draw call for all of them.
 */
import {
  AddEquation,
  CustomBlending,
  DstColorFactor,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  ZeroFactor,
} from 'three'
import type { WorldData } from '../contracts'
import { NOISE_GLSL } from '../render/glsl'
import { LIGHT } from '../render/uniforms'

/** prints kept at once (two per stride); the oldest go first */
const MAX = 1024
/** the quad round one print, metres */
const SIZE = 0.76
/** game seconds after which a print is as faint as it gets */
const OLD = 1800
/** half the gap between the left and right tracks, and the step between them, metres */
const STRADDLE = 0.13
const STEP = 1.05

const VERT = /* glsl */ `
attribute vec3 aPrint; // age 0..1, mirror (1 left, -1 right), seed
uniform vec3 uKeyDir;
varying vec2 vLocal;
varying vec3 vPrint;
varying vec3 vKeyL;
void main() {
	vLocal = position.xz;
	vPrint = aPrint;
	// the light in the print's own frame (x across, y up the ground's normal, z forward)
	vec3 ax = normalize( instanceMatrix[ 0 ].xyz );
	vec3 ay = normalize( instanceMatrix[ 1 ].xyz );
	vec3 az = normalize( instanceMatrix[ 2 ].xyz );
	vKeyL = vec3( dot( uKeyDir, ax ) * aPrint.y, dot( uKeyDir, ay ), dot( uKeyDir, az ) );
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4( position, 1.0 );
}
`

const FRAG = /* glsl */ `
varying vec2 vLocal;
varying vec3 vPrint;
varying vec3 vKeyL;
${NOISE_GLSL}
// one half of the cloven hoof, in units of its own half-width (below 0 inside)
float ocToe( vec2 p, float s ) {
	vec2 q = p - vec2( s * 0.024, - 0.004 );
	// pointed toward the tip, the inner edge flatter than the outer
	q.x /= 1.0 - 0.5 * smoothstep( - 0.035, 0.06, q.y );
	q.x *= q.x * s < 0.0 ? 1.4 : 1.0;
	return length( q / vec2( 0.021, 0.057 ) ) - 1.0;
}
float ocHoof( vec2 p ) {
	return min( ocToe( p, 1.0 ), ocToe( p, - 1.0 ) );
}
// the ground's height in the print: a dimple with a low rim, the hind foot a little ahead in the fore print
float ocDent( vec2 p, float soft ) {
	float fore = ocHoof( p );
	float hind = ocHoof( ( p - vec2( 0.006, 0.026 ) ) * 1.04 );
	float dent = smoothstep( 0.2 + soft, - 0.55 - soft, fore );
	dent = max( dent, 0.75 * smoothstep( 0.2 + soft, - 0.5 - soft, hind ) );
	float d = min( fore, hind );
	float rim = smoothstep( 0.05, 0.45, d ) * ( 1.0 - smoothstep( 0.5, 1.3 + soft, d ) );
	return - dent + rim * 0.3;
}
void main() {
	// twice life size: an eland's 11 cm print would be lost to the brush a few strides off
	vec2 p = vLocal * 0.5;
	p.x *= vPrint.y;
	float age = vPrint.x;
	float seed = vPrint.z;
	// a little crooked, each its own
	float tw = ( ocHash( vec2( seed, 3.1 ) ) - 0.5 ) * 0.25;
	p = mat2( cos( tw ), sin( tw ), - sin( tw ), cos( tw ) ) * p;
	// ragged as a dab, softer as it ages
	p += ( vec2( ocNoise( p * 30.0 + seed ), ocNoise( p * 30.0 - seed * 1.7 ) ) - 0.5 ) * ( 0.004 + 0.006 * age );
	float soft = 0.15 + 0.9 * age;
	float h = ocDent( p, soft );
	// the trodden scuff round the print, broken like a dry-brush smear
	float scuff = ( 1.0 - smoothstep( 0.04, 0.17, length( ( p - vec2( 0.0, 0.01 ) ) * vec2( 1.25, 0.8 ) ) ) )
		* smoothstep( 0.25, 0.6, ocNoise( p * 16.0 + seed * 3.0 ) );
	if ( abs( h ) < 0.004 && scuff < 0.01 ) discard;
	float e = 0.004;
	vec2 g = vec2( ocDent( p + vec2( e, 0.0 ), soft ) - h, ocDent( p + vec2( 0.0, e ), soft ) - h ) / e;
	// the walls are steep for their size
	vec3 n = normalize( vec3( - g.x * 0.012, 1.0, - g.y * 0.012 ) );
	vec3 k = normalize( vKeyL );
	float flat_ = max( k.y, 0.25 );
	float lit = clamp( ( dot( n, k ) - k.y ) / flat_, - 1.0, 1.0 );
	float dent = max( - h, 0.0 );
	float rim = max( h, 0.0 ) / 0.3;
	float strength = 1.0 - 0.5 * age;
	// damp, shaded floor; the far wall in the sky's cool shade, the near wall catching the light; the rim's dry,
	// turned soil; the scuff trodden a little darker
	vec3 mult = mix( vec3( 1.0 ), vec3( 0.3, 0.3, 0.36 ), dent * strength );
	mult *= mix( vec3( 1.0 ), vec3( 0.16, 0.18, 0.25 ), max( - lit, 0.0 ) * strength );
	mult *= 1.0 + max( lit, 0.0 ) * 0.5 * strength + rim * 0.12 * strength;
	mult *= mix( vec3( 1.0 ), vec3( 0.62, 0.62, 0.68 ), scuff * strength );
	gl_FragColor = vec4( mult, 1.0 );
}
`

export type Spoor = {
  root: InstancedMesh
  add(x: number, z: number, heading: number, age: number): void
  clear(): void
  dispose(): void
}

export function createSpoor(world: WorldData): Spoor {
  const geo = new PlaneGeometry(SIZE, SIZE)
  geo.rotateX(-Math.PI / 2)
  const prints = new Float32Array(MAX * 3)
  const printAttr = new InstancedBufferAttribute(prints, 3)
  geo.setAttribute('aPrint', printAttr)
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uKeyDir: LIGHT.uKeyDir },
    transparent: true,
    depthWrite: false,
    // the print multiplies the ground under it, so it is lit as the ground is
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: DstColorFactor,
    blendDst: ZeroFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const mesh = new InstancedMesh(geo, mat, MAX)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  mesh.name = 'spoor'

  const m = new Matrix4()
  const ax = new Vector3()
  const ay = new Vector3()
  const az = new Vector3()
  const pos = new Vector3()
  let next = 0
  let used = 0
  let seed = 0

  const press = (x: number, z: number, heading: number, age: number, mirror: number) => {
    const y = world.heightAt(x, z)
    // the ground's slope under the print, so it lies on the hillside rather than through it
    const e = 0.3
    ay.set(world.heightAt(x - e, z) - world.heightAt(x + e, z), 2 * e, world.heightAt(x, z - e) - world.heightAt(x, z + e)).normalize()
    az.set(Math.sin(heading), 0, Math.cos(heading))
    az.addScaledVector(ay, -az.dot(ay)).normalize()
    ax.crossVectors(ay, az)
    pos.set(x, y + 0.03, z)
    m.makeBasis(ax, ay, az).setPosition(pos)
    mesh.setMatrixAt(next, m)
    seed = (seed + 0.618034) % 1
    prints.set([Math.min(1, Math.max(0, age / OLD)), mirror, seed * 97], next * 3)
    next = (next + 1) % MAX
    used = Math.min(MAX, used + 1)
    mesh.count = used
    mesh.instanceMatrix.needsUpdate = true
    printAttr.needsUpdate = true
  }

  return {
    root: mesh,
    add(x, z, heading, age) {
      // left foot here, right foot a step on; across the track is the heading turned a quarter
      const fx = Math.sin(heading)
      const fz = Math.cos(heading)
      press(x + fz * STRADDLE, z - fx * STRADDLE, heading, age, 1)
      press(x + fx * STEP - fz * STRADDLE, z + fz * STEP + fx * STRADDLE, heading, age, -1)
    },
    clear() {
      next = 0
      used = 0
      mesh.count = 0
    },
    dispose() {
      mesh.removeFromParent()
      geo.dispose()
      mat.dispose()
      mesh.dispose()
    },
  }
}
