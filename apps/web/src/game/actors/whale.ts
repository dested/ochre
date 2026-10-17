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

/** the hull in units of R, tail (0) to rostrum tip (1): the dorsal line, the ventral line (sunk a little into the
 *  sand) and the half width. The head is a third of the whale: the dorsal line dips behind the blowholes, then the
 *  narrow rostrum arches down to the tip while the deep lower lips sweep up to meet it. */
const TOP = profile([
  [0, 0.22],
  [0.04, 0.3],
  [0.1, 0.42],
  [0.2, 0.66],
  [0.3, 1.02],
  [0.4, 1.4],
  [0.5, 1.64],
  [0.6, 1.72],
  [0.68, 1.68],
  [0.75, 1.55],
  [0.8, 1.54],
  [0.86, 1.47],
  [0.92, 1.36],
  [0.96, 1.2],
  [0.985, 1.0],
  [1, 0.84],
])
const BOT = profile([
  [0, 0.06],
  [0.04, 0.04],
  [0.12, 0.01],
  [0.25, -0.04],
  [0.35, -0.08],
  [0.75, -0.08],
  [0.84, -0.05],
  [0.9, 0],
  [0.94, 0.1],
  [0.97, 0.28],
  [0.99, 0.52],
  [1, 0.76],
])
const WID = profile([
  [0, 0.05],
  [0.04, 0.07],
  [0.1, 0.14],
  [0.2, 0.34],
  [0.3, 0.64],
  [0.4, 0.92],
  [0.5, 1.06],
  [0.6, 1.1],
  [0.68, 1.04],
  [0.76, 0.9],
  [0.84, 0.72],
  [0.91, 0.52],
  [0.96, 0.32],
  [0.99, 0.14],
  [1, 0.03],
])
const FLIP = profile([
  [0, 0.35],
  [0.2, 0.5],
  [0.55, 0.56],
  [0.85, 0.42],
  [1, 0],
])

