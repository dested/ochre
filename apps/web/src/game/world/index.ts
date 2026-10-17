/**
 * createWorldView: the coast as a scene graph. The sky, the terrain, the sea, the lagoon and the river, the
 * cave's rock, the fires, and the lights: a key light (the sun by day, the moon by night) whose shadow follows
 * the focus, a hemisphere fill for anything unpainted, and the fires' point lights. Each frame it runs the
 * colour script, which writes the shared light uniforms every painted material and the post chain read.
 */
import { DirectionalLight, Group, HemisphereLight, Matrix4, Object3D, PerspectiveCamera, Vector3 } from 'three'
import type { CreateWorldView, Quality, RenderPipeline, WorldData, WorldFrame, WorldView } from '../contracts'
import { isPaintedPipeline, sunOnScreen } from '../render/index'
import { LIGHT, POST } from '../render/uniforms'
import { isOchreWorld } from '../../world-gen/index'
import { CAVE } from '../../world-gen/layout'
import { createCaveView, type CaveView } from './cave'
import { applyColourScript } from './colour'
import { createFiresView } from './fires'
import { createSeaView } from './sea'
import { createSky } from './sky'
import { createTerrainView } from './terrain'

const SHADOW_SIZE: Record<Quality, number> = { high: 4096, medium: 2048, low: 1024 }

export type OchreWorldView = WorldView & {
  /** the key light (for anyone who wants its direction) */
  readonly sun: DirectionalLight
}

function qualityOf(p: RenderPipeline): Quality {
  return isPaintedPipeline(p) ? p.quality : 'high'
}

export const createWorldView: CreateWorldView = (data: WorldData, pipeline: RenderPipeline): OchreWorldView => {
  const grid = isOchreWorld(data) ? data.terrain : null
  const root = new Group()
  root.name = 'world'

  LIGHT.uCave.value.set(CAVE.x, CAVE.z, Math.sin(CAVE.heading), Math.cos(CAVE.heading))
  LIGHT.uCave2.value.set(CAVE.floor, CAVE.depth, CAVE.halfWidth, CAVE.ceiling)

  const sky = createSky()
  root.add(sky)
  const terrain = createTerrainView(data, grid)
  root.add(terrain.root)
  const sea = createSeaView(data, grid)
  root.add(sea.sea, sea.lagoon)
  if (sea.river) root.add(sea.river)
  let cave: CaveView | null = null
  if (grid) {
    cave = createCaveView(data, grid)
    root.add(cave.mesh)
  }
  const fires = createFiresView(data)
  root.add(fires.root)

  // the key light, its shadow following the focus
  const sun = new DirectionalLight(0xffffff, 1)
  sun.name = 'key-light'
  sun.castShadow = true
  const target = new Object3D()
  target.name = 'key-target'
  sun.target = target
  root.add(sun, target)
  let shadowQ = qualityOf(pipeline)
  const setShadowSize = (q: Quality) => {
    const s = SHADOW_SIZE[q]
    sun.shadow.mapSize.set(s, s)
    sun.shadow.map?.dispose()
    sun.shadow.map = null
  }
  setShadowSize(shadowQ)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.06
  sun.shadow.radius = 2
  const sc = sun.shadow.camera
  sc.near = 1
  sc.far = 1600

  const hemi = new HemisphereLight(0xffffff, 0x000000, Math.PI)
  hemi.name = 'fill'
  root.add(hemi)

  const camPos = new Vector3()
  const focus = new Vector3()
  const lightView = new Matrix4()
  const lightInv = new Matrix4()
  const snap = new Vector3()

  const view: OchreWorldView = {
    root,
    sun,
    update(frame: WorldFrame) {
      const { camera, clock, weather } = frame
      LIGHT.uTime.value += frame.dt
      LIGHT.uSeaLevel.value = clock.seaLevel
      camera.updateMatrixWorld()
      camPos.setFromMatrixPosition(camera.matrixWorld)
      LIGHT.uCamPos.value.copy(camPos)
      focus.set(frame.focus.x, frame.focus.y, frame.focus.z)
      LIGHT.uFocus.value.copy(focus)

      const key = applyColourScript(clock, weather)
      sun.color.copy(key.color)
      sun.intensity = key.intensity * Math.PI
      hemi.color.copy(LIGHT.uSkyAmb.value)
      hemi.groundColor.copy(LIGHT.uGroundAmb.value)

      // the shadow box: sized by how high the camera is over the focus, snapped to whole texels
      const q = qualityOf(pipeline)
      if (q !== shadowQ) {
        shadowQ = q
        setShadowSize(q)
      }
      const lift = Math.max(0, camPos.y - data.heightAt(camPos.x, camPos.z))
      const extent = Math.min(320, Math.max(70, 55 + lift * 0.9 + camPos.distanceTo(focus) * 0.5))
      sc.left = -extent
      sc.right = extent
      sc.top = extent
      sc.bottom = -extent
      sc.updateProjectionMatrix()
      const texel = (extent * 2) / sun.shadow.mapSize.x
      lightView.lookAt(key.dir, new Vector3(0, 0, 0), new Vector3(0, 1, 0))
      lightInv.copy(lightView).invert()
      snap.copy(focus).applyMatrix4(lightInv)
      snap.x = Math.round(snap.x / texel) * texel
      snap.y = Math.round(snap.y / texel) * texel
      snap.applyMatrix4(lightView)
      target.position.copy(snap)
      sun.position.copy(snap).addScaledVector(key.dir, 700)
      target.updateMatrixWorld()
      sun.updateMatrixWorld()

      // the sky dome rides with the camera, inside the far plane
      sky.position.copy(camPos)
      if (camera instanceof PerspectiveCamera) sky.scale.setScalar((camera.far * 0.9) / 10000)
      sky.updateMatrixWorld()

      terrain.update(camera)
      sea.update(camera, clock.seaLevel, LIGHT.uTime.value)
      fires.update(frame.fires, frame.focus)
      sunOnScreen(camera, LIGHT.uSunDir.value, POST.rays.value)
    },
    dispose() {
      terrain.dispose()
      sea.dispose()
      cave?.dispose()
      fires.dispose()
      sun.shadow.map?.dispose()
      sun.dispose()
      hemi.dispose()
      sky.geometry.dispose()
      const m = sky.material
      if (!Array.isArray(m)) m.dispose()
    },
  }
  return view
}
