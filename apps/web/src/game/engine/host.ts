/**
 * The page's one renderer, its frame loop and resize handling. Owned by the lead.
 * Everything that draws goes through a host; a page creates at most one.
 * The render pipeline (post chain, tone mapping) belongs to game/render; the host only owns the WebGLRenderer.
 */
import { WebGLRenderer } from 'three'

export type HostSize = { width: number; height: number; dpr: number }
export type FrameCallback = (dt: number, elapsed: number) => void

export type GameHost = {
  readonly renderer: WebGLRenderer
  readonly canvas: HTMLCanvasElement
  readonly size: HostSize
  /** called every animation frame with dt in seconds (clamped to 0.1); returns an unsubscribe */
  onFrame(cb: FrameCallback): () => void
  onResize(cb: (size: HostSize) => void): () => void
  /** pause stops calling frame callbacks (the canvas keeps its last frame) */
  setPaused(paused: boolean): void
  dispose(): void
}

export type HostOptions = {
  /** cap on devicePixelRatio (default 2) */
  maxDpr?: number
  /** show the fps / draw-call line (default: true when the URL has ?stats=1) */
  stats?: boolean
}

let liveHosts = 0

export function createHost(container: HTMLElement, opts: HostOptions = {}): GameHost {
  if (liveHosts > 0) console.warn('[host] a second GameHost was created on this page; dispose the first one')
  liveHosts++

  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.touchAction = 'none'
  container.appendChild(canvas)

  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    // the world spans 0.1 m details to 20 km mountains; reversed depth (EXT_clip_control) stops waterline flicker
    reversedDepthBuffer: true,
  })
  renderer.info.autoReset = false

  const maxDpr = opts.maxDpr ?? 2
  const size: HostSize = { width: 1, height: 1, dpr: 1 }
  const resizeListeners = new Set<(s: HostSize) => void>()
  const frameListeners = new Set<FrameCallback>()

  const applySize = () => {
    const rect = container.getBoundingClientRect()
    size.width = Math.max(1, Math.floor(rect.width))
    size.height = Math.max(1, Math.floor(rect.height))
    size.dpr = Math.min(maxDpr, window.devicePixelRatio || 1)
    renderer.setPixelRatio(size.dpr)
    renderer.setSize(size.width, size.height, false)
    for (const l of resizeListeners) l(size)
  }
  const observer = new ResizeObserver(applySize)
  observer.observe(container)
  applySize()

  const showStats = opts.stats ?? new URLSearchParams(window.location.search).has('stats')
  let statsEl: HTMLDivElement | null = null
  if (showStats) {
    statsEl = document.createElement('div')
    statsEl.style.cssText =
      'position:absolute;left:8px;bottom:8px;z-index:50;font:11px/1.3 ui-monospace,monospace;color:#fff;' +
      'background:rgba(0,0,0,.55);padding:4px 7px;border-radius:4px;pointer-events:none;white-space:pre'
    container.style.position ||= 'relative'
    container.appendChild(statsEl)
  }

  let paused = false
  let raf = 0
  let last = performance.now()
  let elapsed = 0
  let fpsFrames = 0
  let fpsTime = 0
  let fps = 0

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick)
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (paused) return
    elapsed += dt
    renderer.info.reset()
    for (const cb of frameListeners) cb(dt, elapsed)
    if (statsEl) {
      fpsFrames++
      fpsTime += dt
      if (fpsTime >= 0.5) {
        fps = Math.round(fpsFrames / fpsTime)
        fpsFrames = 0
        fpsTime = 0
        const r = renderer.info.render
        statsEl.textContent = `${fps} fps · ${r.calls} calls · ${(r.triangles / 1000).toFixed(0)}k tris · ${size.width}×${size.height}@${size.dpr}`
      }
    }
  }
  raf = requestAnimationFrame(tick)

  return {
    renderer,
    canvas,
    size,
    onFrame(cb) {
      frameListeners.add(cb)
      return () => frameListeners.delete(cb)
    },
    onResize(cb) {
      resizeListeners.add(cb)
      cb(size)
      return () => resizeListeners.delete(cb)
    },
    setPaused(p) {
      paused = p
      last = performance.now()
    },
    dispose() {
      cancelAnimationFrame(raf)
      observer.disconnect()
      frameListeners.clear()
      resizeListeners.clear()
      renderer.dispose()
      canvas.remove()
      statsEl?.remove()
      liveHosts--
    },
  }
}
