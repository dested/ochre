/**
 * Shared GLSL: hashes and noise, the sky (one function for the dome, the sea's reflections and the haze in the
 * post chain, so distance always melts into the exact sky behind it), and the painted-light helpers.
 * Every name starts with `oc` so nothing collides with three's chunks.
 */

export const NOISE_GLSL = /* glsl */ `
float ocHash( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
float ocHash3( vec3 p ) {
	p = fract( p * 0.1031 );
	p += dot( p, p.zyx + 31.32 );
	return fract( ( p.x + p.y ) * p.z );
}
vec2 ocHash2( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.xx + p3.yz ) * p3.zy );
}
float ocNoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	float a = ocHash( i );
	float b = ocHash( i + vec2( 1.0, 0.0 ) );
	float c = ocHash( i + vec2( 0.0, 1.0 ) );
	float d = ocHash( i + vec2( 1.0, 1.0 ) );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
float ocNoise3( vec3 p ) {
	vec3 i = floor( p );
	vec3 f = fract( p );
	vec3 u = f * f * ( 3.0 - 2.0 * f );
	float n000 = ocHash3( i );
	float n100 = ocHash3( i + vec3( 1.0, 0.0, 0.0 ) );
	float n010 = ocHash3( i + vec3( 0.0, 1.0, 0.0 ) );
	float n110 = ocHash3( i + vec3( 1.0, 1.0, 0.0 ) );
	float n001 = ocHash3( i + vec3( 0.0, 0.0, 1.0 ) );
	float n101 = ocHash3( i + vec3( 1.0, 0.0, 1.0 ) );
	float n011 = ocHash3( i + vec3( 0.0, 1.0, 1.0 ) );
	float n111 = ocHash3( i + vec3( 1.0, 1.0, 1.0 ) );
	return mix( mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y ), mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y ), u.z );
}
float ocFbm( vec2 p ) {
	float s = 0.0;
	float a = 0.5;
	for ( int i = 0; i < 4; i ++ ) {
		s += a * ocNoise( p );
		p = mat2( 1.6, 1.2, - 1.2, 1.6 ) * p + 7.3;
		a *= 0.5;
	}
	return s / 0.9375;
}
float ocFbm3( vec3 p ) {
	float s = 0.0;
	float a = 0.5;
	for ( int i = 0; i < 3; i ++ ) {
		s += a * ocNoise3( p );
		p = p * 2.03 + vec3( 3.1, 1.7, 5.3 );
		a *= 0.5;
	}
	return s / 0.875;
}
`

export const SKY_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform vec3 uSunDisc;
uniform vec4 uSkyState;
uniform vec4 uWeather;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uWind;
uniform float uStarSpin;
uniform float uTime;
`

/** needs NOISE_GLSL and SKY_UNIFORMS_GLSL before it */
export const SKY_GLSL = /* glsl */ `
// the sky without discs, clouds or stars: the dome's base and the haze's colour
vec3 ocSkyBase( vec3 d ) {
	float y = d.y;
	float up = clamp( y, 0.0, 1.0 );
	float t = pow( up, 0.5 );
	// mixed as a painter would, in display space through a pale band, so gold never meets blue as mauve
	vec3 hs = sqrt( uHorizon );
	vec3 zs = sqrt( uZenith );
	vec3 pale = mix( hs, zs, 0.5 );
	// with the sun low the gold climbs higher and the band between stays warm (peach, not grey)
	float gold = smoothstep( 0.45, 0.08, uSunDir.y ) * smoothstep( - 0.1, 0.02, uSunDir.y );
	pale = mix( pale, vec3( dot( pale, vec3( 0.3, 0.55, 0.15 ) ) ) * vec3( 1.04, 1.02, 0.95 ), 0.4 - 0.28 * gold ) * 1.06;
	float split = 0.3 + 0.14 * gold;
	vec3 cs = t < split ? mix( hs, pale, smoothstep( 0.0, split, t ) ) : mix( pale, zs, smoothstep( split, 1.0, t ) );
	vec3 col = cs * cs;
	// a brighter band hugging the horizon
	col = mix( col, uHorizon * 1.08, exp( - up * 18.0 ) * 0.35 );
	// below the horizon: the haze, a little deeper
	col = y < 0.0 ? mix( uHorizon, uHorizon * vec3( 0.78, 0.82, 0.9 ), clamp( - y * 3.0, 0.0, 1.0 ) ) : col;
	float mu = dot( d, uSunDir );
	float m = max( mu, 0.0 );
	float band = exp( - abs( y ) * 5.0 );
	float sunUp = smoothstep( - 0.28, 0.02, uSunDir.y );
	col += uSunGlow * ( pow( m, 5.0 ) * ( 0.1 + 0.9 * band ) * 0.4 + pow( m, 28.0 ) * 0.85 + pow( m, 400.0 ) * 2.0 ) * sunUp;
	// a low sun warms its whole half of the sky, high up too
	col += uSunGlow * pow( m, 1.5 ) * 0.2 * gold;
	// and the far side of the sky goes dusty lavender rather than blue
	col *= mix( vec3( 1.0 ), vec3( 1.12, 0.97, 0.84 ), gold * ( 1.0 - m ) * smoothstep( 0.0, 0.3, y ) );
	// the earth's shadow and the pink belt opposite the sun at twilight
	float twi = smoothstep( 0.18, 0.0, abs( uSunDir.y + 0.02 ) );
	float anti = max( - mu, 0.0 );
	col += vec3( 0.32, 0.16, 0.2 ) * twi * anti * exp( - abs( y - 0.08 ) * 9.0 ) * 0.5;
	// storms grey the sky
	col = mix( col, vec3( dot( col, vec3( 0.3, 0.5, 0.2 ) ) ) * vec3( 0.85, 0.9, 1.0 ), uWeather.w * 0.6 + uWeather.y * 0.25 );
	col *= 1.0 - uWeather.w * 0.3;
	return col;
}

