/**
 * Engraving: scrape lines across the smoothed face of a piece of red ochre with a stone point. Every line stays;
 * there is no wrong answer. Quality is how many lines you made. The finished lines are kept in localStorage
 * (`ochre:engraving`) so the life summary can show the mark you left.
 */
import { useEffect, useRef, useState } from 'react'
import { useBridge } from '~/game/bridge'
import { MenuButton } from '../widgets'
import { loadImage, MinigameFrame, ResultCard, useCanvasLoop, useVoice } from './kit'
import { uiSfx } from './sound'

const BG = '/art/minigames/engrave-bg.webp'
/** working resolution of the ink and the ochre mask, in image pixels */
const INK_W = 1600
const MIN_LINE = 60
export const ENGRAVING_KEY = 'ochre:engraving'

/** whose life made it, so a later life doesn't inherit the mark */
export type SavedEngraving = { name: string; aspect: number; strokes: number[][] }

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty']
export const countWord = (n: number) => NUMBER_WORDS[n] ?? String(n)

type Ink = {
  img: HTMLImageElement
  ink: HTMLCanvasElement
  mask: HTMLCanvasElement
  maskData: Uint8Array
  h: number
}

/** the mask works on a quarter-size copy, so the painting's speckle averages out */
const MASK_DOWN = 4

/** the ochre piece: reddish pixels connected to the middle of the painting */
function buildMask(img: HTMLImageElement): { canvas: HTMLCanvasElement; data: Uint8Array; h: number } | null {
  const h = Math.round((img.naturalHeight / img.naturalWidth) * INK_W)
  const w = INK_W / MASK_DOWN
  const mh = Math.round(h / MASK_DOWN)
  const src = document.createElement('canvas')
  src.width = w
  src.height = mh
  const sctx = src.getContext('2d', { willReadFrequently: true })
  if (!sctx) return null
  sctx.drawImage(img, 0, 0, w, mh)
  const px = sctx.getImageData(0, 0, w, mh).data
  const red = (i: number) => {
    const r = px[i * 4] ?? 0
    const g = px[i * 4 + 1] ?? 0
    const b = px[i * 4 + 2] ?? 0
    return ((r > 140 && r > g * 1.8) || (r > 85 && r > g * 2.7)) && r > b * 1.9
  }
  const data = new Uint8Array(w * mh)
  const stack = [Math.floor(mh / 2) * w + Math.floor(w / 2)]
  while (stack.length > 0) {
    const i = stack.pop() ?? 0
    if (data[i] || !red(i)) continue
    data[i] = 1
    const x = i % w
    if (x > 0) stack.push(i - 1)
    if (x < w - 1) stack.push(i + 1)
    if (i >= w) stack.push(i - w)
    if (i < w * (mh - 1)) stack.push(i + w)
  }
  const small = document.createElement('canvas')
  small.width = w
  small.height = mh
  const mctx = small.getContext('2d')
  if (!mctx) return null
  const out = mctx.createImageData(w, mh)
  for (let i = 0; i < w * mh; i++) out.data[i * 4 + 3] = data[i] ? 255 : 0
  mctx.putImageData(out, 0, 0)
  // scale up smoothly and soften the edge
  const canvas = document.createElement('canvas')
  canvas.width = INK_W
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.filter = 'blur(4px)'
  ctx.drawImage(small, 0, 0, INK_W, h)
  return { canvas, data, h }
}

