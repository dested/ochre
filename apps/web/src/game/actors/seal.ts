/**
 * The Cape fur seal: a torpedo body swept from tail to nose, big bare foreflippers, webbed hind flippers that turn
 * forward to walk, small rolled ears and whiskers. Bulls are bigger and darker with a heavy neck. On land it sits up on
 * its foreflippers (idle, alert), galumphs (walk) or bounds (run); it swims with its foreflippers like wings, sleeps
 * prone with its chin down, and rolls onto its side to fall and die.
 */
import { Color, Quaternion, Sphere, Vector3 } from 'three'
import type { AnimalAnim } from '../contracts'
import { Rng, mix32 } from '~/core/rng'
import { chainSkin, eq, type AnimalCtx, type BoneDef, type Kin, type Plan } from './beast'
import { MeshBuilder, T, bump, fbm3, lerp, profile, rigid, smooth } from './geo'
import { mixc, tone } from './looks'
import { frame, limb } from './quadruped'

const ROOT = 0
const PELVIS = 1
const SPINE = 2
const CHEST = 3
const NECK = 4
const HEAD = 5
const JAW = 6
const FL_ARM = 7
const FL_HAND = 8
const FR_ARM = 9
const FR_HAND = 10
const HL = 11
const HR = 12
const N = 13

const BODY = profile([
  [0, 0.06],
  [0.05, 0.3],
  [0.15, 0.55],
  [0.3, 0.82],
  [0.45, 0.97],
  [0.56, 1],
  [0.66, 0.86],
  [0.74, 0.62],
  [0.8, 0.55],
  [0.86, 0.56],
  [0.92, 0.45],
  [0.97, 0.24],
  [1, 0],
])
const FORE = profile([
  [0, 0.55],
  [0.12, 0.62],
  [0.45, 0.52],
  [0.8, 0.32],
  [0.95, 0.18],
  [1, 0],
])
const HIND = profile([
  [0, 0.35],
  [0.3, 0.42],
  [0.75, 0.7],
  [0.92, 0.72],
  [1, 0],
])

type Spec = { L: number; R: number; yc: number; back: Color; belly: Color; dark: Color; flip: Color; male: boolean }

function specFor(seed: number): Spec {
  const rng = new Rng(mix32(seed, 0x5ea1))
  rng.next()
  const male = rng.chance(0.4)
  const s = rng.range(0.93, 1.07)
  const L = (male ? 2.0 : 1.55) * s
  const R = L * (male ? 0.15 : 0.13)
  const k = rng.range(0.92, 1.08)
  return {
    L,
    R,
    yc: R * 0.9,
    back: (male ? new Color('#463a31') : new Color('#6e5b4a')).multiplyScalar(k),
    belly: (male ? new Color('#6a5848') : new Color('#a08a70')).multiplyScalar(k),
    dark: new Color('#2a221d'),
    flip: new Color('#2c2420'),
    male,
  }
}

const _off = new Vector3()
const _bq = new Quaternion()
const _d = new Vector3()
const _e = new Vector3()

