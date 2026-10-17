/**
 * /lab/world: the coast with nobody in it. A free-fly camera (WASD + drag, Shift fast, Q/E down/up, wheel for
 * speed), sliders for the hour, the day of the year and the moon (the tide follows), weather, quality, and five
 * preset views. URL: ?view=cave&hour=17.5&day=70&moon=0&quality=high&cam=x,y,z,yaw,pitch,fov&rain=0&wind=0.25&fog=0&storm=0.
 * DEV handles on window.__lab for bx.
 */
import { PerspectiveCamera, Scene, Vector3 } from 'three'
import { clockAt, type ClockEpoch } from '../../core/clock'
import type { FireState, PersonActor, PersonAnim, Quality, Sex, WeatherState } from '../contracts'
import { createPerson, randomLook } from '../actors'
import { createHost } from '../engine/host'
import { LIGHT, POST, createRenderPipeline, isPaintedPipeline } from '../render/index'
import { createWorldData } from '../../world-gen/index'
import { CAVE, caveWorld } from '../../world-gen/layout'
import { createWorldView } from './index'

export type WorldLabApi = {
  view(name: string): void
  setHour(h: number): void
  setMoon(p: number): void
  setDay(d: number): void
  setWeather(w: Partial<WeatherState>): void
  setQuality(q: Quality): void
  /** where the camera is and where it looks (for composing views) */
  where(): { x: number; y: number; z: number; yaw: number; pitch: number; seaLevel: number; hour: number }
  place(x: number, y: number, z: number, yaw: number, pitch: number): void
  /** 'raw' draws the scene straight to the canvas (no post chain), 'post' the normal chain */
  debug(mode: 'raw' | 'post'): void
}

type ViewDef = { x: number; y: number; z: number; yaw: number; pitch: number; fov?: number }

const VIEW_NAMES = ['cave', 'shore', 'cove', 'plateau', 'aerial'] as const

function isQuality(s: string | null): s is Quality {
  return s === 'low' || s === 'medium' || s === 'high'
}

