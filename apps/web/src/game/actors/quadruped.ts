/**
 * Four-legged animals on one 29-bone plan: the eland (the hero: big, a dewlap, spiral horns, tan with faint white
 * stripes, a dark crest), the spotted hyena (sloping back, round ears, spots) and the lion (a lioness, or a male
 * with a mane). Hoofed and padded legs share the skeleton: hip → stifle → hock → fetlock behind, shoulder →
 * elbow → carpus → fetlock in front. The upper pair is a two-bone IK; the cannon and hoof fold back in the swing.
 * Gaits are phase tables (walk, trot, canter, gallop) with planted feet; the rest are poses.
 */
import { Color, Matrix4, Quaternion, Sphere, Vector3 } from 'three'
import type { AnimalAnim } from '../contracts'
import { Rng, mix32 } from '~/core/rng'
import { chainSkin, eq, type AnimalCtx, type BoneDef, type Kin, type Plan } from './beast'
import { MeshBuilder, T, bump, clamp, fbm3, lerp, mul, profile, rigid, smooth, type SkinFn } from './geo'
import { mixc, tone } from './looks'

export type QuadKind = 'eland' | 'hyena' | 'lion'

type Spec = {
  kind: QuadKind
  /** withers and rump heights, hip-to-shoulder joint distance, barrel half-width */
  Hs: number
  Hh: number
  L: number
  W: number
  /** belly line height as a fraction of Hs */
  belly: number
  neckLen: number
  /** neck rise above horizontal, radians */
  neckAng: number
  neckR: number
  headLen: number
  headR: number
  /** face angle below horizontal at rest */
  headAng: number
  earLen: number
  earW: number
  tailLen: number
  legK: number
  hoofed: boolean
  coat: Color
  pale: Color
  dark: Color
  muzzle: Color
  hoof: Color
  dewlap: number
  horns: number
  hump: number
  stripes: number
  spots: boolean
  mane: number
  tuft: boolean
  crest: number
  male: boolean
}

function specFor(kind: QuadKind, seed: number): Spec {
  const rng = new Rng(mix32(seed, 0x9a4d))
  // the first draw of nearby seeds is poorly spread
  rng.next()
  const male = rng.chance(0.5)
  const s = rng.range(0.95, 1.05) * (male ? 1.04 : 0.97)
  const c = (hex: string, k = 0.05): Color => new Color(hex).multiplyScalar(rng.range(1 - k, 1 + k))
  switch (kind) {
    case 'eland':
      return {
        kind,
        Hs: 1.5 * s * (male ? 1.05 : 1),
        Hh: 1.44 * s * (male ? 1.02 : 1),
        L: 1.3 * s,
        W: (male ? 0.39 : 0.34) * s,
        belly: 0.47,
        neckLen: 0.56 * s,
        neckAng: 0.62,
        neckR: (male ? 0.16 : 0.13) * s,
        headLen: 0.46 * s,
        headR: 0.1 * s,
        headAng: 0.95,
        earLen: 0.17 * s,
        earW: 0.06 * s,
        tailLen: 0.66 * s,
        legK: 0.85,
        hoofed: true,
        // older bulls go blue-grey
        coat: male ? mixc(c('#ad8158'), new Color('#7a7672'), rng.range(0.15, 0.4)) : c('#b98a5a'),
        pale: c('#e2d0ae'),
        dark: c('#3a2a20'),
        muzzle: c('#4e4038'),
        hoof: c('#26201c', 0.02),
        dewlap: (male ? 0.25 : 0.12) * s,
        horns: (male ? 0.6 : 0.55) * s,
        hump: male ? 0.07 : 0.025,
        stripes: rng.int(7, 11),
        spots: false,
        mane: 0,
        tuft: true,
        crest: 1,
        male,
      }
    case 'hyena':
      return {
        kind,
        Hs: 0.8 * s,
        Hh: 0.66 * s,
        L: 0.6 * s,
        W: 0.19 * s,
        belly: 0.5,
        neckLen: 0.3 * s,
        neckAng: 0.42,
        neckR: 0.115 * s,
        headLen: 0.3 * s,
        headR: 0.1 * s,
        headAng: 0.35,
        earLen: 0.075 * s,
        earW: 0.042 * s,
        tailLen: 0.32 * s,
        legK: 1.05,
        hoofed: false,
        coat: c('#a89170'),
        pale: c('#c2b292'),
        dark: c('#3a2d22'),
        muzzle: c('#2c241e'),
        hoof: c('#2a2420', 0.02),
        dewlap: 0,
        horns: 0,
        hump: 0.03,
        stripes: 0,
        spots: true,
        mane: 0.35,
        tuft: false,
        crest: 0.6,
        male,
      }
    case 'lion':
      return {
        kind,
        Hs: (male ? 1.08 : 0.96) * s,
        Hh: (male ? 1.03 : 0.93) * s,
        L: (male ? 1.02 : 0.92) * s,
        W: (male ? 0.25 : 0.22) * s,
        belly: 0.48,
        neckLen: 0.3 * s,
        neckAng: 0.3,
        neckR: (male ? 0.15 : 0.12) * s,
        headLen: 0.3 * s,
        headR: (male ? 0.13 : 0.12) * s,
        headAng: 0.3,
        earLen: 0.065 * s,
        earW: 0.05 * s,
        tailLen: 0.85 * s,
        legK: 1.1,
        hoofed: false,
        coat: c('#b88f5a'),
        pale: c('#dcc6a0'),
        dark: c('#2a1e16'),
        muzzle: c('#e8dcc6'),
        hoof: c('#2a2420', 0.02),
        dewlap: 0,
        horns: 0,
        hump: 0,
        stripes: 0,
        spots: false,
        mane: male ? 1 : 0,
        tuft: true,
        crest: 0,
        male,
      }
  }
}

/* ─── bones ────────────────────────────────────────────────────────────────────────────────────────────── */

const ROOT = 0
const PELVIS = 1
const SPINE = 2
const CHEST = 3
const NECK1 = 4
const NECK2 = 5
const HEAD = 6
const JAW = 7
const EAR_L = 8
const EAR_R = 9
const TAIL1 = 10
const TAIL2 = 11
const TAIL3 = 12
/** per leg: [upper, lower, cannon, hoof]; legs 0 LH, 1 LF, 2 RH, 3 RF */
const LEG: readonly (readonly [number, number, number, number])[] = [
  [13, 14, 15, 16],
  [21, 22, 23, 24],
  [17, 18, 19, 20],
  [25, 26, 27, 28],
]
const N_BONES = 29

type Geo = {
  bones: BoneDef[]
  neckBase: Vector3
  headAt: Vector3
  muzzle: Vector3
  /** per leg: hip/shoulder, stifle/elbow, hock/carpus, fetlock, toe (bind) */
  leg: Vector3[][]
  tail: Vector3[]
}

