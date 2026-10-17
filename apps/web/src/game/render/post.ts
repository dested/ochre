/**
 * The post chain's shaders. Order: scene (HDR, depth) → atmosphere (aerial perspective from depth, using the
 * same sky function as the dome) → a blur pyramid (bloom, the dream) → grade (exposure, filmic tone, split
 * toning, saturation, god rays) → paint (a generalised Kuwahara whose radius grows with distance, so faces stay
 * crisp and the far coast turns to brushwork) → finish (pigment pooling at silhouettes, canvas, grain,
 * vignette, fade).
 */
import { NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL } from './glsl'

export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`

export const ATMOS_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uNear;
uniform float uFar;
uniform vec4 uHaze;
uniform float uSeaLevel;
uniform vec3 uLagoon;
varying vec2 vUv;
${SKY_UNIFORMS_GLSL}
${NOISE_GLSL}
${SKY_GLSL}
// optical depth through exponential height fog from the camera to a point
float ocHeightFog( float dist, float yc, float yp, float b, float H ) {
	float dy = yp - yc;
	float ec = exp( - max( yc, -50.0 ) / H );
	if ( abs( dy ) < 0.01 ) return b * dist * ec;
	float ep = exp( - max( yp, -50.0 ) / H );
	return b * dist * ( ec - ep ) / ( dy / H );
}
void main() {
	vec4 sc = texture2D( tScene, vUv );
	float depth = texture2D( tDepth, vUv ).r;
	#ifdef USE_REVERSED_DEPTH_BUFFER
		bool sky = depth <= 0.0;
	#else
		bool sky = depth >= 1.0;
	#endif
	if ( sky ) {
		gl_FragColor = sc;
		return;
	}
	float viewZ = perspectiveDepthToViewZ( depth, uNear, uFar );
	vec4 rc = uProjInv * vec4( vUv * 2.0 - 1.0, 1.0, 1.0 );
	vec3 rv = rc.xyz / rc.w;
	vec3 vp = rv * ( viewZ / rv.z );
	vec3 wp = ( uCamWorld * vec4( vp, 1.0 ) ).xyz;
	vec3 d = wp - uCamPos;
	float dist = length( d );
	vec3 dir = d / max( dist, 1e-4 );
	float yc = uCamPos.y - uSeaLevel;
	float yp = wp.y - uSeaLevel;
	float fogK = 1.0 + uWeather.z * 9.0 + uWeather.y * 3.0;
	float od = ocHeightFog( dist, yc, yp, uHaze.x, uHaze.y ) * fogK;
	od += ocHeightFog( dist, yc, yp, uHaze.z, 9.0 ) * fogK;
	// lagoon mist at dawn: a low bank over the water and the valley floor
	if ( uHaze.w > 0.001 ) {
		float ld = length( ( wp.xz - uLagoon.xy ) / vec2( 1.6, 1.0 ) ) / uLagoon.z;
		float lk = 1.0 - smoothstep( 0.4, 1.3, ld );
		od += ocHeightFog( dist, yc - 0.5, yp - 0.5, uHaze.w * lk * 0.02, 3.5 );
	}
	float T = exp( - od );
	// the air takes the colour of the sky a little above the horizon: blue by day, so distance goes blue
	vec3 sd = normalize( vec3( dir.x, max( dir.y, 0.0 ) * 0.6 + 0.1, dir.z ) );
	vec3 inscatter = ocSkyBase( sd );
	gl_FragColor = vec4( sc.rgb * T + inscatter * ( 1.0 - T ), 1.0 );
}
`

