/**
 * PersonLook → one rigged person: three SkinnedMeshes (skin, gear, detail) on one 30-bone skeleton. The detail
 * mesh holds the eyes and teeth plus whatever is in the hands, and is rebuilt when the hands or the carry change.
 * Skin and gear come in three detail levels (a THREE.LOD picks one by camera distance, all on the same skeleton),
 * so a person is three draw calls at any distance and a far crowd costs a fraction of the close-up triangles.
 */
import { Group, LOD, Skeleton, SkinnedMesh, Sphere, Vector3, type Bone, type BufferGeometry } from 'three'
import type { CarrySlot, HeldItem, PersonLook } from '../contracts'
import { Rng, mix32 } from '~/core/rng'
import { bodyDims, type BodyDims } from './body'
import type { BuildCtx } from './ctx'
import { buildArms, buildLegs, buildTorso, torsoShape } from './figure'
import { buildGarments } from './garments'
import { MeshBuilder } from './geo'
import { buildHair } from './hair'
import { buildHead, headShape } from './head'
import { buildAdornments } from './adorn'
import { hairColor, skinColor } from './looks'
import { actorMaterials } from './materials'
import { buildItem, buildSling } from './props'
import { B, bindPositions, makeBones } from './rig'
import type { RigInfo } from './pose'

export type BuiltPerson = {
  dims: BodyDims
  rig: RigInfo
  /** holds the meshes and the root bone */
  group: Group
  bones: Bone[]
  skeleton: Skeleton
  skin: SkinnedMesh
  gear: SkinnedMesh
  detail: SkinnedMesh
  vertexCount: number
  /** triangles per detail level, close to far (with the detail mesh) */
  levelTriangles: number[]
  /** rebuild the detail mesh with these items and an optional back sling for a child of these dims */
  setProps(left: HeldItem, right: HeldItem, sling: { child: BodyDims; slot: CarrySlot } | null): void
  dispose(): void
}

/** the detail levels: [quality, camera distance in metres where the level starts] */
const LEVELS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.45, 6],
  [0.22, 16],
]

/** every part builder in order; each draws from its own seeded stream so the levels agree on every choice */
function buildParts(look: PersonLook, dims: BodyDims, q: number): BuildCtx {
  const ctx: BuildCtx = {
    look,
    d: dims,
    rng: new Rng(mix32(look.seed, 0x9e75)),
    skin: new MeshBuilder(q),
    gear: new MeshBuilder(q),
    detail: new MeshBuilder(q),
    skinC: skinColor(look.skin),
    hairC: hairColor(look.seed, dims.age, look.adornments.includes('ochre-hair')),
    // every adult wears some ochre on the face, arms and shins (the band's look), whatever the look lists
    has: (a) => look.adornments.includes(a) || (dims.age >= 16 && (a === 'ochre-face' || a === 'ochre-body')),
  }
  const hs = headShape(ctx)
  const ts = torsoShape(ctx)
  const steps: (() => void)[] = [
    () => buildHead(ctx, hs),
    () => buildTorso(ctx, ts),
    () => buildArms(ctx),
    () => buildLegs(ctx),
    () => buildHair(ctx, hs),
    () => buildGarments(ctx, ts),
    () => buildAdornments(ctx, ts, hs),
  ]
  steps.forEach((step, i) => {
    ctx.rng = new Rng(mix32(look.seed, 0x9e75 + 0x101 * (i + 1)))
    step()
  })
  return ctx
}

export function buildPerson(look: PersonLook): BuiltPerson {
  const dims = bodyDims(look)
  const levels = LEVELS.map(([q]) => buildParts(look, dims, q))
  const ctx = levels[0]
  if (!ctx) throw new Error('[actors] no detail levels')

  const bind = bindPositions(dims)
  const bones = makeBones(bind)
  const root = bones[B.root]
  const mats = actorMaterials()
  const group = new Group()
  group.name = 'person-rig'
  const skeleton = new Skeleton(bones)
  const sphere = new Sphere(new Vector3(0, dims.stature * 0.5, 0), dims.stature * 0.8 + 0.3)
  if (root) group.add(root)
  group.updateMatrixWorld(true)
  const skinned = (geo: BufferGeometry, mat: SkinnedMesh['material']): SkinnedMesh => {
    const m = new SkinnedMesh(geo, mat)
    m.castShadow = true
    m.receiveShadow = true
    m.bind(skeleton)
    m.boundingSphere = sphere.clone()
    return m
  }
  const geos: BufferGeometry[] = []
  const lod = new LOD()
  lod.name = 'person-lod'
  const meshes = levels.map((lv, i) => {
    const sg = lv.skin.build()
    const gg = lv.gear.build()
    geos.push(sg, gg)
    const level = new Group()
    const m = { skin: skinned(sg, mats.skin), gear: skinned(gg, mats.gear), detail: skinned(lv.detail.build(), mats.detail), base: lv.detail }
    level.add(m.skin, m.gear, m.detail)
    lod.addLevel(level, LEVELS[i]?.[1] ?? 0, 0.08)
    return m
  })
  group.add(lod)
  const top = meshes[0]
  if (!top) throw new Error('[actors] no level-0 meshes')

  const rig: RigInfo = {
    bind,
    hipY: dims.hipY,
    hipX: dims.hipX,
    ankleY: dims.ankleY,
    thigh: dims.thigh,
    shin: dims.shin,
    upperArm: dims.upperArm,
    foreArm: dims.foreArm,
    stature: dims.stature,
  }

  return {
    dims,
    rig,
    group,
    bones,
    skeleton,
    skin: top.skin,
    gear: top.gear,
    detail: top.detail,
    vertexCount: ctx.skin.vertexCount + ctx.gear.vertexCount + ctx.detail.vertexCount,
    levelTriangles: levels.map((lv) => lv.skin.triangleCount + lv.gear.triangleCount + lv.detail.triangleCount),
    setProps(left, right, sling) {
      for (const m of meshes) {
        const mb = new MeshBuilder(m.base.q).append(m.base)
        buildItem(mb, dims, 'left', left, look.seed ^ 0x11)
        buildItem(mb, dims, 'right', right, look.seed ^ 0x22)
        if (sling) buildSling(mb, dims, sling.child, look.seed, sling.slot)
        const old = m.detail.geometry
        // same skeleton and bind matrix: swapping the geometry is enough
        m.detail.geometry = mb.build()
        old.dispose()
      }
    },
    dispose() {
      for (const g of geos) g.dispose()
      for (const m of meshes) m.detail.geometry.dispose()
      skeleton.dispose()
    },
  }
}