export function sealPlan(seed: number): Plan {
  const sp = specFor(seed)
  const { L, R, yc } = sp
  const z = (t: number): number => (t - 0.55) * L
  // the snout dips a little below the body line
  const cy = (t: number): number => yc - 0.08 * R * smooth(0.85, 1, t)
  const rAt = (t: number): number => R * BODY(t) * (sp.male ? 1 + 0.22 * bump(((t - 0.7) / 0.08) ** 2) : 1)
  const at = (t: number): Vector3 => new Vector3(0, cy(t), z(t))
  const v = (x: number, y: number, zz: number): Vector3 => new Vector3(x, y, zz)

  const shoulder = (s: number): Vector3 => v(s * 0.55 * R, yc - 0.3 * R, z(0.6))
  const wrist = (s: number): Vector3 => v(s * 0.97 * R, yc - 0.68 * R, z(0.62))
  const hip = (s: number): Vector3 => v(s * 0.22 * R, yc - 0.4 * R, z(0.05))
  const foreDir = (s: number): Vector3 => v(s * 0.72, -0.12, -0.68).normalize()
  const hindDir = (s: number): Vector3 => v(s * 0.3, -0.12, -0.95).normalize()
  const Lf = 0.24 * L
  const Lh = 0.17 * L

  const bones: BoneDef[] = Array.from({ length: N }, () => ({ name: '', parent: 0, at: v(0, 0, 0) }))
  const set = (i: number, name: string, parent: number, p: Vector3): void => {
    bones[i] = { name, parent, at: p }
  }
  set(ROOT, 'root', 0, v(0, 0, 0))
  set(PELVIS, 'pelvis', ROOT, at(0.22))
  set(SPINE, 'spine', PELVIS, at(0.42))
  set(CHEST, 'chest', SPINE, at(0.6))
  set(NECK, 'neck', CHEST, at(0.72))
  set(HEAD, 'head', NECK, at(0.83))
  set(JAW, 'jaw', HEAD, at(0.88).add(v(0, -0.28 * R, 0)))
  set(FL_ARM, 'flArm', CHEST, shoulder(1))
  set(FL_HAND, 'flHand', FL_ARM, wrist(1))
  set(FR_ARM, 'frArm', CHEST, shoulder(-1))
  set(FR_HAND, 'frHand', FR_ARM, wrist(-1))
  set(HL, 'hindL', PELVIS, hip(1))
  set(HR, 'hindR', PELVIS, hip(-1))

  const build = (body: MeshBuilder, detail: MeshBuilder): void => {
    const skin = chainSkin([PELVIS, SPINE, CHEST, NECK, HEAD], [at(0), at(0.42), at(0.6), at(0.72), at(0.83), at(1)], 0.06 * L)
    const mane = new Color(sp.male ? '#33291f' : '#5e4c3e')
    body.at(T(0, 0, 0), skin).grid(
      26,
      44,
      (u, vv, out) => {
        const t = vv
        const r = rAt(t)
        const th = -u * Math.PI * 2
        const s = Math.sin(th)
        const c = Math.cos(th)
        out.x = r * s
        out.y = cy(t) + r * (c > 0 ? c * 0.92 : c * 0.78)
        out.z = z(t)
        const o = out.c.copy(sp.belly).lerp(sp.back, smooth(-0.4, 0.35, c))
        o.multiplyScalar(0.9 + 0.2 * fbm3(out.x * 7, out.y * 7, out.z * 7, seed))
        // a darker, heavier mane on the neck; a grizzled crown; a dark muzzle
        o.lerp(mane, (sp.male ? 0.6 : 0.25) * bump(((t - 0.7) / 0.08) ** 2) * smooth(-0.3, 0.4, c))
        if (!sp.male) o.lerp(new Color('#8a7a6a'), 0.25 * smooth(0.8, 0.86, t) * (1 - smooth(0.9, 0.95, t)) * smooth(0, 0.6, c))
        o.lerp(sp.dark, 0.6 * smooth(0.94, 0.99, t))
      },
      { wrapU: true },
    )
    for (const s of [1, -1]) {
      // the furred arm, then the bare foreflipper laid flat
      const sh = shoulder(s)
      const wr = wrist(s)
      const tip = wr.clone().addScaledVector(foreDir(s), Lf)
      limb(body, sh, wr, 0.3 * R, 0.16 * R, sp.back, chainSkin([s > 0 ? FL_ARM : FR_ARM, s > 0 ? FL_HAND : FR_HAND], [sh, wr, tip], 0.02), 1.3, 10)
      body.at(frame(wr, foreDir(s), v(0, 1, 0)), rigid(s > 0 ? FL_HAND : FR_HAND)).lathe({
        y0: -0.02 * L,
        y1: Lf,
        r: (y) => 0.058 * L * FORE(Math.max(0, y) / Lf),
        depth: 0.2,
        segs: 12,
        rings: 10,
        color: (y) => tone(sp.flip, 1 + 0.25 * smooth(0.7, 1, y / Lf)),
      })
      // the webbed hind flipper with its toe ridges
      const hp = hip(s)
      body.at(frame(hp, hindDir(s), v(0, 1, 0)), rigid(s > 0 ? HL : HR)).lathe({
        y0: -0.02 * L,
        y1: Lh,
        r: (y) => 0.05 * L * HIND(Math.max(0, y) / Lh),
        depth: 0.18,
        segs: 12,
        rings: 10,
        color: (y, th) => tone(sp.flip, 1 + (y > Lh * 0.7 ? 0.25 * Math.max(0, Math.sin(th * 5)) : 0)),
      })
      // eyes, nose, ears, whiskers
      const te = 0.905
      const re = rAt(te)
      const eye = v(s * re * 0.64, cy(te) + re * 0.34, z(te))
      detail.at(T(eye.x, eye.y, eye.z), rigid(HEAD)).ellipsoid(0.1 * R, 0.085 * R, 0.1 * R, new Color('#0c0908'), 10, 8)
      const ear = v(s * rAt(0.86) * 0.5, cy(0.86) + rAt(0.86) * 0.62, z(0.86))
      detail.at(T(0, 0, 0), rigid(HEAD)).tube([ear, ear.clone().add(v(s * 0.02, 0.012, -0.03).multiplyScalar(L / 1.6))], (t) => 0.012 * (1 - 0.6 * t) * (L / 1.6), sp.dark, 6)
      for (let w = 0; w < 4; w++) {
        const tw = 0.955 + w * 0.008
        const base = v(s * rAt(tw) * 0.7, cy(tw) - rAt(tw) * (0.1 + w * 0.12), z(tw))
        const len = (0.08 + 0.012 * w) * (L / 1.6)
        const pts = [0, 0.33, 0.66, 1].map((k) => base.clone().add(v(s * len * k * 0.85, -len * 0.25 * k * k - len * 0.05 * w * k, -len * 0.45 * k)))
        detail.at(T(0, 0, 0), rigid(HEAD)).tube(pts, (t) => 0.0016 * (1 - 0.6 * t), new Color('#e6dcc6'), 5)
      }
    }
    const nose = at(0.995)
    detail.at(T(nose.x, nose.y + 0.02 * R, nose.z), rigid(HEAD)).ellipsoid(0.1 * R, 0.07 * R, 0.06 * R, new Color('#14100e'), 8, 6)
    // the lower jaw line: a dark lip seam so the bark reads
    detail.at(frame(at(0.89).add(v(0, -0.2 * R, 0)), v(0, -0.1, 1), v(0, 1, 0)), rigid(JAW)).lathe({
      y0: 0,
      y1: 0.065 * L,
      r: (y) => 0.12 * R * Math.sin(Math.PI * Math.min(1, (y / (0.065 * L)) * 0.95 + 0.05)) ** 0.6,
      depth: 0.6,
      segs: 10,
      rings: 8,
      color: mixc(sp.belly, sp.dark, 0.5),
    })
  }

  /** the sitting posture: amt 0 lies flat, 1 sits up on the foreflippers */
  const sit = (k: Kin, amt: number, neckUp: number, yaw: number, nod: number, sway: number): void => {
    k.rot(SPINE, -0.22 * amt, sway * 0.6, 0)
    k.rot(CHEST, -0.32 * amt, -sway * 0.3, 0)
    k.rot(NECK, -0.5 * amt - neckUp, yaw * 0.6 - sway * 0.4, 0)
    k.rot(HEAD, 0.72 * amt + neckUp * 0.6 + nod, yaw * 0.4, 0)
  }
  const fore = (k: Kin, s: number, arm: Vector3, blade: Vector3): void => {
    const a = s > 0 ? FL_ARM : FR_ARM
    const h = s > 0 ? FL_HAND : FR_HAND
    k.point(a, h, _d.copy(arm).normalize())
    k.aim(h, foreDir(s), _e.copy(blade).normalize())
  }
  const hind = (k: Kin, s: number, dir: Vector3): void => {
    k.aim(s > 0 ? HL : HR, hindDir(s), _e.copy(dir).normalize())
  }

  const pose = (anim: AnimalAnim, c: AnimalCtx, k: Kin): void => {
    const t = c.t + c.jit * 30
    const ph = c.phase * Math.PI * 2
    const breathe = Math.sin(t * 1.1)
    const moving = c.speed > 0.05
    if (anim === 'fall' || anim === 'dead') {
      const f = anim === 'dead' ? 1 : smooth(0, 1.1, c.animT)
      _off.set(0, (R - yc) * f, 0)
      k.begin(_off, eq(0, 0, -1.4 * f, _bq))
      sit(k, lerp(0.8, 0, f), 0, 0.3 * f, 0.25 * f, 0)
      k.rot(JAW, 0.12 * f, 0, 0)
      fore(k, 1, _d.set(0.4, -0.4 + 0.9 * f, 0.2), v(0.6, 0.5 * f, -0.4))
      fore(k, -1, _d.set(-0.4, -1, 0.1), v(-0.75, -0.1, -0.5))
      hind(k, 1, v(0.4, 0.2 * f, -0.9))
      hind(k, -1, v(-0.3, -0.12, -0.95))
      return
    }
    if (anim === 'lie') {
      // asleep, prone, the chin on the ground; the breath lifts the back
      _off.set(0, 0.004 * L * breathe, 0)
      k.begin(_off, eq(0, 0, 0.28, _bq))
      sit(k, 0, -0.08, 0.35 * Math.sin(t * 0.05 + c.jit * 5), 0.1, 0)
      k.rot(JAW, 0, 0, 0)
      fore(k, 1, v(0.9, -0.5, 0.05), v(0.7, -0.1, -0.7))
      fore(k, -1, v(-0.9, -0.5, 0.05), v(-0.7, -0.15, -0.7))
      hind(k, 1, v(0.4, -0.1, -0.9))
      hind(k, -1, v(-0.35, -0.15, -0.92))
      return
    }
    if (anim === 'swim') {
      // horizontal and mostly under, the foreflippers beating like wings, the hind pair trailing
      _off.set(0, -yc * 0.85 + 0.01 * L * Math.sin(ph), 0)
      k.begin(_off, eq(0.05 * Math.sin(ph + 1), 0, 0, _bq))
      k.rot(SPINE, 0.05 * Math.sin(ph), 0, 0)
      k.rot(CHEST, 0.04 * Math.sin(ph + 0.6), 0, 0)
      k.rot(NECK, -0.15, 0.2 * Math.sin(t * 0.3), 0)
      k.rot(HEAD, 0.12, 0, 0)
      k.rot(JAW, 0, 0, 0)
      for (const s of [1, -1]) {
        fore(k, s, v(s * 0.7, -0.55 + 0.3 * Math.sin(ph), -0.1), v(s * 0.8, -0.55 * Math.sin(ph), -0.3 + 0.3 * Math.cos(ph)))
        hind(k, s, v(s * 0.12 + 0.1 * Math.sin(ph * 0.5), -0.05, -1))
      }
      return
    }
    const walk = moving && anim === 'walk'
    const run = moving && anim === 'run'
    const alert = anim === 'alert'
    let amt = alert ? 1.1 : 1
    let neckUp = alert ? 0.25 : 0
    let yaw = alert ? 0.6 * Math.tanh(4 * Math.sin(t * 0.45 + c.jit * 4)) : Math.sin(t * 0.21 + c.jit * 7) * 0.5 + Math.sin(t * 0.09) * 0.25
    let nod = 0
    let bob = 0
    let sway = 0
    let roll = 0
    let arch = 0
    // now and then the bark: the head tips up and the mouth opens
    const barkT = (t * 0.09 + c.jit) % 1
    const bark = !walk && !run ? Math.sin(Math.PI * smooth(0.9, 0.97, barkT)) : 0
    if (walk) {
      amt = 0.65
      yaw *= 0.2
      sway = 0.12 * Math.sin(ph)
      bob = 0.012 * L * (1 - Math.cos(2 * ph)) * 0.5
      roll = 0.04 * Math.sin(ph)
    } else if (run) {
      amt = 0.45
      yaw = 0
      neckUp = -0.1
      arch = 0.18 * Math.sin(ph)
      bob = 0.03 * L * Math.max(0, Math.sin(ph))
    }
    nod -= 0.35 * bark
    _off.set(0, bob + 0.003 * L * breathe, 0)
    k.begin(_off, eq(0, 0, roll, _bq))
    sit(k, amt, neckUp + 0.1 * bark, yaw, nod, sway)
    if (arch !== 0) {
      k.rot(SPINE, -0.22 * amt + arch, 0, 0)
      k.rot(CHEST, -0.32 * amt + arch * 0.6, 0, 0)
      k.rot(NECK, -0.5 * amt - neckUp - arch * 0.5, 0, 0)
      k.rot(HEAD, 0.72 * amt + neckUp * 0.6 + arch * 0.3, 0, 0)
    }
    k.rot(JAW, 0.35 * bark, 0, 0)
    for (const s of [1, -1]) {
      // the foreflippers: planted beside the chest, stepping in turn (walk) or together (run)
      const p = run ? ph : ph + (s > 0 ? 0 : Math.PI)
      const step = walk || run ? Math.sin(p) : 0
      const lift = walk || run ? Math.max(0, Math.cos(p)) : 0
      const fan = !walk && !run ? 0.25 * smooth(0.6, 0.9, Math.sin(t * 0.3 + s + c.jit * 3)) : 0
      fore(k, s, v(s * 0.28, -1 + 0.35 * lift, 0.15 + 0.4 * step), v(s * 0.72, -0.02 + 0.3 * lift + fan, 0.55 + 0.25 * step))
      // the hind flippers turned forward under the body, stepping a quarter behind
      const hp = run ? ph + Math.PI : ph + Math.PI / 2 + (s > 0 ? 0 : Math.PI)
      const hs = walk || run ? Math.sin(hp) : 0
      const hl = walk || run ? Math.max(0, Math.cos(hp)) : 0
      hind(k, s, v(s * 0.55, -0.1 + 0.25 * hl, 0.7 + 0.2 * hs))
    }
  }

  return {
    bones,
    build,
    bounds: new Sphere(v(0, R, 0), L * 0.65),
    lod: [8, 24],
    gait: (anim, speed) => {
      if (anim === 'swim') return { id: 'swim', freq: 0.35 + 0.35 * speed }
      const moving = speed > 0.05
      if (anim === 'walk' && moving) return { id: 'galumph', freq: Math.min(2.2, Math.max(0.6, speed / (0.3 * L))) }
      if (anim === 'run' && moving) return { id: 'bound', freq: Math.min(3, Math.max(1.2, speed / (0.55 * L))) }
      return { id: anim === 'lie' || anim === 'fall' || anim === 'dead' ? anim : 'sit', freq: 0 }
    },
    pose,
  }
}
