/**
 * The shell held out to the infant in held.shell, drawn readable in her palm while she offers it. The carried
 * prop is a true-size bead (about a centimetre), which an infant's view can't make out from her shoulder.
 * A periwinkle: a tube coiled three whorls up a cone, pearly cream at the lip banded to brown at the apex.
 */
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  type Vector3,
} from 'three'

/** its length along the coil's axis, metres */
const LENGTH = 0.03
/** resting on the palm, above the grip point */
const ON_PALM = 0.034
const WHORLS = 3
/** around the coil, and around the tube */
const ALONG = 120
const AROUND = 32

const CREAM = new Color('#e3cca4')
const BAND = new Color('#6e4128')
const APEX = new Color('#4a2c1a')

/** the coil: radius grows by GROWTH per radian, the tube is TUBE of it, and it climbs RISE of it */
const GROWTH = 0.13
const TUBE = 0.62
const RISE = 1.25

function shellGeometry(): BufferGeometry {
  const end = WHORLS * Math.PI * 2
  const pos: number[] = []
  const col: number[] = []
  const c = new Color()
  for (let i = 0; i <= ALONG; i++) {
    const u = (i / ALONG) * end
    const r = Math.exp(GROWTH * (u - end))
    const rho = r * TUBE
    // apex up at y > 0, the aperture (the widest turn) at the bottom
    const y = -r * RISE
    // toward the lip the tube rolls out a little: its last quarter turn flares
    const flare = 1 + Math.max(0, (u - (end - Math.PI / 2)) / (Math.PI / 2)) * 0.18
    for (let j = 0; j <= AROUND; j++) {
      const v = (j / AROUND) * Math.PI * 2
      const R = r + rho * flare * Math.cos(v)
      pos.push(R * Math.cos(u), y + rho * flare * Math.sin(v), R * Math.sin(u))
      // spiral bands follow the coil (they run with u, striped across v); darker toward the apex
      const w = Math.cos(v * 3 + 0.6 + u * 0.15)
      const band = Math.min(1, Math.max(0, (w + 0.1) / 0.3))
      const age = i / ALONG
      c.copy(APEX).lerp(CREAM, 0.15 + 0.85 * Math.sqrt(age))
      c.lerp(BAND, band * 0.85)
      col.push(c.r, c.g, c.b)
    }
  }
  const index: number[] = []
  const row = AROUND + 1
  for (let i = 0; i < ALONG; i++)
    for (let j = 0; j < AROUND; j++) {
      const a = i * row + j
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setIndex(index)
  g.computeBoundingBox()
  const box = g.boundingBox
  if (box) {
    const height = box.max.y - box.min.y
    const s = LENGTH / Math.max(1e-6, height)
    g.translate(0, -(box.min.y + box.max.y) / 2, 0)
    g.scale(s, s, s)
  }
  g.computeVertexNormals()
  return g
}

export type OfferShell = {
  readonly object: Object3D
  /** the grip point of the offering hand (null hides it), seen from `view` */
  show(grip: Vector3 | null, view: Vector3): void
  dispose(): void
}

export function createOfferShell(): OfferShell {
  const geometry = shellGeometry()
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.38,
    side: DoubleSide,
  })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'offer-shell'
  mesh.visible = false
  return {
    object: mesh,
    show(grip, view) {
      mesh.visible = grip !== null
      if (!grip) return
      mesh.position.set(grip.x, grip.y + ON_PALM, grip.z)
      // lying on its side, its axis across the line of sight, so the view sees the whorls climb to the apex
      const bearing = Math.atan2(grip.x - view.x, grip.z - view.z)
      mesh.rotation.set(0, bearing, Math.PI / 2 - 0.35)
    },
    dispose() {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  }
}
