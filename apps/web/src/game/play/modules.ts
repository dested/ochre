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
import { createAudio } from '../audio'
import { createStubSpoor } from './stubs/spoor'
import { createAnimal, createPerson } from '../actors'
import { createRenderPipeline } from '../render'
import { createSim } from '../../sim'
import { createWorldData } from '../../world-gen'
import { createWorldView } from '../world'

/** world's tracking-marks helper (game/world/spoor.ts), per the run plan */
export type Spoor = {
  readonly root: Object3D
  add(x: number, z: number, heading: number, age: number): void
  clear(): void
}
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
  createSpoor: createStubSpoor,
  paint,
}
