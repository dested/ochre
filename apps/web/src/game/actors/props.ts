/**
 * Held items and carrying slings, built into a small per-person "props" geometry that is rebuilt whenever the
 * hands or the carry change. Items are authored along +Z through the grip point of a closed hand (with the
 * forearm raised, +Z points up), skinned rigid to the hand bone, so a pose only has to place the hand.
 */
import { Color, Matrix4, Vector3 } from 'three'
import type { CarrySlot, Hand, HeldItem, PersonAnim } from '../contracts'
import type { BodyDims } from './body'
import { B } from './rig'
import { MeshBuilder, Rx, T, fbm3, lerp, mul, rigid, smooth, type SkinFn } from './geo'
import { BONE_WHITE, CORD, OCHRE, SINEW, hideColor, tone } from './looks'

const WOOD = new Color('#7a5a3c')
const WOOD_DARK = new Color('#4a3424')
const SILCRETE = new Color('#9b7863')
const CHAR = new Color('#231a14')

/** what a hand shows: a held item, or a tool the anim itself needs (the fire's poker, the engraver's slab and flake) */
export type PropItem = HeldItem | 'poker' | 'slab' | 'flake'

/** the length of the engraving flake from the grip point to its tip, and the poker's from the grip to its tip */
export const FLAKE_REACH = 0.045
export const POKER_REACH = 0.62

/**
 * the items the hands show for an anim: what they hold, except that the lying hold nothing, tending a fire with an
 * empty right hand takes a poker, and engraving takes both hands: the ochre slab in the left and a stone flake in the
 * right (whatever else was held is set down)
 */
export function shownItems(anim: PersonAnim, held: readonly [HeldItem, HeldItem]): [PropItem, PropItem] {
  const [l, r] = held
  // lying down, what was held is laid aside (a spear left in a dead or sleeping hand stands up off the ground)
  if (anim === 'lie-dead' || anim === 'sleep') return ['none', 'none']
  if (anim === 'tend-fire' && r === 'none') return [l, 'poker']
  if (anim === 'engrave') return ['slab', 'flake']
  return [l, r]
}

/** the grip point in bind space (body space with arms hanging) for a closed hand */
export function gripPoint(d: BodyDims, hand: Hand, out: Vector3): Vector3 {
  const s = hand === 'left' ? 1 : -1
  const wristY = d.shoulderJointY - d.upperArm - d.foreArm
  const thick = d.handW * 0.24
  return out.set(s * d.shoulderX - s * (thick + d.handW * 0.08), wristY - d.palm - d.fingers * 0.22, d.handW * 0.02)
}

/** where a small item rests on the open palm */
function palmPoint(d: BodyDims, hand: Hand, out: Vector3): Vector3 {
  const s = hand === 'left' ? 1 : -1
  const wristY = d.shoulderJointY - d.upperArm - d.foreArm
  return out.set(s * d.shoulderX - s * d.handW * 0.32, wristY - d.palm * 0.85, d.handW * 0.05)
}

/** a lathe along +Z between z0 and z1 */
function rod(mb: MeshBuilder, at: Matrix4, skin: SkinFn, z0: number, z1: number, r: (z: number) => number, color: (z: number) => Color, segs = 8, rings = 14): void {
  mb.at(mul(at, Rx(Math.PI / 2)), skin).lathe({
    y0: z0,
    y1: z1,
    r,
    segs,
    rings,
    color: (y) => color(y),
  })
}

