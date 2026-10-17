/**
 * The band's names: an invented, pleasant syllable table, two syllables at most, no click letters, never a name
 * borrowed from a living people. The fixed cast keeps its names (design doc, "Names and language").
 */
import type { Rng } from '../core/rng'

export const FIXED_NAMES = ['Ama', 'Tuk', 'Oro', 'Kaya', 'Nehe', 'Ilu', 'Sabo', 'Teni'] as const

const ONSETS = ['', 'b', 'd', 'h', 'k', 'l', 'm', 'n', 'r', 's', 't', 'w', 'y'] as const
const VOWELS = ['a', 'e', 'i', 'o', 'u'] as const
/** a few closed second syllables for variety (Tuk, Sen) */
const CODAS = ['', '', '', '', '', 'n', 'k', 'l'] as const

/** pairs that read badly or too close to the fixed cast */
const BANNED = new Set(['Yi', 'Wu', 'Hu', 'Yu', 'Wo', 'Nene', 'Mama', 'Papa', 'Baba', 'Dada', 'Tete', 'Kaka', 'Lulu'])

function syllable(rng: Rng, first: boolean): string {
  const onset = first ? rng.pick(ONSETS) : rng.pick(ONSETS.slice(1))
  return onset + rng.pick(VOWELS)
}

/** a fresh name not in `taken` */
export function makeName(rng: Rng, taken: ReadonlySet<string>): string {
  for (let tries = 0; tries < 200; tries++) {
    const raw = syllable(rng, true) + syllable(rng, false) + rng.pick(CODAS)
    const name = raw.charAt(0).toUpperCase() + raw.slice(1)
    if (name.length < 3 || name.length > 5) continue
    if (BANNED.has(name) || taken.has(name)) continue
    if ((FIXED_NAMES as readonly string[]).includes(name)) continue
    return name
  }
  throw new Error('makeName: ran out of names')
}
