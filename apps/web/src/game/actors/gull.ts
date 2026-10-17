/**
 * The kelp gull: white head and body, a slate-black mantle and wings with white trailing edges and mirror spots, a
 * yellow bill with the red gonys spot, olive legs and webbed feet. Two wing sets share the rig: the folded wings ride
 * the body (a FOLD bone) and the spread wings ride the wing chain; each pose scales away the set it does not use. It
 * stands, walks and runs on planted feet, pecks (graze), sits on the water (swim), roosts (lie), flies with flaps and
 * glides, and tumbles onto its side to fall and die. Now and then it throws its head back for the long call.
 */
import { Color, Quaternion, Sphere, Vector3 } from 'three'
import type { AnimalAnim } from '../contracts'
import { Rng, mix32 } from '~/core/rng'
import { chainSkin, eq, type AnimalCtx, type BoneDef, type Kin, type Plan } from './beast'
import { MeshBuilder, T, clamp, lerp, profile, rigid, smooth } from './geo'
import { mixc } from './looks'
import { catmull, frame } from './quadruped'

const ROOT = 0
const BODY = 1
const NECK = 2
const HEAD = 3
const JAW = 4
const TAIL = 5
const FOLD = 6
const W1L = 7
const W2L = 8
const W3L = 9
const W1R = 10
const W2R = 11
const W3R = 12
const LEGL = 13
const TARSL = 14
const FOOTL = 15
const LEGR = 16
const TARSR = 17
const FOOTR = 18
const N = 19

const BODY_P = profile([
  [0, 0.12],
  [0.12, 0.5],
  [0.4, 0.95],
  [0.6, 1],
  [0.82, 0.86],
  [0.95, 0.5],
  [1, 0],
])
const FOLD_P = profile([
  [0, 0.4],
  [0.1, 0.85],
  [0.35, 1],
  [0.6, 0.7],
  [0.85, 0.32],
  [1, 0],
])

const WHITE = new Color('#f1efe9')
const SLATE = new Color('#2b2b31')
const BLACK = new Color('#131315')
const BILL = new Color('#e6bf2e')
const SPOT = new Color('#c42e1a')
const LEGC = new Color('#a9a257')

const _off = new Vector3()
const _bq = new Quaternion()
const _tg = new Vector3()
const _pole = new Vector3()