function layout(sp: Spec): Geo {
  const { Hs, Hh, L } = sp
  const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z)
  const zH = -L / 2
  const zF = L / 2
  const legs: Vector3[][] = []
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? 1 : -1
    if (i % 2 === 0) {
      const x = side * sp.W * 0.6
      legs.push([v(x, Hh * 0.84, zH), v(x * 1.05, Hh * 0.55, zH + 0.15 * Hh), v(x * 0.95, Hh * (sp.hoofed ? 0.3 : 0.25), zH - 0.12 * Hh), v(x * 0.92, Hh * 0.07, zH - 0.09 * Hh), v(x * 0.92, 0, zH - (sp.hoofed ? 0.05 : 0.0) * Hh)])
    } else {
      const x = side * sp.W * 0.52
      legs.push([v(x, Hs * 0.64, zF), v(x * 1.05, Hs * 0.47, zF - 0.09 * Hs), v(x * 0.95, Hs * 0.25, zF - 0.06 * Hs), v(x * 0.92, Hs * 0.07, zF - 0.05 * Hs), v(x * 0.92, 0, zF + (sp.hoofed ? -0.01 : 0.03) * Hs)])
    }
  }
  const neckBase = v(0, Hs * 0.74, zF + 0.1 * Hs)
  const nd = v(0, Math.sin(sp.neckAng), Math.cos(sp.neckAng))
  const neckMid = neckBase.clone().addScaledVector(nd, sp.neckLen * 0.5)
  const headAt = neckBase.clone().addScaledVector(nd, sp.neckLen)
  const hd = v(0, -Math.sin(sp.headAng), Math.cos(sp.headAng))
  const hu = v(0, Math.cos(sp.headAng), Math.sin(sp.headAng))
  const muzzle = headAt.clone().addScaledVector(hd, sp.headLen)
  const jaw = headAt.clone().addScaledVector(hd, sp.headLen * 0.12).addScaledVector(hu, -sp.headR * 0.5)
  const t1 = v(0, Hh * 0.96, zH - 0.16 * Hh)
  const t2 = t1.clone().addScaledVector(v(0, -0.7, -0.7).normalize(), sp.tailLen * 0.34)
  const t3 = t2.clone().addScaledVector(v(0, -0.95, -0.3).normalize(), sp.tailLen * 0.34)
  const tEnd = t3.clone().addScaledVector(v(0, -1, -0.08).normalize(), sp.tailLen * 0.32)
  const bones: BoneDef[] = Array.from({ length: N_BONES }, () => ({ name: '', parent: 0, at: v(0, 0, 0) }))
  const set = (i: number, name: string, parent: number, at: Vector3): void => {
    bones[i] = { name, parent, at }
  }
  set(ROOT, 'root', 0, v(0, 0, 0))
  set(PELVIS, 'pelvis', ROOT, v(0, Hh * 0.86, zH))
  set(SPINE, 'spine', PELVIS, v(0, (Hh + Hs) * 0.44, 0))
  set(CHEST, 'chest', SPINE, v(0, Hs * 0.76, zF * 0.7))
  set(NECK1, 'neck1', CHEST, neckBase)
  set(NECK2, 'neck2', NECK1, neckMid)
  set(HEAD, 'head', NECK2, headAt)
  set(JAW, 'jaw', HEAD, jaw)
  const earBase = headAt.clone().addScaledVector(hd, -sp.headR * 0.1).addScaledVector(hu, sp.headR * 0.7)
  set(EAR_L, 'earL', HEAD, earBase.clone().add(v(sp.headR * 0.62, 0, 0)))
  set(EAR_R, 'earR', HEAD, earBase.clone().add(v(-sp.headR * 0.62, 0, 0)))
  set(TAIL1, 'tail1', PELVIS, t1)
  set(TAIL2, 'tail2', TAIL1, t2)
  set(TAIL3, 'tail3', TAIL2, t3)
  const names = ['LH', 'LF', 'RH', 'RF']
  LEG.forEach((ids, i) => {
    const pts = legs[i] ?? []
    const [a, b, c, d] = ids
    const p0 = pts[0] ?? v(0, 0, 0)
    set(a, `upper${names[i]}`, i % 2 === 0 ? PELVIS : CHEST, p0)
    set(b, `lower${names[i]}`, a, pts[1] ?? p0)
    set(c, `cannon${names[i]}`, b, pts[2] ?? p0)
    set(d, `hoof${names[i]}`, c, pts[3] ?? p0)
  })
  return { bones, neckBase, headAt, muzzle, leg: legs, tail: [t1, t2, t3, tEnd] }
}

/* ─── geometry ─────────────────────────────────────────────────────────────────────────────────────────── */

const UP = new Vector3(0, 1, 0)
const FWD = new Vector3(0, 0, 1)

/** a frame at `o` whose local +Y runs along `dir` and whose local +Z leans toward `ref` */
export function frame(o: Vector3, dir: Vector3, ref: Vector3): Matrix4 {
  const y = dir.clone().normalize()
  const z = ref.clone().addScaledVector(y, -ref.dot(y))
  if (z.lengthSq() < 1e-8) z.set(1, 0, 0).cross(y)
  z.normalize()
  const x = new Vector3().crossVectors(y, z)
  return new Matrix4().makeBasis(x, y, z).setPosition(o)
}

/** a tapered limb segment a → b, its depth (front-back) a multiple of its width, with rounded ends */
export function limb(mb: MeshBuilder, a: Vector3, b: Vector3, r0: number, r1: number, color: Color | ((t: number, th: number) => Color), skin: SkinFn, depth = 1, segs = 10): void {
  const len = a.distanceTo(b)
  const pad = Math.max(r0, r1) * 0.6
  mb.at(frame(a, new Vector3().subVectors(b, a), FWD), skin).lathe({
    y0: -pad * 0.6,
    y1: len + pad * 0.5,
    r: (y) => {
      const body = lerp(r0, r1, clamp(y / len, 0, 1))
      const e0 = y < 0 ? Math.sqrt(Math.max(0, 1 - (y / (pad * 0.6)) ** 2)) : 1
      const e1 = y > len ? Math.sqrt(Math.max(0, 1 - ((y - len) / (pad * 0.5)) ** 2)) : 1
      return body * e0 * e1
    },
    depth,
    segs,
    rings: 9,
    color: typeof color === 'function' ? (y, th) => color(clamp(y / len, 0, 1), th) : color,
  })
}

/** a Catmull-Rom curve through the points, n + 1 samples */
export function catmull(pts: readonly Vector3[], n: number): Vector3[] {
  const out: Vector3[] = []
  const cr = (a: number, b: number, c: number, d: number, t: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t)
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * (pts.length - 1)
    const k = Math.min(pts.length - 2, Math.floor(f))
    const t = f - k
    const p1 = pts[k] ?? new Vector3()
    const p0 = pts[k - 1] ?? p1
    const p2 = pts[k + 1] ?? p1
    const p3 = pts[k + 2] ?? p2
    out.push(new Vector3(cr(p0.x, p1.x, p2.x, p3.x, t), cr(p0.y, p1.y, p2.y, p3.y, t), cr(p0.z, p1.z, p2.z, p3.z, t)))
  }
  return out
}

