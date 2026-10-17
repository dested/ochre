/**
 * /lab/sim: a top-down view of the living band. Shaded height, the sea at the current tide, POIs, people as
 * labelled dots coloured by task, animals, fires; time controls, click-to-inspect and an event log.
 * Client-only (mounted through ClientMount); the sim itself stays DOM-free.
 */
import type { LifeStageId, Sim, SimAnimal, SimEvent, SimPerson, TaskKind, Vec2, WorldData } from '../game/contracts'
import { LIFE_STAGES } from '../game/contracts'
import { DEFAULT_TIME_SCALE } from '../core/clock'
import { roleOf } from './ai'
import { SKILL_LABEL } from './ctx'
import { createSandboxSim, createSim, debugCtx, debugDirector } from './index'
import { sunTimes } from './time'
import { createWorldData } from '../world-gen'
import { createTestWorld } from './test-world'

const TASK_COLOR: Record<TaskKind, string> = {
  idle: '#9a8f80',
  sleep: '#7a64a0',
  'walk-to': '#efe3c8',
  follow: '#d9c9a0',
  'gather-shellfish': '#3fc0c4',
  'dig-corms': '#c0482a',
  knap: '#e07a3a',
  'tend-fire': '#f2a03d',
  'fetch-wood': '#a07a46',
  hunt: '#ff5a3a',
  track: '#e89a6a',
  eat: '#f6d06b',
  socialize: '#c8b08a',
  play: '#f08fb0',
  nurse: '#f0c0c0',
  'tell-story': '#ffe08a',
  sing: '#ffe08a',
  mourn: '#6a6a8a',
  scripted: '#ffffff',
}

const ANIMAL_COLOR: Record<SimAnimal['kind'], string> = {
  eland: '#d8a868',
  seal: '#5a5a62',
  gull: '#f4f4f0',
  hyena: '#5a4030',
  lion: '#c8a050',
  tortoise: '#7a7a40',
  whale: '#30384a',
}

const SPEEDS = [0, 1, 10, 100, 600] as const

type View = { cx: number; cz: number; scale: number }

const VIEWS: Record<string, (w: WorldData) => { x: number; z: number; span: number }> = {
  band: (w) => ({ x: (w.poi('hearth-main').x + w.poi('eland-plateau').x) / 2, z: (w.poi('hearth-main').z + w.poi('eland-plateau').z) / 2, span: 1100 }),
  hearth: (w) => ({ x: w.poi('hearth-main').x, z: w.poi('hearth-main').z, span: 14 }),
  cave: (w) => ({ x: w.poi('hearth-main').x, z: w.poi('hearth-main').z + 10, span: 90 }),
  shore: (w) => ({ x: w.poi('shore-mussels').x - 40, z: w.poi('shore-mussels').z - 30, span: 260 }),
  plateau: (w) => ({ x: w.poi('eland-plateau').x, z: w.poi('eland-plateau').z, span: 500 }),
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, style: Partial<CSSStyleDeclaration> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  Object.assign(e.style, style)
  if (text !== undefined) e.textContent = text
  return e
}

