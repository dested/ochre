/** the shared state every part builder writes into while one person is built */
import type { Color } from 'three'
import type { PersonLook } from '../contracts'
import type { Rng } from '~/core/rng'
import type { BodyDims } from './body'
import type { MeshBuilder } from './geo'

export type BuildCtx = {
  look: PersonLook
  d: BodyDims
  rng: Rng
  /** skin-material parts: the body, face, lids, lips */
  skin: MeshBuilder
  /** hide, hair, beads: the double-sided gear material */
  gear: MeshBuilder
  /** eyeballs, teeth: the detail material */
  detail: MeshBuilder
  skinC: Color
  hairC: Color
  has(a: PersonLook['adornments'][number]): boolean
}
