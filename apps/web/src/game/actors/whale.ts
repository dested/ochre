/**
 * The southern right whale, stranded: 14 m of rotund black body with no dorsal fin, the arched upper jaw and bowed lower
 * lips, cream callosities on the head and chin, white belly blotches, broad paddle flippers and wide notched flukes
 * lying on the sand. Mostly still: it breathes every few seconds (the back heaves), lifts and drops its flukes now and
 * then, stirs a flipper; alert is the same in distress; it rolls onto its side to fall and die, and swims if refloated.
 */
import { Color, Quaternion, Sphere, Vector3 } from 'three'
import type { AnimalAnim } from '../contracts'
import { Rng, mix32 } from '~/core/rng'
import { chainSkin, eq, type AnimalCtx, type BoneDef, type Kin, type Plan } from './beast'
import { MeshBuilder, T, clamp, fbm3, lerp, profile, rigid, smooth, type SkinFn, type SkinW } from './geo'
import { frame } from './quadruped'

const ROOT = 0
const BODY = 1
const CHEST = 2
const HEAD = 3
const JAW = 4
const FL_L = 5
const FL_R = 6
const TAIL1 = 7
const TAIL2 = 8
const FLUKE = 9
const N = 10

const PROF = profile([
  [0, 0.04],
  [0.04, 0.1],
  [0.1, 0.16],
  [0.18, 0.26],
  [0.28, 0.5],
  [0.38, 0.8],
  [0.5, 0.97],
  [0.6, 1],
  [0.7, 0.96],
  [0.78, 0.88],
  [0.86, 0.74],
  [0.93, 0.52],
  [0.98, 0.25],
  [1, 0.03],
])
const FLIP = profile([
  [0, 0.35],
  [0.2, 0.5],
  [0.55, 0.56],
  [0.85, 0.42],
  [1, 0],
])

const SKIN = new Color('#1c1d21')
const SEAM = new Color('#09090b')
const CALLUS = new Color('#d4c9ae')
const BELLY = new Color('#d6d2ca')

const _off = new Vector3()
const _bq = new Quaternion()

const frac = (x: number): number => x - Math.floor(x)

