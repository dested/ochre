import type { LifeStageId, Sex } from '~/game/contracts'

export type StageInfo = {
  id: LifeStageId
  /** the chapter title, as on its card */
  title: string
  ageYears: number
  /** one line under the title: the feeling of the stage */
  line: string
  painting: string
  /** a man's life, where `painting` puts a woman in focus */
  paintingMale?: Painting
}

/** a painting and whether to flip it, so its subject sits clear of the text */
export type Painting = { src: string; mirror: boolean }

/** the five stages of a life (design doc: Structure) */
export const STAGES: Record<LifeStageId, StageInfo> = {
  held: {
    id: 'held',
    title: 'Held',
    ageYears: 0,
    line: 'Everything is faces, warmth and the breath of the sea',
    painting: '/art/chapters/held.webp',
  },
  small: {
    id: 'small',
    title: 'Small',
    ageYears: 6,
    line: 'You learn by watching, on a shore wide and full of wonders',
    painting: '/art/chapters/small.webp',
  },
  youth: {
    id: 'youth',
    title: 'Coming of age',
    ageYears: 14,
    line: 'Stone, fire and the first hunt, and becoming someone people need',
    painting: '/art/chapters/youth.webp',
  },
  provider: {
    id: 'provider',
    title: 'Provider',
    ageYears: 26,
    line: 'Keeping the people you love alive through the seasons',
    painting: '/art/chapters/provider.webp',
  },
  elder: {
    id: 'elder',
    title: 'Elder',
    ageYears: 58,
    line: 'Passing it on, and letting go',
    painting: '/art/chapters/elder.webp',
    // elder.webp is a grandmother; intro/3 is a grandfather teaching a child at the fire, flipped to the right
    paintingMale: { src: '/art/intro/3.webp', mirror: true },
  },
}

/** the stage's painting for this life (sex null: not known yet, the stage default) */
export function stagePainting(stage: LifeStageId, sex: Sex | null): Painting {
  const info = STAGES[stage]
  if (sex === 'male' && info.paintingMale) return info.paintingMale
  return { src: info.painting, mirror: false }
}