vec3 ocRotate( vec3 v, vec3 k, float a ) {
	float c = cos( a );
	float s = sin( a );
	return v * c + cross( k, v ) * s + k * dot( k, v ) * ( 1.0 - c );
}

// painted clouds: soft heaps lit on the sun's side, with rims of light
vec4 ocClouds( vec3 d ) {
	if ( d.y < 0.005 ) return vec4( 0.0 );
	vec2 p = d.xz / ( d.y + 0.12 ) * 1.25;
	vec2 drift = uWind.xz * uTime * 0.0035 * ( 0.4 + uWind.y );
	p += drift;
	float cover = clamp( uWeather.x, 0.0, 1.0 );
	vec2 q = p + 0.6 * vec2( ocFbm( p * 0.55 + 3.0 ), ocFbm( p * 0.55 + 9.0 ) );
	float n = ocFbm( q * 0.9 );
	float lo = 0.72 - cover * 0.5;
	float dens = smoothstep( lo, lo + 0.22, n );
	// light: sample toward the sun in the cloud plane; thinner there = the lit edge
	vec2 sp = normalize( uSunDir.xz + 1e-4 ) * 0.22;
	float n2 = ocFbm( ( q + sp ) * 0.9 );
	float lit = clamp( ( n - n2 ) * 4.0 + 0.5, 0.0, 1.0 );
	lit = mix( lit, 1.0, 0.25 );
	// painterly: a few soft values, not a smooth gradient
	lit = floor( lit * 4.0 + 0.5 ) / 4.0 * 0.6 + lit * 0.4;
	vec3 col = mix( uCloudShade, uCloudLit, lit );
	// silver lining toward the sun
	float mu = max( dot( d, uSunDir ), 0.0 );
	col += uSunGlow * pow( mu, 8.0 ) * ( 1.0 - dens ) * 1.5 * smoothstep( - 0.2, 0.05, uSunDir.y );
	// high streaks of cirrus, catching the low sun
	vec2 cq = vec2( p.x * 0.35 + p.y * 0.2, p.y * 1.4 - p.x * 0.3 ) * 0.7 + drift * 0.5;
	float ci = smoothstep( 0.55, 0.85, ocFbm( cq + 21.0 ) ) * smoothstep( 0.6, 0.95, ocNoise( cq * 0.25 + 4.0 ) ) * 0.55;
	vec3 ciCol = mix( uCloudLit, uSunGlow * 1.3 + uCloudLit * 0.4, 0.5 );
	float fade = smoothstep( 0.0, 0.18, d.y );
	float a = clamp( dens * 0.95, 0.0, 1.0 ) * fade;
	vec3 outCol = mix( ciCol, col, dens );
	float outA = max( a, ci * fade * ( 1.0 - dens ) );
	return vec4( outCol, outA );
}

