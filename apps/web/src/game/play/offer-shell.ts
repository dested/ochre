/**
 * The shell held out to the infant in held.shell, drawn readable in her palm while she offers it. The carried
 * prop is a true-size bead (about a centimetre), which an infant's view can't make out from her shoulder.
 */
import { Mesh, MeshStandardMaterial, SphereGeometry, type Object3D, type Vector3 } from 'three'

/** a periwinkle-sized shell, metres: long axis, width, depth */
const SIZE = { long: 0.026, wide: 0.018, deep: 0.015 }
/** resting on the palm, above the grip point */
const ON_PALM = 0.025

export type OfferShell = {
  readonly object: Object3D
  /** the grip point of the offering hand, or null to hide it */
  show(grip: Vector3 | null, heading: number): void
  dispose(): void
}

export function createOfferShell(): OfferShell {
  const geometry = new SphereGeometry(1, 16, 12)
  const material = new MeshStandardMaterial({ color: '#efe4cf', roughness: 0.45 })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'offer-shell'
  mesh.scale.set(SIZE.wide, SIZE.deep, SIZE.long)
  mesh.visible = false
  return {
    object: mesh,
    show(grip, heading) {
      mesh.visible = grip !== null
      if (!grip) return
      mesh.position.set(grip.x, grip.y + ON_PALM, grip.z)
      mesh.rotation.set(0.3, heading + 0.6, 0)
    },
    dispose() {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  }
}
