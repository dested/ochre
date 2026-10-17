/**
 * The one place the play session picks its modules, each from its owner. Swap a line here; nothing else changes.
 */
import type {
  CreateAnimal,
  CreateAudio,
  PaintMaterial,
  CreatePerson,
  CreateRenderPipeline,
  CreateSim,
  CreateWorldData,
  CreateWorldView,
  WorldData,
} from '../contracts'
import { paint } from '../render/paint'
import { createAudio } from '../audio'
import { createAnimal, createPerson } from '../actors'
import { createRenderPipeline } from '../render'
import { createSim } from '../../sim'
import { createWorldData } from '../../world-gen'
import { createWorldView } from '../world'
import { createSpoor, type Spoor } from '../world/spoor'

/** world's tracking-marks helper (game/world/spoor.ts) */
export type { Spoor }
export type CreateSpoor = (world: WorldData) => Spoor

export type Modules = {
  createWorldData: CreateWorldData
  createWorldView: CreateWorldView
  createRenderPipeline: CreateRenderPipeline
  createSim: CreateSim
  createPerson: CreatePerson
  createAnimal: CreateAnimal
  createAudio: CreateAudio
  createSpoor: CreateSpoor
  paint: PaintMaterial
}

export const modules: Modules = {
  createWorldData,
  createWorldView,
  createRenderPipeline,
  createSim,
  createPerson,
  createAnimal,
  createAudio,
  createSpoor,
  paint,
}