export function whalePlan(seed: number): Plan {
  const rng = new Rng(mix32(seed, 0x3a1e))
  rng.next()
  const L = 14 * rng.range(0.94, 1.06)
  const m = L / 14
  const R = 0.1 * L
  const yc = 0.78 * R
  const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z)
  const z = (t: number): number => (t - 0.5) * L
  // the tail stock slopes down so the flukes lie on the sand
  const cy = (t: number): number => lerp(0.12 * m, yc, smooth(0, 0.42, t))
  const rAt = (t: number): number => R * PROF(t)
  /** the mouth line on the side, as cos(theta) of the section: arched high over the bowed lower lips */
  const mouth = (t: number): number => 0.1 + 0.5 * Math.sin(Math.PI * clamp((t - 0.72) / 0.28, 0, 1)) ** 0.8
  const at = (t: number): Vector3 => v(0, cy(t), z(t))
  const flipBase = (s: number): Vector3 => v(s * 0.7 * R, yc - 0.55 * R, z(0.7))
  const flipDir = (s: number): Vector3 => v(s * 0.85, -0.22, -0.45).normalize()
  const flipLen = 1.7 * m

  const bones: BoneDef[] = Array.from({ length: N }, () => ({ name: '', parent: 0, at: v(0, 0, 0) }))
  const set = (i: number, name: string, parent: number, p: Vector3): void => {
    bones[i] = { name, parent, at: p }
  }
  set(ROOT, 'root', 0, v(0, 0, 0))
  set(BODY, 'body', ROOT, at(0.45))
  set(CHEST, 'chest', BODY, at(0.62))
  set(HEAD, 'head', CHEST, at(0.76))
  set(JAW, 'jaw', HEAD, at(0.76).add(v(0, -0.3 * R, 0)))
  set(FL_L, 'flipperL', CHEST, flipBase(1))
  set(FL_R, 'flipperR', CHEST, flipBase(-1))
  set(TAIL1, 'tail1', BODY, at(0.3))
  set(TAIL2, 'tail2', TAIL1, at(0.16))
  set(FLUKE, 'fluke', TAIL2, at(0.04))

  const build = (body: MeshBuilder, detail: MeshBuilder): void => {
    const chain = chainSkin([FLUKE, TAIL2, TAIL1, BODY, CHEST, HEAD], [at(0), at(0.04), at(0.16), at(0.3), at(0.62), at(0.76), at(1)], 0.05 * L)
    const jaw: SkinW = { b: [JAW], w: [1] }
    // below the mouth line, the head's lower lips ride the jaw
    const skin: SkinFn = (x, y, zz) => {
      const t = zz / L + 0.5
      if (t > 0.74) {
        const r = rAt(t)
        if (y < cy(t) + r * 0.92 * mouth(t) - 0.02 * R) return jaw
      }
      return chain(x, y, zz)
    }
    body.at(T(0, 0, 0), skin).grid(
      30,
      56,
      (u, vv, out) => {
        const t = vv
        const r = rAt(t)
        const th = -u * Math.PI * 2
        const s = Math.sin(th)
        const c = Math.cos(th)
        // the upper jaw narrows into an arched rostrum over the wide lips
        const narrow = 1 - 0.38 * smooth(0.74, 0.92, t) * smooth(mouth(t), 1, c)
        out.x = r * s * narrow
        out.y = cy(t) + r * (c > 0 ? c * 0.92 : c * 0.7)
        out.z = z(t)
        const o = out.c.copy(SKIN).multiplyScalar(0.85 + 0.3 * fbm3(out.x * 0.8, out.y * 0.8, out.z * 0.8, seed))
        // pale scratches and scars
        const scar = fbm3(out.x * 3, out.y * 3, out.z * 0.6, seed ^ 0x51)
        if (Math.abs(scar - 0.5) < 0.012) o.lerp(new Color('#4a4a50'), 0.6)
        if (t > 0.72) {
          const mt = mouth(t)
          if (Math.abs(c - mt) < 0.045) o.copy(SEAM)
          const n = fbm3(out.x * 1.6, out.y * 1.6, out.z * 1.6, seed ^ 0xca11)
          // callosities: the bonnet on the rostrum, over the eyes, along the chin and lips
          const bonnet = t > 0.84 && c > 0.55
          const brow = Math.abs(t - 0.77) < 0.03 && c > mt + 0.08 && c < mt + 0.3
          const chin = t > 0.9 && c < mt - 0.1
          if ((bonnet || brow || chin) && n > 0.5) o.lerp(CALLUS, smooth(0.5, 0.56, n))
          // the blowholes: a dark V on top behind the bonnet
          if (Math.abs(t - 0.775) < 0.008 && c > 0.97) o.copy(SEAM)
        }
        if (t > 0.38 && t < 0.72 && c < -0.55) {
          const n = fbm3(out.x * 0.7, out.y * 0.7, out.z * 0.7, seed ^ 0xbe11)
          if (n > 0.6) o.lerp(BELLY, smooth(0.6, 0.65, n))
        }
      },
      { wrapU: true },
    )
    // the eyes: small, just above the corner of the mouth
    for (const s of [1, -1]) {
      const te = 0.752
      const ce = mouth(te) + 0.06
      const se = Math.sqrt(Math.max(0, 1 - ce * ce))
      const re = rAt(te)
      const eye = v(s * re * se * 0.99, cy(te) + re * ce * 0.92, z(te))
      detail.at(T(eye.x, eye.y, eye.z), rigid(HEAD)).ellipsoid(0.07 * m, 0.06 * m, 0.08 * m, (_y, _th, p) => (Math.abs(p.x) > 0.05 * m ? new Color('#0a0a0c') : new Color('#3a3634')), 8, 6)
      // the paddle flippers
      body.at(frame(flipBase(s), flipDir(s), v(0, 1, 0)), rigid(s > 0 ? FL_L : FL_R)).lathe({
        y0: -0.2 * m,
        y1: flipLen,
        r: (y) => 0.5 * m * FLIP(clamp(y / flipLen, 0, 1)),
        depth: 0.22,
        segs: 14,
        rings: 10,
        color: (y) => SKIN.clone().multiplyScalar(0.9 + 0.2 * smooth(0.6, 1, y / flipLen)),
      })
    }
    // the flukes: wide, notched, pointed tips swept back, flat on the sand
    const f0 = at(0.03)
    const half = 0.17 * L
    body.at(T(0, 0, 0), rigid(FLUKE)).grid(28, 6, (u, w, out) => {
      const a = (u - 0.5) * 2
      const aa = Math.abs(a)
      const chord = 0.1 * L * (1 - aa ** 2.2) ** 0.7 * (1 - 0.35 * Math.exp(-((a / 0.1) ** 2))) + 0.01 * L
      out.x = a * half
      out.z = f0.z - aa ** 1.6 * 0.09 * L - chord * w
      out.y = 0.1 * m + 0.05 * m * Math.sin(Math.PI * w) * (1 - aa)
      out.c.copy(SKIN).multiplyScalar(0.85 + 0.25 * fbm3(out.x, 0, out.z, seed))
    })
  }

  const pose = (anim: AnimalAnim, c: AnimalCtx, k: Kin): void => {
    const t = c.t + c.jit * 100
    const ph = c.phase * Math.PI * 2
    if (anim === 'swim') {
      _off.set(0, -yc * 0.7, 0)
      k.begin(_off, eq(0.02 * Math.sin(ph + 0.5), 0, 0, _bq))
      k.rot(CHEST, -0.03 * Math.sin(ph), 0, 0)
      k.rot(HEAD, -0.01 * Math.sin(ph), 0, 0)
      k.rot(JAW, 0, 0, 0)
      k.rot(FL_L, 0, 0, -0.3 + 0.08 * Math.sin(ph))
      k.rot(FL_R, 0, 0, 0.3 - 0.08 * Math.sin(ph))
      k.rot(TAIL1, 0.12 * Math.sin(ph), 0, 0)
      k.rot(TAIL2, 0.18 * Math.sin(ph - 0.6), 0, 0)
      k.rot(FLUKE, 0.25 * Math.sin(ph - 1.2), 0, 0)
      return
    }
    const dead = anim === 'dead'
    const fall = anim === 'fall'
    const f = dead ? 1 : fall ? smooth(0, 3, c.animT) : 0
    const alive = !dead
    const alert = anim === 'alert'
    // a breath every ~9 s (quicker in distress): the back heaves and settles
    const q = frac(t / (alert ? 6 : 9))
    const breath = alive ? smooth(0, 0.08, q) * (1 - smooth(0.3, 0.6, q)) * (1 - f) : 0
    // the flukes lift and drop now and then, the flippers stir
    const q2 = frac(t / (alert ? 6 : 23) + c.jit * 3)
    const lift = alive ? Math.sin(Math.PI * smooth(0, 0.14, q2)) ** 2 * (1 - f) : 0
    const q3 = frac(t / (alert ? 4 : 13) + c.jit * 5)
    const stir = alive ? Math.sin(Math.PI * smooth(0, 0.2, q3)) * (1 - f) : 0
    _off.set(0.05 * R * f, 0.04 * m * breath + 0.15 * R * f, 0)
    k.begin(_off, eq(0, 0, 0.55 * f, _bq))
    k.rot(CHEST, -0.012 * breath, 0, 0)
    k.rot(HEAD, 0.004 * breath, 0, 0)
    k.rot(JAW, 0.025 + 0.1 * f, 0, 0)
    k.rot(FL_L, 0, 0, 0.3 * stir + 0.45 * f)
    k.rot(FL_R, 0, 0, -0.15 * stir)
    k.rot(TAIL1, 0.1 * lift, 0, -0.35 * f)
    k.rot(TAIL2, 0.14 * lift, 0, -0.1 * f)
    k.rot(FLUKE, 0.1 * lift, 0, 0)
  }

  return {
    bones,
    build,
    bounds: new Sphere(v(0, yc, 0), 0.6 * L),
    lod: [70, 180],
    gait: (anim, speed) => (anim === 'swim' ? { id: 'swim', freq: 0.22 + 0.08 * speed } : { id: anim === 'fall' || anim === 'dead' ? anim : 'still', freq: 0 }),
    pose,
  }
}