export function buildItem(mb: MeshBuilder, d: BodyDims, hand: Hand, item: PropItem, seed: number): void {
  if (item === 'none') return
  const k = d.stature / 1.65
  const g = gripPoint(d, hand, new Vector3())
  const p = palmPoint(d, hand, new Vector3())
  const at = T(g.x, g.y, g.z)
  const atPalm = T(p.x, p.y, p.z)
  const skin = rigid(hand === 'left' ? B.handL : B.handR)
  switch (item) {
    case 'spear': {
      const len = 2.15 * Math.max(0.75, k)
      const grip = 0.62 * d.stature
      const z0 = -grip
      const z1 = len - grip
      const shaftR = 0.0115 * Math.max(0.8, k)
      rod(mb, at, skin, z0, z1, (z) => shaftR * (1 - 0.25 * smooth(z1 - 0.4, z1, z)) * (z < z0 + 0.03 ? 0.8 : 1), (z) => (fbm3(z * 9, 0, 0, seed) > 0.55 ? tone(WOOD, 0.85) : WOOD), 8, 18)
      // binding: sinew and ochre-gum at the haft
      rod(mb, at, skin, z1 - 0.05, z1 + 0.012, () => shaftR * 1.35, (z) => (Math.sin(z * 900) > 0 ? SINEW : tone(OCHRE, 0.55)), 8, 8)
      // the Still Bay point: a thin, leaf-shaped bifacial blade
      const pl = 0.085 * Math.max(0.8, k)
      const pw = 0.022 * Math.max(0.8, k)
      mb.at(mul(at, T(0, 0, z1 - 0.01), Rx(Math.PI / 2)), skin).lathe({
        y0: 0,
        y1: pl,
        r: (y) => {
          const t = y / pl
          return pw * Math.sin(Math.PI * Math.min(1, t ** 0.75)) ** 0.9
        },
        depth: 0.28,
        segs: 10,
        rings: 12,
        color: (y, th) => (Math.abs(Math.sin(th)) > 0.9 ? tone(SILCRETE, 1.15) : fbm3(y * 120, th, 0, seed) > 0.5 ? SILCRETE : tone(SILCRETE, 0.8)),
      })
      break
    }
    case 'digging-stick': {
      const z0 = -0.72 * Math.max(0.6, k)
      const z1 = 0.3 * Math.max(0.6, k)
      const r0 = 0.0135 * Math.max(0.75, k)
      rod(mb, at, skin, z0, z1, (z) => r0 * (z < z0 + 0.14 ? Math.max(0.08, (z - z0) / 0.14) ** 0.8 : 1) * (1 + 0.08 * Math.sin(z * 31)), (z) => (z < z0 + 0.1 ? CHAR : fbm3(z * 7, 1, 0, seed) > 0.55 ? WOOD_DARK : WOOD), 8, 20)
      break
    }
    case 'stick': {
      const z0 = -0.92 * d.stature * 0.66
      const z1 = 0.07
      const r0 = 0.015 * Math.max(0.75, k)
      rod(mb, at, skin, z0, z1, (z) => r0 * (1 + 0.12 * Math.sin(z * 17) + (z > z1 - 0.06 ? 0.25 : 0)), (z) => (fbm3(z * 6, 2, 0, seed) > 0.5 ? WOOD : tone(WOOD, 0.8)), 8, 22)
      break
    }
    case 'firebrand': {
      rod(mb, at, skin, -0.2, 0.32, (z) => 0.014 * (1 + 0.1 * Math.sin(z * 23)), (z) => (z > 0.24 ? new Color('#f08a2a') : z > 0.18 ? CHAR : WOOD), 8, 12)
      break
    }
    case 'poker': {
      // a stick for the fire: a short butt behind the fist, a charred end with a glowing tip out in front
      rod(mb, at, skin, -0.16, POKER_REACH, (z) => 0.011 * (1 - 0.3 * smooth(0.2, POKER_REACH, z)) * (1 + 0.1 * Math.sin(z * 31)), (z) => (z > POKER_REACH - 0.025 ? new Color('#f08a2a') : z > POKER_REACH - 0.14 ? CHAR : fbm3(z * 7, 3, 0, seed) > 0.5 ? WOOD : tone(WOOD, 0.8)), 7, 16)
      break
    }
    case 'slab': {
      // the ochre slab (the size of a thumb's length and two fingers wide), held flat in the fingers, its broad face
      // to the palm's side: a cross-hatched band scratched along the top face
      mb.at(mul(at, Rx(Math.PI / 2)), skin).box(0.006, 0.034, 0.016, (y, th, v) => {
        const top = Math.abs(Math.sin(th)) > 0.7 && Math.abs(v.x) > 0.003
        const hatch = Math.abs(Math.sin((y + v.z) * 260)) < 0.18 || Math.abs(Math.sin((y - v.z) * 260)) < 0.18
        return top && Math.abs(v.z) < 0.009 && hatch ? tone(OCHRE, 0.55) : y > 0.03 ? tone(OCHRE, 0.85) : OCHRE
      }, 3, 10, 8)
      break
    }
    case 'flake': {
      // a silcrete flake pinched in the fingers, its point out ahead of the grip
      mb.at(mul(at, T(0, 0, FLAKE_REACH * 0.5), Rx(Math.PI / 2)), skin).box(0.004, FLAKE_REACH * 0.5, 0.009, (y) => (y > FLAKE_REACH * 0.3 ? tone(SILCRETE, 1.15) : SILCRETE), 3, 8, 6, (v) => {
        // taper to the point
        const k = 1 - Math.max(0, v.y / (FLAKE_REACH * 0.5)) * 0.9
        v.x *= k
        v.z *= k
      })
      break
    }
    case 'firewood': {
      for (let i = 0; i < 3; i++) {
        const m = mul(at, T((i - 1) * 0.022, 0, 0), new Matrix4().makeRotationY((i - 1) * 0.08))
        rod(mb, m, skin, -0.35, 0.3, (z) => 0.016 * (1 + 0.15 * Math.sin(z * 13 + i)), (z) => (fbm3(z * 5, i, 0, seed) > 0.5 ? WOOD : tone(WOOD_DARK, 1.1)), 7, 10)
      }
      break
    }
    case 'bag': {
      // a hide bag hanging from the fist by its strap
      const hc = hideColor(seed, 9)
      mb.at(mul(at, T(0, -0.02, 0)), skin).tube([new Vector3(0, 0.0, -0.02), new Vector3(0, -0.06, -0.01), new Vector3(0, -0.1, 0.0)], () => 0.004, CORD, 5)
      mb.at(mul(at, T(0, -0.2 * Math.max(0.7, k), 0)), skin).ellipsoid(0.085 * k, 0.11 * k, 0.06 * k, (y) => (y > 0.07 * k ? tone(hc, 0.75) : hc), 14, 10, (v) => {
        v.x *= 1 + 0.15 * Math.sin(v.y * 40)
      })
      break
    }
    case 'meat': {
      mb.at(mul(at, T(0, -0.09, 0)), skin).ellipsoid(0.06, 0.11, 0.05, (_y, th) => (Math.cos(th) > 0.3 ? new Color('#7a2a22') : new Color('#a8564a')), 12, 9, (v) => {
        v.x += 0.012 * Math.sin(v.y * 50)
      })
      break
    }
    case 'shell': {
      mb.at(mul(atPalm, T(0, 0, 0.004)), skin).ellipsoid(0.008, 0.012, 0.007, (_y, _t, v) => (v.z > 0.005 && Math.abs(v.x) < 0.0018 ? tone(BONE_WHITE, 0.45) : BONE_WHITE), 10, 8)
      break
    }
    case 'stone': {
      mb.at(atPalm, skin).ellipsoid(0.03, 0.026, 0.024, (y) => (y > 0 ? SILCRETE : tone(SILCRETE, 0.8)), 10, 8, (v) => {
        v.x *= 1 + 0.18 * (fbm3(v.x * 90, v.y * 90, v.z * 90, seed) - 0.5)
      })
      break
    }
    case 'ochre': {
      mb.at(atPalm, skin).box(0.022, 0.016, 0.014, (y) => (y > 0 ? OCHRE : tone(OCHRE, 0.75)), 3, 10, 6)
      break
    }
    case 'corm': {
      mb.at(atPalm, skin).ellipsoid(0.022, 0.02, 0.022, (y) => (y > 0.012 ? new Color('#6b5034') : new Color('#a2805c')), 10, 8)
      break
    }
    case 'beads': {
      const pts: Vector3[] = []
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2
        pts.push(new Vector3(Math.sin(a) * 0.035, -0.04 - Math.cos(a) * 0.04, 0))
      }
      for (const q of pts) {
        mb.at(mul(at, T(q.x, q.y, q.z)), skin).ellipsoid(0.0045, 0.006, 0.004, BONE_WHITE, 6, 5)
      }
      break
    }
  }
}

