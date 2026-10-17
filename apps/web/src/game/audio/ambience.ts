/**
 * The world bed, driven by the latest AudioFrame: surf (a rumble plus scheduled swells that rise, crash and hiss
 * back), wind with gusts, rain, the fire's roar and crackle, birds and gulls by day, crickets and frogs at night,
 * and the heartbeat under the stage-1 muffle. `apply` sets the continuous levels; `schedule` places the discrete
 * sounds a little ahead of the clock.
 */
import type { AudioFrame } from '../contracts'
import { gullCall, heartbeat, type SfxKit } from './sfx'
import { burst, clamp01, rand, tone } from './synth'

export type Ambience = {
  /** `presence` 0..1 scales the whole bed (0 with no frame, low while paused) */
  apply(f: AudioFrame | null, presence: number): void
  schedule(horizon: number): void
  dispose(): void
}

/** looped noise through a filter into a gain; returns both so levels and filters can move */
function bed(
  k: SfxKit,
  buffer: AudioBuffer,
  type: BiquadFilterType,
  freq: number,
  q: number,
  out: AudioNode
) {
  const src = k.ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const f = k.ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = k.ctx.createGain()
  g.gain.value = 0
  src.connect(f).connect(g).connect(out)
  src.start(0, Math.random() * buffer.duration)
  return { src, f, g }
}

