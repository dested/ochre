/**
 * Looks and colours: randomLook (a plausible member of the band) and the palette every builder colours from.
 * One rule set for every skin tone: nothing in the face is keyed to skin with an `if`; colours that involve skin
 * are fixed blends or fixed multiplies of it (adapted from celworld's FACE RULES).
 */
import { Color } from 'three'
import type { Adornment, Garment, HairStyle, PersonLook, Sex } from '../contracts'
import { Rng, mix32 } from '~/core/rng'
import { clamp, lerp, smooth } from './geo'

export const randomLook = (seed: number, sex: Sex, ageYears: number): PersonLook => {
  const rng = new Rng(mix32(seed, 0x1004))
  const age = clamp(ageYears, 0, 90)
  const child = age < 11
  const infant = age < 2.5
  const female = sex === 'female'

  let hair: HairStyle
  if (infant) hair = rng.pick<HairStyle>(['cropped', 'coils'])
  else if (child) hair = rng.pick<HairStyle>(female ? ['coils', 'knots', 'locs', 'coils'] : ['coils', 'cropped', 'coils', 'knots'])
  else if (age >= 55) hair = rng.pick<HairStyle>(female ? ['coils', 'cropped', 'coils'] : ['cropped', 'coils', 'shaved', 'cropped'])
  else hair = rng.pick<HairStyle>(female ? ['locs', 'coils', 'knots', 'locs', 'coils'] : ['coils', 'cropped', 'locs', 'coils', 'shaved'])

  let garment: Garment
  if (infant) garment = 'none'
  else if (child) garment = female && age >= 8 ? rng.pick<Garment>(['wrap', 'apron']) : 'apron'
  else if (female) garment = age >= 55 ? rng.pick<Garment>(['kaross', 'wrap']) : rng.pick<Garment>(['wrap', 'wrap', 'kaross', 'kaross-apron'])
  else garment = age >= 55 ? rng.pick<Garment>(['kaross', 'kaross-apron']) : rng.pick<Garment>(['kaross-apron', 'apron', 'kaross', 'kaross-apron'])

  const adornments: Adornment[] = []
  if (infant) adornments.push(rng.chance(0.5) ? 'beads-waist' : 'beads-neck')
  else {
    if (rng.chance(0.75)) adornments.push('beads-neck')
    if (rng.chance(0.3)) adornments.push('beads-waist')
    if (rng.chance(female ? 0.45 : 0.12) && hair !== 'shaved' && hair !== 'cropped') adornments.push('beads-hair')
    if (rng.chance(0.15)) adornments.push('shell-pendant')
    if (rng.chance(child ? 0.25 : 0.4)) adornments.push('ochre-face')
    if (rng.chance(child ? 0.15 : 0.4)) adornments.push('ochre-body')
    if (rng.chance(0.1) && hair !== 'shaved') adornments.push('ochre-hair')
  }

  return {
    seed,
    sex,
    ageYears: age,
    skin: clamp(rng.range(0.2, 0.95), 0, 1),
    height: clamp(1 + (rng.next() + rng.next() + rng.next() - 1.5) * 0.055, 0.92, 1.08),
    build: clamp(rng.range(0.15, 0.85), 0, 1),
    hair,
    garment,
    adornments,
  }
}

/* ─── palette ──────────────────────────────────────────────────────────────────────────────────────────── */

// warm browns, kept a little short of saturated: the golden key and the skin's red terminator add the warmth
const SKIN_LIGHT = new Color('#98694e')
const SKIN_MID = new Color('#674331')
const SKIN_DARK = new Color('#3a261c')

/** the skin albedo for look.skin (0 medium brown .. 1 very dark brown), in linear space */
export function skinColor(t: number): Color {
  const c = new Color()
  if (t < 0.5) c.lerpColors(SKIN_LIGHT, SKIN_MID, t / 0.5)
  else c.lerpColors(SKIN_MID, SKIN_DARK, (t - 0.5) / 0.5)
  return c
}

const HAIR_BLACK = new Color('#221813')
const HAIR_GREY = new Color('#a39d94')
const HAIR_WHITE = new Color('#cfc9bf')

/** hair colour: near-black, greying from the 40s with a seeded onset */
export function hairColor(seed: number, age: number, ochre: boolean): Color {
  const rng = new Rng(mix32(seed, 0x4a1f))
  const onset = rng.range(40, 55)
  const g = smooth(onset, onset + 22, age)
  const c = new Color().lerpColors(HAIR_BLACK, HAIR_GREY, g)
  if (age > 70) c.lerp(HAIR_WHITE, smooth(70, 85, age) * 0.6)
  if (ochre) c.lerp(OCHRE_HAIR, 0.55)
  return c
}

export const OCHRE = new Color('#9c3d20')
export const OCHRE_DEEP = new Color('#7d2c16')
const OCHRE_HAIR = new Color('#6a2a17')
export const BONE_WHITE = new Color('#efe3c8')
export const SINEW = new Color('#3b2a1f')
export const CORD = new Color('#5a3e28')

/** hide tones: tan, brown and ochre; a person's garments draw from these with seeded variation */
const HIDES = ['#c9a873', '#b8925f', '#d4b783', '#a77d4c', '#c4a06a', '#8e6a44', '#b07f4f', '#dcc193'].map((h) => new Color(h))
export function hideColor(seed: number, k: number): Color {
  const rng = new Rng(mix32(seed, 0x41de + k * 977))
  const a = rng.pick(HIDES)
  const b = rng.pick(HIDES)
  const c = new Color().lerpColors(a, b, rng.next() * 0.5)
  if (rng.chance(0.18)) c.lerp(OCHRE, 0.35)
  return c
}

/** eye whites lean toward the skin so they never read as stark patches */
export function scleraColor(skin: Color): Color {
  return new Color('#eee5d6').lerp(skin, 0.16)
}
export const IRIS = new Color('#2c170c')
export const IRIS_RIM = new Color('#160b06')
export const PUPIL = new Color('#070504')

/** lips: a fixed multiply of the skin, never a separate lip colour */
export function lipColor(skin: Color): Color {
  // a darker warm brown than the skin, a touch of rose
  return skin.clone().multiply(new Color(0.66, 0.5, 0.47))
}

/** hair catches a soft brown sheen on its coils (added, so it shows on near-black too) */
export function hairSheen(c: Color, k = 1): Color {
  return c.clone().multiplyScalar(1 + 0.25 * k).add(new Color(0.03 * k, 0.021 * k, 0.015 * k))
}

/** a muted value tweak in linear space */
export function tone(c: Color, k: number): Color {
  return c.clone().multiplyScalar(k)
}

export function mixc(a: Color, b: Color, t: number): Color {
  return new Color().lerpColors(a, b, clamp(t, 0, 1))
}

export { lerp }
