import type { LifeStageId } from '~/game/contracts'

export type StageInfo = {
  id: LifeStageId
  /** the chapter title, as on its card */
  title: string
  ageYears: number
  /** one line under the title: the feeling of the stage */
  line: string
  painting: string
}

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
  },
}
