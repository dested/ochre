/**
 * The shared actor materials: every person and animal draws with these three, so a crowd costs draw calls,
 * not shader programs. Vertex colours carry each actor's albedo. All pass through world's paint() once.
 */
import { DoubleSide, MeshStandardMaterial } from 'three'
import { patchPaint, type PaintExtra } from '../render/paint'

export type ActorMaterials = {
  /** skin: body, face, lids, lips (subsurface warmth) */
  skin: MeshStandardMaterial
  /** hide, hair, beads, fur: double-sided for open garments */
  gear: MeshStandardMaterial
  /** eyes, teeth and held items */
  detail: MeshStandardMaterial
}

let shared: ActorMaterials | null = null

/** a per-vertex roughness offset (MeshBuilder's `aRough`): the skin's sheen zones, the dull eyeballs */
const ROUGH: PaintExtra = {
  key: 'actor-rough',
  vertexHead: 'attribute float aRough;\nvarying float vRough;',
  vertexMain: '\tvRough = aRough;',
  fragmentHead: 'varying float vRough;',
  normal: '\troughnessFactor = clamp( roughnessFactor + vRough, 0.05, 1.0 );',
}

export function actorMaterials(): ActorMaterials {
  if (shared) return shared
  const skin = patchPaint(new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, name: 'actor-skin' }), { skin: true, rim: 0.45, brush: 0.25 }, ROUGH)
  const gear = patchPaint(new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: DoubleSide, name: 'actor-gear' }), { brush: 0.6, rim: 0.3 }, ROUGH)
  const detail = patchPaint(new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, name: 'actor-detail' }), { brush: 0.15, rim: 0.2 }, ROUGH)
  shared = { skin, gear, detail }
  return shared
}
