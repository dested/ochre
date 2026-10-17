/**
 * Seeded gradient noise for world-gen (and the view's far field). Three-free, deterministic for a seed: the
 * permutation comes from core/rng, never Math.random().
 */
import { Rng } from '../core/rng'

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function makePerm(seed: number): Uint8Array {
  const rng = new Rng(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const t = p[i] ?? 0
    p[i] = p[j] ?? 0
    p[j] = t
  }
  const out = new Uint8Array(512)
  for (let i = 0; i < 512; i++) out[i] = p[i & 255] ?? 0
  return out
}

/** 2D gradient noise in about [−1, 1], plus fbm and ridged sums */
export class Noise2 {
  private readonly p: Uint8Array
  constructor(seed: number) {
    this.p = makePerm(seed)
  }

  private grad(h: number, x: number, y: number): number {
    switch (h & 7) {
      case 0:
        return x + y
      case 1:
        return -x + y
      case 2:
        return x - y
      case 3:
        return -x - y
      case 4:
        return x
      case 5:
        return -x
      case 6:
        return y
      default:
        return -y
    }
  }

  at(x: number, y: number): number {
    const p = this.p
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const X = xi & 255
    const Y = yi & 255
    const u = fade(xf)
    const v = fade(yf)
    const a = (p[X] ?? 0) + Y
    const b = (p[X + 1] ?? 0) + Y
    const aa = p[a] ?? 0
    const ab = p[a + 1] ?? 0
    const ba = p[b] ?? 0
    const bb = p[b + 1] ?? 0
    const x1 = this.grad(aa, xf, yf) + u * (this.grad(ba, xf - 1, yf) - this.grad(aa, xf, yf))
    const x2 = this.grad(ab, xf, yf - 1) + u * (this.grad(bb, xf - 1, yf - 1) - this.grad(ab, xf, yf - 1))
    return (x1 + v * (x2 - x1)) * 0.75
  }

  /** fractal sum normalised to about [−1, 1] */
  fbm(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    let sum = 0
    let amp = 1
    let norm = 0
    let f = 1
    for (let o = 0; o < octaves; o++) {
      sum += this.at(x * f + o * 17.3, y * f - o * 9.1) * amp
      norm += amp
      amp *= gain
      f *= lacunarity
    }
    return sum / norm
  }

  /** ridged sum in [0, 1]: sharp crests (rock ledges, ridgelines) */
  ridged(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    let sum = 0
    let amp = 1
    let norm = 0
    let f = 1
    let prev = 1
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.at(x * f + o * 31.7, y * f + o * 7.9))
      n *= n
      sum += n * amp * prev
      prev = n
      norm += amp
      amp *= gain
      f *= lacunarity
    }
    return sum / norm
  }
}

/** 3D gradient noise in about [−1, 1] (the cave's rock) */
export class Noise3 {
  private readonly p: Uint8Array
  constructor(seed: number) {
    this.p = makePerm(seed)
  }

  private grad(h: number, x: number, y: number, z: number): number {
    const hh = h & 15
    const u = hh < 8 ? x : y
    const v = hh < 4 ? y : hh === 12 || hh === 14 ? x : z
    return ((hh & 1) === 0 ? u : -u) + ((hh & 2) === 0 ? v : -v)
  }

  at(x: number, y: number, z: number): number {
    const p = this.p
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const xf = x - xi
    const yf = y - yi
    const zf = z - zi
    const X = xi & 255
    const Y = yi & 255
    const Z = zi & 255
    const u = fade(xf)
    const v = fade(yf)
    const w = fade(zf)
    const A = (p[X] ?? 0) + Y
    const AA = (p[A] ?? 0) + Z
    const AB = (p[A + 1] ?? 0) + Z
    const B = (p[X + 1] ?? 0) + Y
    const BA = (p[B] ?? 0) + Z
    const BB = (p[B + 1] ?? 0) + Z
    const g = (i: number, dx: number, dy: number, dz: number) => this.grad(p[i] ?? 0, xf - dx, yf - dy, zf - dz)
    const l = (a: number, b: number, t: number) => a + t * (b - a)
    return l(
      l(l(g(AA, 0, 0, 0), g(BA, 1, 0, 0), u), l(g(AB, 0, 1, 0), g(BB, 1, 1, 0), u), v),
      l(l(g(AA + 1, 0, 0, 1), g(BA + 1, 1, 0, 1), u), l(g(AB + 1, 0, 1, 1), g(BB + 1, 1, 1, 1), u), v),
      w,
    )
  }

  fbm(x: number, y: number, z: number, octaves: number): number {
    let sum = 0
    let amp = 1
    let norm = 0
    let f = 1
    for (let o = 0; o < octaves; o++) {
      sum += this.at(x * f + o * 5.3, y * f - o * 3.1, z * f + o * 1.7) * amp
      norm += amp
      amp *= 0.5
      f *= 2
    }
    return sum / norm
  }
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