export function createAmbience(k: SfxKit, world: AudioNode, heart: AudioNode): Ambience {
  const { ctx, noise } = k
  const rumble = bed(k, noise.brown, 'lowpass', 260, 0.7, world)
  // swells: filter and envelope are automated per wave; level is set by distance
  const swellLevel = ctx.createGain()
  swellLevel.gain.value = 0
  swellLevel.connect(world)
  const swell = bed(k, noise.pink, 'lowpass', 500, 0.6, swellLevel)
  swell.g.gain.value = 0.2
  const wind = bed(k, noise.pink, 'bandpass', 600, 0.9, world)
  const rain = bed(k, noise.white, 'highpass', 1800, 0.5, world)
  const roar = bed(k, noise.brown, 'lowpass', 170, 0.7, world)
  const beds = [rumble, swell, wind, rain, roar]

  let f: AudioFrame | null = null
  let presence = 0
  let seaProx = 0
  let fireProx = 0
  let night = 0
  let day = 0
  let gust = 0.5

  let nextWave = 0
  let nextBird = 0
  let nextGull = 0
  let nextCricket = 0
  let nextFrog = 0
  let nextCrackle = 0
  let nextBeat = 0
  let nextGust = 0

  const set = (p: AudioParam, v: number, tau = 0.25) => p.setTargetAtTime(v, ctx.currentTime, tau)

  return {
    apply(frame, pres) {
      f = frame
      presence = pres
      if (!frame) {
        for (const b of beds) set(b.g.gain, 0, 0.6)
        set(swellLevel.gain, 0, 0.6)
        return
      }
      const cave = frame.inCave ? 1 : 0
      seaProx = clamp01(1 / (1 + Math.max(0, frame.seaDistance) / 28)) * (cave ? 0.45 : 1)
      const surf = seaProx * (0.4 + 0.6 * clamp01(frame.surf))
      fireProx = Number.isFinite(frame.fireDistance)
        ? 1 / (1 + Math.pow(frame.fireDistance / 3.5, 2))
        : 0
      day = clamp01((frame.daylight - 0.2) / 0.5)
      night = clamp01((0.35 - frame.daylight) / 0.25)
      const windAmt = clamp01(frame.wind) * (cave ? 0.25 : 1)
      set(rumble.g.gain, presence * surf * 0.45)
      set(swellLevel.gain, presence * surf * 0.9)
      set(wind.g.gain, presence * windAmt * (0.12 + 0.28 * gust), 0.8)
      set(rain.g.gain, presence * clamp01(frame.rain) * 0.22 * (cave ? 0.35 : 1))
      set(rain.f.frequency, cave ? 900 : 1800)
      set(roar.g.gain, presence * fireProx * 0.3)
    },
    schedule(horizon) {
      const now = ctx.currentTime
      if (!f || presence < 0.01) {
        nextWave =
          nextBird =
          nextGull =
          nextCricket =
          nextFrog =
          nextCrackle =
          nextBeat =
          nextGust =
            now
        return
      }
      const fr = f
      // swells: rise over ~2.4 s, crash, hiss back down until the next one
      if (nextWave < horizon) {
        const t = Math.max(nextWave, now)
        const period = rand(6.5, 10.5) * (1 - 0.3 * clamp01(fr.surf))
        const g = swell.g.gain
        const fq = swell.f.frequency
        g.cancelScheduledValues(t)
        g.setValueAtTime(0.18, t)
        g.linearRampToValueAtTime(0.75, t + 2.2)
        g.linearRampToValueAtTime(1, t + 2.45)
        g.exponentialRampToValueAtTime(0.18, t + period)
        fq.cancelScheduledValues(t)
        fq.setValueAtTime(420, t)
        fq.exponentialRampToValueAtTime(900, t + 2.2)
        fq.exponentialRampToValueAtTime(2400, t + 2.5)
        fq.exponentialRampToValueAtTime(450, t + period)
        nextWave = t + period
      }
      if (nextGust < horizon) {
        gust = Math.random()
        nextGust = Math.max(nextGust, now) + rand(2, 6)
        set(wind.f.frequency, rand(350, 1100), 1.2)
      }
      const outside = fr.inCave ? 0.3 : 1
      const dry = 1 - clamp01(fr.rain) * 0.8
      // birds: little chirp runs in the bush by day
      if (nextBird < horizon) {
        const t = Math.max(nextBird, now)
        const amt = presence * day * outside * dry * (1 - seaProx * 0.5)
        if (amt > 0.05) {
          const base = rand(2400, 4200)
          const n = 2 + Math.floor(Math.random() * 5)
          const pan = ctx.createStereoPanner()
          pan.pan.value = rand(-0.8, 0.8)
          pan.connect(world)
          for (let i = 0; i < n; i++) {
            const s = t + i * rand(0.07, 0.14)
            const up = Math.random() < 0.5
            tone(ctx, pan, s, {
              type: 'sine',
              freq: up ? base : base * 1.3,
              freqTo: up ? base * 1.35 : base * 0.9,
              dur: rand(0.05, 0.1),
              gain: 0.035 * amt,
              attack: 0.008,
            })
          }
          setTimeout(() => pan.disconnect(), (t - now + 2) * 1000)
        }
        nextBird = t + rand(1.5, 5)
      }
      if (nextGull < horizon) {
        const t = Math.max(nextGull, now)
        const amt = presence * day * seaProx * outside
        if (amt > 0.12) {
          const pan = ctx.createStereoPanner()
          pan.pan.value = rand(-0.9, 0.9)
          pan.connect(world)
          gullCall(k, pan, t, 0.06 * amt)
          setTimeout(() => pan.disconnect(), (t - now + 2) * 1000)
        }
        nextGull = t + rand(6, 16)
      }
      // crickets: pulse trains around 4.5 kHz, a couple of voices
      if (nextCricket < horizon) {
        const t = Math.max(nextCricket, now)
        const amt = presence * night * dry * (fr.inCave ? 0.4 : 1)
        if (amt > 0.05) {
          const pan = ctx.createStereoPanner()
          pan.pan.value = rand(-0.9, 0.9)
          pan.connect(world)
          const fq = rand(4200, 4900)
          const pulses = 3 + Math.floor(Math.random() * 2)
          for (let i = 0; i < pulses; i++)
            tone(ctx, pan, t + i * 0.042, {
              type: 'sine',
              freq: fq,
              dur: 0.022,
              gain: 0.018 * amt,
              attack: 0.003,
            })
          setTimeout(() => pan.disconnect(), (t - now + 1) * 1000)
        }
        nextCricket = t + rand(0.25, 0.7)
      }
      if (nextFrog < horizon) {
        const t = Math.max(nextFrog, now)
        const amt = presence * night * outside * dry
        if (amt > 0.1) {
          const pan = ctx.createStereoPanner()
          pan.pan.value = rand(-0.7, 0.7)
          pan.connect(world)
          const fq = rand(150, 230)
          const n = 3 + Math.floor(Math.random() * 4)
          for (let i = 0; i < n; i++)
            tone(ctx, pan, t + i * 0.055, {
              type: 'sawtooth',
              freq: fq,
              freqTo: fq * 0.9,
              dur: 0.04,
              gain: 0.025 * amt,
              attack: 0.006,
              lowpass: 700,
            })
          setTimeout(() => pan.disconnect(), (t - now + 1.5) * 1000)
        }
        nextFrog = t + rand(2.5, 8)
      }
      // fire crackle, denser as you get close
      while (nextCrackle < horizon) {
        const t = Math.max(nextCrackle, now)
        if (fireProx > 0.02) {
          burst(ctx, world, t, {
            buffer: noise.white,
            dur: rand(0.004, 0.02),
            gain: presence * fireProx * rand(0.05, 0.22),
            filter: 'highpass',
            freq: rand(1800, 5000),
          })
          nextCrackle = t + rand(0.03, 0.35) / (0.3 + fireProx)
        } else nextCrackle = t + 0.5
      }
      // the stage-1 heartbeat, about 66 bpm, as loud as the muffle is deep
      if (nextBeat < horizon) {
        const t = Math.max(nextBeat, now)
        const m = clamp01(fr.muffle)
        if (m > 0.05) heartbeat(k, heart, t, 0.55 * m * presence)
        nextBeat = t + 60 / rand(64, 68)
      }
    },
    dispose() {
      for (const b of beds) {
        b.src.stop()
        b.g.disconnect()
      }
      swellLevel.disconnect()
    },
  }
}
