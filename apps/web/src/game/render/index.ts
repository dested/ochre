/**
 * createRenderPipeline: the painted-light post chain on the host's one renderer. See post.ts for the order of
 * passes. The pipeline owns the renderer's shadow settings and tone mapping (it tone maps itself).
 */
import {
  BufferGeometry,
  Camera,
  DepthTexture,
  Float32BufferAttribute,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three'
import type { CreateRenderPipeline, Quality, RenderPipeline } from '../contracts'
import { ATMOS_FRAG, FINISH_FRAG, FS_VERT, GRADE_FRAG, RAYS_FRAG, UP_FRAG, downFrag, paintFrag } from './post'
import { LIGHT, POST } from './uniforms'

export { paint, patchPaint } from './paint'
export { LIGHT, POST } from './uniforms'

type QualitySpec = { samples: number; taps: number; levels: number; maxDpr: number; radius: [number, number] }

const QUALITY: Record<Quality, QualitySpec> = {
  high: { samples: 4, taps: 4, levels: 6, maxDpr: 1.5, radius: [0.0, 4.2] },
  medium: { samples: 2, taps: 3, levels: 5, maxDpr: 1.25, radius: [0.0, 3.2] },
  low: { samples: 0, taps: 0, levels: 4, maxDpr: 1, radius: [0, 0] },
}

/** the extra surface the world view uses (beyond the contract) */
export type PaintedPipeline = RenderPipeline & {
  readonly painted: true
  readonly quality: Quality
  /** 0..1 dream amount (read by the world for audio-free cues) */
  readonly dream: number
}

export function isPaintedPipeline(p: RenderPipeline): p is PaintedPipeline {
  return 'painted' in p
}

function fsTriangle(): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
  return g
}

function rt(name: string, w = 1, h = 1): WebGLRenderTarget {
  const t = new WebGLRenderTarget(w, h, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter })
  t.texture.name = name
  return t
}

function mat(frag: string, uniforms: Record<string, { value: unknown }>): ShaderMaterial {
  return new ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false })
}