/** 13-tap downsample (Jimenez 2014); `KARIS` on the first level tames fireflies */
export function downFrag(karis: boolean): string {
  return /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 tap( vec2 o ) { return texture2D( tSrc, vUv + o * uTexel ).rgb; }
float kw( vec3 c ) { return 1.0 / ( 1.0 + dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) ); }
void main() {
	vec3 a = tap( vec2( -2.0, 2.0 ) ), b = tap( vec2( 0.0, 2.0 ) ), c = tap( vec2( 2.0, 2.0 ) );
	vec3 d = tap( vec2( -2.0, 0.0 ) ), e = tap( vec2( 0.0, 0.0 ) ), f = tap( vec2( 2.0, 0.0 ) );
	vec3 g = tap( vec2( -2.0, -2.0 ) ), h = tap( vec2( 0.0, -2.0 ) ), i = tap( vec2( 2.0, -2.0 ) );
	vec3 j = tap( vec2( -1.0, 1.0 ) ), k = tap( vec2( 1.0, 1.0 ) ), l = tap( vec2( -1.0, -1.0 ) ), m = tap( vec2( 1.0, -1.0 ) );
	${
    karis
      ? `vec3 g0 = ( a + b + d + e ) * 0.25, g1 = ( b + c + e + f ) * 0.25, g2 = ( d + e + g + h ) * 0.25, g3 = ( e + f + h + i ) * 0.25, g4 = ( j + k + l + m ) * 0.25;
	float w0 = kw( g0 ) * 0.125, w1 = kw( g1 ) * 0.125, w2 = kw( g2 ) * 0.125, w3 = kw( g3 ) * 0.125, w4 = kw( g4 ) * 0.5;
	vec3 o = ( g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4 ) / ( w0 + w1 + w2 + w3 + w4 );`
      : `vec3 o = e * 0.125 + ( a + c + g + i ) * 0.03125 + ( b + d + f + h ) * 0.0625 + ( j + k + l + m ) * 0.125;`
  }
	gl_FragColor = vec4( max( o, vec3( 0.0 ) ), 1.0 );
}
`
}

/** 9-tap tent upsample of the smaller level, added to this level */
export const UP_FRAG = /* glsl */ `
uniform sampler2D tSmall;
uniform sampler2D tCur;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
	vec2 o = uTexel * uRadius;
	vec3 s = texture2D( tSmall, vUv ).rgb * 4.0;
	s += ( texture2D( tSmall, vUv + vec2( o.x, 0.0 ) ).rgb + texture2D( tSmall, vUv - vec2( o.x, 0.0 ) ).rgb + texture2D( tSmall, vUv + vec2( 0.0, o.y ) ).rgb + texture2D( tSmall, vUv - vec2( 0.0, o.y ) ).rgb ) * 2.0;
	s += texture2D( tSmall, vUv + o ).rgb + texture2D( tSmall, vUv - o ).rgb + texture2D( tSmall, vUv + vec2( o.x, - o.y ) ).rgb + texture2D( tSmall, vUv + vec2( - o.x, o.y ) ).rgb;
	s /= 16.0;
	gl_FragColor = vec4( texture2D( tCur, vUv ).rgb + s, 1.0 );
}
`

export const GRADE_FRAG = /* glsl */ `
uniform sampler2D tHdr;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform float uBloomNorm;
uniform float uExposure;
uniform float uSaturation;
uniform vec3 uSplitShadow;
uniform vec3 uSplitHighlight;
uniform vec3 uBloom;
uniform vec4 uRays;
uniform vec3 uRayColor;
uniform float uDream;
uniform vec2 uRes;
varying vec2 vUv;
vec3 ocAces( vec3 x ) {
	// Narkowicz's fit, softened in the shoulder a touch for paint
	const float a = 2.43;
	const float b = 0.07;
	const float c = 2.3;
	const float d = 0.62;
	const float e = 0.15;
	return clamp( ( x * ( a * x + b ) ) / ( x * ( c * x + d ) + e ), 0.0, 1.0 );
}
void main() {
	vec3 c = texture2D( tHdr, vUv ).rgb;
	vec3 bl = texture2D( tBloom, vUv ).rgb * uBloomNorm;
	// energy-conserving bloom plus the excess over a knee (fire, sun, sparkle)
	c = mix( c, bl, uBloom.x ) + max( bl - uBloom.z, vec3( 0.0 ) ) * uBloom.y;
	// god rays
	c += texture2D( tRays, vUv ).rgb * uRayColor * uRays.x;
	// the infant's dream: softened everywhere, more so toward the edges
	if ( uDream > 0.001 ) {
		vec2 cc = ( vUv - 0.5 ) * vec2( uRes.x / uRes.y, 1.0 );
		float rad = smoothstep( 0.15, 0.85, length( cc ) );
		c = mix( c, bl * 1.05, uDream * ( 0.45 + 0.55 * rad ) );
		c *= mix( vec3( 1.0 ), vec3( 1.08, 0.96, 0.86 ), uDream );
	}
	c *= uExposure;
	// tone map the luminance and keep the hue (golden light stays golden), letting only the hottest
	// colours (sun, fire) roll per channel toward white
	vec3 pc = ocAces( c );
	float L0 = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	float Lt = ocAces( vec3( L0 ) ).r;
	vec3 lp = c * ( Lt / max( L0, 1e-4 ) );
	float hot = max( max( lp.r, lp.g ), lp.b );
	c = mix( lp, pc, smoothstep( 0.85, 1.5, hot ) );
	float L = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c *= mix( uSplitShadow, uSplitHighlight, smoothstep( 0.05, 0.75, L ) );
	L = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = mix( vec3( L ), c, uSaturation );
	c = clamp( c, 0.0, 1.0 );
	gl_FragColor = vec4( pow( c, vec3( 1.0 / 2.2 ) ), 1.0 );
}
`

/**
 * Generalised Kuwahara with polynomial sector weights (Kyprianidis et al.), 8 sectors, a fixed tap grid scaled
 * by a per-pixel radius: brushwork in the distance, nearly nothing up close.
 */
export function paintFrag(taps: number): string {
  return /* glsl */ `
