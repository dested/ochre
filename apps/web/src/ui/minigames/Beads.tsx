/**
 * Beads: pierce small Nassarius shells with a bone awl and string them. The awl sways over the shell: press when its
 * tip is over the thin place near the lip, hold to push, and let go while the pressure is in the marked band. Too
 * little and it isn't through; too much and the shell cracks. Eight on the string from a pile of twelve.
 */
import { useEffect, useRef, useState } from 'react'
import { C } from '../palette'
import { TextButton } from '../widgets'
import { countWord } from './Engraving'
import { loadImage, MinigameFrame, ResultCard, useCanvasLoop, useRelative, useVoice } from './kit'
import { uiSfx } from './sound'

const BG = '/art/minigames/bead-bg.webp'
const GOAL = 8
const PILE = 12
/** where the shell sits on the painted anvil, as a fraction of the painting */
const ANVIL = { u: 0.53, v: 0.6 }
/** the thin place on the shell sprite (fractions of the sprite box) */
const SPOT = { u: 0.47, v: 0.7 }
/** the painted cord, as points along it in fractions of the painting */
const CORD = [
  { u: 0.21, v: 0.96 },
  { u: 0.5, v: 0.915 },
  { u: 0.75, v: 0.885 },
  { u: 1, v: 0.845 },
]
const IMG_W = 1600
const IMG_H = 1600 * (1024 / 1536)

/** the cover fit of the background, and a point on the painted cord at u (0..1 across the painting) */
function cordAt(u: number, w: number, h: number) {
  const s = Math.max(w / IMG_W, h / IMG_H)
  const ox = (w - IMG_W * s) / 2
  const oy = (h - IMG_H * s) / 2
  let v = CORD[0]?.v ?? 0.9
  for (let i = 1; i < CORD.length; i++) {
    const a = CORD[i - 1]
    const b = CORD[i]
    if (a && b && u >= a.u && u <= b.u) v = a.v + ((u - a.u) / (b.u - a.u)) * (b.v - a.v)
  }
  return { x: ox + u * IMG_W * s, y: oy + v * IMG_H * s }
}

type Phase =
  | { kind: 'arrive'; t: number }
  | { kind: 'sway'; t: number }
  | { kind: 'press'; x: number; acc: number; p: number; holding: boolean }
  | { kind: 'pierced'; t: number; x: number }
  | { kind: 'cracked'; t: number; x: number }
  | { kind: 'over' }

type ShellSetup = { spot: number; tilt: number; speed: number; zone: number; rate: number }

const setupFor = (i: number): ShellSetup => {
  const r = (k: number) => {
    const s = Math.sin((i + 1) * 91.7 + k * 13.1) * 43758.5
    return s - Math.floor(s)
  }
  return { spot: (r(1) - 0.5) * 0.08, tilt: (r(2) - 0.5) * 0.24, speed: 2.1 + i * 0.22 + r(3) * 0.4, zone: 0.58 + r(4) * 0.12, rate: 0.5 + r(5) * 0.25 }
}

