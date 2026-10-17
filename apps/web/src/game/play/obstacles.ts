/**
 * The world's rocks, bushes and trees as simple solids near the player, read from the foliage instances the world
 * view draws (by mesh name; play never changes them). Rocks taller than knee height push the player out, so a body
 * never stands sunk in stone; bushes, canopies and rocks keep the camera from sitting inside them.
 */
import { type BufferGeometry, InstancedMesh, type Object3D } from 'three'

export type Obstacles = {
  /** gather what stands within REACH of (x, z); a few times a second is plenty */
  refresh(root: Object3D, x: number, z: number): void
  /** push a body of radius r (on the ground at p) out of the rocks that stand above its knees */
  pushOut(p: { x: number; z: number }, r: number): void
  /** true when the point sits inside a bush, canopy or rock that the pivot is not itself inside */
  blocks(px: number, py: number, pz: number, x: number, y: number, z: number): boolean
}

const REACH = 16
/** a rock whose top stands this far above the ground blocks the body, metres */
const KNEE = 0.45
/** the camera keeps this far out of a bush or rock's sphere, metres */
const CAM_MARGIN = 0.25

type Shape = { r: number; xz: number; top: number; mid: number }
const SOLID = /^(rock-(near|far)-\d+|stacks)$/
const SOFT = /^(fynbos-near-\d+|protea-near-\d+|milkwoods)$/

/** radius from the origin, the xz radius, and the top and middle height of a geometry, in its own units */
function shapeOf(geo: BufferGeometry, cache: WeakMap<BufferGeometry, Shape>): Shape {
  const hit = cache.get(geo)
  if (hit) return hit
  const pos = geo.getAttribute('position')
  let r = 0
  let xz = 0
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    r = Math.max(r, Math.hypot(x, y, z))
    xz = Math.max(xz, Math.hypot(x, z))
    lo = Math.min(lo, y)
    hi = Math.max(hi, y)
  }
  const s: Shape = { r, xz, top: hi, mid: (lo + hi) / 2 }
  cache.set(geo, s)
  return s
}

export function createObstacles(heightAt: (x: number, z: number) => number): Obstacles {
  const shapes = new WeakMap<BufferGeometry, Shape>()
  let meshes: { mesh: InstancedMesh; solid: boolean }[] | null = null
  // gathered spheres: x, y, z, r; solids also keep their footprint radius
  const soft: number[] = []
  const solid: number[] = []

  const gather = (root: Object3D) => {
    const found: { mesh: InstancedMesh; solid: boolean }[] = []
    root.traverse((o) => {
      if (!(o instanceof InstancedMesh)) return
      if (SOLID.test(o.name)) found.push({ mesh: o, solid: true })
      else if (SOFT.test(o.name)) found.push({ mesh: o, solid: false })
    })
    return found
  }

  return {
    refresh(root, x, z) {
      if (!meshes || meshes.length === 0) meshes = gather(root)
      soft.length = 0
      solid.length = 0
      for (const { mesh, solid: hard } of meshes) {
        if (!mesh.visible) continue
        const shape = shapeOf(mesh.geometry, shapes)
        const m = mesh.instanceMatrix.array
        for (let i = 0; i < mesh.count; i++) {
          const o = i * 16
          const tx = m[o + 12] ?? 0
          const tz = m[o + 14] ?? 0
          if (Math.abs(tx - x) > REACH || Math.abs(tz - z) > REACH) continue
          const ty = m[o + 13] ?? 0
          // the largest axis scale (instances scale evenly, or stretch y a little)
          const s = Math.max(
            Math.hypot(m[o] ?? 0, m[o + 1] ?? 0, m[o + 2] ?? 0),
            Math.hypot(m[o + 4] ?? 0, m[o + 5] ?? 0, m[o + 6] ?? 0)
          )
          if (hard) {
            // tumbled rocks: the sphere about the origin is the honest bound; lumps make it generous, so shrink it
            const r = shape.r * s * 0.8
            const top = ty + r
            solid.push(tx, ty, tz, r, top - heightAt(tx, tz) > KNEE ? shape.xz * s * 0.75 : 0)
          } else
            soft.push(tx, ty + shape.mid * s, tz, Math.max(shape.xz, shape.top - shape.mid) * s)
        }
      }
    },
    pushOut(p, r) {
      for (let pass = 0; pass < 3; pass++) {
        let moved = false
        for (let i = 0; i < solid.length; i += 5) {
          const foot = solid[i + 4] ?? 0
          if (foot <= 0) continue
          const dx = p.x - (solid[i] ?? 0)
          const dz = p.z - (solid[i + 2] ?? 0)
          const d = Math.hypot(dx, dz)
          const need = foot + r
          if (d >= need) continue
          // dead centre: out along +x
          const k = d > 1e-4 ? need / d : 0
          p.x = (solid[i] ?? 0) + (d > 1e-4 ? dx * k : need)
          p.z = (solid[i + 2] ?? 0) + dz * k
          moved = true
        }
        if (!moved) return
      }
    },
    blocks(px, py, pz, x, y, z) {
      const test = (list: number[], stride: number) => {
        for (let i = 0; i < list.length; i += stride) {
          const cx = list[i] ?? 0
          const cy = list[i + 1] ?? 0
          const cz = list[i + 2] ?? 0
          const r = (list[i + 3] ?? 0) + CAM_MARGIN
          if ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 >= r * r) continue
          // the player stands in this bush: the camera may pass through it
          if ((px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2 < r * r) continue
          return true
        }
        return false
      }
      return test(soft, 4) || test(solid, 5)
    },
  }
}
