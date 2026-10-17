/**
 * The cave's rock: an analytic density field (positive inside rock) that the view polygonises into the shell
 * mesh, and that world-gen samples to block the walls. Three-free.
 *
 * The heightfield can't overhang, so the floor terrace lives in the heightfield and the rock lives here: a mass
 * whose top replaces the plateau over the footprint, a brow over the mouth, chunky rock dressing the face round
 * it, minus the cavity (a noisy, domed half-ellipsoid opening toward the sea).
 */
import { CAVE, caveHalfWidth, caveLocal } from './layout'
import { Noise3, smoothstep } from './noise'

/** the box the rock lives in (world metres) */
export const CAVE_BOX = { x0: -100, x1: 22, z0: 36, z1: 132, y0: 22, y1: 64 } as const

export type HeightSampler = (x: number, z: number) => number

/** everything about a vertical column of the rock that doesn't depend on y */
export type CaveColumn = { x: number; z: number; a: number; b: number; hFinal: number; top0: number; topOver: number; topBrow: number }

export type CaveRock = {
  column(x: number, z: number): CaveColumn
  /** positive inside rock */
  density(col: CaveColumn, y: number): number
  /** the cavity alone (negative inside the cavity) */
  cavity(col: CaveColumn, y: number): number
}

const A0 = -7

/**
 * `finalH` is the finished heightfield (terrace and paths cut), `preH` the terrain before the cave was cut,
 * `pathNear` the distance (m) to the nearest path centreline.
 */
export function createCaveRock(seed: number, finalH: HeightSampler, preH: HeightSampler, pathNear: HeightSampler): CaveRock {
  const n3 = new Noise3((seed ^ 0xca7e) >>> 0)

  const column = (x: number, z: number): CaveColumn => {
    const { a, b } = caveLocal(x, z)
    const hFinal = finalH(x, z)
    const hPre = preH(x, z)
    const ex = Math.min(x - CAVE_BOX.x0, CAVE_BOX.x1 - x, z - CAVE_BOX.z0, CAVE_BOX.z1 - z)
    const edge = 1 - smoothstep(4, 22, ex)
    const slope = (Math.abs(preH(x + 2, z) - preH(x - 2, z)) + Math.abs(preH(x, z + 2) - preH(x, z - 2))) / 8
    const slopeK = smoothstep(0.3, 0.9, slope)
    const faceN = n3.fbm(x / 9, 3.7, z / 9, 2)
    let bulge = (0.25 + 1.1 * slopeK + faceN * 1.2) * (1 - edge) - 4 * edge
    bulge -= 5 * (1 - smoothstep(2.4, 5.5, pathNear(x, z)))
    const hw = caveHalfWidth(Math.min(a, 0))
    const terraceK =
      (1 - smoothstep(CAVE.terrace, CAVE.terrace + 4, a)) *
      smoothstep(0.5, 3, a) *
      (1 - smoothstep(CAVE.halfWidth + 1, CAVE.halfWidth + 5, Math.abs(b)))
    bulge -= 5 * terraceK
    const top0 = hFinal + bulge
    const over =
      (1 - smoothstep(0.5, 3.5, a)) *
      (1 - smoothstep(hw + 1, hw + 4.5, Math.abs(b))) *
      smoothstep(-CAVE.depth - 6, -CAVE.depth - 1, a)
    const topOver = over > 0 ? hPre + 0.35 + faceN * 0.6 - (1 - over) * 8 : -1e9
    const browK = (1 - smoothstep(1.2, 3.6, a)) * smoothstep(-6, -1, a) * (1 - smoothstep(hw + 2, hw + 7, Math.abs(b)))
    const topBrow = browK > 0 ? CAVE.floor + CAVE.ceiling + 3.4 + faceN * 1.2 - (1 - browK) * 9 : -1e9
    return { x, z, a, b, hFinal, top0, topOver, topBrow }
  }

  const cavity = (c: CaveColumn, y: number): number => {
    const yy = y - CAVE.floor - 1
    const ra = c.a > A0 ? 30 : CAVE.depth + A0 + 1.5
    const rb = CAVE.halfWidth + 0.4
    const ceil = 3.2 + (CAVE.ceiling - 3.2) * smoothstep(-CAVE.depth, -6, c.a) - 0.6 * smoothstep(-2, 4, c.a)
    const ry = yy > 0 ? ceil : 7
    const ea = (c.a - A0) / ra
    const eb = c.b / rb
    const ey = yy / ry
    const e = Math.sqrt(ea * ea + eb * eb + ey * ey)
    const rough = n3.fbm(c.x / 5.5, y / 4.5, c.z / 5.5, 3) * 1.2 + n3.at(c.x / 1.7, y / 1.7, c.z / 1.7) * 0.3
    return (e - 1) * Math.min(rb, ry) + rough
  }

  const density = (c: CaveColumn, y: number): number => {
    const top = Math.max(c.top0, c.topOver, c.topBrow)
    const chunk = n3.at(c.x / 3.1, y / 2.3, c.z / 3.1) * 0.5
    const dMass = top + chunk - y
    const dSkin = y - (c.hFinal - 2.5)
    return Math.min(dMass, dSkin, cavity(c, y))
  }

  return { column, density, cavity }
}
