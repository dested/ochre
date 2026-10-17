/**
 * The procedural sound of OCHRE: WebAudio only, no samples. One graph per page:
 *   world bus (ambience + sfx) → muffle lowpass → master;  world bus → room reverb (bigger in the cave) → muffle
 *   music bus (drone + plucks) → master;  heartbeat → master (under the stage-1 muffle)
 *   master → gentle compressor → speakers
 * The AudioContext is created on the first `resume()` (a user gesture), so nothing warns before that; calls made
 * earlier only record the music cue, volumes and the latest frame. SSR-safe: no DOM access at import time.
 */
import type { AudioFrame, CreateAudio, GameAudio, MusicCue, SfxName, Vec3 } from '../contracts'
import { createAmbience, type Ambience } from './ambience'
import { createMusic, type Music } from './music'
import { pluckCache, RECIPES, SFX_NAMES, type SfxKit } from './sfx'
import { makeImpulse, makeNoise } from './synth'

export { SFX_NAMES }

type Engine = {
  ctx: AudioContext
  kit: SfxKit
  master: GainNode
  musicBus: GainNode
  world: GainNode
  muffle: BiquadFilterNode
  reverbSend: GainNode
  ambience: Ambience
  music: Music
}

/** how far ahead discrete sounds are placed, and how often the scheduler wakes */
const LOOKAHEAD = 0.25
const TICK_MS = 60
/** a frame older than this means the game is paused: the bed ducks */
const STALE_MS = 400

function createEngine(): Engine {
  const ctx = new AudioContext({ latencyHint: 'interactive' })
  const kit: SfxKit = { ctx, noise: makeNoise(ctx), pluck: pluckCache(ctx) }
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.ratio.value = 3
  comp.attack.value = 0.01
  comp.release.value = 0.25
  comp.connect(ctx.destination)
  const master = ctx.createGain()
  master.connect(comp)

  const muffle = ctx.createBiquadFilter()
  muffle.type = 'lowpass'
  muffle.frequency.value = 18000
  muffle.Q.value = 0.5
  muffle.connect(master)
  const world = ctx.createGain()
  world.connect(muffle)
  const reverb = ctx.createConvolver()
  reverb.buffer = makeImpulse(ctx, 2.4, 2.6)
  const reverbSend = ctx.createGain()
  reverbSend.gain.value = 0.06
  world.connect(reverbSend).connect(reverb).connect(muffle)

  const musicBus = ctx.createGain()
  musicBus.connect(master)
  const musicVerb = ctx.createGain()
  musicVerb.gain.value = 0.25
  musicBus.connect(musicVerb).connect(reverb)

  const heart = ctx.createGain()
  heart.connect(master)

  return {
    ctx,
    kit,
    master,
    musicBus,
    world,
    muffle,
    reverbSend,
    ambience: createAmbience(kit, world, heart),
    music: createMusic(ctx, musicBus, kit.pluck),
  }
}

export const createAudio: CreateAudio = (): GameAudio => {
  let eng: Engine | null = null
  let disposed = false
  let master = 0.8
  let music = 0.6
  let cue: MusicCue = null
  let frame: AudioFrame | null = null
  let frameAt = 0
  let timer: ReturnType<typeof setInterval> | null = null

  const applyVolume = (e: Engine) => {
    const t = e.ctx.currentTime
    e.master.gain.setTargetAtTime(master, t, 0.05)
    e.musicBus.gain.setTargetAtTime(music * 0.55, t, 0.05)
  }

  const tick = () => {
    const e = eng
    if (!e || e.ctx.state !== 'running') return
    const fresh = frame !== null && performance.now() - frameAt < STALE_MS
    const f = frame
    const presence = f === null ? 0 : fresh ? 1 : 0.3
    e.ambience.apply(f, presence)
    const m = f?.muffle ?? 0
    // 18 kHz open, ~1 kHz at the stage-1 muffle of 0.7
    e.muffle.frequency.setTargetAtTime(18000 * Math.pow(300 / 18000, m), e.ctx.currentTime, 0.3)
    e.reverbSend.gain.setTargetAtTime(f?.inCave ? 0.5 : 0.06, e.ctx.currentTime, 0.5)
    const horizon = e.ctx.currentTime + LOOKAHEAD
    e.ambience.schedule(horizon)
    e.music.schedule(horizon)
  }

  const ensure = (): Engine | null => {
    if (eng || disposed) return eng
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null
    eng = createEngine()
    applyVolume(eng)
    eng.music.cue(cue)
    timer = setInterval(tick, TICK_MS)
    return eng
  }

  /** place a one-shot relative to the listener: distance falloff and a stereo pan from the heading */
  const spatial = (e: Engine, at: Vec3 | undefined): AudioNode | null => {
    if (!at || !frame) return e.world
    const dx = at.x - frame.listener.x
    const dz = at.z - frame.listener.z
    const d = Math.hypot(dx, dz, at.y - frame.listener.y)
    if (d > 90) return null
    const h = frame.heading
    // right of the facing direction is (−cos h, sin h) (contracts)
    const pan = d < 0.5 ? 0 : (dx * -Math.cos(h) + dz * Math.sin(h)) / Math.max(0.5, Math.hypot(dx, dz))
    const p = e.ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan * 0.85))
    const g = e.ctx.createGain()
    g.gain.value = 1 / (1 + d / 7)
    p.connect(g).connect(e.world)
    setTimeout(() => g.disconnect(), 4000)
    return p
  }

  return {
    async resume() {
      const e = ensure()
      if (e && e.ctx.state !== 'running') await e.ctx.resume()
    },
    update(f) {
      frame = f
      frameAt = performance.now()
    },
    sfx(name: SfxName, at?: Vec3) {
      const e = eng
      if (!e || e.ctx.state !== 'running') return
      const out = spatial(e, at)
      if (out) RECIPES[name](e.kit, out, e.ctx.currentTime + 0.01)
    },
    music(c) {
      if (c === 'title') frame = null
      if (c === cue) return
      cue = c
      eng?.music.cue(c)
    },
    setVolume(m, mu) {
      master = m
      music = mu
      if (eng) applyVolume(eng)
    },
    dispose() {
      disposed = true
      if (timer) clearInterval(timer)
      const e = eng
      eng = null
      if (!e) return
      e.ambience.dispose()
      e.music.dispose()
      void e.ctx.close().catch(() => {})
    },
  }
}