const SKIN = new Color('#26282d')
const DRY = new Color('#5a5753')
const SEAM = new Color('#09090b')
const CALLUS = new Color('#c8bb9a')
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
  const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z)
  const z = (t: number): number => (t - 0.5) * L
  const topY = (t: number): number => R * TOP(t)
  const botY = (t: number): number => R * BOT(t)
  const mid = (t: number): number => 0.5 * (topY(t) + botY(t))
  /** the lip line on the side, as cos(theta) of the section: from the mouth corner it arches high up the head */
  const mouth = (t: number): number => -0.05 + 0.8 * Math.sin(Math.PI * clamp((t - 0.7) / 0.31, 0, 1)) ** 0.7
  /** a point on the hull at station t, section angle (s, c) = (sin, cos), c = 1 on top; skips the rostrum narrowing */
  const hull = (t: number, s: number, c: number, out: Vector3): Vector3 => {
    const m0 = mid(t)
    // the belly sags and spreads under the whale's own weight
    const y = c >= 0 ? m0 + (topY(t) - m0) * c : m0 - (m0 - botY(t)) * (0.45 * -c + 0.55 * Math.sqrt(-c))
    return out.set(R * WID(t) * s * (1 + 0.08 * Math.max(0, -c)), y, z(t))
  }
  const at = (t: number): Vector3 => v(0, mid(t), z(t))
  const flipBase = (s: number): Vector3 => {
    const p = hull(0.665, s * 0.89, -0.45, v(0, 0, 0))
    return p.set(p.x * 0.9, p.y, p.z)
  }
  const flipDir = (s: number): Vector3 => v(s * 0.85, -0.22, -0.45).normalize()
  const flipLen = 1.7 * m

  const bones: BoneDef[] = Array.from({ length: N }, () => ({ name: '', parent: 0, at: v(0, 0, 0) }))
  const set = (i: number, name: string, parent: number, p: Vector3): void => {
    bones[i] = { name, parent, at: p }
  }
  set(ROOT, 'root', 0, v(0, 0, 0))
  set(BODY, 'body', ROOT, at(0.45))
  set(CHEST, 'chest', BODY, at(0.6))
  set(HEAD, 'head', CHEST, at(0.72))
  set(JAW, 'jaw', HEAD, at(0.7))
  set(FL_L, 'flipperL', CHEST, flipBase(1))
  set(FL_R, 'flipperR', CHEST, flipBase(-1))
  set(TAIL1, 'tail1', BODY, at(0.3))
  set(TAIL2, 'tail2', TAIL1, at(0.16))
  set(FLUKE, 'fluke', TAIL2, at(0.04))

  const build = (body: MeshBuilder, detail: MeshBuilder): void => {
    const chain = chainSkin([FLUKE, TAIL2, TAIL1, BODY, CHEST, HEAD], [at(0), at(0.04), at(0.16), at(0.3), at(0.6), at(0.72), at(1)], 0.05 * L)
    const jaw: SkinW = { b: [JAW], w: [1] }
    // below the lip line, the lower lips ride the jaw
    const skin: SkinFn = (x, y, zz) => {
      const t = zz / L + 0.5
      if (t > 0.7) {
        const m0 = mid(t)
        if (y < m0 + (topY(t) - m0) * mouth(t) - 0.02 * R) return jaw
      }
      return chain(x, y, zz)
    }
    const p = new Vector3()
    const tone = new Color()
    body.at(T(0, 0, 0), skin).grid(
      56,
      80,
      (u, vv, out) => {
        // more rings on the head, where the lips and callosities are
        const t = vv < 0.55 ? (vv / 0.55) * 0.7 : 0.7 + ((vv - 0.55) / 0.45) * 0.3
        // on the head a column runs exactly along the lip line, so the lip rim and seam stay clean instead of stepping
        // across the grid: the section angle is warped piecewise around it
        const mt = mouth(t)
        const uK = 10 / 56
        const thK = lerp(uK * Math.PI * 2, Math.acos(clamp(mt, -1, 1)), smooth(0.56, 0.72, t))
        const uu = u < 0.5 ? u : 1 - u
        const a = uu < uK ? (uu / uK) * thK : thK + ((uu - uK) / (0.5 - uK)) * (Math.PI - thK)
        const th = u < 0.5 ? -a : a - Math.PI * 2
        const s = Math.sin(th)
        const c = Math.cos(th)
        hull(t, s, c, p)
        const head = smooth(0.7, 0.86, t)
        // the narrow arched rostrum sits between the bowed lower lips, which roll out just under the lip line
        const above = smooth(mt, mt + 0.14, c)
        const lip = Math.exp(-(((c - mt + 0.07) / 0.08) ** 2))
        let x = p.x * (1 - 0.45 * head * above + 0.1 * head * lip)
        let y = p.y
        const o = out.c.copy(SKIN).multiplyScalar(0.85 + 0.3 * fbm3(x * 0.8, y * 0.8, p.z * 0.8, seed))
        // out of the water the skin dries grey along the back
        o.lerp(DRY, 0.32 * smooth(0.2, 0.85, c) * smooth(0.45, 0.68, fbm3(x * 0.45, y * 0.45, p.z * 0.45, seed ^ 0x51)))
        if (t > 0.69) {
          const ang = Math.abs(Math.acos(clamp(c, -1, 1)) - Math.acos(clamp(mt, -1, 1)))
          if (ang < 0.07) o.copy(SEAM)
          // callosities, lumpy cream clusters: the bonnet on the rostrum tip, a row along the rostrum, the brows over the
          // eyes, along the lower lips and on the chin
          const n = fbm3(x * 1.8, y * 1.8, p.z * 1.8, seed ^ 0xca11)
          const bonnet = t > 0.92 && t < 0.99 && c > 0.7 ? 0.45 : 2
          const row = t > 0.8 && t < 0.92 && c > 0.88 ? 0.55 : 2
          const brow = t > 0.705 && t < 0.74 && c > mt + 0.14 && c < mt + 0.34 ? 0.56 : 2
          const lips = t > 0.82 && t < 0.98 && c < mt - 0.08 && c > mt - 0.24 ? 0.63 : 2
          const chin = t > 0.95 && c < mt - 0.3 ? 0.58 : 2
          const th0 = Math.min(bonnet, row, brow, lips, chin)
          const cal = smooth(th0, th0 + 0.1, n)
          if (cal > 0) {
            const grain = 0.82 + 0.36 * fbm3(x * 9, y * 9, p.z * 9, seed ^ 0x77)
            o.lerp(tone.copy(CALLUS).multiplyScalar(grain), cal)
            // raised and rough
            const lift = 0.035 * m * cal * grain
            x += s * lift
            y += c * lift
          }
          // the blowholes: a dark V on top behind the bonnet
          if (Math.abs(t - 0.79) < 0.006 && c > 0.97) o.copy(SEAM)
        }
        if (t > 0.36 && t < 0.7 && c < -0.55) {
          const n = fbm3(x * 0.7, y * 0.7, p.z * 0.7, seed ^ 0xbe11)
          if (n > 0.6) o.lerp(BELLY, smooth(0.6, 0.65, n))
        }
        out.x = x
        out.y = y
        out.z = p.z
      },
      { wrapU: true },
    )
    // the eyes: small, just above the corner of the mouth
    for (const s of [1, -1]) {
      const te = 0.715
      const ce = mouth(te) + 0.1
      const eye = hull(te, s * Math.sqrt(Math.max(0, 1 - ce * ce)), ce, v(0, 0, 0))
      eye.x *= 0.99
      detail.at(T(eye.x, eye.y, eye.z), rigid(HEAD)).ellipsoid(0.07 * m, 0.06 * m, 0.08 * m, (_y, _th, q) => (Math.abs(q.x) > 0.05 * m ? new Color('#0a0a0c') : new Color('#3a3634')), 8, 6)
      // the paddle flippers
      body.at(frame(flipBase(s), flipDir(s), v(0, 1, 0)), rigid(s > 0 ? FL_L : FL_R)).lathe({
        y0: -0.2 * m,
        y1: flipLen,
        r: (y) => 0.85 * m * FLIP(clamp(y / flipLen, 0, 1)),
        depth: 0.22,
        segs: 14,
        rings: 10,
        color: (y) => SKIN.clone().multiplyScalar(0.9 + 0.2 * smooth(0.6, 1, y / flipLen)),
      })
    }
    // the flukes: wide, notched, pointed tips swept back, drooping onto the sand
    const f0 = at(0.03)
    const half = 0.17 * L
    body.at(T(0, 0, 0), rigid(FLUKE)).grid(28, 6, (u, w, out) => {
      const a = (u - 0.5) * 2
      const aa = Math.abs(a)
      const chord = 0.1 * L * (1 - aa ** 2.2) ** 0.7 * (1 - 0.35 * Math.exp(-((a / 0.1) ** 2))) + 0.01 * L
      out.x = a * half
      out.z = f0.z - aa ** 1.6 * 0.09 * L - chord * w
      out.y = lerp(f0.y, 0.08 * m, aa ** 0.6) + 0.05 * m * Math.sin(Math.PI * w) * (1 - aa) - 0.04 * m * w * (1 - aa)
      out.c.copy(SKIN).multiplyScalar(0.85 + 0.25 * fbm3(out.x, 0, out.z, seed))
    })
  }

  const pose = (anim: AnimalAnim, c: AnimalCtx, k: Kin): void => {
    const t = c.t + c.jit * 100
    const ph = c.phase * Math.PI * 2
    if (anim === 'swim') {
      _off.set(0, -0.75 * mid(0.5), 0)
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
    k.rot(HEAD, 0.004 * breath - 0.03 * f, 0, 0)
    k.rot(JAW, 0.09 * f, 0, 0)
    k.rot(FL_L, 0, 0, 0.3 * stir + 0.45 * f)
    k.rot(FL_R, 0, 0, -0.15 * stir)
    k.rot(TAIL1, 0.1 * lift, 0, -0.35 * f)
    k.rot(TAIL2, 0.14 * lift, 0, -0.1 * f)
    k.rot(FLUKE, 0.1 * lift, 0, 0)
  }

  return {
    bones,
    build,
    bounds: new Sphere(v(0, 0.8 * R, 0), 0.6 * L),
    lod: [70, 180],
    gait: (anim, speed) => (anim === 'swim' ? { id: 'swim', freq: 0.22 + 0.08 * speed } : { id: anim === 'fall' || anim === 'dead' ? anim : 'still', freq: 0 }),
    pose,
  }
}
