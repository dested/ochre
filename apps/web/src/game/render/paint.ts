/**
 * The painted-light patch for MeshStandardMaterial: three still does the shadows and the fire lights, but the
 * direct light goes through a soft three-step ramp, the ambient comes from the colour script's cool sky and
 * warm ground (and darkens inside the cave), a warm rim catches the key light, skin gets a wrapped, reddened
 * terminator, and the albedo gets a world-space brush variation. No fog here: the post chain paints the air.
 *
 * `patchPaint` is the general form the world's own materials use (terrain, rock, foliage) to inject their
 * albedo; `paint` is the contract export for everyone else.
 */
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three'
import { Vector4 } from 'three'
import type { PaintMaterial, PaintOptions } from '../contracts'
import { NOISE_GLSL, PAINT_GLSL, PAINT_UNIFORMS_GLSL } from './glsl'
import { LIGHT } from './uniforms'

export type PaintExtra = {
  /** a key for the program cache: one per distinct extra */
  key: string
  /** GLSL declared in the vertex shader before main (attributes, varyings) */
  vertexHead?: string
  /** GLSL run after `begin_vertex`: may move `transformed` (object space, before the instance matrix) */
  vertexPre?: string
  /** GLSL run at the end of the vertex main (has `ocWorld`, the world position) */
  vertexMain?: string
  /** GLSL declared in the fragment shader before main */
  fragmentHead?: string
  /** GLSL run after the vertex colour is applied: may rewrite `diffuseColor` (has `vOcWorld`) */
  albedo?: string
  /** GLSL run after the normal is known: may bend `normal` (view space) */
  normal?: string
  /** GLSL run at the very end of the fragment main: may adjust `gl_FragColor` */
  fragmentEnd?: string
  /** extra uniforms (shared objects are fine) */
  uniforms?: Record<string, { value: unknown }>
}

const VERT_HEAD = /* glsl */ `
varying vec3 vOcWorld;
varying vec3 vOcNormalW;
`

const VERT_MAIN = /* glsl */ `
	vec4 ocW = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		ocW = batchingMatrix * ocW;
	#endif
	#ifdef USE_INSTANCING
		ocW = instanceMatrix * ocW;
	#endif
	ocW = modelMatrix * ocW;
	vec3 ocWorld = ocW.xyz;
	vOcWorld = ocWorld;
	vec3 ocNo = objectNormal;
	#ifdef USE_INSTANCING
		ocNo = mat3( instanceMatrix ) * ocNo;
	#endif
	vOcNormalW = normalize( ( modelMatrix * vec4( ocNo, 0.0 ) ).xyz );
`

const FRAG_HEAD = /* glsl */ `
varying vec3 vOcWorld;
varying vec3 vOcNormalW;
uniform vec4 uPaint;
${PAINT_UNIFORMS_GLSL}
${NOISE_GLSL}
${PAINT_GLSL}
// the brush: a world-space variation of value and temperature, in strokes a hand might lay
vec3 ocBrush( vec3 c, vec3 wp, float k ) {
	vec3 q = wp * 1.7;
	float n1 = ocNoise3( q );
	float n2 = ocNoise3( q * vec3( 3.1, 0.9, 3.1 ) + 11.0 );
	float v = ( n1 - 0.5 ) * 0.22 + ( n2 - 0.5 ) * 0.12;
	vec3 warm = c * vec3( 1.06, 1.0, 0.92 );
	vec3 cool = c * vec3( 0.94, 0.99, 1.06 );
	vec3 o = mix( cool, warm, ocNoise3( q * 0.37 + 5.0 ) );
	return mix( c, o * ( 1.0 + v ), k );
}
`

/** rain darkens whatever the sky reaches (the sheen is added with the rim) */
const WET = /* glsl */ `
	float ocWet = uWeather.y * smoothstep( 0.6, 0.95, ocCaveSky( vOcWorld ) );
	diffuseColor.rgb *= 1.0 - 0.38 * ocWet;
`