export const createRenderPipeline: CreateRenderPipeline = (renderer: WebGLRenderer): PaintedPipeline => {
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  renderer.toneMapping = NoToneMapping
  renderer.autoClear = false

  let quality: Quality = 'high'
  let spec = QUALITY[quality]
  let dream = 0
  let fade = 0
  let w = 1
  let h = 1
  let time = 0

  const depthTex = new DepthTexture(1, 1, FloatType)
  const makeScene = () => {
    const t = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: spec.samples, depthTexture: depthTex })
    t.texture.name = 'oc:scene'
    return t
  }
  let sceneRT = makeScene()
  const hdrRT = rt('oc:hdr')
  const ldrRT = rt('oc:ldr')
  const paintRT = rt('oc:paint')
  const raysRT = rt('oc:rays')
  const down: WebGLRenderTarget[] = []
  const up: WebGLRenderTarget[] = []
  for (let i = 0; i < 6; i++) {
    down.push(rt(`oc:down${i}`))
    up.push(rt(`oc:up${i}`))
  }

  const quad = new Mesh(fsTriangle())
  quad.frustumCulled = false
  const quadScene = new Scene()
  quadScene.add(quad)
  const quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const projInv = new Matrix4()
  const camWorld = new Matrix4()
  const near = { value: 0.1 }
  const far = { value: 1000 }
  const lagoon = { value: new Vector3(398, 86, 140) }

  const atmos = mat(ATMOS_FRAG, {
    tScene: { value: null },
    tDepth: { value: depthTex },
    uProjInv: { value: projInv },
    uCamWorld: { value: camWorld },
    uCamPos: LIGHT.uCamPos,
    uNear: near,
    uFar: far,
    uHaze: LIGHT.uHaze,
    uSeaLevel: LIGHT.uSeaLevel,
    uLagoon: lagoon,
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
  })
  const downKaris = mat(downFrag(true), { tSrc: { value: null }, uTexel: { value: new Vector2() } })
  const downPlain = mat(downFrag(false), { tSrc: { value: null }, uTexel: { value: new Vector2() } })
  const upMat = mat(UP_FRAG, { tSmall: { value: null }, tCur: { value: null }, uTexel: { value: new Vector2() }, uRadius: { value: 1 } })
  const rays = mat(RAYS_FRAG, { tSrc: { value: null }, tDepth: { value: depthTex }, uRays: POST.rays, uAspect: { value: 1 } })
  const dreamU = { value: 0 }
  const res = { value: new Vector2(1, 1) }
  const grade = mat(GRADE_FRAG, {
    tHdr: { value: hdrRT.texture },
    tBloom: { value: null },
    tRays: { value: raysRT.texture },
    uBloomNorm: { value: 1 },
    uExposure: POST.exposure,
    uSaturation: POST.saturation,
    uSplitShadow: POST.splitShadow,
    uSplitHighlight: POST.splitHighlight,
    uBloom: POST.bloom,
    uRays: POST.rays,
    uRayColor: POST.rayColor,
    uDream: dreamU,
    uRes: res,
  })
  const paintUniforms = {
    tSrc: { value: ldrRT.texture },
    tDepth: { value: depthTex },
    uTexel: { value: new Vector2() },
    uNear: near,
    uFar: far,
    uRadius: { value: new Vector3(0, 4, 160) },
    uDream: dreamU,
  }
  let paintMat = mat(paintFrag(Math.max(1, spec.taps)), paintUniforms)
  const fadeU = { value: 0 }
  const finish = mat(FINISH_FRAG, {
    tSrc: { value: paintRT.texture },
    tDepth: { value: depthTex },
    uTexel: { value: new Vector2() },
    uRes: res,
    uNear: near,
    uFar: far,
    uFade: fadeU,
    uTime: LIGHT.uTime,
    uVignette: POST.vignette,
    uDream: dreamU,
    uGrain: { value: 0.025 },
    uPool: { value: 0.35 },
  })

  const pass = (m: ShaderMaterial, target: WebGLRenderTarget | null) => {
    quad.material = m
    renderer.setRenderTarget(target)
    renderer.render(quadScene, quadCam)
  }

  const setTexel = (m: ShaderMaterial, name: string, t: WebGLRenderTarget) => {
    const v: unknown = m.uniforms[name]?.value
    if (v instanceof Vector2) v.set(1 / t.width, 1 / t.height)
  }
  const setTex = (m: ShaderMaterial, name: string, t: WebGLRenderTarget | null) => {
    const u = m.uniforms[name]
    if (u) u.value = t ? t.texture : null
  }

  const resize = () => {
    const pw = Math.max(1, Math.round(w))
    const ph = Math.max(1, Math.round(h))
    sceneRT.setSize(pw, ph)
    hdrRT.setSize(pw, ph)
    ldrRT.setSize(pw, ph)
    paintRT.setSize(pw, ph)
    raysRT.setSize(Math.max(1, pw >> 2), Math.max(1, ph >> 2))
    let dw = pw
    let dh = ph
    for (let i = 0; i < 6; i++) {
      dw = Math.max(1, dw >> 1)
      dh = Math.max(1, dh >> 1)
      down[i]?.setSize(dw, dh)
      up[i]?.setSize(dw, dh)
    }
    res.value.set(pw, ph)
    LIGHT.uViewport.value.set(pw, ph)
    const tx: unknown = paintUniforms.uTexel.value
    if (tx instanceof Vector2) tx.set(1 / pw, 1 / ph)
    setTexel(finish, 'uTexel', paintRT)
    const asp = rays.uniforms.uAspect
    if (asp) asp.value = pw / ph
  }

  let cssW = 1
  let cssH = 1
  let devDpr = 1

  const applySize = () => {
    const dpr = Math.min(devDpr, spec.maxDpr)
    w = cssW * dpr
    h = cssH * dpr
    resize()
  }

  const pipeline: PaintedPipeline = {
    painted: true,
    get quality() {
      return quality
    },
    get dream() {
      return dream
    },
    render(scene: Scene, camera: Camera, dt: number) {
      time += dt
      if (camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera) {
        near.value = camera.near
        far.value = camera.far
      }
      camera.updateMatrixWorld()
      projInv.copy(camera.projectionMatrixInverse)
      camWorld.copy(camera.matrixWorld)
      LIGHT.uCamPos.value.setFromMatrixPosition(camera.matrixWorld)

      // 1. the scene
      renderer.setRenderTarget(sceneRT)
      renderer.setClearColor(LIGHT.uHorizon.value, 1)
      renderer.clear(true, true, true)
      renderer.render(scene, camera)

      // 2. the air
      setTex(atmos, 'tScene', sceneRT)
      pass(atmos, hdrRT)

      // 3. the blur pyramid
      const levels = spec.levels
      let src: WebGLRenderTarget = hdrRT
      for (let i = 0; i < levels; i++) {
        const dst = down[i]
        if (!dst) break
        const m = i === 0 ? downKaris : downPlain
        setTex(m, 'tSrc', src)
        setTexel(m, 'uTexel', src)
        pass(m, dst)
        src = dst
      }
      let small: WebGLRenderTarget | undefined = down[levels - 1]
      for (let i = levels - 2; i >= 0; i--) {
        const cur = down[i]
        const dst = up[i]
        if (!small || !cur || !dst) break
        setTex(upMat, 'tSmall', small)
        setTex(upMat, 'tCur', cur)
        setTexel(upMat, 'uTexel', small)
        pass(upMat, dst)
        small = dst
      }
      const bloomTex = up[0] ?? down[0]
      if (bloomTex) setTex(grade, 'tBloom', bloomTex)
      const gn = grade.uniforms.uBloomNorm
      if (gn) gn.value = 1 / levels

      // 4. god rays (quarter resolution)
      if (POST.rays.value.x > 0.001 && POST.rays.value.w > 0.001) {
        setTex(rays, 'tSrc', hdrRT)
        pass(rays, raysRT)
      } else {
        renderer.setRenderTarget(raysRT)
        renderer.setClearColor(0x000000, 1)
        renderer.clear(true, false, false)
      }

      // 5. grade into display space
      dreamU.value = dream
      pass(grade, spec.taps > 0 ? ldrRT : paintRT)

      // 6. paint
      if (spec.taps > 0) {
        const r = paintUniforms.uRadius.value
        if (r instanceof Vector3) r.set(spec.radius[0], spec.radius[1] * (h / 1080), 180)
        pass(paintMat, paintRT)
      }

      // 7. finish to the canvas
      fadeU.value = fade
      pass(finish, null)
    },
    setSize(width: number, height: number, dpr: number) {
      cssW = width
      cssH = height
      devDpr = dpr
      applySize()
    },
    setQuality(q: Quality) {
      if (q === quality) return
      const prev = spec
      quality = q
      spec = QUALITY[q]
      if (prev.samples !== spec.samples) {
        sceneRT.dispose()
        sceneRT = makeScene()
      }
      if (prev.taps !== spec.taps && spec.taps > 0) {
        paintMat.dispose()
        paintMat = mat(paintFrag(spec.taps), paintUniforms)
      }
      renderer.shadowMap.type = PCFSoftShadowMap
      applySize()
    },
    setDream(amount: number) {
      dream = Math.min(1, Math.max(0, amount))
    },
    setFade(amount: number) {
      fade = Math.min(1, Math.max(0, amount))
    },
    dispose() {
      sceneRT.dispose()
      depthTex.dispose()
      for (const t of [hdrRT, ldrRT, paintRT, raysRT, ...down, ...up]) t.dispose()
      for (const m of [atmos, downKaris, downPlain, upMat, rays, grade, paintMat, finish]) m.dispose()
      quad.geometry.dispose()
    },
  }
  return pipeline
}

/** the sun's position on screen (uv) and whether it is in front of the camera; for god rays */
export function sunOnScreen(camera: Camera, sunDir: Vector3, out: Vector4): Vector4 {
  const p = new Vector3().copy(sunDir).multiplyScalar(1000).add(new Vector3().setFromMatrixPosition(camera.matrixWorld))
  p.project(camera)
  const front = new Vector3(0, 0, -1).transformDirection(camera.matrixWorld).dot(sunDir)
  out.y = p.x * 0.5 + 0.5
  out.z = p.y * 0.5 + 0.5
  out.w = Math.max(0, Math.min(1, front * 3)) * (1 - Math.min(1, Math.max(0, Math.max(Math.abs(p.x), Math.abs(p.y)) - 1.2)))
  return out
}
