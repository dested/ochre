/**
 * Every SfxName as a small synth recipe. `SFX_NAMES` is the list the lab panel plays; `RECIPES` is keyed by it,
 * so a SfxName added to the contract fails typecheck here until it has a recipe.
 */
import type { SfxName } from '../contracts'
import { burst, makePluck, play, rand, tone, type Noise } from './synth'

export const SFX_NAMES = [
  'step-sand',
  'step-rock',
  'step-grass',
  'gather',
  'dig',
  'knap',
  'throw',
  'hit',
  'learn',
  'note',
  'fire-flare',
  'wave-crash',
  'gull',
  'hyena',
  'eland-snort',
  'heartbeat',
  'ui-click',
  'ui-open',
  'chapter',
] as const satisfies readonly SfxName[]

export type SfxKit = {
  ctx: BaseAudioContext
  noise: Noise
  /** cached plucks by rounded frequency */
  pluck(freq: number): AudioBuffer
}

type Recipe = (k: SfxKit, out: AudioNode, t: number) => void

export function pluckCache(ctx: BaseAudioContext): (freq: number) => AudioBuffer {
  const cache = new Map<number, AudioBuffer>()
  return (freq) => {
    const key = Math.round(freq * 10)
    let b = cache.get(key)
    if (!b) {
      b = makePluck(ctx, freq)
      cache.set(key, b)
    }
    return b
  }
}

/** a soft heart thump pair, also used by the stage-1 heartbeat bed */
export function heartbeat(k: SfxKit, out: AudioNode, t: number, gain: number): void {
  tone(k.ctx, out, t, { type: 'sine', freq: 90, freqTo: 42, glide: 0.09, dur: 0.18, gain, attack: 0.012, lowpass: 180 })
  tone(k.ctx, out, t + 0.27, { type: 'sine', freq: 80, freqTo: 40, glide: 0.08, dur: 0.16, gain: gain * 0.7, attack: 0.012, lowpass: 160 })
}

export function gullCall(k: SfxKit, out: AudioNode, t: number, gain: number): void {
  const n = 2 + Math.floor(Math.random() * 3)
  const base = rand(1100, 1500)
  for (let i = 0; i < n; i++) {
    const s = t + i * rand(0.2, 0.28)
    tone(k.ctx, out, s, { type: 'triangle', freq: base * 1.25, freqTo: base * 0.7, dur: 0.18, gain, attack: 0.02, lowpass: 3200 })
    tone(k.ctx, out, s, { type: 'sine', freq: base * 2.5, freqTo: base * 1.4, dur: 0.14, gain: gain * 0.25, attack: 0.02 })
  }
}

const PENT = [0, 2, 4, 7, 9]
const semi = (root: number, s: number) => root * Math.pow(2, s / 12)