/**
 * The sling for a child on the back: a hide pouch round the child's seat behind the carrier's shoulders, with
 * a strap over the left shoulder and across the chest. Carrier bind space, rigid to the chest.
 */
export function buildSling(mb: MeshBuilder, d: BodyDims, child: BodyDims, seed: number, slot: CarrySlot): void {
  if (slot !== 'back') return
  const hc = hideColor(seed, 11)
  const p = backSeat(d, child)
  const w = Math.max(child.hipW * 1.9, 0.11)
  const h = (child.waistY - child.crotchY) * 1.6 + 0.06
  const dep = child.hipDepth * 1.9 + 0.04
  const cy = p.y + child.hipY - (child.hipY - child.crotchY) * 0.3
  const cz = p.z
  mb.at(T(p.x, cy, cz), rigid(B.chest)).grid(26, 10, (u, v, out) => {
    const th = u * Math.PI * 2
    const y = lerp(-h * 0.55, h * 0.5, v)
    const k = Math.sqrt(Math.max(0.05, 1 - ((y + h * 0.05) / (h * 0.62)) ** 2))
    out.x = Math.sin(th) * w * k * (1 + 0.05 * Math.sin(th * 5))
    out.y = y + 0.01 * Math.cos(th * 3)
    out.z = Math.cos(th) * dep * 0.5 * k
    out.c.copy(hc).multiplyScalar(0.8 + 0.3 * fbm3(out.x * 30, out.y * 30, out.z * 30, seed))
    if (v > 0.88) out.c.multiplyScalar(0.7)
  }, { wrapU: true })
  // strap: from the pouch top over the left shoulder, across the chest to the right waist, round the back
  const pts: Vector3[] = []
  const back = -d.chestDepth - 0.012
  const front = d.chestDepth * 1.05 + 0.012
  const ctl: [number, number, number][] = [
    [p.x + w * 0.5, cy + h * 0.45, cz + dep * 0.2],
    [d.shoulderW * 0.5, d.shoulderY + 0.02, back * 0.6],
    [d.shoulderW * 0.55, d.topY + 0.01, 0],
    [d.shoulderW * 0.4, d.shoulderY - 0.02, front * 0.95],
    [0, d.chestY, front * 1.05],
    [-d.chestW * 0.75, d.waistY + 0.02, front * 0.75],
    [-d.waistW * 1.08, d.waistY, 0],
    [-d.waistW * 0.7, d.waistY + 0.03, back * 0.9],
    [p.x - w * 0.5, cy - h * 0.2, cz + dep * 0.2],
  ]
  for (const c of ctl) pts.push(new Vector3(c[0], c[1], c[2]))
  mb.at(new Matrix4(), rigid(B.chest)).tube(smoothPath(pts, 4), () => d.stature * 0.011, tone(hc, 0.85), 6, { flatten: 0.35 })
}

/** where the child's root (feet) sits for a back carry, in the carrier's bind space */
export function backSeat(d: BodyDims, child: BodyDims): Vector3 {
  const hips = new Vector3(d.shoulderW * 0.22, d.chestY - (d.chestY - d.waistY) * 0.85, -(d.chestDepth + child.hipDepth * 1.05 + 0.02))
  return hips.sub(new Vector3(0, child.hipY, 0))
}

/** Catmull-Rom resample of a polyline */
export function smoothPath(pts: readonly Vector3[], sub: number): Vector3[] {
  const out: Vector3[] = []
  const n = pts.length
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(n - 1, i + 2)]
    if (!p0 || !p1 || !p2 || !p3) continue
    for (let k = 0; k < sub; k++) {
      const t = k / sub
      const t2 = t * t
      const t3 = t2 * t
      out.push(
        new Vector3(
          0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
          0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
        ),
      )
    }
  }
  const last = pts[n - 1]
  if (last) out.push(last.clone())
  return out
}