const DIRECT = /* glsl */ `
void RE_Direct_Painted( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float ndl = dot( geometryNormal, directLight.direction );
	float r;
	vec3 tint = vec3( 1.0 );
	if ( uPaint.z > 0.5 ) {
		// skin: wrapped light with a warm, reddened terminator
		float w = ( ndl + 0.42 ) / 1.42;
		r = ocRamp( w ) * smoothstep( - 0.42, 0.0, ndl );
		float term = smoothstep( - 0.3, 0.05, ndl ) * ( 1.0 - smoothstep( 0.05, 0.45, ndl ) );
		tint = mix( vec3( 1.0 ), vec3( 1.25, 0.72, 0.55 ), term );
	} else {
		r = ocRamp( ndl );
	}
	vec3 irradiance = directLight.color * r * tint;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	// a soft, broad sheen instead of a sharp highlight
	vec3 h = normalize( directLight.direction + geometryViewDir );
	float sh = pow( max( dot( geometryNormal, h ), 0.0 ), 24.0 ) * ( 1.0 - material.roughness ) * 0.6;
	reflectedLight.directSpecular += directLight.color * sh * r * 0.25;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Painted
`

const AMBIENT = /* glsl */ `
	{
		vec3 ocN = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz );
		irradiance = ocAmbient( ocN, vOcWorld ) * 3.14159;
	}
`

const RIM = /* glsl */ `
	{
		vec3 ocN = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz );
		vec3 ocV = normalize( uCamPos - vOcWorld );
		float fr = pow( 1.0 - clamp( dot( ocN, ocV ), 0.0, 1.0 ), 3.0 );
		float facing = clamp( dot( ocN, uKeyDir ) * 0.6 + 0.5, 0.0, 1.0 );
		float behind = clamp( - dot( ocV, uKeyDir ) * 0.5 + 0.5, 0.0, 1.0 );
		reflectedLight.directDiffuse += uRimColor * fr * facing * ( 0.4 + 0.6 * behind ) * uPaint.y * diffuseColor.rgb * ocCaveSky( vOcWorld );
		// wet things shine with the sky at a grazing look
		reflectedLight.directSpecular += uSkyAmb * fr * fr * ocWet * 0.3;
	}
`

function opt(v: number | undefined, d: number): number {
  return v === undefined ? d : v
}

/** Patch a standard material into the painted look, with optional injected GLSL. In place; returns it. */
export function patchPaint(material: MeshStandardMaterial, opts: PaintOptions = {}, extra?: PaintExtra): MeshStandardMaterial {
  const skin = opts.skin === true
  const uPaint = { value: new Vector4(opt(opts.brush, 0.5), opt(opts.rim, skin ? 0.45 : 0.3), skin ? 1 : 0, 0) }
  const prev = material.onBeforeCompile
  const key = `paint:${skin ? 's' : 'n'}:${extra?.key ?? ''}`
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev.call(material, shader, renderer)
    const u = shader.uniforms
    u.uPaint = uPaint
    u.uKeyColor = LIGHT.uKeyColor
    u.uKeyDir = LIGHT.uKeyDir
    u.uSkyAmb = LIGHT.uSkyAmb
    u.uGroundAmb = LIGHT.uGroundAmb
    u.uRimColor = LIGHT.uRimColor
    u.uCave = LIGHT.uCave
    u.uCave2 = LIGHT.uCave2
    u.uCamPos = LIGHT.uCamPos
    u.uSeaLevel = LIGHT.uSeaLevel
    u.uFireGlow = LIGHT.uFireGlow
    u.uFireGlow2 = LIGHT.uFireGlow2
    u.uWeather = LIGHT.uWeather
    u.uTime = LIGHT.uTime
    u.uWind = LIGHT.uWind
    if (extra?.uniforms) for (const [k, v] of Object.entries(extra.uniforms)) u[k] = v
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}\nuniform float uTime;\nuniform vec3 uWind;\n${extra?.vertexHead ?? ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${extra?.vertexPre ?? ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_MAIN}\n${extra?.vertexMain ?? ''}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}\nuniform float uTime;\nuniform vec3 uWind;\n${extra?.fragmentHead ?? ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n\tdiffuseColor.rgb = ocBrush( diffuseColor.rgb, vOcWorld, uPaint.x );\n${extra?.albedo ?? ''}\n${WET}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${extra?.normal ?? ''}`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${DIRECT}`)
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>\n${AMBIENT}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${RIM}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${extra?.fragmentEnd ?? ''}\n\t// a NaN here would spread through the bloom pyramid to the whole frame\n\tif ( any( isnan( gl_FragColor.rgb ) ) || any( isinf( gl_FragColor.rgb ) ) ) gl_FragColor.rgb = vec3( 0.0 );`)
  }
  const prevKey = material.customProgramCacheKey
  material.customProgramCacheKey = () => `${prevKey.call(material)}|${key}`
  material.fog = false
  material.needsUpdate = true
  return material
}

export const paint: PaintMaterial = (material: MeshStandardMaterial, opts?: PaintOptions) => patchPaint(material, opts)
