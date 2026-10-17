/**
 * The shared actor materials: every person and animal draws with these three, so a crowd costs draw calls,
 * not shader programs. Vertex colours carry each actor's albedo. All pass through world's paint() once.
 */
import { DoubleSide, MeshStandardMaterial } from 'three'
import { paint } from '../render/paint'

export type ActorMaterials = {
  /** skin: body, face, lids, lips (subsurface warmth) */
  skin: MeshStandardMaterial
  /** hide, hair, beads, fur: double-sided for open garments */
  gear: MeshStandardMaterial
  /** eyes, teeth and held items */
  detail: MeshStandardMaterial
}

let shared: ActorMaterials | null = null

export function actorMaterials(): ActorMaterials {
  if (shared) return shared
  const skin = paint(new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, name: 'actor-skin' }), { skin: true, rim: 0.45, brush: 0.25 })
  const gear = paint(new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: DoubleSide, name: 'actor-gear' }), { brush: 0.6, rim: 0.3 })
  const detail = paint(new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, name: 'actor-detail' }), { brush: 0.15, rim: 0.2 })
  shared = { skin, gear, detail }
  return shared
}
