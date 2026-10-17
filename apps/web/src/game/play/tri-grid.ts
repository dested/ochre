/**
 * A flat grid over a static mesh's triangles, for cheap segment-blocked tests (name-tag occlusion by the cave rock).
 * Triangles are binned by their xz bounds; a segment only tests the triangles in the cells it crosses.
 */
import type { Mesh, Vector3 } from 'three'
import { Vector3 as V3 } from 'three'

export type TriGrid = {
  /** true when the segment from → to passes through a triangle (either side) */
  blocked(from: Vector3, to: Vector3): boolean
}

export function createTriGrid(mesh: Mesh, cell = 2): TriGrid {
  mesh.updateWorldMatrix(true, false)
  const pos = mesh.geometry.getAttribute('position')
  const index = mesh.geometry.getIndex()
  const triCount = index ? index.count / 3 : pos.count / 3
  const tris = new Float32Array(triCount * 9)
  const v = new V3()
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const vi = index ? index.getX(t * 3 + k) : t * 3 + k
      v.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld)
      tris[t * 9 + k * 3] = v.x
      tris[t * 9 + k * 3 + 1] = v.y
      tris[t * 9 + k * 3 + 2] = v.z
      minX = Math.min(minX, v.x)
      maxX = Math.max(maxX, v.x)
      minZ = Math.min(minZ, v.z)
      maxZ = Math.max(maxZ, v.z)
    }
  }
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell))
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell))
  const cells: number[][] = Array.from({ length: cols * rows }, () => [])
  const colOf = (x: number) => Math.min(cols - 1, Math.max(0, Math.floor((x - minX) / cell)))
  const rowOf = (z: number) => Math.min(rows - 1, Math.max(0, Math.floor((z - minZ) / cell)))
  for (let t = 0; t < triCount; t++) {
    const o = t * 9
    const x0 = Math.min(tris[o] ?? 0, tris[o + 3] ?? 0, tris[o + 6] ?? 0)
    const x1 = Math.max(tris[o] ?? 0, tris[o + 3] ?? 0, tris[o + 6] ?? 0)
    const z0 = Math.min(tris[o + 2] ?? 0, tris[o + 5] ?? 0, tris[o + 8] ?? 0)
    const z1 = Math.max(tris[o + 2] ?? 0, tris[o + 5] ?? 0, tris[o + 8] ?? 0)
    for (let c = colOf(x0); c <= colOf(x1); c++)
      for (let r = rowOf(z0); r <= rowOf(z1); r++) cells[r * cols + c]?.push(t)
  }

  // each query stamps the triangles it has tested so a triangle in several cells is tested once
  const stamp = new Uint32Array(triCount)
  let query = 0

  /** Möller–Trumbore against the segment p + d·s, s in (0, 1) */
  const hitTri = (
    o: number,
    px: number,
    py: number,
    pz: number,
    dx: number,
    dy: number,
    dz: number
  ) => {
    const ax = tris[o] ?? 0
    const ay = tris[o + 1] ?? 0
    const az = tris[o + 2] ?? 0
    const e1x = (tris[o + 3] ?? 0) - ax
    const e1y = (tris[o + 4] ?? 0) - ay
    const e1z = (tris[o + 5] ?? 0) - az
    const e2x = (tris[o + 6] ?? 0) - ax
    const e2y = (tris[o + 7] ?? 0) - ay
    const e2z = (tris[o + 8] ?? 0) - az
    const hx = dy * e2z - dz * e2y
    const hy = dz * e2x - dx * e2z
    const hz = dx * e2y - dy * e2x
    const det = e1x * hx + e1y * hy + e1z * hz
    if (Math.abs(det) < 1e-9) return false
    const inv = 1 / det
    const sx = px - ax
    const sy = py - ay
    const sz = pz - az
    const u = (sx * hx + sy * hy + sz * hz) * inv
    if (u < 0 || u > 1) return false
    const qx = sy * e1z - sz * e1y
    const qy = sz * e1x - sx * e1z
    const qz = sx * e1y - sy * e1x
    const w = (dx * qx + dy * qy + dz * qz) * inv
    if (w < 0 || u + w > 1) return false
    const s = (e2x * qx + e2y * qy + e2z * qz) * inv
    return s > 1e-4 && s < 1 - 1e-4
  }

  return {
    blocked(from, to) {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const dz = to.z - from.z
      // clip the xz walk to the grid's bounds; a segment that misses them can't hit anything
      if (Math.max(from.x, to.x) < minX || Math.min(from.x, to.x) > maxX) return false
      if (Math.max(from.z, to.z) < minZ || Math.min(from.z, to.z) > maxZ) return false
      query++
      if (query === 0xffffffff) {
        stamp.fill(0)
        query = 1
      }
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (cell * 0.5)))
      let lastCell = -1
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = from.x + dx * t
        const z = from.z + dz * t
        if (x < minX - cell || x > maxX + cell || z < minZ - cell || z > maxZ + cell) continue
        const c = rowOf(z) * cols + colOf(x)
        if (c === lastCell) continue
        lastCell = c
        for (const tri of cells[c] ?? []) {
          if (stamp[tri] === query) continue
          stamp[tri] = query
          if (hitTri(tri * 9, from.x, from.y, from.z, dx, dy, dz)) return true
        }
      }
      return false
    },
  }
}