vec3 ocStars( vec3 d ) {
	// the sky turns about the south celestial pole (34° up, due south)
	vec3 axis = vec3( 0.0, 0.5592, 0.829 );
	vec3 s = ocRotate( d, axis, - uStarSpin );
	vec3 col = vec3( 0.0 );
	for ( int layer = 0; layer < 2; layer ++ ) {
		float sc = layer == 0 ? 140.0 : 260.0;
		vec3 q = s * sc;
		vec3 c = floor( q );
		float h = ocHash3( c + float( layer ) * 17.0 );
		float thr = layer == 0 ? 0.972 : 0.955;
		if ( h > thr ) {
			vec3 jit = vec3( ocHash3( c + 1.3 ), ocHash3( c + 7.1 ), ocHash3( c + 3.7 ) ) * 0.6 + 0.2;
			float dd = length( q - c - jit );
			float b = pow( ( h - thr ) / ( 1.0 - thr ), 2.0 ) * ( layer == 0 ? 2.6 : 1.0 );
			float tw = 0.75 + 0.25 * sin( uTime * ( 1.5 + h * 4.0 ) + h * 60.0 );
			vec3 tint = mix( vec3( 0.75, 0.85, 1.0 ), vec3( 1.0, 0.85, 0.65 ), ocHash3( c + 9.9 ) );
			col += tint * b * tw * smoothstep( 0.32, 0.0, dd );
		}
	}
	// the Milky Way: a band of light with dark dust lanes, brightest toward the core
	vec3 g = normalize( vec3( 0.35, 0.25, - 0.9 ) );
	float lat = dot( s, g );
	float band = exp( - lat * lat * 28.0 );
	vec3 core = normalize( vec3( 0.2, - 0.6, 0.15 ) );
	float coreK = pow( max( dot( s, core ), 0.0 ), 3.0 );
	float cl = ocFbm3( s * 7.0 ) * 0.7 + ocFbm3( s * 19.0 ) * 0.3;
	float dust = smoothstep( 0.48, 0.72, ocFbm3( s * 11.0 + 5.0 ) ) * exp( - lat * lat * 120.0 );
	float mw = band * ( 0.35 + 0.65 * cl ) * ( 1.0 + 1.6 * coreK ) * ( 1.0 - 0.75 * dust );
	col += mix( vec3( 0.32, 0.38, 0.55 ), vec3( 0.6, 0.48, 0.38 ), coreK ) * mw * 0.32;
	return col;
}

