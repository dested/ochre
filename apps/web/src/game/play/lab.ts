/**
 * /lab/play: the controller sandbox. Drops straight into a stage (?stage=small, default) with no title flow,
 * plus buttons for every stage, a few teleports and time scales. DEV handles on window.__lab.
 */
import { Vector3 } from 'three'
import { SFX_NAMES } from '../audio'
import { LIFE_STAGES, type AudioFrame, type GameAudio, type LifeStageId, type MusicCue } from '../contracts'
import { createRuntime } from './runtime'

const TELEPORTS = ['hearth-main', 'shore-path-top', 'shore-mussels', 'corm-slope', 'cove-beach', 'lookout-point']

export type PlayLabHandles = {
  stage(s: LifeStageId): void
  teleport(poiId: string): void
  teleportTo(x: number, z: number, heading?: number): void
  timeScale(scale: number): void
  /** face the camera at an animal (and stand 20 m from it) for spear tests */
  faceAnimal(id: string, distance?: number): void
  state(): unknown
}

declare global {
  interface Window {
    __lab?: PlayLabHandles
  }
}

function isStage(s: string | null): s is LifeStageId {
  return s !== null && (LIFE_STAGES as readonly string[]).includes(s)
}

type Scrub = Pick<AudioFrame, 'seaDistance' | 'surf' | 'fireDistance' | 'daylight' | 'wind' | 'rain' | 'muffle'>
const SCRUBS: { key: keyof Scrub; max: number; step: number }[] = [
  { key: 'seaDistance', max: 200, step: 1 },
  { key: 'surf', max: 1, step: 0.01 },
  { key: 'fireDistance', max: 40, step: 0.5 },
  { key: 'daylight', max: 1, step: 0.01 },
  { key: 'wind', max: 1, step: 0.01 },
  { key: 'rain', max: 1, step: 0.01 },
  { key: 'muffle', max: 1, step: 0.01 },
]
const MUSIC_CUES: MusicCue[] = ['title', ...LIFE_STAGES, 'summary', null]

/** the ambience scrubber: while on, the panel's values replace the game's in every AudioFrame */
function createScrubber() {
  const values: Scrub = { seaDistance: 20, surf: 0.5, fireDistance: 40, daylight: 0.8, wind: 0.3, rain: 0, muffle: 0 }
  const s = { on: false, inCave: false, values }
  const wrap = (a: GameAudio): GameAudio => ({
    ...a,
    update(f) {
      if (!s.on) return a.update(f)
      // the far end of the fire slider means no fire
      const fireDistance = values.fireDistance >= 40 ? Infinity : values.fireDistance
      a.update({ ...f, ...values, fireDistance, inCave: s.inCave })
    },
  })
  return { state: s, wrap }
}

function audioPanel(audio: GameAudio, scrub: ReturnType<typeof createScrubber>['state']): HTMLElement {
  const panel = document.createElement('div')
  panel.style.cssText =
    'position:absolute;right:8px;top:8px;z-index:20;width:240px;box-sizing:border-box;max-height:calc(100% - 16px);overflow:hidden auto;display:flex;flex-direction:column;gap:3px;' +
    'font:11px system-ui;color:#efe3c8;background:rgba(42,36,32,.82);padding:8px;border-radius:6px'
  panel.addEventListener('pointerdown', (e) => e.stopPropagation())
  const head = (text: string) => {
    const h = document.createElement('div')
    h.textContent = text
    h.style.cssText = 'font-weight:600;margin-top:4px'
    panel.appendChild(h)
  }
  const row = () => {
    const r = document.createElement('div')
    r.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px'
    panel.appendChild(r)
    return r
  }
  const btn = (parent: HTMLElement, label: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'padding:2px 6px;border-radius:3px;border:0;color:#efe3c8;background:rgba(156,61,32,.55);cursor:pointer;font:inherit'
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      void audio.resume().then(onClick)
    })
    parent.appendChild(b)
  }
  head('Sound effects')
  const sfxRow = row()
  for (const n of SFX_NAMES) btn(sfxRow, n, () => audio.sfx(n))
  head('Music')
  const musicRow = row()
  for (const c of MUSIC_CUES) btn(musicRow, c ?? 'off', () => audio.music(c))
  head('Ambience')
  const check = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const l = document.createElement('label')
    l.style.cssText = 'display:flex;gap:6px;align-items:center'
    const i = document.createElement('input')
    i.type = 'checkbox'
    i.checked = get()
    i.addEventListener('change', () => {
      set(i.checked)
      void audio.resume()
    })
    l.append(i, label)
    panel.appendChild(l)
  }
  check('override the game', () => scrub.on, (v) => (scrub.on = v))
  check('in cave', () => scrub.inCave, (v) => (scrub.inCave = v))
  for (const sc of SCRUBS) {
    const l = document.createElement('label')
    l.style.cssText = 'display:grid;grid-template-columns:72px minmax(0,1fr) 30px;gap:4px;align-items:center'
    const name = document.createElement('span')
    name.textContent = sc.key
    const i = document.createElement('input')
    i.type = 'range'
    i.style.cssText = 'width:100%;min-width:0;margin:0'
    i.min = '0'
    i.max = String(sc.max)
    i.step = String(sc.step)
    i.value = String(scrub.values[sc.key])
    const val = document.createElement('span')
    val.textContent = i.value
    i.addEventListener('input', () => {
      scrub.values[sc.key] = Number(i.value)
      val.textContent = i.value
    })
    l.append(name, i, val)
    panel.appendChild(l)
  }
  return panel
}

