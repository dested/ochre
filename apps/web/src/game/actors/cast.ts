/** the fixed cast's looks for the people lab (the sim builds the real band with its own looks) */
import type { HeldItem, PersonLook } from '../contracts'

export type CastMember = { name: string; look: PersonLook; right: HeldItem; left: HeldItem }

export const LAB_CAST: CastMember[] = [
  {
    name: 'Oro',
    look: { seed: 1101, sex: 'female', ageYears: 62, skin: 0.72, height: 0.99, build: 0.35, hair: 'coils', garment: 'kaross', adornments: ['beads-neck', 'ochre-face'] },
    right: 'stick',
    left: 'none',
  },
  {
    name: 'Ama',
    look: { seed: 2202, sex: 'female', ageYears: 28, skin: 0.55, height: 1.0, build: 0.5, hair: 'locs', garment: 'wrap', adornments: ['beads-neck', 'beads-hair', 'ochre-body'] },
    right: 'none',
    left: 'none',
  },
  {
    name: 'Tuk',
    look: { seed: 3303, sex: 'male', ageYears: 31, skin: 0.7, height: 1.03, build: 0.6, hair: 'coils', garment: 'kaross-apron', adornments: ['beads-neck', 'ochre-body', 'ochre-face'] },
    right: 'spear',
    left: 'none',
  },
  {
    name: 'Kaya',
    look: { seed: 4404, sex: 'female', ageYears: 10, skin: 0.5, height: 1.0, build: 0.45, hair: 'locs', garment: 'wrap', adornments: ['beads-neck', 'beads-hair', 'ochre-body'] },
    right: 'digging-stick',
    left: 'none',
  },
  {
    name: 'Teni',
    look: { seed: 5505, sex: 'male', ageYears: 6, skin: 0.6, height: 1.0, build: 0.5, hair: 'coils', garment: 'apron', adornments: ['beads-neck', 'ochre-face'] },
    right: 'none',
    left: 'none',
  },
  {
    name: 'Sabo',
    look: { seed: 6606, sex: 'male', ageYears: 14, skin: 0.66, height: 1.0, build: 0.45, hair: 'coils', garment: 'kaross', adornments: ['beads-neck', 'ochre-face'] },
    right: 'none',
    left: 'none',
  },
  {
    name: 'Ilu',
    look: { seed: 7707, sex: 'male', ageYears: 60, skin: 0.82, height: 1.0, build: 0.4, hair: 'cropped', garment: 'kaross', adornments: ['beads-neck'] },
    right: 'stick',
    left: 'none',
  },
]

export const LAB_INFANT: CastMember = {
  name: 'Baby',
  look: { seed: 8808, sex: 'male', ageYears: 0.6, skin: 0.58, height: 1.0, build: 0.5, hair: 'coils', garment: 'none', adornments: ['beads-neck'] },
  right: 'none',
  left: 'none',
}