export function Beads({ onDone }: { onDone: (quality: number) => void }) {
  const mother = useRelative(/^mother$/i) ?? 'Ama'
  const { line, say } = useVoice(mother)
  const canvas = useRef<HTMLCanvasElement>(null)
  const art = useRef<{ shell: HTMLImageElement | null; awl: HTMLImageElement | null }>({ shell: null, awl: null })
  const phase = useRef<Phase>({ kind: 'arrive', t: 0 })
  const shellIndex = useRef(0)
  const precision = useRef<number[]>([])
  const [strung, setStrung] = useState(0)
  const [left, setLeft] = useState(PILE - 1)
  const [result, setResult] = useState<{ quality: number; n: number } | null>(null)
  const sayRef = useRef(say)
  sayRef.current = say
  const said = useRef(new Set<string>())

  useEffect(() => {
    let live = true
    void Promise.all([loadImage('/art/minigames/shell.webp'), loadImage('/art/minigames/awl.webp')]).then(([shell, awl]) => {
      if (live) art.current = { shell, awl }
    })
    sayRef.current('Find the thin place near the lip. Then push, slowly.', 4200)
    if (import.meta.env.DEV) Object.assign(window, { __beads: { phase, setup: () => setupFor(shellIndex.current) } })
    return () => {
      live = false
    }
  }, [])

  const finish = (n: number) => {
    const avg = precision.current.length > 0 ? precision.current.reduce((s, p) => s + p, 0) / precision.current.length : 0
    phase.current = { kind: 'over' }
    setResult({ quality: Math.min(1, 0.65 * (n / GOAL) + 0.35 * avg * (n > 0 ? 1 : 0)), n })
  }

  const nextShell = (n: number) => {
    if (n >= GOAL || shellIndex.current >= PILE - 1) {
      finish(n)
      return
    }
    shellIndex.current += 1
    setLeft(PILE - 1 - shellIndex.current)
    phase.current = { kind: 'arrive', t: 0 }
  }

  /** the layout of this frame: the shell on the anvil, its size, and the sway */
  const layout = (w: number, h: number) => {
    const s = Math.max(w / IMG_W, h / IMG_H)
    const ax = (w - IMG_W * s) / 2 + ANVIL.u * IMG_W * s
    const ay = (h - IMG_H * s) / 2 + ANVIL.v * IMG_H * s
    const size = Math.min(h * 0.34, w * 0.26)
    const setup = setupFor(shellIndex.current)
    const spotX = ax + (SPOT.u - 0.5 + setup.spot) * size
    const spotY = ay - size * 0.5 + SPOT.v * size
    return { ax, ay, size, setup, spotX, spotY, halfWidth: size * 0.22 }
  }

  const press = (w: number, h: number) => {
    const ph = phase.current
    if (result) return
    if (ph.kind === 'sway') {
      const L = layout(w, h)
      const x = L.spotX + Math.sin(ph.t * L.setup.speed) * L.halfWidth * 1.5
      const dx = Math.abs(x - L.spotX)
      if (dx > L.halfWidth * 0.95) {
        sayRef.current('It slid off. Steady.', 2600)
        return
      }
      phase.current = { kind: 'press', x, acc: Math.max(0, 1 - dx / (L.halfWidth * 0.55)), p: 0, holding: true }
    } else if (ph.kind === 'press' && !ph.holding && ph.p === 0) {
      phase.current = { ...ph, holding: true }
    }
  }

  const release = (w: number, h: number) => {
    const ph = phase.current
    if (ph.kind !== 'press' || !ph.holding) return
    const L = layout(w, h)
    const zw = 0.08 + 0.12 * ph.acc
    const z0 = L.setup.zone
    if (ph.p < z0) {
      phase.current = { ...ph, holding: false }
      if (!said.current.has('under')) {
        said.current.add('under')
        sayRef.current('Not through yet. Press again, a little longer.', 3000)
      }
      return
    }
    if (ph.p <= z0 + zw) {
      const mid = z0 + zw / 2
      precision.current.push(0.5 * ph.acc + 0.5 * Math.max(0, 1 - Math.abs(ph.p - mid) / (zw / 2)))
      phase.current = { kind: 'pierced', t: 0, x: ph.x }
      uiSfx('gather')
      const n = strung + 1
      setStrung(n)
      if (n === 1) sayRef.current('Clean through. Now string it.', 3000)
      else if (n === GOAL - 1) sayRef.current('One more.', 2400)
      return
    }
    crack(ph.x)
  }

  const crack = (x: number) => {
    phase.current = { kind: 'cracked', t: 0, x }
    uiSfx('hit')
    if (!said.current.has('crack')) {
      said.current.add('crack')
      sayRef.current('Too hard. They are fragile. Take another.', 3200)
    }
  }

  // Space works like the mouse button
  useEffect(() => {
    const size = () => {
      const el = canvas.current
      return { w: el?.clientWidth ?? 0, h: el?.clientHeight ?? 0 }
    }
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()
      const { w, h } = size()
      press(w, h)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const { w, h } = size()
      release(w, h)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  useCanvasLoop(canvas, (ctx, w, h, dt) => {
    const L = layout(w, h)
    const { shell, awl } = art.current
    const ph = phase.current

    // the beads ride the painted cord along the bottom
    const beadSize = Math.min(66, h * 0.08)
    const beadPos = (i: number) => cordAt(0.42 + (i / (GOAL - 1)) * 0.36, w, h)
    const onString = ph.kind === 'pierced' ? strung - 1 : strung
    for (let i = 0; i < onString; i++) {
      const b = beadPos(i)
      drawShell(ctx, shell, b.x, b.y + beadSize * 0.05, beadSize, Math.PI + (i % 2 ? 0.12 : -0.12), true)
    }

    if (ph.kind === 'over') return

    const setup = L.setup
    let shellX = L.ax
    let shellY = L.ay
    let scale = 1
    if (ph.kind === 'arrive') {
      ph.t += dt / 0.5
      const t = Math.min(1, ph.t)
      const e = 1 - Math.pow(1 - t, 3)
      shellX = w * 0.12 + (L.ax - w * 0.12) * e
      shellY = h * 0.9 + (L.ay - h * 0.9) * e - Math.sin(t * Math.PI) * 40
      scale = 0.4 + 0.6 * e
      if (ph.t >= 1) phase.current = { kind: 'sway', t: 0 }
    }
    if (ph.kind === 'pierced') {
      ph.t += dt
      if (ph.t > 0.7) {
        const t = Math.min(1, (ph.t - 0.7) / 0.5)
        const b = beadPos(strung - 1)
        shellX = L.ax + (b.x - L.ax) * t
        shellY = L.ay + (b.y + beadSize * 0.05 - L.ay) * t - Math.sin(t * Math.PI) * 60
        scale = 1 - (1 - beadSize / L.size) * t
      }
      if (ph.t >= 1.2) nextShell(strung)
    }

    if (ph.kind === 'cracked') {
      ph.t += dt
      const t = Math.min(1, ph.t / 0.9)
      ctx.globalAlpha = 1 - t
      for (const side of [-1, 1]) {
        ctx.save()
        ctx.translate(L.ax + side * t * 60, L.ay + t * t * 50)
        ctx.rotate(setup.tilt + side * t * 0.7)
        ctx.beginPath()
        // a jagged split down the middle
        const half = L.size / 2
        ctx.moveTo(0, -half)
        for (let k = 0; k <= 8; k++) ctx.lineTo((k % 2 ? 6 : -6) * 1, -half + (k / 8) * L.size)
        ctx.lineTo(side * half, half)
        ctx.lineTo(side * half, -half)
        ctx.closePath()
        ctx.clip()
        drawShell(ctx, shell, 0, 0, L.size, 0, false)
        ctx.restore()
      }
      ctx.globalAlpha = 1
      if (ph.t >= 1.1) nextShell(strung)
    } else {
      drawShell(ctx, shell, shellX, shellY, L.size * scale, setup.tilt * scale, false)
    }

    // the hole, once it is through
    if (ph.kind === 'pierced' && ph.t <= 0.7) {
      ctx.save()
      ctx.translate(ph.x, L.spotY)
      ctx.fillStyle = 'rgba(30, 16, 10, 0.92)'
      ctx.beginPath()
      ctx.ellipse(0, 0, L.size * 0.035, L.size * 0.05, 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(250, 236, 214, 0.75)'
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.restore()
    }

    // the awl and the pressure
    let tipX = L.spotX
    let tipY = L.spotY - L.size * 0.08
    if (ph.kind === 'sway') {
      ph.t += dt
      tipX = L.spotX + Math.sin(ph.t * setup.speed) * L.halfWidth * 1.5
    }
    if (ph.kind === 'press') {
      tipX = ph.x
      if (ph.holding) {
        ph.p += dt * setup.rate
        if (ph.p >= 1) crack(ph.x)
      } else ph.p = Math.max(0, ph.p - dt * 1.5)
      tipY = L.spotY - L.size * 0.03 + ph.p * L.size * 0.05
      // the band to let go in, and the pressure so far
      const zw = 0.08 + 0.12 * ph.acc
      const r = 34
      const arc = (from: number, to: number) => {
        ctx.beginPath()
        ctx.arc(tipX, L.spotY, r, -Math.PI / 2 + from * Math.PI * 2, -Math.PI / 2 + to * Math.PI * 2)
        ctx.stroke()
      }
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(22, 17, 14, 0.6)'
      ctx.lineWidth = 7
      arc(0, 1)
      ctx.strokeStyle = 'rgba(255, 244, 222, 0.9)'
      ctx.lineWidth = 9
      arc(setup.zone, setup.zone + zw)
      ctx.strokeStyle = ph.p > setup.zone + zw ? C.ochreBright : C.amber
      ctx.lineWidth = 3.5
      arc(0, Math.min(1, ph.p))
    }
    if (ph.kind === 'pierced' || ph.kind === 'cracked') tipY = L.spotY - L.size * 0.02 - Math.min(1, ph.t * 3) * L.size * 0.25
    // a faint glint marks the thin place while you aim
    if (ph.kind === 'sway') {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260)
      ctx.strokeStyle = `rgba(255, 244, 222, ${0.25 + 0.3 * pulse})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(L.spotX, L.spotY, L.size * 0.04, L.size * 0.03, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (ph.kind !== 'arrive' && awl) {
      const aw = L.size * 0.55
      const ah = aw * (awl.naturalHeight / awl.naturalWidth)
      ctx.save()
      ctx.shadowColor = 'rgba(10, 5, 2, 0.55)'
      ctx.shadowBlur = 16
      ctx.shadowOffsetX = 10
      ctx.shadowOffsetY = 10
      ctx.translate(tipX, tipY)
      ctx.rotate(0.18)
      ctx.drawImage(awl, -aw * 0.47, -ah * 0.985, aw, ah)
      ctx.restore()
    }
  })

  const size = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { w: r.width, h: r.height }
  }

  return (
    <MinigameFrame
      title="Pierce the shells"
      background={BG}
      hint={
        <>
          Click when the awl is over the thin place near the lip, hold to push, and let go in the pale band. Space works
          too.
          <span className="mt-1 block font-serif text-amber" style={{ fontVariationSettings: '"opsz" 24' }}>
            {strung} of {GOAL} strung · {left} {left === 1 ? 'shell' : 'shells'} left
          </span>
        </>
      }
      line={line}
      lineBottom="calc(100% - 40vh)"
      actions={strung > 0 ? <TextButton onClick={() => finish(strung)}>Stop here</TextButton> : null}
      done={
        result && (
          <ResultCard
            heading={result.n === 0 ? 'No beads this time' : `${countWord(result.n)} ${result.n === 1 ? 'bead' : 'beads'} on the string`}
            body={
              result.n === 0
                ? 'The shells are fragile. There will be more at the next low tide.'
                : 'Rubbed with ochre and worn against the skin, they say who you belong to.'
            }
            onContinue={() => onDone(result.quality)}
          />
        )
      }>
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          const { w, h } = size(e)
          press(w, h)
        }}
        onPointerUp={(e) => {
          const { w, h } = size(e)
          release(w, h)
        }}
      />
    </MinigameFrame>
  )
}

function drawShell(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, size: number, rot: number, small: boolean) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.shadowColor = 'rgba(10, 5, 2, 0.55)'
  ctx.shadowBlur = small ? 6 : 18
  ctx.shadowOffsetX = small ? 2 : 8
  ctx.shadowOffsetY = small ? 3 : 10
  if (img) ctx.drawImage(img, -size / 2, -size / 2, size, size)
  else {
    ctx.fillStyle = '#9b7b5c'
    ctx.beginPath()
    ctx.ellipse(0, 0, size * 0.22, size * 0.42, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  if (small) {
    // the hole, threaded
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = 'rgba(30, 16, 10, 0.9)'
    ctx.beginPath()
    ctx.ellipse(-size * 0.03, size * 0.2, size * 0.05, size * 0.07, 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
