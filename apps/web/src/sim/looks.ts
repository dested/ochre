/**
 * A plausible PersonLook for someone in the band. Same signature as the actors' randomLook, but three-free so the
 * sim can build its people headless.
 */
import { Rng, mix32 } from '../core/rng'
import type { Adornment, Garment, HairStyle, PersonLook, Sex } from '../game/contracts'

export function randomLook(seed: number, sex: Sex, ageYears: number): PersonLook {
  const rng = new Rng(mix32(seed, 0x100c))
  const skin = rng.range(0.25, 1)
  const height = rng.range(0.93, 1.07)
  const build = Math.min(1, Math.max(0, rng.range(0.2, 0.75) + (ageYears > 40 ? 0.1 : 0) - (ageYears < 12 ? 0.15 : 0)))

  let hair: HairStyle
  if (ageYears < 2) hair = 'cropped'
  else if (ageYears < 12) hair = rng.pick<HairStyle>(['cropped', 'coils', 'knots'])
  else if (sex === 'female') hair = rng.pick<HairStyle>(['coils', 'knots', 'locs', 'coils', 'cropped'])
  else hair = rng.pick<HairStyle>(['cropped', 'coils', 'shaved', 'locs', 'cropped'])

  let garment: Garment
  if (ageYears < 3) garment = 'none'
  else if (ageYears < 12) garment = 'apron'
  else if (ageYears < 16) garment = rng.pick<Garment>(['apron', 'kaross-apron'])
  else garment = rng.pick<Garment>(['kaross', 'kaross-apron', 'kaross-apron', 'wrap'])

  const adornments: Adornment[] = []
  if (ageYears < 3) adornments.push('beads-neck')
  else {
    if (rng.chance(sex === 'female' ? 0.7 : 0.35)) adornments.push('beads-neck')
    if (ageYears >= 12 && rng.chance(0.3)) adornments.push('beads-waist')
    if (sex === 'female' && ageYears >= 12 && rng.chance(0.3)) adornments.push('beads-hair')
    if (rng.chance(0.15)) adornments.push('shell-pendant')
    if (ageYears >= 12 && rng.chance(0.4)) adornments.push('ochre-face')
    if (ageYears >= 16 && rng.chance(0.2)) adornments.push('ochre-body')
    if (sex === 'female' && ageYears >= 16 && rng.chance(0.25)) adornments.push('ochre-hair')
  }

  return { seed, sex, ageYears, skin, height, build, hair, garment, adornments }
}