export const RECIPES: Record<(typeof SFX_NAMES)[number], Recipe> = {
  'step-sand': (k, o, t) => burst(k.ctx, o, t, { buffer: k.noise.pink, dur: rand(0.1, 0.14), gain: 0.22, attack: 0.012, freq: 900, freqTo: 500 }),
  'step-rock': (k, o, t) => {
    burst(k.ctx, o, t, { buffer: k.noise.white, dur: 0.05, gain: 0.12, filter: 'bandpass', freq: rand(2200, 3000), q: 2 })
    tone(k.ctx, o, t, { type: 'sine', freq: rand(240, 320), freqTo: 160, dur: 0.07, gain: 0.12 })
  },
  'step-grass': (k, o, t) =>
    burst(k.ctx, o, t, { buffer: k.noise.white, dur: rand(0.14, 0.2), gain: 0.11, attack: 0.03, filter: 'bandpass', freq: rand(2800, 3800), q: 0.8 }),
  gather: (k, o, t) => {
    // wet shell clacks and a little trickle
    for (let i = 0; i < 3; i++) burst(k.ctx, o, t + i * rand(0.06, 0.11), { buffer: k.noise.white, dur: 0.035, gain: 0.4, filter: 'bandpass', freq: rand(1800, 3200), q: 4 })
    burst(k.ctx, o, t + 0.05, { buffer: k.noise.pink, dur: 0.35, gain: 0.12, attack: 0.05, filter: 'bandpass', freq: 1400, freqTo: 2600, q: 1.5 })
  },
  dig: (k, o, t) => {
    burst(k.ctx, o, t, { buffer: k.noise.brown, dur: 0.32, gain: 0.35, attack: 0.03, filter: 'bandpass', freq: 700, freqTo: 300, q: 1.2 })
    tone(k.ctx, o, t + 0.02, { type: 'sine', freq: 110, freqTo: 60, dur: 0.12, gain: 0.2 })
  },
  knap: (k, o, t) => {
    burst(k.ctx, o, t, { buffer: k.noise.white, dur: 0.03, gain: 0.3, filter: 'highpass', freq: 2500 })
    tone(k.ctx, o, t, { type: 'sine', freq: rand(2400, 3400), dur: 0.16, gain: 0.08, attack: 0.001 })
    tone(k.ctx, o, t, { type: 'sine', freq: rand(1100, 1500), dur: 0.09, gain: 0.06, attack: 0.001 })
  },
  throw: (k, o, t) => burst(k.ctx, o, t, { buffer: k.noise.pink, dur: 0.45, gain: 0.9, attack: 0.12, filter: 'bandpass', freq: 400, freqTo: 1800, q: 2.5 }),
  hit: (k, o, t) => {
    tone(k.ctx, o, t, { type: 'sine', freq: 120, freqTo: 55, dur: 0.22, gain: 0.45 })
    burst(k.ctx, o, t, { buffer: k.noise.brown, dur: 0.12, gain: 0.3, freq: 600 })
  },
  learn: (k, o, t) => {
    const root = 392
    play(k.ctx, o, t, k.pluck(root), 0.35)
    play(k.ctx, o, t + 0.16, k.pluck(semi(root, 7)), 0.3)
    play(k.ctx, o, t + 0.32, k.pluck(semi(root, 12)), 0.25)
  },
  note: (k, o, t) => {
    const root = 523.25
    PENT.forEach((s, i) => play(k.ctx, o, t + i * 0.09, k.pluck(semi(root, s)), 0.18))
    tone(k.ctx, o, t, { type: 'sine', freq: root * 2, dur: 1.4, gain: 0.03, attack: 0.3 })
  },
  'fire-flare': (k, o, t) => {
    burst(k.ctx, o, t, { buffer: k.noise.brown, dur: 0.9, gain: 0.4, attack: 0.15, freq: 200, freqTo: 1600 })
    for (let i = 0; i < 6; i++) burst(k.ctx, o, t + rand(0.05, 0.8), { buffer: k.noise.white, dur: 0.012, gain: 0.15, filter: 'highpass', freq: rand(2500, 5000) })
  },
  'wave-crash': (k, o, t) => {
    burst(k.ctx, o, t, { buffer: k.noise.brown, dur: 1.8, gain: 0.7, attack: 0.08, freq: 1400, freqTo: 300 })
    burst(k.ctx, o, t + 0.05, { buffer: k.noise.white, dur: 1.4, gain: 0.12, attack: 0.1, filter: 'highpass', freq: 3000 })
  },
  gull: (k, o, t) => gullCall(k, o, t, 0.12),
  hyena: (k, o, t) => {
    for (let i = 0; i < 2; i++) {
      const s = t + i * 1.1
      tone(k.ctx, o, s, { type: 'triangle', freq: 280, freqTo: 900, dur: 0.85, gain: 0.14, attack: 0.08, lowpass: 2400 })
      tone(k.ctx, o, s, { type: 'sine', freq: 560, freqTo: 1750, dur: 0.85, gain: 0.03, attack: 0.08 })
    }
  },
  'eland-snort': (k, o, t) => {
    burst(k.ctx, o, t, { buffer: k.noise.pink, dur: 0.28, gain: 0.8, attack: 0.01, filter: 'bandpass', freq: 520, freqTo: 380, q: 1.2 })
    burst(k.ctx, o, t + 0.12, { buffer: k.noise.pink, dur: 0.18, gain: 0.5, filter: 'bandpass', freq: 460, q: 1.2 })
  },
  heartbeat: (k, o, t) => heartbeat(k, o, t, 0.5),
  'ui-click': (k, o, t) => {
    tone(k.ctx, o, t, { type: 'sine', freq: 1250, freqTo: 900, dur: 0.05, gain: 0.08, attack: 0.001 })
    burst(k.ctx, o, t, { buffer: k.noise.white, dur: 0.015, gain: 0.04, filter: 'bandpass', freq: 3000, q: 2 })
  },
  'ui-open': (k, o, t) => {
    // a woody two-note marimba
    tone(k.ctx, o, t, { type: 'sine', freq: 587, dur: 0.35, gain: 0.08, attack: 0.002 })
    tone(k.ctx, o, t, { type: 'sine', freq: 587 * 4, dur: 0.06, gain: 0.015, attack: 0.001 })
    tone(k.ctx, o, t + 0.09, { type: 'sine', freq: 880, dur: 0.4, gain: 0.07, attack: 0.002 })
  },
  chapter: (k, o, t) => {
    const root = 146.83
    tone(k.ctx, o, t, { type: 'sine', freq: root / 2, dur: 4, gain: 0.12, attack: 1.2 })
    tone(k.ctx, o, t, { type: 'sine', freq: (root * 3) / 4, dur: 4, gain: 0.06, attack: 1.5 })
    ;[0, 7, 12, 16, 19].forEach((s, i) => play(k.ctx, o, t + 0.4 + i * 0.22, k.pluck(semi(root * 2, s)), 0.22))
  },
}
