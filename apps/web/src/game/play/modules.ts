/**
 * The one place the play session picks its modules. Each line points at the owner's real module once it is
 * committed, or at the local stub until then. Swap a line here; nothing else changes.
 */
import type { Object3D } from 'three'
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
import { createStubAudio } from './stubs/audio'
import { createStubSpoor } from './stubs/spoor'
import { createStubAnimal, createStubPerson } from './stubs/actors'
import { createStubPipeline } from './stubs/pipeline'
import { createSim } from '../../sim'
import { createStubWorldData } from './stubs/world-data'
import { createStubWorldView } from './stubs/world-view'

/** world's tracking-marks helper (game/world/spoor.ts), per the run plan */
export type Spoor = { readonly root: Object3D; add(x: number, z: number, heading: number, age: number): void; clear(): void }
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
  createWorldData: createStubWorldData,
  createWorldView: createStubWorldView,
  createRenderPipeline: createStubPipeline,
  createSim,
  createPerson: createStubPerson,
  createAnimal: createStubAnimal,
  createAudio: createStubAudio,
  createSpoor: createStubSpoor,
  paint,
}