function fmtHour(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** "an eland", "a seal" */
function animalLabel(kind: string | undefined): string | null {
  return kind ? `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}` : null
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function mount(root: HTMLElement): () => void {
  const params = new URLSearchParams(window.location.search)
  let seed = Number(params.get('seed') ?? '1') || 1
  let stage: LifeStageId = LIFE_STAGES.find((s) => s === params.get('stage')) ?? 'small'
  // the real coast from world-gen; `?world=fixture` for the analytic test world
  const world: WorldData = params.get('world') === 'fixture' ? createTestWorld(seed) : createWorldData(seed)
  // story: the director runs the chapter (nobody plays, so the beats wait; "Complete beat" moves them on)
  let story = params.get('mode') !== 'sandbox'
  const make = (): Sim => (story ? createSim : createSandboxSim)({ seed, world, stage, playerName: 'Teni' })
  let sim: Sim = make()
  let speed: (typeof SPEEDS)[number] = 1
  let selected: { kind: 'person' | 'animal'; id: string } | null = { kind: 'person', id: 'ama' }
  const log: string[] = []
  const lastTask = new Map<string, string>()

  // ─── layout ──────────────────────────────────────────────────────────────────────────────────────────────
  root.textContent = ''
  const wrap = el('div', { position: 'absolute', inset: '0', display: 'flex', background: '#16120f', color: '#efe3c8', font: '12px/1.4 Figtree, system-ui, sans-serif' })
  const stageBox = el('div', { position: 'relative', flex: '1', overflow: 'hidden' })
  const canvas = el('canvas', { position: 'absolute', inset: '0', width: '100%', height: '100%', cursor: 'crosshair' })
  const panel = el('div', { width: '330px', padding: '14px', boxSizing: 'border-box', borderLeft: '1px solid #3a302a', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' })
  stageBox.appendChild(canvas)
  wrap.append(stageBox, panel)
  root.appendChild(wrap)

  const title = el('div', { font: '600 18px Fraunces, Georgia, serif', color: '#f2d9a8' }, 'The living band')
  const clockBox = el('div', { whiteSpace: 'pre-line', color: '#d8ccb0' })
  const controls = el('div', { display: 'flex', gap: '4px', flexWrap: 'wrap' })
  const speedButtons = SPEEDS.map((s) => {
    const b = el('button', { padding: '3px 8px', background: '#2a221d', color: '#efe3c8', border: '1px solid #4a3c32', borderRadius: '3px', cursor: 'pointer', font: 'inherit' }, s === 0 ? 'Pause' : `×${s}`)
    b.onclick = () => setSpeed(s)
    controls.appendChild(b)
    return b
  })
  const stageRow = el('div', { display: 'flex', gap: '4px', alignItems: 'center' })
  const stageSel = el('select', { background: '#2a221d', color: '#efe3c8', border: '1px solid #4a3c32', font: 'inherit' })
  for (const s of LIFE_STAGES) {
    const o = el('option', {}, s)
    o.value = s
    if (s === stage) o.selected = true
    stageSel.appendChild(o)
  }
  const seedIn = el('input', { width: '48px', background: '#2a221d', color: '#efe3c8', border: '1px solid #4a3c32', font: 'inherit' })
  seedIn.value = String(seed)
  const restartBtn = el('button', { padding: '3px 8px', background: '#2a221d', color: '#efe3c8', border: '1px solid #4a3c32', borderRadius: '3px', cursor: 'pointer', font: 'inherit' }, 'Restart')
  restartBtn.onclick = () => {
    const s = LIFE_STAGES.find((x) => x === stageSel.value)
    if (s) stage = s
    story = modeSel.value === 'story'
    seed = Number(seedIn.value) || 1
    restart()
  }
  const viewRow = el('div', { display: 'flex', gap: '4px' })
  for (const name of Object.keys(VIEWS)) {
    const b = el('button', { padding: '3px 8px', background: '#2a221d', color: '#efe3c8', border: '1px solid #4a3c32', borderRadius: '3px', cursor: 'pointer', font: 'inherit' }, name)
    b.onclick = () => setView(name)
    viewRow.appendChild(b)
  }
  const modeSel = el('select', { background: '#2a221d', color: '#efe3c8', border: '1px solid #4a3c32', font: 'inherit' })
  for (const m of ['story', 'sandbox']) {
    const o = el('option', {}, m)
    o.value = m
    if ((m === 'story') === story) o.selected = true
    modeSel.appendChild(o)
  }
  stageRow.append(el('span', {}, 'Stage'), stageSel, modeSel, el('span', {}, 'Seed'), seedIn, restartBtn)
  const directorBox = el('div', { background: '#241c17', padding: '8px', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '6px' })
  const directorText = el('div', { whiteSpace: 'pre-line', color: '#e8d8b4' })
  const completeBtn = el('button', { padding: '3px 8px', background: '#5a3a22', color: '#efe3c8', border: '1px solid #7a5232', borderRadius: '3px', cursor: 'pointer', font: 'inherit', alignSelf: 'flex-start' }, 'Complete beat')
  completeBtn.onclick = () => completeBeat()
  directorBox.append(directorText, completeBtn)
  const inspect = el('div', { whiteSpace: 'pre-line', background: '#201a16', padding: '8px', borderRadius: '4px', minHeight: '150px' })
  const logBox = el('div', { flex: '1', overflowY: 'auto', background: '#1c1713', padding: '6px', borderRadius: '4px', font: '11px/1.45 ui-monospace, monospace', color: '#cbbfa4' })
  panel.append(title, clockBox, controls, stageRow, viewRow, directorBox, inspect, el('div', { color: '#a09070' }, 'Events'), logBox)

  const ctx2d = canvas.getContext('2d')
  if (!ctx2d) throw new Error('no 2d context')
  const g = ctx2d

  // ─── view and background ─────────────────────────────────────────────────────────────────────────────────
  let view: View = { cx: 40, cz: -190, scale: 1 }
  let width = 1
  let height = 1
  let bgDirty = true
  let lastSea = NaN
  const RES = 3
  let bgW = 1
  let bgH = 1
  let heights = new Float32Array(1)
  let lagoon = new Float32Array(1)
  let seaMask = new Uint8Array(1)
  let caveMask = new Uint8Array(1)
  let bgImage: ImageData | null = null
  const bgCanvas = document.createElement('canvas')

  const toScreen = (x: number, z: number): [number, number] => [width / 2 + (x - view.cx) * view.scale, height / 2 + (z - view.cz) * view.scale]
  const toWorld = (sx: number, sy: number): Vec2 => ({ x: view.cx + (sx - width / 2) / view.scale, z: view.cz + (sy - height / 2) / view.scale })

  function setView(name: string): void {
    const v = VIEWS[name]
    if (!v) return
    const r = v(world)
    view = { cx: r.x, cz: r.z, scale: Math.min(width, height) / r.span }
    bgDirty = true
  }

  function resize(): void {
    const rect = stageBox.getBoundingClientRect()
    width = Math.max(1, Math.floor(rect.width))
    height = Math.max(1, Math.floor(rect.height))
    canvas.width = width
    canvas.height = height
    bgDirty = true
  }

  function rebuildHeights(): void {
    bgW = Math.ceil(width / RES)
    bgH = Math.ceil(height / RES)
    heights = new Float32Array(bgW * bgH)
    lagoon = new Float32Array(bgW * bgH)
    seaMask = new Uint8Array(bgW * bgH)
    caveMask = new Uint8Array(bgW * bgH)
    for (let j = 0; j < bgH; j++) {
      for (let i = 0; i < bgW; i++) {
        const w = toWorld(i * RES + RES / 2, j * RES + RES / 2)
        const k = j * bgW + i
        const h = world.heightAt(w.x, w.z)
        heights[k] = h
        lagoon[k] = world.waterDepth(w.x, w.z, -5)
        seaMask[k] = world.waterDepth(w.x, w.z, 5) > 0 ? 1 : 0
        caveMask[k] = world.inCave(w.x, w.z) ? 1 : 0
      }
    }
    bgCanvas.width = bgW
    bgCanvas.height = bgH
    bgImage = new ImageData(bgW, bgH)
    lastSea = NaN
  }

  const SAND = hexToRgb('#d9c79b')
  const LOW = hexToRgb('#a3a06a')
  const MID = hexToRgb('#7d8b5a')
  const HIGH = hexToRgb('#6a6a4c')
  const ROCK = hexToRgb('#9b9285')
  const SHALLOW = hexToRgb('#3d8f8f')
  const DEEP = hexToRgb('#173a52')
  const FOAM = hexToRgb('#e6efe8')
  const CAVE = hexToRgb('#4a3a30')

  function recolor(sea: number): void {
    if (!bgImage) return
    const d = bgImage.data
    const metresPerPx = RES / view.scale
    for (let j = 0; j < bgH; j++) {
      for (let i = 0; i < bgW; i++) {
        const k = j * bgW + i
        const h = heights[k] ?? 0
        const depth = Math.max(lagoon[k] ?? 0, seaMask[k] ? sea - h : 0)
        let c: [number, number, number]
        let shade = 1
        if (depth > 0) {
          if (depth < 0.12 && seaMask[k]) c = FOAM
          else {
            const t = Math.min(1, depth / 8)
            c = [SHALLOW[0] + (DEEP[0] - SHALLOW[0]) * t, SHALLOW[1] + (DEEP[1] - SHALLOW[1]) * t, SHALLOW[2] + (DEEP[2] - SHALLOW[2]) * t]
          }
        } else {
          const hx = (heights[k + 1] ?? h) - (heights[k - 1] ?? h)
          const hz = (heights[k + bgW] ?? h) - (heights[k - bgW] ?? h)
          const slope = Math.hypot(hx, hz) / (2 * metresPerPx)
          shade = Math.max(0.55, Math.min(1.25, 1 + (-hx - hz) / (2 * metresPerPx) * 0.6))
          if (caveMask[k]) c = CAVE
          else if (slope > 0.9) c = ROCK
          else if (h < 4) c = SAND
          else if (h < 20) c = LOW
          else if (h < 50) c = MID
          else c = HIGH
        }
        const o = k * 4
        d[o] = Math.min(255, c[0] * shade)
        d[o + 1] = Math.min(255, c[1] * shade)
        d[o + 2] = Math.min(255, c[2] * shade)
        d[o + 3] = 255
      }
    }
    const bctx = bgCanvas.getContext('2d')
    bctx?.putImageData(bgImage, 0, 0)
  }

  // ─── sim control ─────────────────────────────────────────────────────────────────────────────────────────
  function setSpeed(s: (typeof SPEEDS)[number]): void {
    speed = s
    if (s > 0) sim.command({ type: 'set-time-scale', scale: DEFAULT_TIME_SCALE * s })
    speedButtons.forEach((b, i) => {
      b.style.background = SPEEDS[i] === s ? '#6a4a2a' : '#2a221d'
    })
  }

  function completeBeat(): void {
    const d = debugDirector(sim)
    if (!d) return
    d.completeBeat()
    // the beat's events go out with the next step
    logEvents(sim.step(1 / 60))
    logDirty = true
  }

  function restart(): void {
    sim = make()
    log.length = 0
    lastTask.clear()
    setSpeed(speed === 0 ? 1 : speed)
  }

  function person(id: string): SimPerson | undefined {
    return sim.state.people.find((p) => p.id === id)
  }

  function addLog(line: string): void {
    const s = sim.state
    log.push(`D${s.clock.day} ${fmtHour(s.clock.hour)}  ${line}`)
    if (log.length > 300) log.splice(0, log.length - 300)
  }

  function logEvents(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'learned': {
          const from = e.fromId ? person(e.fromId)?.name : null
          addLog(`★ ${person(e.personId)?.name ?? e.personId} learned ${SKILL_LABEL[e.skill]}${from ? ` from ${from}` : ''}`)
          break
        }
        case 'face-learned':
          addLog(`◉ face learned: ${person(e.personId)?.name ?? e.personId}`)
          break
        case 'bond':
          addLog(`♥ ${person(e.personId)?.name ?? e.personId} bond ${e.value.toFixed(2)}`)
          break
        case 'item':
          addLog(`+ ${e.item} ${e.delta > 0 ? '+' : ''}${e.delta}`)
          break
        case 'caption':
          addLog(`“${e.caption.text}”${e.caption.speaker ? ` (${e.caption.speaker})` : ''}`)
          break
        case 'sfx':
          if (e.name === 'eland-snort') addLog('~ the eland bolt')
          else if (e.name === 'hit') addLog('✦ a spear finds an eland')
          else if (e.name === 'hyena') addLog('~ a hyena calls in the dark')
          break
        case 'death':
          addLog(`✝ ${person(e.personId)?.name ?? e.personId} died`)
          break
        case 'objective':
          if (e.objective) addLog(`▸ ${e.objective.text}`)
          break
        case 'note':
          addLog(`✎ Field Note: ${e.noteId}`)
          break
        case 'chapter-start':
          addLog(`━━ ${e.title} · ${e.subtitle} (age ${e.ageYears})`)
          break
        case 'chapter-end':
          addLog(`━━ end of ${e.stage}${e.next ? ` → ${e.next}` : ''}`)
          break
        case 'minigame':
          addLog(`◆ minigame: ${e.game}`)
          break
        case 'choice':
          addLog(`◆ choice: ${e.choice.prompt} ${e.choice.options.map((o) => o.label).join(' / ')}`)
          break
        case 'camera':
          if (e.cue.kind === 'fade') addLog(`▒ fade to ${e.cue.to}`)
          break
        case 'teleport':
          addLog(`⇢ player to (${e.position.x.toFixed(0)}, ${e.position.z.toFixed(0)})`)
          break
        case 'life-summary':
          addLog(`☾ life summary: ${e.summary.name}, ${e.summary.years} years, ${e.summary.notesFound} notes, heir ${e.summary.heirName ?? '—'}`)
          break
        default:
          break
      }
    }
    for (const p of sim.state.people) {
      if (!['ama', 'tuk', 'oro', 'kaya', 'player', 'nehe'].includes(p.id)) continue
      const key = p.task.kind === 'walk-to' ? `walk-to ${p.task.targetId ?? ''}` : p.task.kind
      if (lastTask.get(p.id) === key) continue
      lastTask.set(p.id, key)
      if (p.task.kind !== 'walk-to') addLog(`${p.name}: ${p.task.kind}${p.task.skill ? ` (${SKILL_LABEL[p.task.skill]})` : ''}`)
    }
  }

  // ─── input ───────────────────────────────────────────────────────────────────────────────────────────────
  let drag: { x: number; y: number; cx: number; cz: number; moved: boolean } | null = null
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false }
    canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    if (drag.moved) {
      view.cx = drag.cx - dx / view.scale
      view.cz = drag.cz - dy / view.scale
    }
  }
  const onUp = (e: PointerEvent) => {
    if (drag && !drag.moved) pick(e.offsetX, e.offsetY)
    if (drag?.moved) bgDirty = true
    drag = null
  }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const before = toWorld(e.offsetX, e.offsetY)
    view.scale *= Math.exp(-e.deltaY * 0.0015)
    view.scale = Math.min(40, Math.max(0.2, view.scale))
    const after = toWorld(e.offsetX, e.offsetY)
    view.cx += before.x - after.x
    view.cz += before.z - after.z
    bgDirty = true
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    if (e.key === ' ') setSpeed(speed === 0 ? 1 : 0)
    const n = Number(e.key)
    const s = SPEEDS[n - 1]
    if (n >= 1 && n <= 5 && s !== undefined) setSpeed(s)
  }

  function pick(sx: number, sy: number): void {
    let best: typeof selected = null
    let bd = 14
    for (const p of sim.state.people) {
      if (p.carriedBy) continue
      const [x, y] = toScreen(p.position.x, p.position.z)
      const d = Math.hypot(x - sx, y - sy)
      if (d < bd) {
        bd = d
        best = { kind: 'person', id: p.id }
      }
    }
    for (const a of sim.state.animals) {
      const [x, y] = toScreen(a.position.x, a.position.z)
      const d = Math.hypot(x - sx, y - sy)
      if (d < bd) {
        bd = d
        best = { kind: 'animal', id: a.id }
      }
    }
    selected = best
  }

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKey)
  const ro = new ResizeObserver(resize)
  ro.observe(stageBox)

  // ─── drawing ─────────────────────────────────────────────────────────────────────────────────────────────
  function drawPerson(p: SimPerson, carriedCount: number): void {
    const [x, y] = toScreen(p.position.x, p.position.z)
    const r = roleOf(p) === 'child' || roleOf(p) === 'toddler' ? 3.5 : 4.5
    g.fillStyle = TASK_COLOR[p.task.kind]
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(20,14,10,0.8)'
    g.lineWidth = 1
    g.stroke()
    // heading tick
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.sin(p.heading) * (r + 4), y + Math.cos(p.heading) * (r + 4))
    g.stroke()
    if (carriedCount > 0) {
      g.fillStyle = '#ffe0c0'
      g.beginPath()
      g.arc(x + r, y - r, 2, 0, Math.PI * 2)
      g.fill()
    }
    if (p.isPlayer) {
      g.strokeStyle = '#ffffff'
      g.lineWidth = 1.5
      g.beginPath()
      g.arc(x, y, r + 3.5, 0, Math.PI * 2)
      g.stroke()
    }
    if (selected?.kind === 'person' && selected.id === p.id) {
      g.strokeStyle = '#ffd27a'
      g.lineWidth = 2
      g.beginPath()
      g.arc(x, y, r + 6, 0, Math.PI * 2)
      g.stroke()
    }
    if (view.scale > 0.9 || p.isPlayer || ['ama', 'tuk', 'oro', 'kaya'].includes(p.id)) {
      g.fillStyle = 'rgba(239,227,200,0.92)'
      g.font = '11px Figtree, system-ui, sans-serif'
      g.fillText(p.name, x + r + 3, y + 3)
    }
    if (p.speech && view.scale > 1.5) {
      g.fillStyle = 'rgba(255,240,210,0.85)'
      g.font = 'italic 11px Fraunces, Georgia, serif'
      g.fillText(`“${p.speech.text}”`, x + r + 3, y - 9)
    }
  }

  function drawAnimal(a: SimAnimal): void {
    const [x, y] = toScreen(a.position.x, a.position.z)
    g.save()
    g.translate(x, y)
    g.rotate(-a.heading)
    g.fillStyle = a.alive ? ANIMAL_COLOR[a.kind] : '#6a4030'
    g.globalAlpha = a.kind === 'gull' && a.altitude > 0.5 ? 0.75 : 1
    const s = a.kind === 'eland' ? 4 : a.kind === 'gull' || a.kind === 'tortoise' ? 2.2 : 3.2
    g.beginPath()
    g.moveTo(0, s * 1.4)
    g.lineTo(-s, -s)
    g.lineTo(s, -s)
    g.closePath()
    g.fill()
    if (a.wounded) {
      g.strokeStyle = '#ff3020'
      g.lineWidth = 1.5
      g.stroke()
    }
    g.restore()
    if (selected?.kind === 'animal' && selected.id === a.id) {
      g.strokeStyle = '#ffd27a'
      g.lineWidth = 2
      g.beginPath()
      g.arc(x, y, 8, 0, Math.PI * 2)
      g.stroke()
    }
  }

  function draw(): void {
    const s = sim.state
    if (bgDirty) {
      rebuildHeights()
      bgDirty = false
    }
    if (!(Math.abs(s.clock.seaLevel - lastSea) < 0.03)) {
      recolor(s.clock.seaLevel)
      lastSea = s.clock.seaLevel
    }
    g.imageSmoothingEnabled = true
    g.clearRect(0, 0, width, height)
    // the background was rendered for the view at the last rebuild; while dragging it shifts with the view
    g.drawImage(bgCanvas, 0, 0, bgW * RES, bgH * RES)
    // night tint
    const night = 1 - s.clock.daylight
    if (night > 0.02) {
      g.fillStyle = `rgba(16,18,48,${0.45 * night})`
      g.fillRect(0, 0, width, height)
    }
    // fires
    for (const f of s.fires) {
      if (f.intensity <= 0.01) continue
      const [x, y] = toScreen(f.x, f.z)
      const r = 6 + 22 * f.intensity * Math.min(2, view.scale)
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, `rgba(255,190,80,${0.9 * f.intensity})`)
      grad.addColorStop(1, 'rgba(255,120,40,0)')
      g.fillStyle = grad
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
    // POIs
    g.font = '10px Figtree, system-ui, sans-serif'
    for (const p of world.pois) {
      if (p.kind === 'sleep-spot' && view.scale < 2) continue
      if (p.kind === 'path-node' && view.scale < 1.2) continue
      const [x, y] = toScreen(p.x, p.z)
      g.strokeStyle = p.tideMax !== undefined ? (s.clock.seaLevel < p.tideMax ? '#7af0e0' : '#4a7a80') : 'rgba(240,220,170,0.5)'
      g.lineWidth = 1
      g.beginPath()
      g.arc(x, y, Math.max(3, p.radius * view.scale), 0, Math.PI * 2)
      g.stroke()
      if (view.scale > 0.5 || p.kind === 'cave-mouth' || p.kind === 'eland-range') {
        g.fillStyle = 'rgba(240,225,190,0.7)'
        g.fillText(p.label, x + 5, y - 5)
      }
    }
    // herds
    const dctx = debugCtx(sim)
    if (dctx) {
      for (const h of dctx.herds) {
        const [x, y] = toScreen(h.center.x, h.center.z)
        g.strokeStyle = 'rgba(216,168,104,0.6)'
        g.beginPath()
        g.moveTo(x - 5, y)
        g.lineTo(x + 5, y)
        g.moveTo(x, y - 5)
        g.lineTo(x, y + 5)
        g.stroke()
      }
    }
    for (const a of s.animals) drawAnimal(a)
    // selected person's path
    if (dctx && selected?.kind === 'person') {
      const p = person(selected.id)
      const ag = dctx.agents.get(selected.id)
      if (p && ag && ag.path.length) {
        g.strokeStyle = 'rgba(255,210,122,0.7)'
        g.setLineDash([4, 4])
        g.beginPath()
        const [x0, y0] = toScreen(p.position.x, p.position.z)
        g.moveTo(x0, y0)
        for (const w of ag.path) {
          const [x, y] = toScreen(w.x, w.z)
          g.lineTo(x, y)
        }
        g.stroke()
        g.setLineDash([])
      }
    }
    const carried = new Map<string, number>()
    for (const p of s.people) if (p.carriedBy) carried.set(p.carriedBy, (carried.get(p.carriedBy) ?? 0) + 1)
    for (const p of s.people) if (!p.carriedBy && p.alive) drawPerson(p, carried.get(p.id) ?? 0)
    // wind arrow
    const w = s.weather
    g.save()
    g.translate(width - 40, 40)
    g.rotate(-w.windDir)
    g.strokeStyle = '#efe3c8'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(0, -14)
    g.lineTo(0, 14)
    g.lineTo(-5, 8)
    g.moveTo(0, 14)
    g.lineTo(5, 8)
    g.stroke()
    g.restore()
    g.fillStyle = '#efe3c8'
    g.fillText(`wind ${w.wind.toFixed(2)}`, width - 66, 70)
    // legend
    const legend: [string, TaskKind][] = [
      ['sleep', 'sleep'], ['walk', 'walk-to'], ['shore', 'gather-shellfish'], ['corms', 'dig-corms'], ['knap', 'knap'],
      ['hunt', 'hunt'], ['track', 'track'], ['wood', 'fetch-wood'], ['fire', 'tend-fire'], ['eat', 'eat'],
      ['hearth', 'socialize'], ['play', 'play'], ['story', 'tell-story'], ['follow', 'follow'], ['idle/craft', 'idle'],
    ]
    let lx = 10
    for (const [label, kind] of legend) {
      g.fillStyle = TASK_COLOR[kind]
      g.beginPath()
      g.arc(lx + 4, height - 12, 4, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#d8ccb0'
      g.fillText(label, lx + 11, height - 8)
      lx += g.measureText(label).width + 24
    }
  }

  function updatePanel(): void {
    const s = sim.state
    const c = s.clock
    const sun = (() => {
      const d = debugCtx(sim)
      return d ? sunTimes(d, c.dayOfYear) : null
    })()
    const moonName = c.moonPhase < 0.06 || c.moonPhase > 0.94 ? 'new' : Math.abs(c.moonPhase - 0.5) < 0.06 ? 'full' : c.moonPhase < 0.5 ? 'waxing' : 'waning'
    const h = s.hearth
    clockBox.textContent =
      `Day ${c.day} · ${fmtHour(c.hour)} · ${c.season} · year ${c.year}\n` +
      `Sun ${sun ? `${fmtHour(sun.rise)}–${fmtHour(sun.set)}` : ''} · moon ${moonName} (${c.moonPhase.toFixed(2)})\n` +
      `Sea ${c.seaLevel >= 0 ? '+' : ''}${c.seaLevel.toFixed(2)} m · ${c.tideRange > 0.7 ? 'spring' : c.tideRange < 0.3 ? 'neap' : 'mid'} tide\n` +
      `Weather: cloud ${s.weather.cloud.toFixed(1)} · rain ${s.weather.rain.toFixed(1)} · wind ${s.weather.wind.toFixed(1)}${s.weather.storm ? ' · storm' : ''}\n` +
      `Hearth: shellfish ${h.shellfish} · corms ${h.corms} · meat ${h.meat} · wood ${h.firewood}\n` +
      `Fires: ${s.fires.map((f) => f.intensity.toFixed(2)).join(' / ')} · stage ${s.stage} · ×${speed}`

    let text = 'Click someone to inspect them'
    if (selected?.kind === 'person') {
      const p = person(selected.id)
      if (p) {
        const rel = sim.relationOf(p.id)
        const names = (ids: string[]) => ids.map((id) => person(id)?.name ?? id).join(', ') || '—'
        const bar = (v: number) => '█'.repeat(Math.round(v * 10)).padEnd(10, '·')
        const task = p.task
        const animal = (id: string) => s.animals.find((q) => q.id === id)
        const target = task.targetId
          ? (world.pois.find((q) => q.id === task.targetId)?.label ??
            person(task.targetId)?.name ??
            animalLabel(animal(task.targetId)?.kind) ??
            task.targetId)
          : ''
        text =
          `${p.name}${p.isPlayer ? ' (you)' : ''} · ${p.look.sex} · ${p.look.ageYears.toFixed(1)} y${rel ? ` · ${rel}` : ''}\n` +
          `Task: ${task.kind}${task.skill ? ` [${SKILL_LABEL[task.skill]}]` : ''}${target ? ` → ${target}` : ''}\n` +
          `Anim: ${p.anim} · speed ${p.speed.toFixed(1)} · held ${p.held.left}/${p.held.right}\n` +
          `fed     ${bar(p.needs.fed)} ${p.needs.fed.toFixed(2)}\n` +
          `warmth  ${bar(p.needs.warmth)} ${p.needs.warmth.toFixed(2)}\n` +
          `energy  ${bar(p.needs.energy)} ${p.needs.energy.toFixed(2)}\n` +
          `health  ${bar(p.needs.health)} ${p.needs.health.toFixed(2)}\n` +
          `Skills: ${p.skills.map((k) => SKILL_LABEL[k]).join(', ') || '—'}\n` +
          `Bond ${p.bond.toFixed(2)} · ${p.known ? 'face known' : 'face not known'}\n` +
          `Mother ${names(p.motherId ? [p.motherId] : [])} · Father ${names(p.fatherId ? [p.fatherId] : [])}\n` +
          `Partner ${names(p.partnerId ? [p.partnerId] : [])} · Children ${names(p.childIds)}\n` +
          (p.carrying ? `Carrying ${person(p.carrying.id)?.name ?? ''} (${p.carrying.slot})\n` : '') +
          (p.speech ? `“${p.speech.text}”` : '')
      }
    } else if (selected?.kind === 'animal') {
      const a = s.animals.find((x) => x.id === selected?.id)
      const b = debugCtx(sim)?.brains.get(selected.id)
      if (a) {
        text = `${a.kind} ${a.id}\nAnim: ${a.anim} · speed ${a.speed.toFixed(1)}${a.altitude > 0.1 ? ` · ${a.altitude.toFixed(0)} m up` : ''}\n${a.alive ? 'alive' : 'dead'}${a.wounded ? ' · wounded' : ''}${b ? ` · ${b.mode}` : ''}`
      }
    }
    inspect.textContent = text
    const dir = debugDirector(sim)
    directorBox.style.display = dir ? 'flex' : 'none'
    if (dir) {
      const o = s.chapter.objective
      directorText.textContent = `Beat: ${s.chapter.beatId}${s.chapter.finished ? ' (life finished)' : ''}\nObjective: ${o ? o.text : '—'}\nNotes: ${s.notes.length} · time ×${(s.timeScale / DEFAULT_TIME_SCALE).toFixed(2)}`
    }
    if (logDirty) {
      logBox.textContent = log.slice(-150).join('\n')
      logBox.style.whiteSpace = 'pre-line'
      logBox.scrollTop = logBox.scrollHeight
      logDirty = false
    }
  }
  let logDirty = true

  // ─── loop ────────────────────────────────────────────────────────────────────────────────────────────────
  let raf = 0
  let last = performance.now()
  let panelTick = 0
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (speed > 0) {
      const before = log.length
      logEvents(sim.step(dt))
      if (log.length !== before) logDirty = true
    }
    draw()
    panelTick += dt
    if (panelTick > 0.1) {
      panelTick = 0
      updatePanel()
    }
    raf = requestAnimationFrame(frame)
  }

  resize()
  setView('band')
  setSpeed(1)
  raf = requestAnimationFrame(frame)

  // DEV handles for bx
  const api = {
    speed: (m: number) => {
      const s = SPEEDS.find((x) => x === m)
      if (s !== undefined) setSpeed(s)
    },
    /** fast-forward to an hour (and optionally a day) */
    jumpTo: (hour: number, day?: number) => {
      const s = sim.state
      const target = day ?? (s.clock.hour < hour ? s.clock.day : s.clock.day + 1)
      const saved = s.timeScale
      sim.command({ type: 'set-time-scale', scale: DEFAULT_TIME_SCALE })
      for (let i = 0; i < 40_000; i++) {
        if (s.clock.day > target || (s.clock.day === target && s.clock.hour >= hour)) break
        logEvents(sim.step(10 / DEFAULT_TIME_SCALE))
      }
      sim.command({ type: 'set-time-scale', scale: saved })
      logDirty = true
    },
    select: (nameOrId: string) => {
      const p = sim.state.people.find((q) => q.id === nameOrId || q.name.toLowerCase() === nameOrId.toLowerCase())
      selected = p ? { kind: 'person', id: p.id } : null
    },
    view: (name: string) => setView(name),
    state: () => sim.state,
    completeBeat: () => completeBeat(),
    beat: () => sim.state.chapter.beatId,
    restart: (st: LifeStageId, mode: 'story' | 'sandbox' = 'story') => {
      stage = st
      story = mode === 'story'
      stageSel.value = st
      modeSel.value = mode
      restart()
    },
  }
  if (import.meta.env.DEV) Object.assign(window, { __lab: api })

  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    window.removeEventListener('keydown', onKey)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('wheel', onWheel)
    Reflect.deleteProperty(window, '__lab')
    root.textContent = ''
  }
}
