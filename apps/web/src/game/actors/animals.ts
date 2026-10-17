/**
 * Animals: each kind is a Plan (bones, geometry, procedural poses) run by the shared BeastActor (beast.ts), drawn
 * with the people's shared materials in two draw calls at any detail level.
 */
import type { AnimalKind, CreateAnimal } from '../contracts'
import { BeastActor, type Plan } from './beast'
import { gullPlan } from './gull'
import { quadrupedPlan } from './quadruped'
import { sealPlan } from './seal'
import { tortoisePlan } from './tortoise'
import { whalePlan } from './whale'

function planFor(kind: AnimalKind, seed: number): Plan {
  switch (kind) {
    case 'eland':
    case 'hyena':
    case 'lion':
      return quadrupedPlan(kind, seed)
    case 'seal':
      return sealPlan(seed)
    case 'gull':
      return gullPlan(seed)
    case 'tortoise':
      return tortoisePlan(seed)
    case 'whale':
      return whalePlan(seed)
  }
}

export const createAnimal: CreateAnimal = (kind, seed) => new BeastActor(kind, planFor(kind, seed), seed)