#include <packing>
uniform sampler2D tSrc;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform vec3 uRadius;
uniform float uDream;
varying vec2 vUv;
const int R = ${taps};
void main() {
	float depth = texture2D( tDepth, vUv ).r;
	#ifdef USE_REVERSED_DEPTH_BUFFER
		bool sky = depth <= 0.0;
	#else
		bool sky = depth >= 1.0;
	#endif
	float dist = sky ? uFar : - perspectiveDepthToViewZ( depth, uNear, uFar );
	float radius = mix( uRadius.x, uRadius.y, smoothstep( 4.0, uRadius.z, dist ) );
	radius = mix( radius, uRadius.y * 1.2, uDream );
	if ( radius < 0.7 ) {
		gl_FragColor = texture2D( tSrc, vUv );
		return;
	}
	const float zeta = 0.22;
	const float eta = ( zeta + 0.92388 ) / 0.146447;
	vec4 m[8];
	vec3 s[8];
	for ( int k = 0; k < 8; k ++ ) {
		m[k] = vec4( 0.0 );
		s[k] = vec3( 0.0 );
	}
	float stp = radius / float( R );
	for ( int j = - R; j <= R; j ++ ) {
		for ( int i = - R; i <= R; i ++ ) {
			vec2 v = vec2( float( i ), float( j ) ) / float( R );
			float vv = dot( v, v );
			if ( vv > 1.0 ) continue;
			vec3 c = texture2D( tSrc, vUv + vec2( float( i ), float( j ) ) * stp * uTexel ).rgb;
			float w[8];
			float sum = 0.0;
			float z, vxx, vyy;
			vxx = zeta - eta * v.x * v.x;
			vyy = zeta - eta * v.y * v.y;
			z = max( 0.0, v.y + vxx ); w[0] = z * z; sum += w[0];
			z = max( 0.0, - v.x + vyy ); w[2] = z * z; sum += w[2];
			z = max( 0.0, - v.y + vxx ); w[4] = z * z; sum += w[4];
			z = max( 0.0, v.x + vyy ); w[6] = z * z; sum += w[6];
			vec2 r = 0.70710678 * vec2( v.x - v.y, v.x + v.y );
			vxx = zeta - eta * r.x * r.x;
			vyy = zeta - eta * r.y * r.y;
			z = max( 0.0, r.y + vxx ); w[1] = z * z; sum += w[1];
			z = max( 0.0, - r.x + vyy ); w[3] = z * z; sum += w[3];
			z = max( 0.0, - r.y + vxx ); w[5] = z * z; sum += w[5];
			z = max( 0.0, r.x + vyy ); w[7] = z * z; sum += w[7];
			float g = exp( - 2.2 * vv ) / max( sum, 1e-5 );
			for ( int k = 0; k < 8; k ++ ) {
				float wk = w[k] * g;
				m[k] += vec4( c * wk, wk );
				s[k] += c * c * wk;
			}
		}
	}
	vec4 o = vec4( 0.0 );
	for ( int k = 0; k < 8; k ++ ) {
		if ( m[k].w <= 1e-6 ) continue;
		vec3 mean = m[k].rgb / m[k].w;
		vec3 var = abs( s[k] / m[k].w - mean * mean );
		float sigma2 = var.r + var.g + var.b;
		float w = 1.0 / ( 1.0 + pow( 700.0 * sigma2, 4.0 ) );
		o += vec4( mean * w, w );
	}
	gl_FragColor = vec4( o.rgb / max( o.w, 1e-5 ), 1.0 );
}
`
}

export const FINISH_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tSrc;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uFade;
uniform float uTime;
uniform vec4 uVignette;
uniform float uDream;
uniform float uGrain;
uniform float uPool;
varying vec2 vUv;
${NOISE_GLSL}
float ocDist( vec2 uv ) {
	float d = texture2D( tDepth, uv ).r;
	#ifdef USE_REVERSED_DEPTH_BUFFER
		if ( d <= 0.0 ) return uFar;
	#else
		if ( d >= 1.0 ) return uFar;
	#endif
	return - perspectiveDepthToViewZ( d, uNear, uFar );
}
void main() {
	vec3 c = texture2D( tSrc, vUv ).rgb;
	// pigment pooled at silhouettes: where depth jumps, the wash darkens a little and deepens in colour
	if ( uPool > 0.0 ) {
		// 1/z is linear across a plane in screen space, so its Laplacian is zero on any flat surface however
		// grazing, and spikes only where one surface steps in front of another
		vec2 o = uTexel * 1.5;
		float z0 = ocDist( vUv );
		float w0 = 1.0 / z0;
		float wl = 1.0 / ocDist( vUv - vec2( o.x, 0.0 ) );
		float wr = 1.0 / ocDist( vUv + vec2( o.x, 0.0 ) );
		float wd = 1.0 / ocDist( vUv - vec2( 0.0, o.y ) );
		float wu = 1.0 / ocDist( vUv + vec2( 0.0, o.y ) );
		float lx = abs( wl + wr - 2.0 * w0 );
		float ly = abs( wu + wd - 2.0 * w0 );
		float jump = max( lx, ly ) / w0;
		// only the far side of a step pools (the background just outside a silhouette)
		float behind = step( 0.0, max( max( wl, wr ), max( wu, wd ) ) - w0 * 1.02 );
		float edge = smoothstep( 0.08, 0.4, jump ) * behind * ( 1.0 - smoothstep( 300.0, 2000.0, z0 ) );
		vec3 deep = c * c * 1.1;
		c = mix( c, deep, edge * uPool );
	}
	vec2 fc = vUv * uRes;
	float P = uRes.y / 1080.0;
	// canvas: a fine weave and a slow mottle
	vec2 wq = fc / ( 2.6 * P );
	float weave = ( sin( wq.x * 1.7 + sin( wq.y * 0.31 ) * 0.6 ) * sin( wq.y * 1.7 + sin( wq.x * 0.29 ) * 0.6 ) ) * 0.5 + 0.5;
	float mott = ocFbm( fc / ( 220.0 * P ) );
	float lum = dot( c, vec3( 0.3, 0.55, 0.15 ) );
	c *= 1.0 + ( weave - 0.5 ) * 0.035 * ( 0.4 + lum ) + ( mott - 0.5 ) * 0.04;
	// grain
	float gr = ocHash( fc + fract( uTime * 7.13 ) * 113.0 ) - 0.5;
	c += gr * uGrain * ( 0.6 + 0.4 * ( 1.0 - lum ) );
	// vignette (warm in the dream)
	vec2 cc = ( vUv - 0.5 ) * vec2( uRes.x / uRes.y, 1.0 );
	float vr = dot( cc, cc );
	float vig = smoothstep( 0.18, 0.9, vr ) * uVignette.w;
	vec3 vcol = mix( uVignette.rgb, vec3( 0.75, 0.42, 0.22 ), uDream );
	vig = max( vig, smoothstep( 0.08, 0.6, vr ) * uDream * 0.85 );
	c = mix( c, c * vcol, vig );
	c *= 1.0 - uFade;
	gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
}
`

