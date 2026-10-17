/**
 * Procedural building blocks: noise buffers, Karplus-Strong plucks, a generated room impulse, and two one-shot
 * voices (filtered noise burst, swept tone) that free themselves when done. No samples anywhere.
 */

export type Noise = { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer }

export function makeNoise(ctx: AudioContext, seconds = 3): Noise {
  const n = Math.floor(ctx.sampleRate * seconds)
  const white = ctx.createBuffer(1, n, ctx.sampleRate)
  const pink = ctx.createBuffer(1, n, ctx.sampleRate)
  const brown = ctx.createBuffer(1, n, ctx.sampleRate)
  const w = white.getChannelData(0)
  const p = pink.getChannelData(0)
  const b = brown.getChannelData(0)
  // Paul Kellet's pink filter; brown is leaky integrated white
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1
    w[i] = x
    b0 = 0.99886 * b0 + x * 0.0555179
    b1 = 0.99332 * b1 + x * 0.0750759
    b2 = 0.969 * b2 + x * 0.153852
    b3 = 0.8665 * b3 + x * 0.3104856
    b4 = 0.55 * b4 + x * 0.5329522
    b5 = -0.7616 * b5 - x * 0.016898
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11
    b6 = x * 0.115926
    last = (last + 0.02 * x) / 1.02
    b[i] = last * 3.5
  }
  return { white, pink, brown }
}

/** a plucked string at `freq`, normalised, `seconds` long */
export function makePluck(ctx: AudioContext, freq: number, seconds = 3, brightness = 0.45): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * seconds)
  const buf = ctx.createBuffer(1, n, sr)
  const out = buf.getChannelData(0)
  const period = Math.max(2, Math.round(sr / freq))
  const ring = new Float32Array(period)
  let prev = 0
  for (let i = 0; i < period; i++) {
    prev += brightness * (Math.random() * 2 - 1 - prev)
    ring[i] = prev
  }
  // extra loss so low notes don't ring forever: -60 dB over ~2.4 s
  const loss = Math.pow(0.001, 1 / (2.4 * sr))
  let idx = 0
  let peak = 0
  for (let i = 0; i < n; i++) {
    const next = (idx + 1) % period
    const a = ring[idx] ?? 0
    const v = (a + (ring[next] ?? 0)) * 0.5 * loss
    ring[idx] = v
    out[i] = a
    peak = Math.max(peak, Math.abs(a))
    idx = next
  }
  const fade = Math.floor(sr * 0.05)
  const scale = peak > 0 ? 0.8 / peak : 1
  for (let i = 0; i < n; i++) {
    const tail = i > n - fade ? (n - i) / fade : 1
    out[i] = (out[i] ?? 0) * scale * tail
  }
  return buf
}

/** a soft stereo room: decaying noise with a darkening tail */
export function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * seconds)
  const buf = ctx.createBuffer(2, n, sr)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let lp = 0
    for (let i = 0; i < n; i++) {
      const t = i / n
      const k = 0.9 - 0.75 * t
      lp += k * (Math.random() * 2 - 1 - lp)
      d[i] = lp * Math.pow(1 - t, decay)
    }
  }
  return buf
}

export function envelope(g: GainNode, t: number, peak: number, attack: number, dur: number): void {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.005, dur))
}

export type BurstOpts = {
  buffer: AudioBuffer
  dur: number
  gain: number
  attack?: number
  filter?: BiquadFilterType
  freq?: number
  freqTo?: number
  q?: number
  rate?: number
}

/** a filtered slice of a noise buffer */
export function burst(ctx: AudioContext, dest: AudioNode, t: number, o: BurstOpts): void {
  const src = ctx.createBufferSource()
  src.buffer = o.buffer
  src.playbackRate.value = o.rate ?? 1
  const f = ctx.createBiquadFilter()
  f.type = o.filter ?? 'lowpass'
  f.frequency.setValueAtTime(o.freq ?? 1000, t)
  if (o.freqTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqTo), t + o.dur)
  f.Q.value = o.q ?? 0.7
  const g = ctx.createGain()
  envelope(g, t, o.gain, o.attack ?? 0.004, o.dur)
  src.connect(f).connect(g).connect(dest)
  const offset = Math.random() * Math.max(0, o.buffer.duration - o.dur - 0.1)
  src.start(t, offset)
  src.stop(t + o.dur + 0.05)
  src.onended = () => g.disconnect()
}

export type ToneOpts = {
  type: OscillatorType
  freq: number
  freqTo?: number
  /** seconds over which freq glides to freqTo (default dur) */
  glide?: number
  dur: number
  gain: number
  attack?: number
  /** optional lowpass on the voice */
  lowpass?: number
}

export function tone(ctx: AudioContext, dest: AudioNode, t: number, o: ToneOpts): void {
  const osc = ctx.createOscillator()
  osc.type = o.type
  osc.frequency.setValueAtTime(o.freq, t)
  if (o.freqTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.freqTo), t + (o.glide ?? o.dur))
  const g = ctx.createGain()
  envelope(g, t, o.gain, o.attack ?? 0.005, o.dur)
  if (o.lowpass !== undefined) {
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = o.lowpass
    osc.connect(f).connect(g)
  } else osc.connect(g)
  g.connect(dest)
  osc.start(t)
  osc.stop(t + o.dur + 0.05)
  osc.onended = () => g.disconnect()
}

/** play a prepared buffer (a pluck) once */
export function play(ctx: AudioContext, dest: AudioNode, t: number, buffer: AudioBuffer, gain: number, rate = 1): void {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = rate
  const g = ctx.createGain()
  g.gain.value = gain
  src.connect(g).connect(dest)
  src.start(t)
  src.onended = () => g.disconnect()
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a)
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
