/** The sky dome: a sphere that follows the camera, drawn first, writing no depth (the post reads it as sky). */
import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from 'three'
import { NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL } from '../render/glsl'
import { LIGHT } from '../render/uniforms'

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = position;
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FRAG = /* glsl */ `
varying vec3 vDir;
${SKY_UNIFORMS_GLSL}
${NOISE_GLSL}
${SKY_GLSL}
void main() {
	vec3 d = normalize( vDir );
	gl_FragColor = vec4( ocSkyFull( d ), 1.0 );
}
`

export function createSky(): Mesh {
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
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
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  })
  const mesh = new Mesh(new SphereGeometry(10000, 64, 32), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -1000
  mesh.name = 'sky'
  return mesh
}