export function mount(el: HTMLElement): () => void {
  const scrubber = createScrubber()
  const rt = createRuntime(el, { wrapAudio: scrubber.wrap })
  const { bridge } = rt
  const q = new URLSearchParams(window.location.search).get('stage')
  let stage: LifeStageId = isStage(q) ? q : 'small'

  const start = (s: LifeStageId) => {
    stage = s
    rt.startLife({ seed: 80_000, stage: s, playerName: 'Teni' })
    bridge.set({ screen: 'playing', hasLife: true })
    for (const b of stageButtons) b.style.background = b.dataset.stage === s ? '#9c3d20' : 'rgba(42,36,32,.8)'
  }
  // chapter cards from the sim just dismiss themselves in the lab
  const offCard = bridge.subscribe(() => {
    if (bridge.get().screen === 'chapter-card') bridge.set({ screen: 'playing' })
  })

  const panel = document.createElement('div')
  panel.style.cssText =
    'position:absolute;left:8px;top:50%;transform:translateY(-50%);z-index:20;display:flex;flex-direction:column;gap:4px;font:12px system-ui;'
  const mkBtn = (label: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'padding:4px 8px;border-radius:4px;border:0;color:#efe3c8;background:rgba(42,36,32,.8);cursor:pointer;text-align:left'
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      onClick()
    })
    panel.appendChild(b)
    return b
  }
  const stageButtons = LIFE_STAGES.map((s) => {
    const b = mkBtn(s, () => start(s))
    b.dataset.stage = s
    return b
  })
  for (const id of TELEPORTS) mkBtn(`→ ${id}`, () => handles.teleport(id))
  for (const scale of [72, 720, 7200]) mkBtn(`time ×${scale}`, () => handles.timeScale(scale))
  el.appendChild(panel)
  const sound = audioPanel(rt.audio, scrubber.state)
  el.appendChild(sound)
  const wake = () => void rt.audio.resume().catch(() => {})
  window.addEventListener('pointerdown', wake, true)

  const handles: PlayLabHandles = {
    stage: start,
    teleport(id) {
      const w = rt.world
      if (!w || !rt.game) return
      const poi = w.poi(id)
      rt.game.teleport(poi.x, poi.z + poi.radius * 0.5, 0)
    },
    teleportTo(x, z, heading = 0) {
      rt.game?.teleport(x, z, heading)
    },
    faceAnimal(id, distance = 20) {
      const g = rt.game
      const a = g?.sim.state.animals.find((x) => x.id === id)
      if (!g || !a) return
      const x = a.position.x - distance
      g.teleport(x, a.position.z, Math.PI / 2)
      g.controller.yaw = Math.PI / 2
      g.controller.pitch = 0.05
    },
    timeScale(scale) {
      rt.game?.sim.command({ type: 'set-time-scale', scale })
    },
    state() {
      const g = rt.game
      if (!g) return null
      const p = g.player()
      return {
        stage,
        player: { x: p.position.x, z: p.position.z, heading: p.heading, carriedBy: p.carriedBy, skills: p.skills },
        hour: g.sim.state.clock.hour,
        seaLevel: g.sim.state.clock.seaLevel,
        prompt: bridge.get().prompt,
        eland: g.sim.state.animals.filter((a) => a.kind === 'eland').map((a) => [a.id, a.wounded]),
        spear: { aim: g.hunt.aim, state: g.hunt.spear.state, at: g.hunt.spear.stuckAt },
        known: g.sim.state.people.filter((q) => q.known).map((q) => q.id),
        camera: rt.camera.position.toArray(),
        fwd: rt.camera.getWorldDirection(new Vector3()).toArray(),
        heads: g.sim.state.people.map((q) => {
          const a = g.cast.person(q.id)
          return a ? [q.id, a.headPosition(new Vector3()).toArray().map((v) => Number(v.toFixed(2)))] : [q.id, null]
        }),
      }
    },
  }
  if (import.meta.env.DEV) window.__lab = handles

  start(stage)
  return () => {
    offCard()
    window.removeEventListener('pointerdown', wake, true)
    sound.remove()
    panel.remove()
    rt.dispose()
    bridge.reset()
    if (window.__lab === handles) delete window.__lab
  }
}