/** radial blur of the sky's light from the sun's screen position (god rays), quarter resolution */
export const RAYS_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tSrc;
uniform sampler2D tDepth;
uniform vec4 uRays;
uniform float uAspect;
varying vec2 vUv;
float ocSkyMask( vec2 uv ) {
	float d = texture2D( tDepth, uv ).r;
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float sky = d <= 0.0 ? 1.0 : 0.0;
	#else
		float sky = d >= 1.0 ? 1.0 : 0.0;
	#endif
	vec3 c = texture2D( tSrc, uv ).rgb;
	// only the sun and its hot glow cast rays, not the whole bright sky
	return sky * clamp( dot( c, vec3( 0.3, 0.5, 0.2 ) ) - 3.5, 0.0, 8.0 );
}
void main() {
	vec2 sun = uRays.yz;
	vec2 dlt = ( vUv - sun ) / 48.0 * 0.92;
	vec2 uv = vUv;
	float acc = 0.0;
	float decay = 1.0;
	float jitter = fract( sin( dot( vUv, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
	uv -= dlt * jitter;
	for ( int i = 0; i < 48; i ++ ) {
		acc += ocSkyMask( uv ) * decay;
		decay *= 0.965;
		uv -= dlt;
	}
	vec2 asp = ( vUv - sun ) * vec2( uAspect, 1.0 );
	float fall = exp( - dot( asp, asp ) * 1.6 );
	gl_FragColor = vec4( vec3( acc / 48.0 * fall * uRays.w ), 1.0 );
}
`