const HEAD_HOOFED = profile([
  [0, 0],
  [0.05, 0.6],
  [0.15, 0.9],
  [0.3, 0.95],
  [0.46, 0.78],
  [0.66, 0.6],
  [0.84, 0.54],
  [0.94, 0.5],
  [0.985, 0.32],
  [1, 0],
])
const HEAD_CAT = profile([
  [0, 0],
  [0.06, 0.72],
  [0.18, 1],
  [0.38, 1.02],
  [0.56, 0.86],
  [0.72, 0.74],
  [0.88, 0.68],
  [0.97, 0.46],
  [1, 0],
])
const HEAD_HYENA = profile([
  [0, 0],
  [0.06, 0.7],
  [0.18, 1],
  [0.34, 1],
  [0.52, 0.76],
  [0.7, 0.6],
  [0.88, 0.55],
  [0.97, 0.4],
  [1, 0],
])

function build(sp: Spec, g: Geo, seed: number, body: MeshBuilder, detail: MeshBuilder): void {
  const { Hs, Hh, L, W } = sp
  const zR = -L / 2 - 0.2 * Hh
  const zF = L / 2 + 0.22 * Hs
  const { coat, pale, dark } = sp
  const pelvisAt = g.bones[PELVIS]?.at ?? new Vector3()
  const spineAt = g.bones[SPINE]?.at ?? new Vector3()
  const chestAt = g.bones[CHEST]?.at ?? new Vector3()
  const torsoSkin = chainSkin([PELVIS, SPINE, CHEST], [new Vector3(0, pelvisAt.y, zR), spineAt, chestAt, new Vector3(0, chestAt.y, zF)], 0.22 * L)
  const spotSeed = seed ^ 0x5b07
  const grain = (c: Color, x: number, y: number, z: number): Color => c.multiplyScalar(0.93 + 0.14 * fbm3(x * 9, y * 9, z * 9, seed))
  const spotted = (c: Color, x: number, y: number, z: number, k: number): Color => {
    if (!sp.spots) return c
    const n = fbm3(x * 13, y * 13, z * 13, spotSeed)
    return c.lerp(dark, smooth(0.58, 0.66, n) * k)
  }

  /* torso: a superelliptic section along z, the top line from rump over the withers, the belly line below */
  const tz = (z: number): number => (z - zR) / (zF - zR)
  const top = (z: number): number => {
    const t = tz(z)
    const back = lerp(Hh, Hs * (1 + sp.hump * 0.4), smooth(0.2, 0.82, t)) - 0.025 * Hs * bump(((t - 0.45) / 0.18) ** 2)
    return back + sp.hump * Hs * 0.6 * bump(((t - 0.76) / 0.1) ** 2) - 0.06 * Hs * smooth(0.86, 1, t)
  }
  const bottom = (z: number): number => {
    const t = tz(z)
    return lerp(Hh * 0.6, Hs * sp.belly, smooth(0.06, 0.38, t)) - 0.02 * Hs * bump(((t - 0.64) / 0.15) ** 2) + 0.06 * Hs * smooth(0.9, 1, t)
  }
  const width = (z: number): number => {
    const t = tz(z)
    return W * (0.8 + 0.22 * bump(((t - 0.56) / 0.3) ** 2) - 0.1 * bump(((t - 0.3) / 0.1) ** 2) - 0.18 * smooth(0.84, 1, t))
  }
  // the rump closes quickly behind the thighs; the chest rounds off slowly into the neck
  const capR = (t: number): number => smooth(0, 0.11, t) ** 0.4 * (1 - smooth(0.8, 1, t)) ** 0.55
  const stripeZ = Array.from({ length: sp.stripes }, (_, i) => lerp(-L * 0.22, L * 0.4, (i + 0.5) / Math.max(1, sp.stripes)))
  body.at(T(0, 0, 0), torsoSkin).grid(
    30,
    44,
    (u, v, out) => {
      const z = lerp(zR, zF, v)
      const th = -u * Math.PI * 2
      const cr = capR(v)
      const tp = top(z)
      const bt = bottom(z)
      const cy = (tp + bt) / 2
      const hy = ((tp - bt) / 2) * Math.max(cr, 0.001)
      const w = width(z) * cr
      const s = Math.sin(th)
      const c = Math.cos(th)
      // the back is broad and flat, the belly round
      const yy = c > 0 ? c ** 0.7 : -((-c) ** 1.1)
      out.x = w * Math.sign(s) * Math.abs(s) ** 0.8
      out.y = cy + hy * yy
      out.z = z
      const h = clamp((out.y - bt) / Math.max(0.01, tp - bt), 0, 1)
      const o = out.c.copy(coat).lerp(pale, 1 - smooth(0.06, 0.42, h))
      grain(o, out.x, out.y, out.z)
      if (sp.crest > 0) o.lerp(dark, sp.crest * 0.7 * smooth(0.93, 0.995, h) * smooth(-0.3 * L, 0.5 * L, z))
      for (const sz of stripeZ) {
        const dz = Math.abs(z - sz - (out.y - Hs * 0.8) * 0.18)
        const half = 0.016 * Hs
        if (dz < half && h > 0.35 && h < 0.9) o.lerp(pale, 0.2 * (1 - dz / half) * smooth(0.35, 0.6, h))
      }
      spotted(o, out.x, out.y, out.z, 0.8 * smooth(0.97, 0.85, h))
    },
    { wrapU: true },
  )

  /* neck: a section swept from inside the chest to inside the head, the dewlap hanging below, a crest above */
  const nb = g.neckBase
  const ha = g.headAt
  const nd = new Vector3().subVectors(ha, nb).normalize()
  const n0 = nb.clone().addScaledVector(nd, -0.24 * sp.neckLen).add(new Vector3(0, -0.04 * Hs, -0.05 * Hs))
  const n1 = ha.clone().addScaledVector(nd, 0.04 * sp.neckLen)
  const nUp = new Vector3().crossVectors(nd, new Vector3(1, 0, 0)).normalize()
  const neckSkin = chainSkin([CHEST, NECK1, NECK2, HEAD], [n0, nb, g.bones[NECK2]?.at ?? nb, ha, n1.clone().addScaledVector(nd, 0.2)], 0.12 * sp.neckLen)
  const maneC = new Color('#4a3020')
  body.at(T(0, 0, 0), neckSkin).grid(
    22,
    18,
    (u, v, out) => {
      const cx = lerp(n0.x, n1.x, v)
      const cy = lerp(n0.y, n1.y, v)
      const cz = lerp(n0.z, n1.z, v)
      const th = -u * Math.PI * 2
      const s = Math.sin(th)
      const co = Math.cos(th)
      const base = smooth(0.35, 0, v)
      const r = sp.neckR * (1 + 0.3 * base) * (1 - 0.22 * smooth(0.45, 1, v))
      const ry = r * (1.05 + 0.45 * base)
      // the dewlap: the underside drops into a soft flap, deepest low on the neck, gone by the throat
      const dew = sp.dewlap * Math.sin(Math.PI * clamp((0.8 - v) / 0.85, 0, 1)) ** 1.3 * smooth(-0.5, -0.98, co)
      // the hyena's short crest of mane (the male lion's ruff is its own mesh below)
      const mane = (sp.kind === 'lion' ? 0 : sp.mane) * 0.7 * r * smooth(-0.3, 0.7, co) * (1 - smooth(0.85, 1, v))
      const up = co * ry - dew + mane * Math.max(0, co)
      out.x = cx + s * (r + mane * 0.6)
      out.y = cy + nUp.y * up
      out.z = cz + nUp.z * up
      const k = 0.5 - 0.5 * co
      const o = out.c.copy(coat).lerp(pale, smooth(0.75, 0.98, k) * 0.6 * smooth(0.2, 0.7, v))
      grain(o, out.x, out.y, out.z)
      if (sp.crest > 0) o.lerp(dark, sp.crest * 0.75 * smooth(0.9, 0.995, 1 - k))
      if (sp.dewlap > 0) o.lerp(dark, 0.3 * smooth(0.4, 1, dew / sp.dewlap))
      if (mane > 0 && sp.mane > 0.5) o.lerp(maneC, smooth(0.1, 0.5, mane / (r * 0.7)) * 0.85)
      spotted(o, out.x, out.y, out.z, 0.6)
    },
    { wrapU: true },
  )
  if (sp.dewlap > 0) {
    // the dark tuft on the dewlap's edge where its flap is deepest, mostly sunk into the flap, longer on bulls
    const tuftAt = new Vector3().lerpVectors(n0, n1, 0.375).addScaledVector(nUp, -sp.neckR * 1.05 - sp.dewlap)
    const tl = (sp.male ? 0.05 : 0.03) * Hs
    body.at(T(tuftAt.x, tuftAt.y + tl * 0.15, tuftAt.z), rigid(NECK1)).ellipsoid(0.014 * Hs, tl, 0.034 * Hs, tone(dark, 0.9), 8, 6)
  }

  /* head: a lathe along the face, cranium to muzzle; local +Z is the top of the head */
  const hd = new Vector3().subVectors(g.muzzle, ha).normalize()
  const hu = new Vector3().crossVectors(new Vector3(-1, 0, 0), hd).normalize()
  const HL = sp.headLen
  const HR = sp.headR
  const carn = !sp.hoofed
  const prof = sp.kind === 'eland' ? HEAD_HOOFED : sp.kind === 'lion' ? HEAD_CAT : HEAD_HYENA
  const hm = frame(ha, hd, UP)
  const span = HL * 1.12
  const back = 0.14 * HL
  body.at(mul(hm, T(0, -back, 0)), rigid(HEAD)).lathe({
    y0: 0,
    y1: span,
    r: (y) => HR * prof(y / span),
    depth: carn ? 0.92 : 1.15,
    segs: 18,
    rings: 18,
    color: (y, th) => {
      const t = y / span
      const ct = Math.cos(th)
      const o = coat.clone().lerp(sp.muzzle, smooth(0.72, 0.95, t))
      if (ct < -0.3) o.lerp(pale, 0.55)
      if (sp.kind === 'eland' && t > 0.2 && t < 0.5 && ct > 0.4) o.lerp(dark, sp.male ? 0.55 : 0.25)
      // the lion's pale chin and muzzle sides under a tawny bridge
      if (sp.kind === 'lion') o.copy(coat).lerp(sp.muzzle, smooth(0.6, 0.8, t) * smooth(0.1, -0.5, ct) * 0.9)
      if (sp.kind === 'hyena') o.lerp(sp.muzzle, smooth(0.55, 0.85, t))
      return o.multiplyScalar(0.95 + 0.1 * fbm3(y * 30, th, 0, seed))
    },
    deform: (vv, _th, y) => {
      const t = y / span
      // a flat forehead and a straight bridge; the nose droops a touch
      if (vv.z > 0) vv.z *= carn ? 0.86 : 0.8
      vv.z -= HR * 0.12 * smooth(0.6, 1, t)
      // cheeks: carnivores carry their width into the jaw
      if (carn && vv.z < 0) vv.x *= 1 + 0.1 * bump(((t - 0.4) / 0.2) ** 2)
    },
  })
  // the lower jaw (moves for chewing and panting)
  const jawAt = g.bones[JAW]?.at ?? ha
  const jl = HL * 0.84
  body.at(frame(jawAt, hd, UP), rigid(JAW)).lathe({
    y0: 0,
    y1: jl,
    r: (y) => HR * (carn ? 0.6 : 0.4) * Math.sin(Math.PI * Math.min(1, (y / jl) * 1.1 + 0.05)) ** 0.5 * (1 - 0.25 * (y / jl)),
    depth: 0.7,
    segs: 12,
    rings: 10,
    color: (y) => pale.clone().lerp(sp.muzzle, smooth(0.6, 0.95, y / jl)),
  })
  // nose pad and eyes
  const noseAt = g.muzzle.clone().addScaledVector(hd, -0.025 * HL).addScaledVector(hu, -HR * 0.08)
  detail.at(frame(noseAt, hd, UP), rigid(HEAD)).ellipsoid(HR * (carn ? 0.36 : 0.4), HR * 0.16, HR * 0.24, sp.kind === 'lion' ? new Color('#6a3e36') : new Color('#1c1816'), 10, 6)
  const eyeT = carn ? 0.36 : 0.3
  const eyeW = HR * prof(eyeT + back / span) * (carn ? 0.78 : 0.86)
  for (const s of [1, -1]) {
    const eyeAt = ha.clone().addScaledVector(hd, eyeT * HL - back * 0.2).addScaledVector(hu, HR * (carn ? 0.4 : 0.3)).add(new Vector3(s * eyeW, 0, 0))
    const er = HR * (carn ? 0.16 : 0.19)
    const iris = sp.kind === 'lion' ? new Color('#9a7428') : sp.kind === 'hyena' ? new Color('#3a2414') : new Color('#120d0a')
    detail.at(T(eyeAt.x, eyeAt.y, eyeAt.z), rigid(HEAD)).ellipsoid(er, er * 0.82, er, (_y, _th, vv) => (carn && vv.z > er * 0.55 && Math.abs(vv.x) < er * 0.3 ? new Color('#0a0806') : iris), 10, 8)
    // ears: a cupped leaf on its own bone, opening forward
    const ear = g.bones[s > 0 ? EAR_L : EAR_R]?.at ?? ha
    const lat = sp.kind === 'eland' ? 0.85 : 0.25
    const Ld = new Vector3(s * lat, 1 - lat * 0.45, -0.2).normalize()
    const Wd = new Vector3(Ld.y, -Ld.x, 0).normalize()
    const ew = sp.earW
    const el = sp.earLen
    body.at(T(ear.x, ear.y, ear.z), rigid(s > 0 ? EAR_L : EAR_R)).grid(8, 8, (u, v, out) => {
      const a = (u - 0.5) * 2
      const w = ew * Math.sin(Math.PI * Math.min(1, v * 0.88 + 0.1)) ** (carn ? 0.45 : 0.8)
      const cup = -(1 - a * a) * w * 0.4
      out.x = Ld.x * v * el + Wd.x * a * w
      out.y = Ld.y * v * el + Wd.y * a * w
      out.z = Ld.z * v * el + cup
      const o = out.c.copy(coat).lerp(pale, (1 - Math.abs(a)) * 0.45)
      if (sp.kind === 'lion') o.lerp(dark, smooth(0.6, 1, v) * 0.7)
      if (sp.kind === 'hyena') o.lerp(dark, 0.35)
      if (sp.kind === 'eland') o.lerp(dark, smooth(0.85, 1, v) * 0.4)
    })
  }
  // horns: tight open spirals running back from the poll in line with the face (detail)
  if (sp.horns > 0) {
    const hornDir = hd.clone().negate().add(new Vector3(0, 0.35, 0)).normalize()
    for (const s of [1, -1]) {
      const base = ha.clone().addScaledVector(hd, 0.06 * HL).addScaledVector(hu, HR * 0.62).add(new Vector3(s * HR * 0.36, 0, 0))
      const pts: Vector3[] = []
      const n = 24
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const a = t * Math.PI * 3.4
        const rad = HR * 0.11 * (1 - t * 0.7)
        pts.push(base.clone().addScaledVector(hornDir, t * sp.horns).add(new Vector3(s * (rad * Math.cos(a) + t * HR * 0.5), rad * Math.sin(a) * 0.6, rad * Math.sin(a) * 0.6)))
      }
      const hr0 = HR * (sp.male ? 0.26 : 0.17)
      const hornA = new Color('#3a3228')
      const hornB = new Color('#6e604c')
      detail.at(T(0, 0, 0), rigid(HEAD)).tube(pts, (t) => hr0 * (1 - 0.82 * t ** 0.9), (t, a) => hornA.clone().lerp(hornB, 0.5 + 0.5 * Math.sin(t * 55 + a)).multiplyScalar(t > 0.86 ? 0.65 : 1), 8)
    }
    if (sp.male) {
      // the bull's forehead brush
      const fb = ha.clone().addScaledVector(hd, 0.26 * HL).addScaledVector(hu, HR * 0.78)
      body.at(frame(fb, hd, UP), rigid(HEAD)).ellipsoid(HR * 0.42, HR * 0.55, HR * 0.3, tone(dark, 1.2), 8, 6)
    }
  }
  // the male lion's mane: a ruff of hair from the withers over the neck that swells behind the head and rolls round
  // to a soft rim framing the face, fuller under the throat, lumpy, darkening toward the back
  if (sp.mane > 0.5) {
    const nm = g.bones[NECK2]?.at ?? nb
    const behind = ha.clone().addScaledVector(hd, -0.1 * HL)
    const path = catmull([n0.clone().addScaledVector(nd, -0.1 * sp.neckLen), nb.clone().addScaledVector(nUp, sp.neckR * 0.25), nm.clone().addScaledVector(nUp, sp.neckR * 0.2), behind], 12)
    const ma = new Color('#3e2716')
    const mm = new Color('#7a5030')
    const mg = new Color('#a87a40')
    const pt = new Vector3()
    const tan = new Vector3()
    const upv = new Vector3()
    const X = new Vector3(1, 0, 0)
    const endTan = new Vector3().subVectors(behind, path[path.length - 2] ?? nb).normalize()
    body.at(T(0, 0, 0), neckSkin).grid(
      26,
      18,
      (u, v, out) => {
        // along the neck path for the first three quarters, then the rounded front over the head
        const q = clamp((v - 0.7) / 0.3, 0, 1)
        if (v < 0.7) {
          const f = (v / 0.7) * (path.length - 1)
          const k = Math.min(path.length - 2, Math.floor(f))
          const a = path[k] ?? behind
          const b = path[k + 1] ?? behind
          pt.lerpVectors(a, b, f - k)
          tan.subVectors(b, a).normalize()
        } else pt.copy(behind).addScaledVector(hd, 0.3 * HL * q)
        // the rings turn from the neck's line to the face's gradually, so the ruff never folds under the throat
        if (v > 0.5) tan.copy(endTan).lerp(hd, smooth(0.5, 1, v)).normalize()
        upv.crossVectors(tan, X).normalize()
        // thick over the neck, fullest round the back of the head, then sloping in to a rim behind the eyes
        let r = v < 0.7 ? lerp(sp.neckR * (1 + 0.3 * smooth(0, 0.3, v)), HR * 1.85, smooth(0.35, 0.7, v)) : HR * (0.96 + 0.89 * (1 - smooth(0, 1, q)))
        const th = -u * Math.PI * 2
        const sn = Math.sin(th)
        const co = Math.cos(th)
        // the throat and chest mane hangs fuller; tufts break the silhouette, settling down at the face rim
        r *= 1 + 0.25 * Math.max(0, -co) * smooth(0.1, 0.6, v) * (1 - smooth(0.62, 0.95, v))
        r *= 1 + 0.36 * (fbm3(Math.cos(th) * 2.6, Math.sin(th) * 2.6, v * 6, seed ^ 0x3a7e) - 0.5) * (1 - smooth(0.88, 1, v))
        const wx = r * (0.9 + 0.1 * smooth(0.5, 0.8, v))
        const wy = r * (1 + 0.15 * smooth(0.2, 0.7, v))
        out.x = pt.x + X.x * sn * wx
        out.y = pt.y + upv.y * co * wy
        out.z = pt.z + upv.z * co * wy
        const o = out.c.copy(ma).lerp(mm, smooth(0.2, 0.75, v)).lerp(mg, smooth(0.8, 1, v))
        if (v < 0.85) o.lerp(ma, 0.4 * Math.max(0, -co))
        o.multiplyScalar(0.86 + 0.28 * fbm3(Math.cos(th) * 4, Math.sin(th) * 4, v * 9, seed ^ 0x51a))
      },
      { wrapU: true },
    )
  }

  /* legs: one continuous sweep per leg through its joints (deeper than wide), paler below; hooves in the detail
     mesh, padded paws in the body */
  g.leg.forEach((pts, i) => {
    const hind = i % 2 === 0
    const ids = LEG[i]
    if (!ids) return
    const [a, b, c, d] = ids
    const [p0, p1, p2, p3, p4] = pts
    if (!p0 || !p1 || !p2 || !p3 || !p4) return
    const skin = chainSkin([a, b, c, d], [p0, p1, p2, p3, p4], 0.05 * Hs)
    const R = W * 0.36 * sp.legK
    const lowC = sp.kind === 'eland' ? mixc(coat, pale, 0.3) : coat
    // the top starts inside the barrel, pulled in toward the midline and up, so only the lower thigh shows
    const top = new Vector3(p0.x * 0.55, p0.y + (hind ? 0.04 * Hh : 0.06 * Hs), p0.z + (hind ? -0.02 * Hh : 0.03 * Hs))
    const end = sp.hoofed ? p4.clone().add(new Vector3(0, 0.03 * Hs, 0.03 * Hs)) : p4.clone().add(new Vector3(0, 0.04 * Hs, 0.03 * Hs))
    const ctrl = [top, p1, p2, p3, end]
    const lens = [0]
    for (let k = 1; k < ctrl.length; k++) lens.push((lens[k - 1] ?? 0) + (ctrl[k]?.distanceTo(ctrl[k - 1] ?? top) ?? 0))
    const total = lens[lens.length - 1] ?? 1
    const f1 = (lens[1] ?? 0) / total
    const f2 = (lens[2] ?? 0) / total
    const f3 = (lens[3] ?? 0) / total
    const paw = sp.hoofed ? 1 : 1.3
    const rad = profile(
      hind
        ? [
            [0, 1.0],
            [f1 * 0.5, 1.12],
            [f1, 0.78],
            [lerp(f1, f2, 0.5), 0.52],
            [f2 - 0.025, 0.36],
            [f2, 0.4],
            [f2 + 0.04, 0.3 * paw],
            [lerp(f2, f3, 0.6), 0.26 * paw],
            [f3, 0.3 * paw],
            [lerp(f3, 1, 0.5), 0.26 * paw],
            [1, 0.28 * paw],
          ]
        : [
            [0, 0.85],
            [f1 * 0.5, 0.92],
            [f1, 0.7],
            [lerp(f1, f2, 0.3), 0.6],
            [f2 - 0.03, 0.34 * paw],
            [f2, 0.37 * paw],
            [f2 + 0.04, 0.3 * paw],
            [lerp(f2, f3, 0.6), 0.26 * paw],
            [f3, 0.3 * paw],
            [lerp(f3, 1, 0.5), 0.26 * paw],
            [1, 0.28 * paw],
          ],
    )
    const path = catmull(ctrl, 28)
    const tan: Vector3[] = path.map((_, k) => new Vector3().subVectors(path[Math.min(path.length - 1, k + 1)] ?? top, path[Math.max(0, k - 1)] ?? top).normalize())
    const side = new Vector3()
    const front = new Vector3()
    const fc = new Color()
    body.at(T(0, 0, 0), skin).grid(
      12,
      28,
      (u, v, out) => {
        const k = Math.round(v * 28)
        const p = path[k] ?? top
        const tg = tan[k] ?? UP
        side.set(1, 0, 0).addScaledVector(tg, -tg.x).normalize()
        front.crossVectors(tg, side)
        const th = -u * Math.PI * 2
        const r = R * rad(v)
        // deeper than wide, more so up top where the muscle is
        const depth = lerp(1.45, 1.15, smooth(f1, f2, v))
        out.x = p.x + side.x * r * Math.sin(th) + front.x * r * depth * Math.cos(th)
        out.y = p.y + side.y * r * Math.sin(th) + front.y * r * depth * Math.cos(th)
        out.z = p.z + side.z * r * Math.sin(th) + front.z * r * depth * Math.cos(th)
        const low = smooth(f2 - 0.1, f3, v)
        const o = out.c.copy(coat).lerp(lowC, low)
        grain(o, out.x, out.y, out.z)
        spotted(o, out.x, out.y, out.z, 0.65 * (1 - low))
        // the eland's dark garter on the back of the forearm, a dark knee patch in front, dark pasterns
        if (sp.kind === 'eland') {
          if (!hind && v > lerp(f1, f2, 0.55) && v < f2 - 0.02 && Math.cos(th) < -0.3) o.lerp(dark, 0.85)
          if (!hind && Math.abs(v - f2) < 0.035 && Math.cos(th) > 0.3) o.lerp(dark, 0.5)
          o.lerp(fc.copy(dark), 0.7 * smooth(f3 + 0.02, 1, v))
        }
        if (!sp.hoofed) o.lerp(fc.copy(coat).lerp(pale, 0.4), 0.35 * smooth(f3, 1, v))
      },
      { wrapU: true },
    )
    if (sp.hoofed) {
      // the cloven hoof
      const hz = p4.clone().add(new Vector3(0, 0.022 * Hs, 0.035 * Hs))
      detail.at(T(hz.x, hz.y, hz.z), rigid(d)).box(R * 0.32, 0.026 * Hs, R * 0.44, (_y, th) => (Math.abs(Math.sin(th)) < 0.1 && Math.cos(th) > 0 ? tone(sp.hoof, 0.5) : sp.hoof), 4, 10, 6)
    } else {
      // a padded paw
      const pz = p4.clone().add(new Vector3(0, 0.032 * Hs, 0.04 * Hs))
      body.at(T(pz.x, pz.y, pz.z), rigid(d)).ellipsoid(R * 0.48, 0.036 * Hs, R * 0.64, (y) => (y < -0.014 * Hs ? tone(coat, 0.55) : mixc(coat, pale, 0.4)), 10, 6)
    }
    void c
  })

  /* tail */
  const tailSkin = chainSkin([TAIL1, TAIL2, TAIL3], g.tail, 0.05 * sp.tailLen)
  const bushy = sp.kind === 'hyena'
  body.at(T(0, 0, 0), tailSkin).tube(
    catmull(g.tail, 12),
    (t) => (bushy ? 0.035 * Hs * (0.8 + 0.7 * Math.sin(Math.PI * t)) : 0.022 * Hs * (1 - 0.55 * t)) * (sp.kind === 'eland' ? 1.15 : 1),
    (t) => (bushy ? mixc(coat, dark, t) : sp.kind === 'eland' ? mixc(coat, dark, smooth(0.5, 0.9, t) * 0.6) : coat.clone()),
    8,
  )
  if (sp.tuft) {
    const tip = g.tail[3] ?? new Vector3()
    body.at(T(tip.x, tip.y - 0.025 * Hs, tip.z), rigid(TAIL3)).ellipsoid(0.028 * Hs, 0.07 * Hs, 0.028 * Hs, tone(dark, 0.8), 8, 6)
  }
}

