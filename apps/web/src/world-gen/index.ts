/**
 * createWorldData: the coast as data. Three-free and DOM-free; deterministic for a seed. Every query samples
 * precomputed grids (no noise at query time). The returned object also carries the raw grids (`terrain`,
 * `shore`) for the world view; anything else should use only the WorldData contract.
 */
import type { CreateWorldData, Poi, PoiKind, Surface, Vec3, WorldData } from '../game/contracts'
import { CELL, HALF, HIGH_WATER, POI_DEFS, WADE_DEPTH, WALK_SLOPE, WORLD_SIZE, inCaveFootprint } from './layout'
import { buildShore, deepDistanceAt, shoreDistanceAt, type ShoreFields } from './shore'
import { FRESH_NONE, MAT, buildTerrain, cellOf, sampleGrid, type TerrainGrid } from './terrain'

export type OchreWorldData = WorldData & {
  readonly terrain: TerrainGrid
  readonly shore: ShoreFields
}

/** narrows a WorldData to the one world-gen made (with its grids) */
export function isOchreWorld(w: WorldData): w is OchreWorldData {
  return 'terrain' in w && 'shore' in w
}

export const createWorldData: CreateWorldData = (seed: number): OchreWorldData => {
  const terrain = buildTerrain(seed)
  const shore = buildShore(terrain.h, terrain.fresh)
  const { h, mat, fresh, freshKind, path, blocked, slope } = terrain

  const heightAt = (x: number, z: number): number => sampleGrid(h, x, z)

  const normalAt = (x: number, z: number): Vec3 => {
    const e = CELL
    const dx = heightAt(x + e, z) - heightAt(x - e, z)
    const dz = heightAt(x, z + e) - heightAt(x, z - e)
    const nx = -dx / (2 * e)
    const nz = -dz / (2 * e)
    const len = Math.hypot(nx, 1, nz)
    return { x: nx / len, y: 1 / len, z: nz / len }
  }

  const inBounds = (x: number, z: number) => x >= -HALF && x <= HALF && z >= -HALF && z <= HALF

  const waterDepth = (x: number, z: number, seaLevel: number): number => {
    const c = cellOf(x, z)
    const hv = heightAt(x, z)
    if (c < 0) return Math.max(0, seaLevel - hv)
    const fl = fresh[c] ?? FRESH_NONE
    return Math.max(0, (fl !== FRESH_NONE ? fl : seaLevel) - hv)
  }

  const surfaceAt = (x: number, z: number, seaLevel: number): Surface => {
    if (!inBounds(x, z)) return 'deep-sea'
    if (inCaveFootprint(x, z)) return 'cave'
    const c = cellOf(x, z)
    const hv = heightAt(x, z)
    const fk = freshKind[c] ?? 0
    const fl = fresh[c] ?? FRESH_NONE
    if (fl !== FRESH_NONE) {
      if (fl - hv > 0.05) return fk === 2 ? 'river' : 'lagoon'
    } else {
      const depth = seaLevel - hv
      if (depth > 0) {
        if (depth > 2.5) return 'deep-sea'
        if (depth < 1.7 && deepDistanceAt(shore, x, z) < 34) return 'surf'
        return 'shallows'
      }
    }
    const m = mat[c] ?? MAT.fynbos
    switch (m) {
      case MAT.path:
        return 'path'
      case MAT.cave:
        return 'cave'
      case MAT.cliff:
        return 'cliff'
      case MAT.rock:
        return 'rock'
      case MAT.scree:
        return 'rock'
      case MAT.shelf:
      case MAT.seabed:
        return hv < HIGH_WATER ? 'wet-rock' : 'rock'
      case MAT.sand:
        return hv < seaLevel + 0.6 ? 'wet-sand' : 'sand'
      case MAT.dune:
        return 'dune'
      case MAT.grass:
        return 'grass'
      case MAT.lagoonBed:
      case MAT.riverBed:
        return 'wet-sand'
      default:
        return 'fynbos'
    }
  }

  const walkable = (x: number, z: number, seaLevel: number): boolean => {
    if (!inBounds(x, z)) return false
    const c = cellOf(x, z)
    if (c < 0) return false
    if (blocked[c] === 1) return false
    if (waterDepth(x, z, seaLevel) > WADE_DEPTH) return false
    if (path[c] === 1) return true
    return sampleGrid(slope, x, z) <= WALK_SLOPE
  }

  const shoreDistance = (x: number, z: number, seaLevel: number): number => {
    if (waterDepth(x, z, seaLevel) > 0) return 0
    return shoreDistanceAt(shore, x, z, seaLevel)
  }

  const pois: Poi[] = POI_DEFS.map((d) => {
    const p: Poi = { id: d.id, kind: d.kind, x: d.x, z: d.z, radius: d.radius, label: d.label }
    if (d.tideMax !== undefined) p.tideMax = d.tideMax
    return p
  })
  const byId = new Map(pois.map((p) => [p.id, p]))
  const byKind = new Map<PoiKind, Poi[]>()
  for (const p of pois) {
    const list = byKind.get(p.kind) ?? []
    list.push(p)
    byKind.set(p.kind, list)
  }

  return {
    seed,
    size: WORLD_SIZE,
    heightAt,
    normalAt,
    surfaceAt,
    walkable,
    waterDepth,
    shoreDistance,
    inCave: inCaveFootprint,
    pois,
    poi(id: string): Poi {
      const p = byId.get(id)
      if (!p) throw new Error(`unknown POI "${id}"`)
      return p
    },
    poisOf(kind: PoiKind): readonly Poi[] {
      return byKind.get(kind) ?? []
    },
    terrain,
    shore,
  }
}

