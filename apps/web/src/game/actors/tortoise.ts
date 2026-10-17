/**
 * The angulate tortoise: a high domed shell painted with its scutes (yellow-ochre fields with black seams, growth
 * rings and dark areolae), the male's gular plate jutting under the chin, stumpy scaled legs and a small beaked head.
 * It walks in diagonal pairs with the shell rocking, eats with its head down, stretches its neck to look (alert),
 * withdraws into the shell (lie), lies limp (dead), and flips onto its back waving its legs (fall).
 */
import { Color, Quaternion, Sphere, Vector3 } from 'three'
import type { AnimalAnim } from '../contracts'
import { Rng, mix32 } from '~/core/rng'
import { eq, type AnimalCtx, type BoneDef, type Kin, type Plan } from './beast'
import { MeshBuilder, T, clamp, fbm3, lerp, rigid, smooth } from './geo'
import { mixc } from './looks'

const ROOT = 0
const SHELL = 1
const NECK = 2
const HEAD = 3
const FL = 4
const FR = 5
const HL = 6
const HR = 7
const TAIL = 8
const N = 9
/** legs in walking order: front left, front right, hind left, hind right */
const LEGS = [FL, FR, HL, HR] as const

const YELLOW = new Color('#d2a443')
const SEAM = new Color('#231a12')
const AREOLA = new Color('#8e5226')
const SKIN = new Color('#a08852')
const SKIN_DARK = new Color('#5a4a30')

const _off = new Vector3()
const _bq = new Quaternion()

const frac = (x: number): number => x - Math.floor(x)

