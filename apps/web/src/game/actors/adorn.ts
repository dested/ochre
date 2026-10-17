/**
 * Adornments: shell bead strings (neck, waist, wrists, ankles), a shell pendant, and ochre marks painted on the
 * face. Beads are small bone-white shells with a dark aperture, strung along a sagging path.
 */
import { Color, Matrix4, Quaternion, Vector3 } from 'three'
import type { BuildCtx } from './ctx'
import type { HeadShape } from './head'
import type { TorsoShape } from './figure'
import { B } from './rig'
import { lerp, mul, rigid, smooth, T, type SkinFn } from './geo'
import { BONE_WHITE, CORD, OCHRE, mixc, tone } from './looks'

const UP = new Vector3(0, 1, 0)

/** beads along a closed or open path; each bead's long axis follows the string */
function beadString(ctx: BuildCtx, pts: readonly Vector3[], br: number, skin: SkinFn, spacing = 1.25): void {
  if (ctx.gear.q < 1) {
    // far away the shells are sub-pixel: one pale cord in their place
    ctx.gear.at(new Matrix4(), skin).tube(pts, () => br * 0.75, BONE_WHITE.clone().multiplyScalar(0.92), 5)
    return
  }
  const rng = ctx.rng.fork(0xbe4d + pts.length)
  let acc = 0
  const step = br * 2 * spacing
  const q = new Quaternion()
  const dir = new Vector3()
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (!a || !b) continue
    const len = a.distanceTo(b)
    dir.subVectors(b, a).normalize()
    while (acc <= len) {
      const p = a.clone().lerp(b, acc / len)
      q.setFromUnitVectors(UP, dir)
      const c = BONE_WHITE.clone().multiplyScalar(rng.range(0.82, 1.04))
      const slot = tone(c, 0.45)
      const m = new Matrix4().compose(p, q, new Vector3(1, 1, 1))
      // a shell: long along the string, its aperture facing out
      ctx.gear.at(m, skin).ellipsoid(br * 0.72, br, br * 0.62, (_y, _t, v) => (v.z > br * 0.42 && Math.abs(v.x) < br * 0.16 ? slot : c), 7, 5)
      acc += step
    }
    acc -= len
  }
}

export function buildAdornments(ctx: BuildCtx, ts: TorsoShape, hs: HeadShape): void {
  const { d } = ctx
  const H = d.stature
  const br = lerp(0.0055, 0.0085, smooth(0, 16, d.age)) * (H / Math.max(0.6, H))
  const rng = ctx.rng.fork(0xad0)

  if (ctx.has('beads-neck')) {
    const strings = d.age >= 12 && rng.chance(0.5) ? 2 : 1
    for (let s = 0; s < strings; s++) {
      const drop = (d.topY - d.chestY) * (0.42 + s * 0.28) * rng.range(0.9, 1.1)
      const pts: Vector3[] = []
      const n = 48
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * Math.PI * 2
        const front = (0.5 + 0.5 * Math.cos(th)) ** 2
        const y = d.topY + d.neckR * 0.15 - drop * front
        const r = Math.max(ts.radius(th, Math.min(y, d.topY - 0.002)), d.neckR * 1.08) + br * 1.2 + (d.female ? d.bust * 0.006 * front : 0)
        pts.push(new Vector3(r * Math.sin(th), y, r * Math.cos(th)))
      }
      beadString(ctx, pts, br, rigid(B.chest))
    }
  }
  if (ctx.has('beads-waist') || d.age < 2.5) {
    const y = d.age < 2.5 ? d.waistY - (d.waistY - d.hipY) * 0.3 : d.beltY - 0.01 * H
    const pts: Vector3[] = []
    for (let i = 0; i <= 40; i++) {
      const th = (i / 40) * Math.PI * 2
      const r = ts.radius(th, y) + br * 1.4 + (d.age < 2.5 ? 0 : 0.008 * H)
      pts.push(new Vector3(r * Math.sin(th), y - 0.004 * H * Math.cos(th), r * Math.cos(th)))
    }
    beadString(ctx, pts, br * 0.9, rigid(B.hips))
  }
  // wrist and ankle bands on anyone with a neck string past infancy
  if (ctx.has('beads-neck') && d.age >= 3) {
    const wristY = d.shoulderJointY - d.upperArm - d.foreArm + d.wristR * 1.2
    for (const s of [1, -1] as const) {
      if (rng.chance(0.75)) ring(ctx, new Vector3(s * d.shoulderX, wristY, 0), d.wristR * 1.18, br * 0.85, rigid(s > 0 ? B.foreL : B.foreR), 1.3)
      if (rng.chance(0.6)) ring(ctx, new Vector3(s * d.hipX, d.ankleY + d.ankleR * 1.4, 0), d.ankleR * 1.3, br * 0.85, rigid(s > 0 ? B.shinL : B.shinR), 1)
    }
  }
  if (ctx.has('shell-pendant')) {
    const y0 = d.topY + d.neckR * 0.1
    const y1 = d.chestY + (d.shoulderY - d.chestY) * 0.3
    const pts: Vector3[] = []
    for (let i = 0; i <= 30; i++) {
      const th = (i / 30) * Math.PI * 2
      const front = (0.5 + 0.5 * Math.cos(th)) ** 3
      const y = lerp(y0, y1, front)
      const r = Math.max(ts.radius(th, Math.min(y, d.topY - 0.002)), d.neckR * 1.1) + 0.003 * H
      pts.push(new Vector3(r * Math.sin(th), y, r * Math.cos(th)))
    }
    ctx.gear.at(new Matrix4(), rigid(B.chest)).tube(pts, () => 0.0018 * H, CORD, 5)
    const pr = 0.012 * H
    const zf = ts.radius(0, y1) + pr * 0.5
    ctx.gear.at(T(0, y1 - pr * 0.9, zf), rigid(B.chest)).ellipsoid(pr * 0.7, pr, pr * 0.45, (_y, _t, v) => (v.z > pr * 0.25 && Math.abs(v.x) < pr * 0.12 ? tone(BONE_WHITE, 0.4) : BONE_WHITE), 12, 8)
  }
  if (ctx.has('ochre-face')) ochreFace(ctx, hs)
}

