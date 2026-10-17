/**
 * The world's rocks, bushes and trees as simple solids near the player, read from the foliage instances the world
 * view draws (by mesh name; play never changes them). Rocks taller than knee height push the player out, so a body
 * never stands sunk in stone. The camera rides over rocks and bushes, and pulls in short of a tree's canopy.
 */
import { type BufferGeometry, InstancedMesh, type Object3D } from 'three'

export type Obstacles = {
  /** gather what stands within REACH of (x, z); a few times a second is plenty */
  refresh(root: Object3D, x: number, z: number): void
  /** push a body of radius r (on the ground at p) out of the rocks that stand above its knees */
  pushOut(p: { x: number; z: number }, r: number): void
  /** true when the point sits inside a canopy that the pivot is not itself inside */
  blocks(px: number, py: number, pz: number, x: number, y: number, z: number): boolean
  /** the lowest the camera may sit at (x, z) to stay out of the rocks and bushes there (−Infinity when clear) */
  floorAt(x: number, z: number): number
}

const REACH = 16
/** a rock whose top stands this far above the ground blocks the body, metres */
const KNEE = 0.45
/** a bush whose top stands above this is a canopy the camera pulls in short of, not one it rides over, metres */
const CANOPY = 2.4
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
  // gathered spheres (x, y, z, r): rocks and low bushes the camera rides over, canopies it stops short of;
  // and the footprints (x, z, r) of the rocks that block the body
  const low: number[] = []
  const tall: number[] = []
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
      low.length = 0
      tall.length = 0
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
            low.push(tx, ty, tz, r)
            if (ty + r - heightAt(tx, tz) > KNEE) solid.push(tx, tz, shape.xz * s * 0.75)
          } else {
            const cy = ty + shape.mid * s
            const r = Math.max(shape.xz, shape.top - shape.mid) * s
            ;(cy + r - heightAt(tx, tz) > CANOPY ? tall : low).push(tx, cy, tz, r)
          }
        }
      }
    },
    pushOut(p, r) {
      for (let pass = 0; pass < 3; pass++) {
        let moved = false
        for (let i = 0; i < solid.length; i += 3) {
          const foot = solid[i + 2] ?? 0
          const dx = p.x - (solid[i] ?? 0)
          const dz = p.z - (solid[i + 1] ?? 0)
          const d = Math.hypot(dx, dz)
          const need = foot + r
          if (d >= need) continue
          // dead centre: out along +x
          const k = d > 1e-4 ? need / d : 0
          p.x = (solid[i] ?? 0) + (d > 1e-4 ? dx * k : need)
          p.z = (solid[i + 1] ?? 0) + dz * k
          moved = true
        }
        if (!moved) return
      }
    },
    blocks(px, py, pz, x, y, z) {
      for (let i = 0; i < tall.length; i += 4) {
        const cx = tall[i] ?? 0
        const cy = tall[i + 1] ?? 0
        const cz = tall[i + 2] ?? 0
        const r = (tall[i + 3] ?? 0) + CAM_MARGIN
        if ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 >= r * r) continue
        // the player stands under this tree: the camera may pass through it
        if ((px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2 < r * r) continue
        return true
      }
      return false
    },
    floorAt(x, z) {
      let floor = -Infinity
      for (let i = 0; i < low.length; i += 4) {
        const r = (low[i + 3] ?? 0) + CAM_MARGIN
        const d2 = (x - (low[i] ?? 0)) ** 2 + (z - (low[i + 2] ?? 0)) ** 2
        if (d2 >= r * r) continue
        floor = Math.max(floor, (low[i + 1] ?? 0) + Math.sqrt(r * r - d2))
      }
      return floor
    },
  }
}