export function Engraving({ onDone }: { onDone: (quality: number) => void }) {
  const { line, say } = useVoice(null)
  const name = useBridge((s) => s.hud.name)
  const canvas = useRef<HTMLCanvasElement>(null)
  const inkRef = useRef<Ink | null>(null)
  const strokes = useRef<number[][]>([])
  const current = useRef<{ pts: number[]; length: number } | null>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const [lines, setLines] = useState(0)
  const [result, setResult] = useState<{ quality: number; n: number } | null>(null)
  const sayRef = useRef(say)
  sayRef.current = say

  useEffect(() => {
    let live = true
    void loadImage(BG).then((img) => {
      if (!live) return
      const m = buildMask(img)
      if (!m) return
      const ink = document.createElement('canvas')
      ink.width = INK_W
      ink.height = m.h
      inkRef.current = { img, ink, mask: m.canvas, maskData: m.data, h: m.h }
    })
    sayRef.current('The ochre is smooth where you ground it. The stone point is sharp.', 4200, true)
    return () => {
      live = false
    }
  }, [])

  /** the cover fit the CSS background uses, so the ink lines up with the painting */
  const fit = (w: number, h: number) => {
    const ink = inkRef.current
    const ih = ink ? ink.h : INK_W * (2 / 3)
    const s = Math.max(w / INK_W, h / ih)
    return { s, ox: (w - INK_W * s) / 2, oy: (h - ih * s) / 2 }
  }

  const inside = (x: number, y: number) => {
    const ink = inkRef.current
    if (!ink) return false
    const w = INK_W / MASK_DOWN
    const xi = Math.floor(x / MASK_DOWN)
    const yi = Math.floor(y / MASK_DOWN)
    if (xi < 0 || yi < 0 || xi >= w || yi >= Math.round(ink.h / MASK_DOWN)) return false
    return ink.maskData[yi * w + xi] === 1
  }

  /** one scraped segment: a shadowed groove with pale powder in it and a few flecks */
  const scrape = (x0: number, y0: number, x1: number, y1: number) => {
    const ink = inkRef.current
    const ctx = ink?.ink.getContext('2d')
    if (!ink || !ctx) return
    const seg = (dx: number, dy: number, width: number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(x0 + dx, y0 + dy)
      ctx.lineTo(x1 + dx, y1 + dy)
      ctx.stroke()
    }
    ctx.lineCap = 'round'
    ctx.globalCompositeOperation = 'source-over'
    seg(1.3, 1.5, 4.6, 'rgba(48, 12, 6, 0.42)')
    seg(0, 0, 2.6, 'rgba(232, 140, 100, 0.55)')
    seg(-0.5, -0.6, 1, 'rgba(255, 196, 166, 0.34)')
    const d = Math.hypot(x1 - x0, y1 - y0)
    for (let i = 0; i < d / 3; i++) {
      const t = Math.random()
      ctx.fillStyle = `rgba(240, 186, 156, ${0.25 + Math.random() * 0.35})`
      ctx.fillRect(x0 + (x1 - x0) * t + (Math.random() - 0.5) * 7, y0 + (y1 - y0) * t + (Math.random() - 0.5) * 7, 1.2, 1.2)
    }
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(ink.mask, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
  }

  useCanvasLoop(canvas, (ctx, w, h) => {
    const ink = inkRef.current
    const { s, ox, oy } = fit(w, h)
    if (ink) ctx.drawImage(ink.ink, ox, oy, INK_W * s, ink.h * s)
    // the stone point as the cursor: a small pale flake, its tip on the pointer
    const p = pointer.current
    if (p && !result) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(-0.6)
      ctx.shadowColor = 'rgba(10, 5, 2, 0.6)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetX = 4
      ctx.shadowOffsetY = 6
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(12, -44)
      ctx.lineTo(4, -70)
      ctx.lineTo(-12, -58)
      ctx.lineTo(-9, -30)
      ctx.closePath()
      const g = ctx.createLinearGradient(-12, -60, 12, 0)
      g.addColorStop(0, '#e6d2b8')
      g.addColorStop(1, '#a8805e')
      ctx.fillStyle = g
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.strokeStyle = 'rgba(60, 35, 20, 0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }
  })

  const toInk = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    pointer.current = { x, y }
    const { s, ox, oy } = fit(r.width, r.height)
    return { x: (x - ox) / s, y: (y - oy) / s }
  }

  const endStroke = () => {
    const c = current.current
    current.current = null
    if (!c || c.pts.length < 4) return
    strokes.current.push(c.pts.map((v) => Math.round(v * 10) / 10))
    if (c.length < MIN_LINE) return
    const n = lines + 1
    setLines(n)
    if (n === 1) say('A pale line opens in the red.', 3600, true)
    else if (n === 4) say('Line by line, a pattern that was not there before.', 4000, true)
    else if (n === 9) say('No one asked for this. You make it anyway.', 4000, true)
  }

  const finish = () => {
    const ink = inkRef.current
    const saved: SavedEngraving = {
      name,
      aspect: ink ? INK_W / ink.h : 1.5,
      strokes: strokes.current.map((pts) => pts.map((v, i) => Math.round((v / (i % 2 === 0 ? INK_W : (ink?.h ?? INK_W))) * 1000) / 1000)),
    }
    try {
      window.localStorage.setItem(ENGRAVING_KEY, JSON.stringify(saved))
    } catch {
      // storage can be unavailable (private windows); the engraving still counts
    }
    setResult({ quality: Math.min(1, lines / 10), n: lines })
  }

  return (
    <MinigameFrame
      title="Engrave the ochre"
      background={BG}
      hint={
        <>
          Drag the stone point across the ochre. Every line stays.
          {lines > 0 && (
            <span className="ml-2 font-serif text-amber" style={{ fontVariationSettings: '"opsz" 24' }}>
              {lines} {lines === 1 ? 'line' : 'lines'}
            </span>
          )}
        </>
      }
      line={line}
      actions={
        <MenuButton primary disabled={lines < 1} onClick={finish}>
          Set it down
        </MenuButton>
      }
      done={
        result && (
          <ResultCard
            heading={`${countWord(result.n)} ${result.n === 1 ? 'line' : 'lines'}`}
            body="Someone, a very long time from now, will hold this and wonder who made it."
            onContinue={() => onDone(result.quality)}
          />
        )
      }>
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: result ? 'default' : 'none' }}
        onPointerDown={(e) => {
          if (result) return
          const p = toInk(e)
          if (!inside(p.x, p.y)) return
          e.currentTarget.setPointerCapture(e.pointerId)
          current.current = { pts: [p.x, p.y], length: 0 }
          uiSfx('gather')
        }}
        onPointerMove={(e) => {
          const p = toInk(e)
          const c = current.current
          if (!c) return
          const lx = c.pts[c.pts.length - 2] ?? p.x
          const ly = c.pts[c.pts.length - 1] ?? p.y
          const d = Math.hypot(p.x - lx, p.y - ly)
          if (d < 3) return
          // the point skitters a little across the grain
          const jx = p.x + (Math.random() - 0.5) * 1.2
          const jy = p.y + (Math.random() - 0.5) * 1.2
          if (inside(jx, jy) || inside(lx, ly)) scrape(lx, ly, jx, jy)
          c.pts.push(jx, jy)
          c.length += d
        }}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={() => {
          pointer.current = null
        }}
      />
    </MinigameFrame>
  )
}