export function tortoisePlan(seed: number): Plan {
  const rng = new Rng(mix32(seed, 0x7027))
  rng.next()
  const male = rng.chance(0.5)
  const Ls = (male ? 0.24 : 0.2) * rng.range(0.92, 1.08)
  const k = Ls / 0.2
  const Ws = 0.78 * Ls
  const Hs = 0.62 * Ls
  const y0 = 0.026 * k
  const hue = rng.range(0.9, 1.1)
  const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z)
  const neckBase = v(0, y0 + 0.02 * k, Ls / 2 - 0.03 * k)
  const headC = v(0, y0 + 0.03 * k, Ls / 2 + 0.042 * k)
  const legTop = (i: number): Vector3 => {
    const s = i % 2 === 0 ? 1 : -1
    return i < 2 ? v(s * Ws * 0.3, y0 + 0.022 * k, Ls * 0.3) : v(s * Ws * 0.28, y0 + 0.018 * k, -Ls * 0.3)
  }
  const legFoot = (i: number): Vector3 => {
    const s = i % 2 === 0 ? 1 : -1
    return i < 2 ? v(s * Ws * 0.46, 0.008 * k, Ls * 0.37) : v(s * Ws * 0.38, 0.008 * k, -Ls * 0.34)
  }

  const bones: BoneDef[] = Array.from({ length: N }, () => ({ name: '', parent: 0, at: v(0, 0, 0) }))
  const set = (i: number, name: string, parent: number, p: Vector3): void => {
    bones[i] = { name, parent, at: p }
  }
  set(ROOT, 'root', 0, v(0, 0, 0))
  set(SHELL, 'shell', ROOT, v(0, y0 + Hs * 0.3, 0))
  set(NECK, 'neck', SHELL, neckBase)
  set(HEAD, 'head', NECK, headC)
  LEGS.forEach((b, i) => set(b, ['legFL', 'legFR', 'legHL', 'legHR'][i] ?? 'leg', SHELL, legTop(i)))
  set(TAIL, 'tail', SHELL, v(0, y0 + 0.01 * k, -Ls / 2 + 0.01 * k))

  /** the scute pattern at a point on the carapace (h: height fraction, th: angle from the front, zc: -1..1 along) */
  const scute = (h: number, th: number, zc: number, out: Color): Color => {
    let db: number
    let dc: number
    if (h < 0.2) {
      // the marginal ring: 24 small scutes with a dark wedge at the rim
      const f = frac((th / (Math.PI * 2)) * 24)
      db = Math.min(f, 1 - f, (0.2 - h) * 3)
      dc = Math.hypot(f - 0.5, (h - 0.1) * 4)
      if (h < 0.16 * (1 - 2 * Math.abs(f - 0.5))) return out.copy(SEAM).lerp(AREOLA, 0.25)
    } else if (h < 0.62) {
      // the costal ring: 8 large scutes, offset half a cell
      const f = frac((th / (Math.PI * 2)) * 8 + 0.5)
      db = Math.min(f, 1 - f, (h - 0.2) * 2.2, (0.62 - h) * 2.2)
      dc = Math.hypot(f - 0.5, (h - 0.41) * 1.8)
    } else {
      // the vertebral row along the top
      const f = frac(((zc + 1) / 2) * 5)
      db = Math.min(f, 1 - f, (h - 0.62) * 2)
      dc = Math.hypot(f - 0.5, (1 - h) * 0.8)
    }
    out.copy(YELLOW).multiplyScalar(hue)
    // growth rings follow the seams; the areola sits dark in the middle
    out.multiplyScalar(0.9 + 0.1 * Math.sin(db * 70))
    out.lerp(AREOLA, smooth(0.2, 0.08, dc) * 0.8)
    return out.lerp(SEAM, smooth(0.15, 0.06, db))
  }

  const build = (body: MeshBuilder, detail: MeshBuilder): void => {
    // the carapace: a vertical lathe, flared at the rim, capped flat underneath by the plastron
    body.at(T(0, y0, 0), rigid(SHELL)).lathe({
      y0: 0,
      y1: Hs,
      r: (y) => {
        const h = y / Hs
        return (Ws / 2) * Math.max(0, 1 - h ** 2.3) ** (1 / 2.3) * (1 + 0.07 * smooth(0.25, 0, h))
      },
      depth: Ls / Ws,
      segs: 48,
      rings: 24,
      color: (y, th, p) => {
        if (y <= 1e-5) return mixc(new Color('#c99a4c'), new Color('#7a4426'), smooth(0.5, 0.1, Math.hypot(p.x / Ws, p.z / Ls) * 2))
        return scute(y / Hs, th, clamp(p.z / (Ls / 2), -1, 1), new Color())
      },
      deform: (p, _th, y) => {
        // the front rim lifts over the neck and the back rim flares down over the tail
        const h = y / Hs
        const front = smooth(0.35, 0.5, p.z / Ls)
        p.y += 0.012 * k * front * smooth(0.3, 0, h)
      },
    })
    if (male) {
      // the angulate's gular plate, jutting forward under the chin
      body.at(T(0, y0 + 0.005 * k, Ls / 2 + 0.008 * k), rigid(SHELL)).ellipsoid(0.022 * k, 0.005 * k, 0.026 * k, new Color('#c49448'), 10, 4)
    }
    // neck and head
    body.at(T(0, 0, 0), rigid(NECK)).tube([neckBase.clone().add(v(0, 0, -0.02 * k)), neckBase.clone().lerp(headC, 0.5).add(v(0, 0.004 * k, 0)), headC.clone().add(v(0, -0.002 * k, -0.01 * k))], () => 0.013 * k, (t, a) => (Math.cos(a) < -0.3 ? mixc(SKIN, YELLOW, 0.4) : SKIN.clone().multiplyScalar(0.9 + 0.15 * Math.sin(t * 40 + a * 3))), 8)
    body.at(T(headC.x, headC.y, headC.z), rigid(HEAD)).ellipsoid(0.017 * k, 0.016 * k, 0.025 * k, (_y, _th, p) => (p.z > 0.018 * k ? SKIN_DARK : p.y > 0.004 * k ? mixc(SKIN, YELLOW, 0.3) : SKIN), 12, 8)
    for (const s of [1, -1]) {
      detail.at(T(headC.x + s * 0.0125 * k, headC.y + 0.005 * k, headC.z + 0.008 * k), rigid(HEAD)).ellipsoid(0.0035 * k, 0.0035 * k, 0.0035 * k, new Color('#100c08'), 6, 4)
    }
    // legs: stout scaled columns with round feet
    LEGS.forEach((b, i) => {
      const a = legTop(i)
      const f = legFoot(i)
      const front = i < 2
      body.at(T(0, 0, 0), rigid(b)).tube([a, a.clone().lerp(f, 0.5), f], (t) => lerp(front ? 0.016 : 0.02, front ? 0.012 : 0.016, t) * k, (t, ang) => SKIN.clone().multiplyScalar(0.85 + 0.25 * fbm3(t * 9, ang * 2, i, seed)), 8)
      body.at(T(f.x, f.y - 0.002 * k, f.z), rigid(b)).ellipsoid((front ? 0.015 : 0.017) * k, 0.007 * k, (front ? 0.017 : 0.016) * k, SKIN_DARK, 8, 4)
    })
    body.at(T(0, 0, 0), rigid(TAIL)).tube([v(0, y0 + 0.012 * k, -Ls / 2 + 0.01 * k), v(0, y0 + 0.002 * k, -Ls / 2 - 0.016 * k)], (t) => 0.007 * k * (1 - 0.8 * t), SKIN, 6)
  }

  const legSwing = (kk: Kin, i: number, fwd: number, lift: number, scale = 1): void => {
    const s = i % 2 === 0 ? 1 : -1
    const b = LEGS[i] ?? FL
    kk.rot(b, fwd, 0, s * lift)
    kk.scale(b, scale)
  }

  const pose = (anim: AnimalAnim, c: AnimalCtx, kk: Kin): void => {
    const t = c.t + c.jit * 30
    const ph = c.phase * Math.PI * 2
    const moving = c.speed > 0.01 && (anim === 'walk' || anim === 'run' || anim === 'swim')
    if (anim === 'fall') {
      // flipped onto its back, legs waving
      const f = smooth(0, 0.8, c.animT)
      const hop = Math.sin(Math.PI * f) * 0.06 * k
      _off.set(0.02 * k * f, (0.4 * Hs - y0 + 0.003 * k) * f + hop, 0)
      kk.begin(_off, eq(0, 0, Math.PI * f, _bq))
      kk.rot(NECK, -0.3 * f + 0.2 * Math.sin(t * 3) * f, 0.3 * Math.sin(t * 2), 0)
      kk.rot(HEAD, 0.2, 0, 0)
      for (let i = 0; i < 4; i++) legSwing(kk, i, 0.5 * Math.sin(t * 4 + i * 1.7) * f, 0.4 * f)
      kk.rot(TAIL, 0, 0, 0)
      return
    }
    if (anim === 'lie' || anim === 'dead') {
      const dead = anim === 'dead'
      _off.set(0, -(y0 - 0.004 * k), 0)
      kk.begin(_off, eq(dead ? 0.04 : 0.02, 0, dead ? 0.05 : 0, _bq))
      if (dead) {
        // limp: the neck out on the ground, legs splayed flat
        kk.rot(NECK, 0.35, 0.4, 0)
        kk.rot(HEAD, 0.3, 0.2, 0.3)
        for (let i = 0; i < 4; i++) legSwing(kk, i, i < 2 ? -0.5 : 0.5, 1.1)
      } else {
        // withdrawn: head and legs drawn in under the rim
        kk.rot(NECK, 0.2, 0, 0)
        kk.scale(NECK, 0.3)
        kk.rot(HEAD, 0, 0, 0)
        for (let i = 0; i < 4; i++) legSwing(kk, i, i < 2 ? 0.6 : -0.6, -0.5, 0.55)
      }
      kk.rot(TAIL, 0, 0, 0)
      return
    }
    const alert = anim === 'alert'
    const eat = anim === 'graze'
    const roll = moving ? 0.035 * Math.sin(ph) : 0
    const yaw = moving ? 0.03 * Math.sin(ph) : 0
    _off.set(0, moving ? 0.002 * k * Math.abs(Math.sin(ph)) : 0, 0)
    kk.begin(_off, eq(eat ? 0.04 : alert ? -0.05 : 0, yaw, roll, _bq))
    if (eat) {
      const bite = Math.max(0, Math.sin(t * 2.2)) ** 2
      kk.rot(NECK, 0.45 + 0.15 * bite, 0.2 * Math.sin(t * 0.4), 0)
      kk.rot(HEAD, 0.35 + 0.2 * bite, 0, 0)
    } else if (alert) {
      kk.rot(NECK, -0.55, 0.3 * Math.sin(t * 0.5 + c.jit * 3), 0)
      kk.rot(HEAD, 0.35, 0, 0)
    } else {
      const look = moving ? 0.08 * Math.sin(ph) : Math.sin(t * 0.25 + c.jit * 6) * 0.45
      kk.rot(NECK, -0.12 + (moving ? 0.06 * Math.sin(2 * ph) : 0.06 * Math.sin(t * 0.4)), look, 0)
      kk.rot(HEAD, 0.08, look * 0.5, 0)
    }
    for (let i = 0; i < 4; i++) {
      if (!moving) {
        legSwing(kk, i, 0, 0)
        continue
      }
      // diagonal pairs: front left with hind right, front right with hind left
      const q = frac(c.phase + (i === 0 || i === 3 ? 0 : 0.5))
      const duty = 0.65
      const amp = anim === 'run' ? 0.42 : 0.3
      if (q < duty) legSwing(kk, i, lerp(-amp, amp, q / duty), 0)
      else {
        const u = (q - duty) / (1 - duty)
        legSwing(kk, i, lerp(amp, -amp, smooth(0, 1, u)), 0.35 * Math.sin(Math.PI * u))
      }
    }
    kk.rot(TAIL, 0, 0, 0)
  }

  return {
    bones,
    build,
    bounds: new Sphere(v(0, Hs * 0.5, 0), Ls * 0.9),
    lod: [4, 12],
    gait: (anim, speed) => {
      const moving = speed > 0.01 && (anim === 'walk' || anim === 'run' || anim === 'swim')
      if (moving) return { id: 'walk', freq: clamp(speed / 0.1, 0.3, 2.2) }
      return { id: anim, freq: 0 }
    },
    pose,
  }
}