export function gullPlan(seed: number): Plan {
  const rng = new Rng(mix32(seed, 0x6011))
  rng.next()
  const k = rng.range(0.94, 1.06)
  const v = (x: number, y: number, z: number): Vector3 => new Vector3(x * k, y * k, z * k)
  const yb = 0.19 * k
  const bodyC = v(0, 0.19, 0)
  const neckBase = v(0, 0.205, 0.085)
  const headC = v(0, 0.27, 0.16)
  const shoulder = (s: number): Vector3 => v(s * 0.05, 0.215, 0.06)
  const elbow = (s: number): Vector3 => v(s * 0.2, 0.22, 0.04)
  const wrist = (s: number): Vector3 => v(s * 0.36, 0.225, 0.05)
  const wtip = (s: number): Vector3 => v(s * 0.66, 0.21, -0.1)
  const hip = (s: number): Vector3 => v(s * 0.03, 0.16, 0.005)
  const ankle = (s: number): Vector3 => v(s * 0.035, 0.095, -0.012)
  const foot = (s: number): Vector3 => v(s * 0.035, 0.012, 0.005)

  const bones: BoneDef[] = Array.from({ length: N }, () => ({ name: '', parent: 0, at: v(0, 0, 0) }))
  const set = (i: number, name: string, parent: number, p: Vector3): void => {
    bones[i] = { name, parent, at: p }
  }
  set(ROOT, 'root', 0, v(0, 0, 0))
  set(BODY, 'body', ROOT, bodyC)
  set(NECK, 'neck', BODY, neckBase)
  set(HEAD, 'head', NECK, headC)
  set(JAW, 'jaw', HEAD, v(0, 0.258, 0.19))
  set(TAIL, 'tail', BODY, v(0, 0.2, -0.13))
  set(FOLD, 'fold', BODY, bodyC.clone())
  set(W1L, 'w1L', BODY, shoulder(1))
  set(W2L, 'w2L', W1L, elbow(1))
  set(W3L, 'w3L', W2L, wrist(1))
  set(W1R, 'w1R', BODY, shoulder(-1))
  set(W2R, 'w2R', W1R, elbow(-1))
  set(W3R, 'w3R', W2R, wrist(-1))
  set(LEGL, 'legL', BODY, hip(1))
  set(TARSL, 'tarsL', LEGL, ankle(1))
  set(FOOTL, 'footL', TARSL, foot(1))
  set(LEGR, 'legR', BODY, hip(-1))
  set(TARSR, 'tarsR', LEGR, ankle(-1))
  set(FOOTR, 'footR', TARSR, foot(-1))

  const build = (body: MeshBuilder, detail: MeshBuilder): void => {
    const BL = 0.3 * k
    const BR = 0.062 * k
    // body: a lathe from the tail base to the breast; the mantle between the wings is slate
    body.at(frame(v(0, 0.19, -0.165), new Vector3(0, 0.08, 1), new Vector3(0, 1, 0)), rigid(BODY)).lathe({
      y0: 0,
      y1: BL,
      r: (y) => BR * BODY_P(y / BL),
      depth: 1.05,
      segs: 16,
      rings: 14,
      color: (y, th) => (Math.cos(th) > 0.55 && y / BL > 0.15 && y / BL < 0.8 ? SLATE : WHITE),
      deform: (p) => {
        if (p.z < 0) p.z *= 1.12
      },
    })
    // neck and head
    body.at(T(0, 0, 0), chainSkin([NECK, HEAD], [neckBase.clone().add(v(0, -0.02, -0.03)), headC, headC.clone().add(v(0, 0.01, 0.05))], 0.02 * k)).tube(
      catmull([neckBase.clone().add(v(0, -0.015, -0.03)), v(0, 0.235, 0.12), headC.clone().add(v(0, -0.005, -0.005))], 6),
      (t) => lerp(0.034, 0.025, t) * k,
      WHITE,
      10,
    )
    body.at(T(headC.x, headC.y, headC.z), rigid(HEAD)).ellipsoid(0.03 * k, 0.031 * k, 0.04 * k, WHITE, 12, 10, (p) => {
      // a flatter crown and a fuller cheek
      if (p.y > 0) p.y *= 0.9
    })
    // the bill: upper with a hooked tip, lower on the jaw with the red spot
    detail.at(T(0, 0, 0), rigid(HEAD)).tube([v(0, 0.271, 0.188), v(0, 0.27, 0.215), v(0, 0.266, 0.24), v(0, 0.26, 0.255), v(0, 0.252, 0.258)], (t) => lerp(0.011, 0.003, t) * k, BILL, 8, { flatten: 0.75 })
    detail.at(T(0, 0, 0), rigid(JAW)).tube([v(0, 0.259, 0.19), v(0, 0.257, 0.215), v(0, 0.256, 0.235), v(0, 0.258, 0.248)], (t) => lerp(0.008, 0.003, t) * k, (t) => (t > 0.62 && t < 0.86 ? SPOT : BILL), 8, { flatten: 0.75 })
    for (const s of [1, -1]) {
      const eye = v(s * 0.024, 0.279, 0.176)
      detail.at(T(eye.x, eye.y, eye.z), rigid(HEAD)).ellipsoid(0.0062 * k, 0.0062 * k, 0.0062 * k, new Color('#2a170c'), 8, 6)
      detail.at(T(eye.x - s * 0.0015, eye.y, eye.z), rigid(HEAD)).ellipsoid(0.0068 * k, 0.0068 * k, 0.0058 * k, SPOT, 8, 6)
      // the folded wing: a slim blade along the side from the shoulder to past the tail, primaries crossing
      const a = v(s * 0.052, 0.222, 0.075)
      const b = v(s * 0.03, 0.226, -0.27)
      const dir = new Vector3().subVectors(b, a)
      const len = dir.length()
      body.at(frame(a, dir, new Vector3(s, 0.35, 0)), rigid(FOLD)).lathe({
        y0: 0,
        y1: len,
        r: (y) => 0.044 * k * FOLD_P(y / len),
        depth: 0.28,
        segs: 12,
        rings: 14,
        color: (y, th) => {
          const t = y / len
          if (t > 0.93) return WHITE
          if (t > 0.58) return t > 0.82 && t < 0.87 ? WHITE : BLACK
          // the white tertial crescent along the lower edge
          return Math.abs(Math.sin(th)) > 0.85 && Math.sin(th) * s < 0 && t > 0.35 ? WHITE : SLATE
        },
      })
      // the spread wing: a cambered sheet, slate above and white below, on the wing chain
      const S = shoulder(s)
      const E = elbow(s)
      const W = wrist(s)
      const P = wtip(s)
      const seg = [S, E, W, P]
      const lens = [0]
      for (let i = 1; i < 4; i++) lens.push((lens[i - 1] ?? 0) + (seg[i]?.distanceTo(seg[i - 1] ?? S) ?? 0))
      const total = lens[3] ?? 1
      const uw = (lens[2] ?? 0) / total
      const le = (u: number, out: Vector3): Vector3 => {
        const d = u * total
        const i = d < (lens[1] ?? 0) ? 0 : d < (lens[2] ?? 0) ? 1 : 2
        const a0 = seg[i] ?? S
        const a1 = seg[i + 1] ?? P
        const f = (d - (lens[i] ?? 0)) / Math.max(1e-6, (lens[i + 1] ?? 1) - (lens[i] ?? 0))
        return out.lerpVectors(a0, a1, clamp(f, 0, 1))
      }
      const chord = (u: number): number => (u < uw ? 0.15 - 0.01 * (u / uw) : lerp(0.14, 0.015, ((u - uw) / (1 - uw)) ** 1.2)) * k
      const skin = chainSkin(s > 0 ? [W1L, W2L, W3L] : [W1R, W2R, W3R], seg, 0.03 * k)
      const p = new Vector3()
      for (const face of [1, -1]) {
        body.at(T(0, 0, 0), skin).grid(22, 8, (u, w, out) => {
          le(u, p)
          const c = chord(u)
          // the hand's chord fans back toward the body
          const fan = smooth(uw, 1, u) * 0.35
          out.x = p.x - s * c * w * fan
          out.y = p.y + 0.015 * k * Math.sin(Math.PI * w) * (1 - 0.6 * u) + face * 0.002 * k
          out.z = p.z - c * w * (1 - fan * 0.3)
          if (face > 0) {
            const tip = u > uw + 0.05
            out.c.copy(tip ? BLACK : SLATE)
            if (w > 0.86 && u < 0.82) out.c.copy(WHITE)
            if (u > 0.9 && w > 0.25 && w < 0.7) out.c.copy(WHITE)
          } else {
            out.c.copy(WHITE).lerp(new Color('#3a3a3e'), smooth(0.78, 0.9, u) * smooth(0.2, 0.6, w))
          }
        })
      }
      // legs: a feathered stub, the bare tarsus, the webbed foot
      const H = hip(s)
      const A = ankle(s)
      const F = foot(s)
      const legSkin = chainSkin(s > 0 ? [LEGL, TARSL, FOOTL] : [LEGR, TARSR, FOOTR], [H, A, F, F.clone().add(v(0, 0, 0.04))], 0.008 * k)
      body.at(T(0, 0, 0), legSkin).tube([H, H.clone().lerp(A, 0.5), A], (t) => lerp(0.016, 0.007, t) * k, (t) => (t > 0.7 ? LEGC : WHITE), 8)
      detail.at(T(0, 0, 0), legSkin).tube([A, A.clone().lerp(F, 0.5), F], (t) => lerp(0.005, 0.0045, t) * k, LEGC, 6)
      detail.at(T(F.x, F.y, F.z), rigid(s > 0 ? FOOTL : FOOTR)).grid(6, 4, (u, w, out) => {
        const ang = (u - 0.5) * 0.9
        const len = 0.048 * k * (1 - 0.25 * Math.abs(u - 0.5) * 2)
        // the web dips between the toes
        const web = w > 0.85 ? 1 - Math.abs(Math.sin(u * Math.PI * 2)) * 0.25 : 1
        out.x = Math.sin(ang) * len * w * web
        out.y = -0.008 * k + 0.002 * k * Math.sin(Math.PI * w)
        out.z = Math.cos(ang) * len * w * web
        out.c.copy(LEGC).multiplyScalar(0.92)
      })
    }
    // tail: a white fan
    body.at(T(0, 0, 0), rigid(TAIL)).grid(6, 4, (u, w, out) => {
      const a = (u - 0.5) * 2
      out.x = a * lerp(0.03, 0.045, w) * k
      out.y = (0.205 + 0.004 * w) * k
      out.z = (-0.125 - 0.105 * w * (1 - 0.15 * a * a)) * k
      out.c.copy(WHITE)
    })
    void mixc
  }

  type Wings = { flap: number; lag: number; sweep: number; dihedral: number; open: number }
  const spreadWings = (kk: Kin, w: Wings): void => {
    for (const s of [1, -1]) {
      kk.rot(s > 0 ? W1L : W1R, 0, s * (0.1 * (1 - w.open) + 0.05), s * (w.flap + w.dihedral))
      kk.rot(s > 0 ? W2L : W2R, 0, s * -0.15 * (1 - w.open), s * w.lag * 0.45)
      kk.rot(s > 0 ? W3L : W3R, 0, s * (w.sweep + 0.6 * (1 - w.open)), s * w.lag * 0.7)
    }
  }
  const showWings = (kk: Kin, spread: boolean): void => {
    kk.scale(FOLD, spread ? 1e-4 : 1)
    kk.scale(W1L, spread ? 1 : 1e-4)
    kk.scale(W1R, spread ? 1 : 1e-4)
  }
  const restFoot = [foot(1), foot(-1)]
  const legs = (kk: Kin, place: (s: number, out: Vector3) => number): void => {
    for (const s of [1, -1]) {
      const lift = place(s, _tg)
      kk.twoBone(s > 0 ? LEGL : LEGR, s > 0 ? TARSL : TARSR, s > 0 ? FOOTL : FOOTR, _tg, _pole.set(s * 0.1, 0, -1))
      kk.setWorld(s > 0 ? FOOTL : FOOTR, eq(lift * 0.9, 0, 0, _bq))
    }
  }
  const head = (kk: Kin, pitch: number, yaw: number, nod: number, roll = 0): void => {
    kk.rot(NECK, pitch, yaw * 0.6, roll)
    kk.rot(HEAD, nod, yaw * 0.4, roll * 0.5)
  }

  const pose = (anim: AnimalAnim, c: AnimalCtx, kk: Kin): void => {
    const t = c.t + c.jit * 50
    const ph = c.phase * Math.PI * 2
    const moving = c.speed > 0.05
    if (anim === 'fly') {
      // flap for a while, then glide on set wings with a slow bank
      const glide = smooth(0.2, 0.5, Math.sin(t * 0.45 + c.jit * 6))
      const amp = 0.6 * (1 - glide)
      _off.set(0, -0.012 * k * Math.sin(ph) * (1 - glide), 0)
      kk.begin(_off, eq(0.04, 0, 0.18 * glide * Math.sin(t * 0.3), _bq))
      showWings(kk, true)
      head(kk, 0.25, 0.25 * Math.sin(t * 0.4), -0.2)
      kk.rot(JAW, 0, 0, 0)
      kk.rot(TAIL, 0.05, 0, 0)
      kk.rot(FOLD, 0, 0, 0)
      spreadWings(kk, { flap: amp * Math.sin(ph), lag: amp * Math.sin(ph - 0.9), sweep: 0.15 + 0.35 * Math.max(0, -Math.cos(ph)) * (1 - glide), dihedral: 0.1, open: 1 })
      // legs tucked back under the tail
      legs(kk, (s, out) => {
        out.copy(hip(s)).add(v(s * 0.005, -0.03, -0.11))
        return 1.2
      })
      return
    }
    if (anim === 'fall' || anim === 'dead') {
      const f = anim === 'dead' ? 1 : smooth(0, 0.7, c.animT)
      _off.set(0.02 * k * f, -(yb - 0.06 * k) * f, 0)
      kk.begin(_off, eq(0, 0, 1.45 * f, _bq))
      showWings(kk, true)
      head(kk, 0.5 * f, 0.6 * f, 0.3 * f, 0.4 * f)
      kk.rot(JAW, 0.2 * f, 0, 0)
      kk.rot(TAIL, 0, 0, 0)
      kk.rot(FOLD, 0, 0, 0)
      // one wing flops open, the other stays half folded under the body
      kk.rot(W1L, 0, 0.3, 0.5 * f)
      kk.rot(W2L, 0, -0.3, -0.2)
      kk.rot(W3L, 0, 0.5, -0.3)
      kk.rot(W1R, 0, -1.2, -0.2)
      kk.rot(W2R, 0, 1.6, 0)
      kk.rot(W3R, 0, -1.4, 0)
      legs(kk, (s, out) => {
        out.copy(hip(s)).add(v(s * 0.03, -0.11, 0.03 + 0.02 * s))
        return -0.3
      })
      return
    }
    if (anim === 'swim' || anim === 'lie') {
      // afloat or roosting: the body down on the surface, legs folded away, the neck drawn in
      const swim = anim === 'swim'
      _off.set(0, -(yb - (swim ? 0.055 : 0.06) * k) + 0.004 * k * Math.sin(t * (swim ? 2 : 1)), 0)
      kk.begin(_off, eq(swim ? -0.06 : 0.02, swim ? 0.06 * Math.sin(ph) : 0, 0, _bq))
      showWings(kk, false)
      kk.rot(FOLD, 0, 0, 0)
      head(kk, swim ? -0.1 : 0.45, swim ? 0.6 * Math.sin(t * 0.3 + c.jit * 3) : 0.9, swim ? 0.1 : 0.3)
      kk.rot(JAW, 0, 0, 0)
      kk.rot(TAIL, -0.05, 0, 0)
      for (const s of [1, -1]) kk.scale(s > 0 ? LEGL : LEGR, 1e-4)
      return
    }
    // standing family: stand (idle), alert, walk, run, peck (graze)
    const walk = moving && anim === 'walk'
    const run = moving && anim === 'run'
    const peck = anim === 'graze'
    const alert = anim === 'alert'
    const stride = (run ? 0.16 : 0.09) * k
    const freq = run ? clamp(c.speed / 0.3, 2, 5) : clamp(c.speed / 0.18, 1, 4)
    const S = walk || run ? (c.speed * 0.5) / Math.max(0.5, freq) : 0
    void stride
    let pitch = run ? -0.12 : -0.28
    if (peck) pitch = 0.25
    const bob = walk || run ? 0.006 * k * Math.abs(Math.sin(ph)) : 0
    const roll = walk ? 0.07 * Math.sin(ph) : run ? 0.04 * Math.sin(ph) : 0
    _off.set(0, bob + (alert ? 0.01 * k : 0), 0)
    kk.begin(_off, eq(pitch, 0, roll, _bq))
    showWings(kk, false)
    kk.rot(FOLD, 0, 0, 0)
    kk.rot(TAIL, peck ? -0.2 : 0.1, 0, 0)
    // the long call: head down, then thrown back with the bill wide
    const callT = (t * 0.07 + c.jit) % 1
    const call = !walk && !run && !peck ? smooth(0.9, 0.93, callT) * (1 - smooth(0.97, 1, callT)) : 0
    const callDown = !walk && !run && !peck ? Math.sin(Math.PI * smooth(0.86, 0.9, callT)) : 0
    if (peck) {
      const jab = Math.max(0, Math.sin(t * 5)) ** 3
      head(kk, 0.7 + 0.35 * jab, 0.25 * Math.sin(t * 0.7), 0.4)
      kk.rot(JAW, 0.15 * jab, 0, 0)
    } else if (alert) {
      head(kk, -0.45, 0.8 * Math.tanh(3 * Math.sin(t * 0.6 + c.jit * 5)), 0.35)
      kk.rot(JAW, 0, 0, 0)
    } else {
      const look = walk || run ? 0 : Math.sin(t * 0.3 + c.jit * 7) * 0.7
      const nod = walk ? 0.12 * Math.sin(2 * ph) : 0
      head(kk, (walk || run ? 0.1 : 0) + 0.5 * callDown - 0.8 * call + nod, look * (1 - call), 0.25 - 0.4 * call, 0)
      kk.rot(JAW, 0.45 * call, 0, 0)
    }
    legs(kk, (s, out) => {
      const rest = restFoot[s > 0 ? 0 : 1] ?? foot(s)
      out.copy(rest)
      if (S < 1e-4) return 0
      const q = (((c.phase + (s > 0 ? 0 : 0.5)) % 1) + 1) % 1
      const duty = run ? 0.4 : 0.6
      if (q < duty) {
        out.z += S / 2 - (S * q) / duty
        return 0
      }
      const u = (q - duty) / (1 - duty)
      out.z += -S / 2 + S * smooth(0, 1, u)
      out.y += (run ? 0.035 : 0.022) * k * Math.sin(Math.PI * u)
      return 0.6 * Math.sin(Math.PI * u)
    })
  }

  return {
    bones,
    build,
    bounds: new Sphere(v(0, 0.2, 0), 0.75 * k),
    lod: [5, 16],
    gait: (anim, speed) => {
      if (anim === 'fly') return { id: 'fly', freq: 2.7 }
      if (anim === 'swim') return { id: 'swim', freq: 1 }
      const moving = speed > 0.05
      if (anim === 'walk' && moving) return { id: 'walk', freq: clamp(speed / 0.18, 1, 4) }
      if (anim === 'run' && moving) return { id: 'run', freq: clamp(speed / 0.3, 2, 5) }
      return { id: anim === 'lie' || anim === 'fall' || anim === 'dead' || anim === 'graze' ? anim : 'stand', freq: 0 }
    },
    pose,
  }
}