/* ─── gaits ────────────────────────────────────────────────────────────────────────────────────────────── */

type Gait = { id: string; offs: readonly [number, number, number, number]; duty: number; stride: number; lift: number; foldF: number; foldH: number }

/** leg phase offsets in LEG order: LH, LF, RH, RF */
const WALK: Gait = { id: 'walk', offs: [0, 0.25, 0.5, 0.75], duty: 0.64, stride: 0.6, lift: 0.07, foldF: 1.1, foldH: 0.55 }
const TROT: Gait = { id: 'trot', offs: [0, 0.5, 0.5, 0], duty: 0.44, stride: 0.75, lift: 0.12, foldF: 1.6, foldH: 0.85 }
const CANTER: Gait = { id: 'canter', offs: [0.3, 0.62, 0, 0.32], duty: 0.36, stride: 0.85, lift: 0.14, foldF: 1.8, foldH: 1.0 }
const GALLOP: Gait = { id: 'gallop', offs: [0, 0.55, 0.1, 0.66], duty: 0.3, stride: 0.9, lift: 0.15, foldF: 1.9, foldH: 1.15 }

/* ─── poses ────────────────────────────────────────────────────────────────────────────────────────────── */

const _off = new Vector3()
const _bq = new Quaternion()
const _qd = new Quaternion()
const _tg = new Vector3()
const _fet = new Vector3()
const _pole = new Vector3()
const _j = new Vector3()
const _d = new Vector3()
const _mz = new Vector3()
const X_AXIS = new Vector3(1, 0, 0)

