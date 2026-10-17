import type { MeshStandardMaterial } from 'three'
import type { PaintMaterial, PaintOptions } from '../contracts'

/** placeholder until the world agent lands the painted-light patch: returns the material unchanged */
export const paint: PaintMaterial = (material: MeshStandardMaterial, _opts?: PaintOptions) => material
