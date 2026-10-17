/** Stub RenderPipeline until game/render lands: a direct render plus a vignette/fade overlay quad. */
import {
  ACESFilmicToneMapping,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three'
import type { CreateRenderPipeline } from '../../contracts'

export const createStubPipeline: CreateRenderPipeline = (renderer) => {
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.autoClear = false

  const overlayScene = new Scene()
  const overlayCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mat = new ShaderMaterial({
    uniforms: { uFade: { value: 0 }, uDream: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform float uFade; uniform float uDream; varying vec2 vUv;
      void main(){
        float r = length(vUv - 0.5) * 1.4142;
        float vig = smoothstep(0.35, 1.0, r) * (0.25 + uDream * 0.6);
        vec3 warm = mix(vec3(0.0), vec3(0.35, 0.16, 0.06), uDream);
        float a = max(uFade, vig);
        vec3 c = mix(warm, vec3(0.0), uFade);
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const quad = new Mesh(new PlaneGeometry(2, 2), mat)
  quad.frustumCulled = false
  overlayScene.add(quad)
  const uniforms = mat.uniforms
  const setU = (name: 'uFade' | 'uDream', v: number) => {
    const u = uniforms[name]
    if (u) u.value = v
  }

  return {
    render(scene, camera) {
      renderer.clear()
      renderer.render(scene, camera)
      renderer.render(overlayScene, overlayCam)
    },
    setSize() {},
    setQuality() {},
    setDream(a) {
      setU('uDream', a)
    },
    setFade(a) {
      setU('uFade', a)
    },
    dispose() {
      quad.geometry.dispose()
      mat.dispose()
    },
  }
}
