/**
 * The one place the play session picks its modules. Each line points at the owner's real module once it is
 * committed, or at the local stub until then. Swap a line here; nothing else changes.
 */
import type {
  CreateAnimal,
  CreatePerson,
  CreateRenderPipeline,
  CreateSim,
  CreateWorldData,
  CreateWorldView,
} from '../contracts'
import { createStubAnimal, createStubPerson } from './stubs/actors'
import { createStubPipeline } from './stubs/pipeline'
import { createStubSim } from './stubs/sim'
import { createStubWorldData } from './stubs/world-data'
import { createStubWorldView } from './stubs/world-view'

export type Modules = {
  createWorldData: CreateWorldData
  createWorldView: CreateWorldView
  createRenderPipeline: CreateRenderPipeline
  createSim: CreateSim
  createPerson: CreatePerson
  createAnimal: CreateAnimal
}

export const modules: Modules = {
  createWorldData: createStubWorldData,
  createWorldView: createStubWorldView,
  createRenderPipeline: createStubPipeline,
  createSim: createStubSim,
  createPerson: createStubPerson,
  createAnimal: createStubAnimal,
}