export function mount(el: HTMLElement): () => void {
  const host = createHost(el)
  const pipeline = createRenderPipeline(host.renderer)
  const t0 = performance.now()
  const world = createWorldData(80_000)
  const genMs = performance.now() - t0
  const view = createWorldView(world, pipeline)
  const scene = new Scene()
  scene.add(view.root)
  const camera = new PerspectiveCamera(50, 1, 0.1, 40000)

  const q = new URLSearchParams(window.location.search)
  const num = (k: string, d: number) => {
    const v = q.get(k)
    const n = v === null ? NaN : Number(v)
    return Number.isFinite(n) ? n : d
  }
  const epoch: ClockEpoch = { dayOfYear: num('day', 70), hour: num('hour', 17.5), moonPhase: num('moon', 0), year: 0 }
  const weather: WeatherState = {
    cloud: num('cloud', 0.3),
    rain: num('rain', 0),
    wind: num('wind', 0.25),
    windDir: num('windDir', 0.6),
    fog: num('fog', 0),
    storm: q.get('storm') === '1',
  }
  const qp = q.get('quality')
  if (isQuality(qp)) pipeline.setQuality(qp)

  // the preset views
  const ground = (x: number, z: number) => world.heightAt(x, z)
  // standing behind the main hearth, looking out over the shelf and the cove into the sun (the concept painting)
  const caveEye = caveWorld(-7.5, -1)
  const views: Record<(typeof VIEW_NAMES)[number], ViewDef> = {
    cave: { x: caveEye.x, y: CAVE.floor + 5.2, z: caveEye.z, yaw: -1.0, pitch: -0.44, fov: 82 },
    shore: { x: 6, y: ground(6, 168) + 1.6, z: 168, yaw: -0.9, pitch: 0.02, fov: 55 },
    cove: { x: -150, y: ground(-150, 112) + 1.7, z: 112, yaw: -1.75, pitch: 0.0, fov: 55 },
    plateau: { x: -40, y: ground(-40, -420) + 1.7, z: -420, yaw: Math.PI, pitch: 0.03, fov: 50 },
    aerial: { x: 260, y: 230, z: 560, yaw: -2.6, pitch: -0.32, fov: 50 },
  }

  const pos = new Vector3()
  let yaw = 0
  let pitch = 0
  const place = (x: number, y: number, z: number, yw: number, pt: number) => {
    pos.set(x, y, z)
    yaw = yw
    pitch = pt
  }
  const setView = (name: string) => {
    const v = (views as Record<string, ViewDef | undefined>)[name]
    if (!v) return
    place(v.x, v.y, v.z, v.yaw, v.pitch)
    camera.fov = v.fov ?? 50
    camera.updateProjectionMatrix()
  }
  setView(q.get('view') ?? 'cave')
  // ?cam=x,y,z,yaw,pitch[,fov] overrides the preset
  const cam = (q.get('cam') ?? '').split(',').map(Number)
  if (cam.length >= 5 && cam.every((v) => Number.isFinite(v))) {
    place(cam[0] ?? 0, cam[1] ?? 0, cam[2] ?? 0, cam[3] ?? 0, cam[4] ?? 0)
    if (cam[5] !== undefined) {
      camera.fov = cam[5]
      camera.updateProjectionMatrix()
    }
  }

  // the panel
  const panel = document.createElement('div')
  panel.style.cssText =
    'position:absolute;top:10px;right:10px;z-index:40;width:250px;padding:10px 12px;border-radius:8px;' +
    'background:rgba(24,18,14,.72);color:#efe3c8;font:12px/1.4 ui-sans-serif,system-ui,sans-serif;' +
    'backdrop-filter:blur(4px);user-select:none'
  el.style.position ||= 'relative'
  el.appendChild(panel)
  const info = document.createElement('div')
  info.style.cssText = 'font:11px/1.35 ui-monospace,monospace;opacity:.85;margin-bottom:6px;white-space:pre'
  panel.appendChild(info)
  const sliders: Record<string, HTMLInputElement> = {}
  const slider = (label: string, min: number, max: number, step: number, value: number, on: (v: number) => void) => {
    const row = document.createElement('label')
    row.style.cssText = 'display:grid;grid-template-columns:52px 1fr;align-items:center;gap:6px;margin:3px 0'
    const span = document.createElement('span')
    span.textContent = label
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(value)
    input.style.width = '100%'
    input.addEventListener('input', () => on(Number(input.value)))
    row.append(span, input)
    panel.appendChild(row)
    sliders[label] = input
  }
  slider('hour', 0, 24, 0.05, epoch.hour, (v) => (epoch.hour = v))
  slider('day', 0, 364, 1, epoch.dayOfYear, (v) => (epoch.dayOfYear = v))
  slider('moon', 0, 1, 0.01, epoch.moonPhase, (v) => (epoch.moonPhase = v))
  slider('cloud', 0, 1, 0.01, weather.cloud, (v) => (weather.cloud = v))
  slider('fog', 0, 1, 0.01, weather.fog, (v) => (weather.fog = v))
  slider('wind', 0, 1, 0.01, weather.wind, (v) => (weather.wind = v))
  slider('rain', 0, 1, 0.01, weather.rain, (v) => (weather.rain = v))
  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px'
  panel.appendChild(btnRow)
  const button = (label: string, on: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'flex:1 0 auto;padding:3px 7px;border-radius:5px;border:1px solid rgba(239,227,200,.3);background:rgba(239,227,200,.08);color:inherit;font:inherit;cursor:pointer'
    b.addEventListener('click', on)
    btnRow.appendChild(b)
    return b
  }
  for (const name of VIEW_NAMES) button(name, () => setView(name))
  let firesOn = true
  const fireBtn = button('fire: on', () => {
    firesOn = !firesOn
    fireBtn.textContent = firesOn ? 'fire: on' : 'fire: off'
  })
  const stormBtn = button(weather.storm ? 'storm: on' : 'storm: off', () => {
    weather.storm = !weather.storm
    stormBtn.textContent = weather.storm ? 'storm: on' : 'storm: off'
  })
  let running = false
  const runBtn = button('time: paused', () => {
    running = !running
    runBtn.textContent = running ? 'time: running' : 'time: paused'
  })
  const qSel = document.createElement('select')
  qSel.style.cssText = 'margin-top:6px;width:100%;background:rgba(239,227,200,.08);color:inherit;border:1px solid rgba(239,227,200,.3);border-radius:5px;font:inherit'
  for (const o of ['high', 'medium', 'low'] as const) {
    const opt = document.createElement('option')
    opt.value = o
    opt.textContent = `quality: ${o}`
    qSel.appendChild(opt)
  }
  qSel.value = isPaintedPipeline(pipeline) ? pipeline.quality : 'high'
  qSel.addEventListener('change', () => {
    if (isQuality(qSel.value)) pipeline.setQuality(qSel.value)
  })
  panel.appendChild(qSel)
  const help = document.createElement('div')
  help.style.cssText = 'margin-top:6px;opacity:.6;font-size:11px'
  help.textContent = 'WASD fly · drag look · Q/E down/up · Shift fast · wheel speed'
  panel.appendChild(help)

  // the camera controls
  const keys = new Set<string>()
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
    if (e.type === 'keydown') keys.add(e.code)
    else keys.delete(e.code)
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  const onBlur = () => keys.clear()
  window.addEventListener('blur', onBlur)
  let dragging = false
  let lx = 0
  let ly = 0
  const canvas = host.canvas
  const onDown = (e: PointerEvent) => {
    dragging = true
    lx = e.clientX
    ly = e.clientY
    canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const k = (camera.fov / 50) * 0.0042
    yaw -= (e.clientX - lx) * k
    pitch = Math.max(-1.5, Math.min(1.5, pitch - (e.clientY - ly) * k))
    lx = e.clientX
    ly = e.clientY
  }
  const onUp = (e: PointerEvent) => {
    dragging = false
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
  }
  let speedK = 1
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    speedK = Math.max(0.1, Math.min(20, speedK * (e.deltaY > 0 ? 0.85 : 1.18)))
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  const api: WorldLabApi = {
    view: setView,
    setHour(h) {
      epoch.hour = h
      const s = sliders.hour
      if (s) s.value = String(h)
    },
    setMoon(p) {
      epoch.moonPhase = p
      const s = sliders.moon
      if (s) s.value = String(p)
    },
    setDay(d) {
      epoch.dayOfYear = d
      const s = sliders.day
      if (s) s.value = String(d)
    },
    setWeather(w) {
      Object.assign(weather, w)
    },
    setQuality(qq) {
      pipeline.setQuality(qq)
      qSel.value = qq
    },
    where() {
      const c = clockAt(0, epoch)
      return { x: pos.x, y: pos.y, z: pos.z, yaw, pitch, seaLevel: c.seaLevel, hour: c.hour }
    },
    place,
    debug(mode) {
      raw = mode === 'raw'
    },
  }
  if (import.meta.env.DEV) Object.assign(window, { __lab: api, __labScene: { scene, camera, renderer: host.renderer, pipeline, LIGHT, POST } })

  const offResize = host.onResize((s) => {
    pipeline.setSize(s.width, s.height, s.dpr)
    camera.aspect = s.width / s.height
    camera.updateProjectionMatrix()
  })

  const fwd = new Vector3()
  const right = new Vector3()
  const look = new Vector3()
  const focus = { x: 0, y: 0, z: 0 }
  const fires: FireState[] = []
  const hearths = world.pois.filter((p) => p.kind === 'hearth')
  // ?people=1: a band round the main hearth, to judge faces by firelight: four seated across a 3 m fire, two
  // standing back at 4 and 7.5 m
  const band: PersonActor[] = []
  const h0 = hearths[0]
  if (q.get('people') === '1' && h0) {
    const inX = -Math.sin(CAVE.heading)
    const inZ = -Math.cos(CAVE.heading)
    const seats: [number, number, PersonAnim, Sex, number][] = [
      [0.35, 1.5, 'sit', 'female', 64],
      [-0.45, 1.5, 'sit', 'male', 34],
      [1.6, 1.5, 'sit', 'female', 27],
      [-1.75, 1.5, 'sit', 'male', 9],
      [0.15, 4, 'idle', 'male', 30],
      [-0.6, 7.5, 'idle', 'female', 22],
    ]
    seats.forEach(([ang, r, anim, sex, age], i) => {
      const dx = inX * Math.cos(ang) - inZ * Math.sin(ang)
      const dz = inZ * Math.cos(ang) + inX * Math.sin(ang)
      const x = h0.x + dx * r
      const z = h0.z + dz * r
      const p = createPerson(randomLook(101 + i * 17, sex, age))
      p.object.position.set(x, world.heightAt(x, z), z)
      p.object.rotation.y = Math.atan2(h0.x - x, h0.z - z)
      p.setAnim(anim, 0)
      scene.add(p.object)
      band.push(p)
    })
  }
  let frames = 0
  let raw = q.get('post') === '0'
  const offFrame = host.onFrame((dt) => {
    // fly
    fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    right.set(-Math.cos(yaw), 0, Math.sin(yaw))
    const lift = Math.max(0, pos.y - world.heightAt(pos.x, pos.z))
    const sp = (4 + lift * 0.6) * speedK * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6 : 1) * dt
    if (keys.has('KeyW')) pos.addScaledVector(fwd, sp)
    if (keys.has('KeyS')) pos.addScaledVector(fwd, -sp)
    if (keys.has('KeyA')) pos.addScaledVector(right, -sp)
    if (keys.has('KeyD')) pos.addScaledVector(right, sp)
    if (keys.has('KeyE') || keys.has('Space')) pos.y += sp
    if (keys.has('KeyQ')) pos.y -= sp
    pos.y = Math.max(pos.y, world.heightAt(pos.x, pos.z) + 0.3)
    camera.position.copy(pos)
    look.copy(pos).add(fwd)
    camera.lookAt(look)
    camera.updateMatrixWorld()

    if (running) epoch.hour += (dt * 72) / 3600
    if (epoch.hour >= 24) {
      epoch.hour -= 24
      epoch.dayOfYear = (epoch.dayOfYear + 1) % 365
    }
    const clock = clockAt(0, epoch)

    // detail centres on the ground a little ahead of the camera
    const ahead = Math.min(40, 8 + lift * 0.5)
    focus.x = pos.x + Math.sin(yaw) * ahead
    focus.z = pos.z + Math.cos(yaw) * ahead
    focus.y = world.heightAt(focus.x, focus.z)

    fires.length = 0
    if (firesOn) hearths.forEach((h, i) => fires.push({ id: h.id, x: h.x, z: h.z, intensity: i === 0 ? 1 : 0.65 }))

    view.update({ dt, clock, weather, camera, fires, focus })
    for (const p of band) p.update(dt)
    if (raw) {
      host.renderer.setRenderTarget(null)
      host.renderer.clear(true, true, true)
      host.renderer.render(scene, camera)
    } else pipeline.render(scene, camera, dt)

    if ((frames++ & 15) === 0) {
      const sunEl = (Math.asin(clock.sunDir.y) * 180) / Math.PI
      const hh = Math.floor(clock.hour)
      const mm = Math.floor((clock.hour - hh) * 60)
      info.textContent =
        `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  day ${clock.dayOfYear}  ${clock.season}\n` +
        `sun ${sunEl.toFixed(1)}°  moon ${clock.moonPhase.toFixed(2)}\n` +
        `sea ${clock.seaLevel.toFixed(2)} m  tide ${clock.tide.toFixed(2)}\n` +
        `cam ${pos.x.toFixed(0)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(0)}  gen ${genMs.toFixed(0)} ms`
    }
  })

  return () => {
    offFrame()
    offResize()
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('keyup', onKey)
    window.removeEventListener('blur', onBlur)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('wheel', onWheel)
    if (import.meta.env.DEV) Object.assign(window, { __lab: undefined })
    for (const p of band) p.dispose()
    view.dispose()
    pipeline.dispose()
    panel.remove()
    host.dispose()
  }
}

