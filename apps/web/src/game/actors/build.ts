/**
 * PersonLook → one rigged person: three SkinnedMeshes (skin, gear, detail) on one 30-bone skeleton. The detail
 * mesh holds the eyes and teeth plus whatever is in the hands, and is rebuilt when the hands or the carry change.
 */
import { Group, Skeleton, SkinnedMesh, Sphere, Vector3, type Bone, type BufferGeometry } from 'three'
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
  /** rebuild the detail mesh with these items and an optional back sling for a child of these dims */
  setProps(left: HeldItem, right: HeldItem, sling: { child: BodyDims; slot: CarrySlot } | null): void
  dispose(): void
}

export function buildPerson(look: PersonLook): BuiltPerson {
  const dims = bodyDims(look)
  const rng = new Rng(mix32(look.seed, 0x9e75))
  const ctx: BuildCtx = {
    look,
    d: dims,
    rng,
    skin: new MeshBuilder(),
    gear: new MeshBuilder(),
    detail: new MeshBuilder(),
    skinC: skinColor(look.skin),
    hairC: hairColor(look.seed, dims.age, look.adornments.includes('ochre-hair')),
    has: (a) => look.adornments.includes(a),
  }
  const hs = headShape(ctx)
  const ts = torsoShape(ctx)
  buildHead(ctx, hs)
  buildTorso(ctx, ts)
  buildArms(ctx)
  buildLegs(ctx)
  buildHair(ctx, hs)
  buildGarments(ctx, ts)
  buildAdornments(ctx, ts, hs)
  const detailBase = ctx.detail

  const bind = bindPositions(dims)
  const bones = makeBones(bind)
  const root = bones[B.root]
  const mats = actorMaterials()
  const skinGeo = ctx.skin.build()
  const gearGeo = ctx.gear.build()
  const group = new Group()
  group.name = 'person-rig'
  const skin = new SkinnedMesh(skinGeo, mats.skin)
  const gear = new SkinnedMesh(gearGeo, mats.gear)
  const detail = new SkinnedMesh(detailBase.build(), mats.detail)
  for (const m of [skin, gear, detail]) {
    m.castShadow = true
    m.receiveShadow = true
  }
  group.add(skin, gear, detail)
  if (root) skin.add(root)
  const skeleton = new Skeleton(bones)
  group.updateMatrixWorld(true)
  skin.bind(skeleton)
  gear.bind(skeleton)
  detail.bind(skeleton)
  const sphere = new Sphere(new Vector3(0, dims.stature * 0.5, 0), dims.stature * 0.8 + 0.3)
  skin.boundingSphere = sphere
  gear.boundingSphere = sphere.clone()
  detail.boundingSphere = sphere.clone()

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

  const geos: BufferGeometry[] = [skinGeo, gearGeo]
  return {
    dims,
    rig,
    group,
    bones,
    skeleton,
    skin,
    gear,
    detail,
    vertexCount: ctx.skin.vertexCount + ctx.gear.vertexCount + detailBase.vertexCount,
    setProps(left, right, sling) {
      const mb = new MeshBuilder().append(detailBase)
      buildItem(mb, dims, 'left', left, look.seed ^ 0x11)
      buildItem(mb, dims, 'right', right, look.seed ^ 0x22)
      if (sling) buildSling(mb, dims, sling.child, look.seed, sling.slot)
      const old = detail.geometry
      // same skeleton and bind matrix: swapping the geometry is enough
      detail.geometry = mb.build()
      old.dispose()
    },
    dispose() {
      for (const g of geos) g.dispose()
      detail.geometry.dispose()
      skeleton.dispose()
    },
  }
}