vec3 ocMoon( vec3 d, out float mask ) {
	float r = 0.028;
	float c = dot( d, uMoonDir );
	mask = 0.0;
	if ( c < cos( r * 4.0 ) ) return vec3( 0.0 );
	vec3 up = abs( uMoonDir.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
	vec3 tx = normalize( cross( up, uMoonDir ) );
	vec3 ty = cross( uMoonDir, tx );
	vec2 uv = vec2( dot( d, tx ), dot( d, ty ) ) / r;
	float rr = dot( uv, uv );
	vec3 col = vec3( 0.0 );
	// halo
	col += vec3( 0.55, 0.62, 0.8 ) * uSkyState.w * 0.06 * exp( - sqrt( rr ) * 0.9 );
	if ( rr < 1.0 ) {
		vec3 n = normalize( uv.x * tx + uv.y * ty - uMoonDir * sqrt( 1.0 - rr ) );
		float lit = smoothstep( - 0.04, 0.12, dot( n, uSunDir ) );
		float maria = ocFbm( uv * 2.3 + 4.0 );
		vec3 alb = mix( vec3( 0.95, 0.92, 0.84 ), vec3( 0.62, 0.62, 0.66 ), smoothstep( 0.45, 0.7, maria ) );
		col = alb * ( lit * 3.2 + 0.05 );
		// by day the unlit part is just sky
		mask = smoothstep( 1.0, 0.92, rr ) * mix( lit, 1.0, uSkyState.z );
	}
	return col;
}

// the whole sky: base, sun disc, stars, moon, clouds
vec3 ocSkyFull( vec3 d ) {
	vec3 col = ocSkyBase( d );
	float night = uSkyState.z;
	if ( night > 0.01 && d.y > - 0.02 ) col += ocStars( d ) * night * smoothstep( - 0.02, 0.12, d.y );
	float mm = 0.0;
	vec3 moon = ocMoon( d, mm );
	col = mix( col + moon * ( 1.0 - mm ), moon + col * 0.15, mm * clamp( 0.35 + night, 0.0, 1.0 ) );
	float mu = dot( d, uSunDir );
	float disc = smoothstep( 0.99975, 0.99985, mu );
	col += uSunDisc * disc * smoothstep( - 0.02, 0.0, d.y );
	vec4 cl = ocClouds( d );
	col = mix( col, cl.rgb, cl.a );
	return col;
}
`

export const PAINT_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uKeyColor;
uniform vec3 uKeyDir;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uRimColor;
uniform vec4 uCave;
uniform vec4 uCave2;
uniform vec3 uCamPos;
uniform float uSeaLevel;
uniform vec4 uFireGlow;
uniform vec4 uFireGlow2;
uniform vec4 uWeather;
`

/** cave darkness and the painted ramp; needs PAINT_UNIFORMS_GLSL */
export const PAINT_GLSL = /* glsl */ `
// how much open sky a point inside the cave still sees (1 outside)
float ocCaveSky( vec3 wp ) {
	vec2 d = wp.xz - uCave.xy;
	float a = d.x * uCave.z + d.y * uCave.w;
	float b = - ( d.x * uCave.w - d.y * uCave.z );
	float hw = uCave2.z + 3.0;
	float inside = smoothstep( 3.0, - 3.0, a ) * ( 1.0 - smoothstep( hw - 2.0, hw + 3.0, abs( b ) ) );
	inside *= 1.0 - smoothstep( uCave2.x + uCave2.w + 1.5, uCave2.x + uCave2.w + 4.5, wp.y );
	inside *= smoothstep( - uCave2.y - 6.0, - uCave2.y + 2.0, a );
	float deep = smoothstep( 2.0, - uCave2.y * 0.75, a );
	return mix( 1.0, mix( 0.6, 0.16, deep ), inside );
}
// knife-laid rock: Voronoi blocks on the plane the surface mostly faces, wider than tall like bedding; each block
// is a flat facet with its own tilt (xyz, world space, ±0.5) and tone (w)
vec4 ocFacet( vec3 wp, vec3 nw, float size ) {
	vec3 an = abs( nw );
	vec3 U = vec3( 1.0, 0.0, 0.0 );
	vec3 V = vec3( 0.0, 1.0, 0.0 );
	if ( an.y > 0.72 ) V = vec3( 0.0, 0.0, 1.0 );
	else if ( an.x > an.z ) U = vec3( 0.0, 0.0, 1.0 );
	vec2 p = vec2( dot( wp, U ) / ( size * 1.6 ), dot( wp, V ) / size );
	vec2 i = floor( p );
	vec2 f = fract( p );
	float d1 = 9.0;
	vec2 id = vec2( 0.0 );
	for ( int y = - 1; y <= 1; y ++ ) {
		for ( int x = - 1; x <= 1; x ++ ) {
			vec2 o = vec2( float( x ), float( y ) );
			vec2 r = o + ocHash2( i + o ) - f;
			float d = dot( r, r );
			if ( d < d1 ) { d1 = d; id = i + o; }
		}
	}
	vec2 h = ocHash2( id + 17.0 ) - 0.5;
	return vec4( U * h.x + V * h.y, ocHash( id + 5.3 ) );
}
// a soft three-step ramp: shadow, half-tone, light (with a little of the smooth term kept)
float ocRamp( float ndl ) {
	float a = smoothstep( - 0.06, 0.1, ndl );
	float b = smoothstep( 0.3, 0.48, ndl );
	float stepped = a * 0.58 + b * 0.42;
	return mix( stepped, clamp( ndl * 1.1, 0.0, 1.0 ), 0.3 );
}
// a hearth as a big soft light: wrapped round the forms, falling off over about 8 m, no shadow (the point lights
// do the hard modelling; this is the warm air of the fire that fills a cave and the faces round it)
vec3 ocFireFill( vec4 f, vec3 nw, vec3 wp ) {
	vec3 d = f.xyz - wp;
	float r2 = dot( d, d );
	float wrap = clamp( dot( nw, d * inversesqrt( max( r2, 1e-4 ) ) ) * 0.6 + 0.4, 0.0, 1.0 );
	float fall = 1.0 / ( 1.0 + r2 * 0.11 ) * ( 1.0 - smoothstep( 100.0, 400.0, r2 ) );
	return vec3( 1.0, 0.44, 0.16 ) * f.w * wrap * wrap * fall;
}
vec3 ocAmbient( vec3 nw, vec3 wp ) {
	float up = nw.y * 0.5 + 0.5;
	vec3 amb = mix( uGroundAmb, uSkyAmb, smoothstep( 0.0, 1.0, up ) );
	float cs = ocCaveSky( wp );
	// what light reaches inside has come off warm rock and sand, not straight from the blue sky
	amb = mix( amb, vec3( dot( amb, vec3( 0.3, 0.5, 0.2 ) ) ) * vec3( 1.15, 0.92, 0.7 ), ( 1.0 - cs ) * 0.85 );
	// inside, the sunlit ground at the mouth bounces a warm light deep into the cave, most onto walls and roof
	vec3 bounce = uKeyColor * vec3( 0.95, 0.72, 0.5 ) * ( 0.045 + 0.035 * ( 1.0 - up ) ) * ( 1.0 - cs );
	// and it comes in through the mouth: rock turned to the mouth catches it, rock turned away keeps its shade,
	// so the back wall at 20 m holds its form instead of going one flat brown
	float face = max( dot( nw, vec3( uCave.z, 0.0, uCave.w ) ), nw.y * 0.55 );
	float dirK = mix( 1.0, 0.5 + 0.8 * smoothstep( - 0.7, 0.9, face ), 1.0 - cs );
	return ( amb * cs + bounce ) * dirK + ocFireFill( uFireGlow, nw, wp ) + ocFireFill( uFireGlow2, nw, wp );
}
`
