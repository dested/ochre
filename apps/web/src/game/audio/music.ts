/**
 * Sparse warm music: a soft hum drone (root, fifth and a breathy hummed tone) under short plucked-string phrases
 * in a pentatonic mode, separated by long silences. Each cue has its own key, pace and register; a cue change
 * glides the drone to the new root.
 */
import type { MusicCue } from '../contracts'
import { play, rand } from './synth'

type Style = {
  /** root of the phrase register, Hz */
  root: number
  scale: readonly number[]
  /** seconds per step */
  step: number
  phrase: readonly [number, number]
  rest: readonly [number, number]
  /** scale-degree span of the melody */
  span: number
  drone: number
}

const MINOR = [0, 3, 5, 7, 10]
const MAJOR = [0, 2, 4, 7, 9]

const STYLES: Record<Exclude<MusicCue, null>, Style> = {
  title: {
    root: 293.66,
    scale: MINOR,
    step: 0.55,
    phrase: [4, 7],
    rest: [6, 11],
    span: 7,
    drone: 1,
  },
  held: {
    root: 349.23,
    scale: MAJOR,
    step: 0.85,
    phrase: [3, 5],
    rest: [10, 18],
    span: 6,
    drone: 0.55,
  },
  small: {
    root: 392,
    scale: MAJOR,
    step: 0.42,
    phrase: [5, 8],
    rest: [9, 16],
    span: 8,
    drone: 0.7,
  },
  youth: { root: 220, scale: MINOR, step: 0.4, phrase: [5, 9], rest: [9, 15], span: 8, drone: 0.8 },
  provider: {
    root: 261.63,
    scale: MAJOR,
    step: 0.48,
    phrase: [4, 8],
    rest: [10, 17],
    span: 7,
    drone: 0.8,
  },
  elder: {
    root: 329.63,
    scale: MINOR,
    step: 0.8,
    phrase: [3, 5],
    rest: [12, 20],
    span: 5,
    drone: 0.9,
  },
  summary: {
    root: 293.66,
    scale: MAJOR,
    step: 0.6,
    phrase: [6, 10],
    rest: [4, 8],
    span: 9,
    drone: 1,
  },
}

export type Music = {
  cue(c: MusicCue): void
  /** schedule notes that start before `horizon` (ctx time) */
  schedule(horizon: number): void
  dispose(): void
}

export function createMusic(
  ctx: BaseAudioContext,
  out: AudioNode,
  pluck: (f: number) => AudioBuffer
): Music {
  const droneGain = ctx.createGain()
  droneGain.gain.value = 0
  const droneLp = ctx.createBiquadFilter()
  droneLp.type = 'lowpass'
  droneLp.frequency.value = 520
  droneLp.connect(droneGain).connect(out)
  // slow breathing tremolo on the drone
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.09
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.25
  const breath = ctx.createGain()
  breath.gain.value = 0.75
  lfo.connect(lfoDepth).connect(breath.gain)
  breath.connect(droneLp)

  const mk = (type: OscillatorType, gain: number, detune: number) => {
    const o = ctx.createOscillator()
    o.type = type
    o.detune.value = detune
    const g = ctx.createGain()
    g.gain.value = gain
    o.connect(g).connect(breath)
    return o
  }
  const low = mk('sine', 0.3, 0)
  const fifth = mk('sine', 0.12, 3)
  const hum = mk('sawtooth', 0.035, -4)
  const oscs = [lfo, low, fifth, hum]
  for (const o of oscs) o.start()

  let style: Style | null = null
  let nextPhrase = 0
  let queue: { t: number; freq: number; gain: number }[] = []
  let degree = 0

  const setRoot = (root: number, at: number, glide: number) => {
    low.frequency.setTargetAtTime(root / 4, at, glide)
    fifth.frequency.setTargetAtTime((root * 3) / 8, at, glide)
    hum.frequency.setTargetAtTime(root / 2, at, glide)
  }
  setRoot(STYLES.title.root, ctx.currentTime, 0.01)

  const freqOf = (s: Style, deg: number) => {
    const n = s.scale.length
    const oct = Math.floor(deg / n)
    const idx = ((deg % n) + n) % n
    return s.root * Math.pow(2, ((s.scale[idx] ?? 0) + 12 * oct) / 12)
  }

  const composePhrase = (s: Style, t0: number) => {
    const count = Math.round(rand(s.phrase[0], s.phrase[1]))
    let t = t0
    degree = Math.round(rand(0, s.span / 2))
    for (let i = 0; i < count; i++) {
      const last = i === count - 1
      // small steps, an occasional leap, end on the root or the fifth
      if (last) degree = Math.random() < 0.6 ? 0 : 3
      else {
        const leap =
          Math.random() < 0.18 ? (Math.random() < 0.5 ? -3 : 3) : Math.random() < 0.5 ? -1 : 1
        degree = Math.max(-2, Math.min(s.span, degree + leap))
      }
      const gain = (last ? 0.32 : 0.26) * rand(0.75, 1)
      queue.push({ t, freq: freqOf(s, degree), gain })
      // a quiet fifth under some notes
      if (Math.random() < 0.2) queue.push({ t, freq: freqOf(s, degree - 3), gain: gain * 0.5 })
      t += s.step * (Math.random() < 0.3 ? 2 : 1) * rand(0.92, 1.08)
    }
    return t
  }

  return {
    cue(c) {
      const now = ctx.currentTime
      queue = queue.filter((n) => n.t < now + 0.05)
      if (c === null) {
        style = null
        droneGain.gain.setTargetAtTime(0, now, 1.2)
        return
      }
      style = STYLES[c]
      setRoot(style.root, now, 1.5)
      droneGain.gain.setTargetAtTime(0.5 * style.drone, now, 2)
      nextPhrase = now + rand(2.5, 4.5)
    },
    schedule(horizon) {
      if (style && nextPhrase < horizon) {
        const end = composePhrase(style, Math.max(nextPhrase, ctx.currentTime + 0.05))
        nextPhrase = end + rand(style.rest[0], style.rest[1])
      }
      const keep: typeof queue = []
      for (const n of queue) {
        if (n.t < horizon) play(ctx, out, Math.max(n.t, ctx.currentTime), pluck(n.freq), n.gain)
        else keep.push(n)
      }
      queue = keep
    },
    dispose() {
      for (const o of oscs) o.stop()
      droneGain.disconnect()
    },
  }
}