function ring(ctx: BuildCtx, c: Vector3, r: number, br: number, skin: SkinFn, depth: number): void {
  const pts: Vector3[] = []
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2
    pts.push(new Vector3(c.x + Math.sin(a) * r, c.y + Math.cos(a * 1) * r * 0.08, c.z + Math.cos(a) * r * depth))
  }
  beadString(ctx, pts, br, skin, 1.15)
}

/** ochre marks painted on the face as thin strips laid on the skin */
function ochreFace(ctx: BuildCtx, hs: HeadShape): void {
  const { d, skinC } = ctx
  const ry = d.ry
  const col = mixc(skinC, OCHRE, 0.78)
  const rng = ctx.rng.fork(0x0c4e)
  const style = rng.int(0, 2)
  const strip = (pts2: readonly [number, number][], w: number): void => {
    // grid along the polyline, w wide, lifted just off the skin; head-local (X, Y) in units of ry
    const n = pts2.length
    ctx.skin.at(new Matrix4(), rigid(B.head)).grid(Math.max(2, (n - 1) * 3), 2, (u, v, out) => {
      const f = u * (n - 1)
      const i = Math.min(n - 2, Math.floor(f))
      const t = f - i
      const a = pts2[i]
      const b = pts2[i + 1]
      if (!a || !b) return
      const X = lerp(a[0], b[0], t)
      const Y = lerp(a[1], b[1], t)
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const dl = Math.hypot(dx, dy) || 1
      const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, u * 1.02)))
      const ox = (-dy / dl) * (v - 0.5) * w * (0.4 + 0.6 * taper)
      const oy = (dx / dl) * (v - 0.5) * w * (0.4 + 0.6 * taper)
      const x = (X + ox) * ry
      const y = Y + oy
      const p = new Vector3(x, y * ry, hs.frontZ(x, y) + ry * 0.006).applyMatrix4(hs.centre)
      out.x = p.x
      out.y = p.y
      out.z = p.z
      out.c.copy(col)
    })
  }
  const ey = hs.eyeYn
  if (style === 0 || style === 2) {
    // a vertical line down the forehead
    strip([
      [0, hs.browYn + 0.34],
      [0, hs.browYn + 0.18],
      [0, hs.browYn + 0.04],
    ], 0.05)
  }
  if (style === 1 || style === 2) {
    // two short bars on each cheekbone
    for (const s of [1, -1] as const) {
      for (let k = 0; k < 2; k++) {
        const y = ey - 0.2 - k * 0.075
        strip([
          [s * 0.25, y + 0.01],
          [s * 0.38, y],
          [s * 0.5, y - 0.015],
        ], 0.04)
      }
    }
  }
  if (style === 0) {
    // one band across the nose and cheeks
    strip([
      [-0.52, ey - 0.2],
      [-0.25, ey - 0.16],
      [0, ey - 0.15],
      [0.25, ey - 0.16],
      [0.52, ey - 0.2],
    ], 0.045)
  }
  void Color
  void mul
}
