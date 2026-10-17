/** Stub WorldView until game/world lands: vertex-coloured terrain, a tidal sea plane, sky colour, sun and fires. */
import {
  BackSide,
  BufferAttribute,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
} from 'three'
import type { CreateWorldView, Surface } from '../../contracts'

const SURFACE_COLOR: Record<Surface, string> = {
  'deep-sea': '#173a52',
  shallows: '#2f6f73',
  surf: '#9fc7c0',
  'wet-rock': '#4e4a44',
  rock: '#8a7f6e',
  sand: '#d9c39a',
  'wet-sand': '#a8916b',
  dune: '#e2cfa4',
  fynbos: '#7d8b5a',
  grass: '#a39a5c',
  cliff: '#b49a7a',
  cave: '#5a4a3c',
  path: '#b8a07a',
  lagoon: '#3d7a78',
  river: '#3d7a78',
}

export const createStubWorldView: CreateWorldView = (data) => {
  const root = new Group()
  root.name = 'stub-world'

  // terrain: a 1000 m square around the cave, finer than the world but enough for the stub
  const span = 1000
  const seg = 320
  const geo = new PlaneGeometry(span, span, seg, seg)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, 0, -150)
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const c = new Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, data.heightAt(x, z))
    c.set(SURFACE_COLOR[data.surfaceAt(x, z, 0.4)])
    const n = Math.sin(x * 0.7) * Math.cos(z * 0.9) * 0.04
    colors[i * 3] = c.r + n
    colors[i * 3 + 1] = c.g + n
    colors[i * 3 + 2] = c.b + n
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const terrainMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  root.add(new Mesh(geo, terrainMat))

  // the cave shell: a dark half-dome over the terrace
  const shellMat = new MeshStandardMaterial({ color: '#6d5a48', roughness: 1, side: BackSide })
  const shell = new Mesh(new SphereGeometry(1, 32, 16, Math.PI, Math.PI, 0, Math.PI / 2), shellMat)
  const cave = data.poi('hearth-main')
  shell.scale.set(17, 9, 10)
  shell.position.set(cave.x, data.heightAt(cave.x, cave.z) - 0.5, cave.z - 2)
  root.add(shell)

  const seaMat = new MeshStandardMaterial({
    color: '#2f6f73',
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.86,
  })
  const sea = new Mesh(new PlaneGeometry(4000, 4000), seaMat)
  sea.rotation.x = -Math.PI / 2
  root.add(sea)

  const sun = new DirectionalLight('#ffe2b0', 2.2)
  root.add(sun, sun.target)
  const hemi = new HemisphereLight('#bcd4e6', '#6b5038', 0.8)
  root.add(hemi)

  const fireGroup = new Group()
  root.add(fireGroup)
  const flameMat = new MeshBasicMaterial({ color: '#f2a03d', transparent: true, opacity: 0.85, side: DoubleSide })
  const flameGeo = new ConeGeometry(0.35, 0.9, 8)
  const fires = new Map<string, { light: PointLight; flame: Mesh }>()

  const fogColor = new Color()
  const dayColor = new Color('#bcd4e6')
  const goldColor = new Color('#e8b27a')
  const nightColor = new Color('#0e1626')
  let attached = false
  let time = 0

  return {
    root,
    update(frame) {
      time += frame.dt
      const scene = root.parent
      if (scene instanceof Scene && !attached) {
        attached = true
        scene.fog = new Fog('#bcd4e6', 60, 1400)
      }
      const { clock } = frame
      sea.position.set(frame.focus.x, clock.seaLevel, frame.focus.z)
      const s = clock.sunDir
      const golden = Math.max(0, 1 - Math.abs(s.y - 0.12) * 5)
      fogColor.copy(nightColor).lerp(dayColor, clock.daylight).lerp(goldColor, golden * 0.6)
      if (scene instanceof Scene) {
        scene.background = fogColor
        if (scene.fog instanceof Fog) scene.fog.color.copy(fogColor)
      }
      sun.position.set(frame.focus.x + s.x * 200, frame.focus.y + Math.max(0.05, s.y) * 200, frame.focus.z + s.z * 200)
      sun.target.position.set(frame.focus.x, frame.focus.y, frame.focus.z)
      sun.intensity = 2.4 * clock.daylight
      sun.color.set(golden > 0.3 ? '#ffb070' : '#ffe8c0')
      hemi.intensity = 0.15 + 0.75 * clock.daylight

      const seen = new Set<string>()
      for (const f of frame.fires) {
        seen.add(f.id)
        let entry = fires.get(f.id)
        if (!entry) {
          const light = new PointLight('#ff9a3c', 0, 18, 1.6)
          const flame = new Mesh(flameGeo, flameMat)
          fireGroup.add(light, flame)
          entry = { light, flame }
          fires.set(f.id, entry)
        }
        const y = data.heightAt(f.x, f.z)
        const flicker = 0.85 + Math.sin(time * 13 + f.x) * 0.08 + Math.sin(time * 7.3) * 0.07
        entry.light.position.set(f.x, y + 0.8, f.z)
        entry.light.intensity = f.intensity * 14 * flicker
        entry.flame.position.set(f.x, y + 0.45, f.z)
        entry.flame.scale.setScalar(Math.max(0.01, f.intensity) * flicker)
      }
      for (const [id, entry] of fires) {
        if (!seen.has(id)) {
          fireGroup.remove(entry.light, entry.flame)
          entry.light.dispose()
          fires.delete(id)
        }
      }
    },
    dispose() {
      geo.dispose()
      terrainMat.dispose()
      shell.geometry.dispose()
      shellMat.dispose()
      sea.geometry.dispose()
      seaMat.dispose()
      flameGeo.dispose()
      flameMat.dispose()
      for (const e of fires.values()) e.light.dispose()
    },
  }
}
