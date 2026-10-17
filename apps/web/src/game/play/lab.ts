/**
 * /lab/play: the controller sandbox. Drops straight into a stage (?stage=small, default) with no title flow,
 * plus buttons for every stage, a few teleports and time scales. DEV handles on window.__lab.
 */
import { Vector3 } from 'three'
import { LIFE_STAGES, type LifeStageId } from '../contracts'
import { createRuntime } from './runtime'

const TELEPORTS = ['hearth-main', 'shore-path-top', 'shore-mussels', 'corm-slope', 'cove-beach', 'lookout-point']

export type PlayLabHandles = {
  stage(s: LifeStageId): void
  teleport(poiId: string): void
  timeScale(scale: number): void
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

export function mount(el: HTMLElement): () => void {
  const rt = createRuntime(el)
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

  const handles: PlayLabHandles = {
    stage: start,
    teleport(id) {
      const w = rt.world
      if (!w || !rt.game) return
      const poi = w.poi(id)
      rt.game.teleport(poi.x, poi.z + poi.radius * 0.5, 0)
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
    panel.remove()
    rt.dispose()
    bridge.reset()
    if (window.__lab === handles) delete window.__lab
  }
}
