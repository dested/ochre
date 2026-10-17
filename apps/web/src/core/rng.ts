/**
 * Seeded randomness for world-gen and the sim. Never use Math.random() in those modules. Owned by the lead.
 */

/** a well-mixed 32-bit hash of an int and a salt (for sub-seeding: mix32(seed, 0x5eed)) */
export function mix32(a: number, b = 0): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  return (h ^ (h >>> 16)) >>> 0
}

/** hash a string to 32 bits (FNV-1a) */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 */
export class Rng {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0
  }
  /** [0, 1) */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  /** [a, b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }
  /** integer in [a, b] */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1))
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)]
    if (item === undefined) throw new Error('Rng.pick on an empty list')
    return item
  }
  /** a child stream that won't disturb this one's sequence */
  fork(salt: number): Rng {
    return new Rng(mix32(this.s, salt))
  }
}