type LegPlace = { toe: Vector3; fold: number }

function makePlan(kind: QuadKind, seed: number): Plan {
  const sp = specFor(kind, seed)
  const g = layout(sp)
  const legLen = (sp.Hs + sp.Hh) / 2
  const places: LegPlace[] = Array.from({ length: 4 }, () => ({ toe: new Vector3(), fold: 0 }))
  const restToe = g.leg.map((p) => p[4]?.clone() ?? new Vector3())
  const vFet = g.leg.map((p) => new Vector3().subVectors(p[3] ?? new Vector3(), p[4] ?? new Vector3()))
  const vHock = g.leg.map((p) => new Vector3().subVectors(p[2] ?? new Vector3(), p[3] ?? new Vector3()))
  const muzzleOff = new Vector3().subVectors(g.muzzle, g.headAt)
  const pelvisY = g.bones[PELVIS]?.at.y ?? sp.Hh

  const gaitFor = (anim: AnimalAnim, speed: number): Gait => {
    if (anim === 'run') {
      if (kind === 'hyena') return speed > 7 ? GALLOP : CANTER
      return speed > 4.5 * Math.sqrt(legLen) ? GALLOP : TROT
    }
    return speed > 2.4 * Math.sqrt(legLen) ? TROT : WALK
  }
  const freqOf = (gt: Gait, speed: number): number => clamp((speed * gt.duty) / (gt.stride * legLen), 0.3, 2.8)

  /** toes for a gait at a phase: the stance slides back at the ground speed, the swing arcs forward */
  const placeFeet = (gt: Gait, phase: number, speed: number): void => {
    const freq = freqOf(gt, speed)
    const S = speed > 0.02 ? (speed * gt.duty) / freq : 0
    for (let i = 0; i < 4; i++) {
      const pl = places[i]
      const rest = restToe[i]
      if (!pl || !rest) continue
      pl.toe.copy(rest)
      pl.fold = 0
      if (S < 1e-3) continue
      const q = (((phase - (gt.offs[i] ?? 0)) % 1) + 1) % 1
      // hind feet land a little forward of their rest spot, so the back of the stride stays in reach
      const c = i % 2 === 0 ? 0.08 * S : 0
      if (q < gt.duty) {
        pl.toe.z += c + S / 2 - (S * q) / gt.duty
      } else {
        const u = (q - gt.duty) / (1 - gt.duty)
        const sw = Math.sin(Math.PI * u)
        const k = Math.min(1, S / (0.25 * legLen))
        pl.toe.z += c - S / 2 + S * smooth(0, 1, u)
        pl.toe.y += gt.lift * legLen * sw * k
        // the fold leads the lift: early in the swing the lower leg tucks, late it reaches out
        pl.fold = Math.sin(Math.PI * Math.min(1, u * 1.25)) * k
      }
    }
  }

  /** legs to their toes: the hoof and cannon fold by `fold`, the upper pair reaches the hock/carpus by IK */
  const solveLegs = (k: Kin, gt: Gait): void => {
    for (let i = 0; i < 4; i++) {
      const pl = places[i]
      const ids = LEG[i]
      const vf = vFet[i]
      const vh = vHock[i]
      if (!pl || !ids || !vf || !vh) continue
      const hind = i % 2 === 0
      const [a, b, c, d] = ids
      const ang = pl.fold * (hind ? gt.foldH : gt.foldF)
      const angD = Math.min(1.7, ang * 1.25)
      eq(angD, 0, 0, _qd)
      _fet.copy(vf).applyQuaternion(_qd).add(pl.toe)
      _tg.copy(vh).applyAxisAngle(X_AXIS, ang).add(_fet)
      _pole.set((i < 2 ? 1 : -1) * 0.1, 0, hind ? 1 : -1)
      k.twoBone(a, b, c, _tg, _pole)
      k.point(c, d, _d.subVectors(_fet, k.jointOf(c, _j)))
      k.setWorld(d, _qd)
    }
  }

  /** neck and head: pitch (down +), yaw (+ toward the left), the head's own nod, and a roll */
  const neck = (k: Kin, pitch: number, yaw: number, nod: number, roll = 0): void => {
    k.rot(NECK1, pitch * 0.55, yaw * 0.45, roll * 0.5)
    k.rot(NECK2, pitch * 0.45, yaw * 0.4, roll * 0.5)
    k.rot(HEAD, nod, yaw * 0.15, 0)
  }

  /** the neck pitch that brings the muzzle down to height `y` (bisection on the posed chain) */
  const reachDown = (k: Kin, y: number, yaw: number, nod: number): void => {
    let lo = 0
    let hi = 2.6
    for (let it = 0; it < 8; it++) {
      const mid = (lo + hi) / 2
      neck(k, mid, yaw, nod)
      const qh = k.Q[HEAD]
      const ph = k.P[HEAD]
      if (!qh || !ph) return
      const my = _mz.copy(muzzleOff).applyQuaternion(qh).add(ph).y
      if (my > y) lo = mid
      else hi = mid
    }
    neck(k, (lo + hi) / 2, yaw, nod)
  }

  const tail = (k: Kin, swish: number, lift: number): void => {
    k.rot(TAIL1, lift, swish * 0.4, 0)
    k.rot(TAIL2, lift * 0.4, swish * 0.6, 0)
    k.rot(TAIL3, -lift * 0.2, swish * 0.8, 0)
  }

  /** fwd > 0 pricks the ears up and forward, < 0 pins them back */
  const ears = (k: Kin, fwd: number, flick: number): void => {
    k.rot(EAR_L, 0.25 * fwd, -0.35 * fwd, flick)
    k.rot(EAR_R, 0.25 * fwd, 0.35 * fwd, -flick)
  }

  const jawFor = (t: number, chewing: boolean, pant: boolean): number => {
    if (pant) return 0.16 + 0.04 * Math.sin(t * 9)
    if (chewing) return 0.05 * Math.max(0, Math.sin(t * 6.5))
    return 0
  }

  const pose = (anim: AnimalAnim, c: AnimalCtx, k: Kin): void => {
    const t = c.t + c.jit * 40
    const breathe = Math.sin(t * 1.4)
    const swish = Math.sin(t * 1.7) * 0.5 + Math.sin(t * 4.3) * 0.3 * smooth(0.5, 0.8, Math.sin(t * 0.3))
    const flick = Math.sin(t * 9) * 0.4 * smooth(0.82, 0.92, Math.sin(t * 0.7 + c.jit * 7))
    const moving = c.speed > 0.05 && (anim === 'walk' || anim === 'run' || anim === 'graze' || anim === 'swim')
    if (anim === 'lie') {
      // belly on the ground; antelope fold the forelegs under, cats stretch them out in front
      const drop = sp.Hs * sp.belly - 0.03 * sp.Hs
      _off.set(0, -drop + 0.005 * sp.Hs * breathe, 0)
      k.begin(_off, eq(0.03, 0, 0.05, _bq))
      k.rot(SPINE, 0, 0, 0)
      k.rot(CHEST, 0.01 * breathe, 0, 0)
      neck(k, -0.12 + 0.06 * Math.sin(t * 0.21), 0.45 * Math.sin(t * 0.13 + c.jit * 6), 0.1)
      k.rot(JAW, jawFor(t, kind === 'eland', false), 0, 0)
      ears(k, 0.1, flick)
      tail(k, swish * 0.25, -0.15)
      for (let i = 0; i < 4; i++) {
        const ids = LEG[i]
        if (!ids) continue
        const s = i < 2 ? 1 : -1
        const [a, b, cc, d] = ids
        if (i % 2 === 0) {
          // hock on the ground beside the rump, the cannon forward under the belly
          _tg.set(s * sp.W * 1.05, 0.05 * sp.Hh, -sp.L / 2 - 0.02 * sp.Hh)
          k.twoBone(a, b, cc, _tg, _pole.set(s * 0.6, 0.2, 1))
          k.point(cc, d, _d.set(-s * 0.3, -0.06, 1))
          k.setWorld(d, eq(1.5, 0, 0, _bq))
        } else if (sp.hoofed) {
          // knees folded: the carpus on the ground in front, the cannon back under the chest
          _tg.set(s * sp.W * 0.45, 0.05 * sp.Hs, sp.L / 2 + 0.06 * sp.Hs)
          k.twoBone(a, b, cc, _tg, _pole.set(s * 0.1, -0.4, -1))
          k.point(cc, d, _d.set(0, -0.12, -1))
          k.setWorld(d, eq(1.6, 0, 0, _bq))
        } else {
          // sphinx: elbows down beside the chest, forearms and paws forward on the ground
          _tg.set(s * sp.W * 0.5, 0.06 * sp.Hs, sp.L / 2 + 0.3 * sp.Hs)
          k.twoBone(a, b, cc, _tg, _pole.set(s * 0.2, -0.6, -1))
          k.point(cc, d, _d.set(0, -0.15, 1))
          k.setWorld(d, eq(-1.45, 0, 0, _bq))
        }
      }
      return
    }
    if (anim === 'dead' || anim === 'fall') {
      // fall: the forelegs buckle, then the body rolls onto its right side; dead: on the side, legs out, still
      const f = anim === 'dead' ? 1 : smooth(0.25, 1.2, c.animT)
      const buckle = anim === 'dead' ? 0 : Math.sin(Math.PI * smooth(0, 0.9, c.animT)) * (1 - f * 0.7)
      const lieY = sp.W * 0.95
      _off.set(0.2 * sp.W * f, -(pelvisY - lieY) * f - buckle * 0.18 * sp.Hs, 0)
      k.begin(_off, eq(0.1 * buckle * (1 - f), 0, (Math.PI / 2) * f, _bq))
      k.rot(SPINE, 0, 0, 0)
      k.rot(CHEST, 0.12 * buckle, 0, 0)
      // the neck stretches out and the head comes down to the ground on its cheek
      neck(k, lerp(0.2 * buckle, -0.25, f), -0.75 * f, -0.2 * f, 0.3 * f)
      k.rot(JAW, 0.07 * f, 0, 0)
      ears(k, -0.6 * f, 0)
      tail(k, 0, -0.1)
      for (let i = 0; i < 4; i++) {
        const ids = LEG[i]
        if (!ids) continue
        const hind = i % 2 === 0
        const [a, b, cc, d] = ids
        // the legs lie out, a little bent; the upper pair rests a touch lower over the lower pair
        const bend = lerp(0.12, 0.28, f) + buckle * (hind ? 0.25 : 1.1)
        k.rot(a, hind ? -0.25 * f : 0.3 * f + 0.4 * buckle, 0, i < 2 ? 0.12 * f : 0)
        k.rot(b, hind ? bend : -bend, 0, 0)
        k.rot(cc, hind ? -bend * 0.6 : bend * 1.2, 0, 0)
        k.rot(d, 0.35 * f, 0, 0)
      }
      return
    }
    // standing and moving anims share the legs
    const gt = gaitFor(anim, c.speed)
    placeFeet(gt, c.phase, moving ? c.speed : 0)
    const ph = c.phase * Math.PI * 2
    let bob = 0
    let pitch = 0
    let flexSp = 0
    if (moving) {
      if (gt === WALK) bob = -0.008 * sp.Hs * Math.cos(2 * ph)
      else if (gt === TROT) bob = 0.014 * sp.Hs * Math.cos(2 * ph)
      else {
        bob = 0.026 * sp.Hs * Math.sin(ph)
        pitch = 0.06 * Math.sin(ph + 0.6)
        flexSp = 0.08 * Math.sin(ph)
      }
    }
    const alert = anim === 'alert'
    const grazing = anim === 'graze'
    // grazing spreads the forelegs a touch so the muzzle reaches the grass
    if (grazing && !moving) {
      for (const i of [1, 3]) places[i]?.toe.add(_d.set(0, 0, 0.07 * sp.Hs))
    }
    _off.set(0, bob - 0.004 * sp.Hs * breathe + (alert ? 0.01 * sp.Hs : 0), 0)
    k.begin(_off, eq(pitch + (grazing ? 0.03 : 0), 0, 0, _bq))
    k.rot(SPINE, -flexSp, 0, 0)
    k.rot(CHEST, -flexSp * 0.8 + 0.008 * breathe, 0, 0)
    const run = moving && (gt === GALLOP || gt === CANTER)
    if (grazing) {
      // nose to the grass, nibbling, the head working side to side
      reachDown(k, 0.07 * sp.Hs + 0.025 * sp.Hs * Math.max(0, Math.sin(t * 1.9)), 0.18 * Math.sin(t * 0.4 + c.jit * 5), 0.3)
      k.rot(JAW, jawFor(t, true, false), 0, 0)
      ears(k, 0, flick)
      tail(k, swish, 0)
    } else if (alert) {
      // head high and still, ears forward, the tail lifted
      neck(k, -0.45, 0.25 * Math.sin(t * 0.25 + c.jit * 4), -0.12)
      k.rot(JAW, 0, 0, 0)
      ears(k, 1, 0)
      tail(k, 0.05 * Math.sin(t * 3), 0.35)
    } else if (moving) {
      const nodAmp = gt === WALK ? 0.06 : gt === TROT ? 0.025 : 0.09
      neck(k, (run ? 0.18 : 0.05) + nodAmp * Math.sin(2 * ph + 0.8), 0, (run ? 0.12 : 0) + nodAmp * 0.6 * Math.sin(2 * ph + 1.6))
      k.rot(JAW, jawFor(t, false, run && kind !== 'eland'), 0, 0)
      ears(k, run ? -0.7 : 0.3, flick * 0.5)
      tail(k, run ? 0.12 * Math.sin(ph * 2) : swish * 0.7, run ? 0.5 : 0.05)
    } else {
      // idle: looks about, chews the cud, flicks the ears and tail
      const look = Math.sin(t * 0.17 + c.jit * 9) * 0.55 + Math.sin(t * 0.07) * 0.3
      neck(k, -0.05 + 0.08 * Math.sin(t * 0.11), look, 0.05)
      k.rot(JAW, jawFor(t, kind === 'eland', kind === 'hyena' && Math.sin(t * 0.2) > 0.3), 0, 0)
      ears(k, 0.3, flick)
      tail(k, swish, 0)
    }
    solveLegs(k, gt)
  }

  return {
    bones: g.bones,
    build: (body, detail) => build(sp, g, seed, body, detail),
    bounds: new Sphere(new Vector3(0, sp.Hs * 0.6, sp.L * 0.2), Math.max(sp.L, sp.Hs) * 1.1 + sp.neckLen + sp.headLen),
    lod: kind === 'eland' ? [10, 30] : [7, 22],
    gait: (anim, speed) => {
      const moving = (anim === 'walk' || anim === 'run' || anim === 'graze' || anim === 'swim') && speed > 0.05
      if (!moving) return { id: anim === 'lie' || anim === 'dead' || anim === 'fall' ? anim : 'stand', freq: 0 }
      const gt = gaitFor(anim, speed)
      return { id: gt.id, freq: freqOf(gt, speed) }
    },
    pose,
  }
}

export function quadrupedPlan(kind: QuadKind, seed: number): Plan {
  return makePlan(kind, seed)
}
