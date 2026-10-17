/**
 * Knapping: shape a heat-treated silcrete blank into a Still Bay leaf point. Press on the edge, pull the hammerstone
 * back to aim (the pull's direction is the blow's angle, its length the force) and let go. Square blows bite the
 * outline; slanting blows travel across the face and thin it. Space turns the stone over to work the other face.
 * Quality comes from symmetry, the leaf shape and thinness (knap-geom.ts).
 */
import { useEffect, useRef, useState } from 'react'
import { C } from '../palette'
import { MenuButton, TextButton } from '../widgets'
import { assess, areaOf, centroid, leafOutline, nearestVertex, newStone, normalAt, strike, type Face, type Pt, type Stone } from './knap-geom'
import { loadImage, MinigameFrame, ResultCard, useCanvasLoop, useRelative, useVoice } from './kit'
import { uiSfx } from './sound'

const MAX_PULL = 150
const SNAP_PX = 34

type Aim = { index: number; pull: Pt; valid: boolean; deg: number; side: number; force: number }
type Swing = { from: Pt; t: number; aim: Aim }
type Bit = { pts: Pt[]; x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; size: number }

type World = {
  stone: Stone
  seed: number
  /** current horizontal scale: 1 front, −1 back, between while turning */
  sx: number
  face: Face
  center: Pt
  pointer: Pt | null
  aim: Aim | null
  swing: Swing | null
  bits: Bit[]
  shake: number
  guide: boolean
  started: number
  nudged: boolean
  said: Set<string>
}

function verdict(q: number, father: string): { heading: string; body: string } {
  if (q >= 0.8) return { heading: 'A fine point', body: `Even on both sides and thin enough to fly true. ${father} turns it in the firelight and nods.` }
  if (q >= 0.6) return { heading: 'A good point', body: 'A little uneven, but it is sharp and it will fly.' }
  if (q >= 0.4) return { heading: 'A workable point', body: 'Thick in places, crooked in others. It will do for now.' }
  return { heading: 'A rough point', body: `${father} turns it over and says nothing. Stone teaches slowly.` }
}

export function Knapping({ onDone }: { onDone: (quality: number) => void }) {
  const father = useRelative(/^father$/i) ?? 'Tuk'
  const { line, say } = useVoice(father)
  const canvas = useRef<HTMLCanvasElement>(null)
  const images = useRef<{ tex: CanvasPattern | null; hammer: HTMLImageElement | null }>({ tex: null, hammer: null })
  const world = useRef<World>({
    stone: newStone(7),
    seed: 7,
    sx: 1,
    face: 0,
    center: { x: 0, y: 0 },
    pointer: null,
    aim: null,
    swing: null,
    bits: [],
    shake: 0,
    guide: true,
    started: 0,
    nudged: false,
    said: new Set(),
  })
  const [strikes, setStrikes] = useState(0)
  const [guide, setGuide] = useState(true)
  const [result, setResult] = useState<{ quality: number; heading: string; body: string; spent: boolean } | null>(null)
  const sayRef = useRef(say)
  sayRef.current = say

  // per-render view math shared by drawing and input
  const view = (w: number, h: number) => {
    const k = Math.min((h * 0.58) / 10, (w * 0.4) / 7)
    const g = world.current
    const shake = g.shake > 0 ? { x: (Math.random() - 0.5) * g.shake, y: (Math.random() - 0.5) * g.shake } : { x: 0, y: 0 }
    return { k, cx: w * 0.5 + shake.x, cy: h * 0.53 + shake.y }
  }
  const toScreen = (p: Pt, w: number, h: number): Pt => {
    const g = world.current
    const { k, cx, cy } = view(w, h)
    return { x: cx + (p.x - g.center.x) * k * g.sx, y: cy + (p.y - g.center.y) * k }
  }

  useEffect(() => {
    world.current.started = performance.now()
    if (import.meta.env.DEV) Object.assign(window, { __knap: world.current })
    sayRef.current('Feel for the edge. Pull back, and let the stone tell you.', 4200)
    let live = true
    void Promise.all([loadImage('/art/minigames/silcrete.webp'), loadImage('/art/minigames/hammer.webp')]).then(([tex, hammer]) => {
      if (!live) return
      const ctx = document.createElement('canvas').getContext('2d')
      images.current = { tex: ctx?.createPattern(tex, 'repeat') ?? null, hammer }
    })
    return () => {
      live = false
    }
  }, [])

  const turn = () => {
    const g = world.current
    if (g.swing || result) return
    g.face = g.face === 0 ? 1 : 0
    uiSfx('ui-click')
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        turn()
      }
      if (e.key === 'g' || e.key === 'G') toggleGuide()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const toggleGuide = () => {
    world.current.guide = !world.current.guide
    setGuide(world.current.guide)
  }

  const finish = (spent: boolean) => {
    const a = assess(world.current.stone)
    const q = spent ? Math.min(a.quality, 0.25) : a.quality
    setResult({ quality: q, ...verdict(q, father), ...(spent ? { heading: 'Too little stone left', body: 'It broke down to a sliver. There is more silcrete by the fire.' } : {}), spent })
  }

  const newBlank = () => {
    const g = world.current
    g.seed += 11
    g.stone = newStone(g.seed)
    g.face = 0
    g.sx = 1
    g.center = { x: 0, y: 0 }
    g.said.clear()
    setStrikes(0)
    setResult(null)
  }

  /** apply a finished swing: break the stone, throw the flake, speak */
  const land = (aim: Aim, w: number, h: number) => {
    const g = world.current
    const before = g.stone
    const blow = strike(before, g.face, aim.index, aim.deg, aim.side, aim.force, g.seed * 31 + before.strikes)
    g.stone = blow.stone
    setStrikes(blow.stone.strikes)
    const n = normalAt(before.outline, aim.index)
    const nS = { x: n.x * Math.sign(g.sx || 1), y: n.y }
    if (blow.flake.length > 2) {
      const pts = blow.flake.map((p) => toScreen(p, w, h))
      const c = pts.reduce((s, p) => ({ x: s.x + p.x / pts.length, y: s.y + p.y / pts.length }), { x: 0, y: 0 })
      const speed = 180 + 260 * aim.force
      g.bits.push({
        pts: pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
        x: c.x,
        y: c.y,
        vx: nS.x * speed + (Math.random() - 0.5) * 80,
        vy: nS.y * speed - 140,
        rot: 0,
        vr: (Math.random() - 0.5) * 9,
        life: 1.3,
        size: 1,
      })
    }
    const hit = toScreen(before.outline[aim.index] ?? { x: 0, y: 0 }, w, h)
    for (let i = 0; i < 10 + aim.force * 14; i++) {
      const a = Math.atan2(nS.y, nS.x) + (Math.random() - 0.5) * 1.8
      const s = 60 + Math.random() * 240
      g.bits.push({ pts: [], x: hit.x, y: hit.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, rot: 0, vr: 0, life: 0.5 + Math.random() * 0.6, size: 1 + Math.random() * 2 })
    }
    g.shake = 3 + aim.force * 7
    uiSfx('knap')

    const a = assess(g.stone)
    const once = (key: string, text: string, ms?: number) => {
      if (g.said.has(key)) return false
      g.said.add(key)
      sayRef.current(text, ms)
      return true
    }
    if (blow.kind === 'snap') sayRef.current(aim.deg < 14 ? 'Too square and too hard. A whole piece broke away.' : 'Too much where it was thin. It broke.')
    else if (blow.kind === 'weak') sayRef.current('Harder. Pull further back.')
    else if (aim.deg > 72) sayRef.current('Too slanting. It skipped off.')
    else if (blow.kind === 'bite') once('bite', 'A square blow bites the edge. That shapes it.') || advise()
    else once('clean', 'Good. That one ran across the face. It is thinner now.') || advise()

    function advise() {
      if (g.stone.strikes % 3 !== 0) return
      const [ta, tb] = g.stone.thick
      const lean = a.widerSide && (g.sx < 0 ? (a.widerSide === 'left' ? 'right' : 'left') : a.widerSide)
      if (Math.abs(ta - tb) > 0.22) sayRef.current('Turn it over. Work the other face too.')
      else if (lean && a.symmetry < 0.8) sayRef.current(`It is wider on the ${lean}. Take from that side.`)
      else if (g.stone.strikes >= 9 && (ta + tb) / 2 > 0.7) sayRef.current('Slant your blows more. Make it thin.')
      else if (a.quality >= 0.72) once('good', 'That is a good point. You could stop here.')
    }

    if (a.length < 3.6 || areaOf(g.stone) < 5) window.setTimeout(() => finish(true), 600)
  }

  useCanvasLoop(canvas, (ctx, w, h, dt) => {
    const g = world.current
    // turning
    const targetSx = g.face === 0 ? 1 : -1
    if (g.sx !== targetSx) {
      const step = dt * 7
      g.sx = Math.abs(targetSx - g.sx) <= step ? targetSx : g.sx + Math.sign(targetSx - g.sx) * step
    }
    const c = centroid(g.stone.outline)
    g.center = { x: g.center.x + (c.x - g.center.x) * Math.min(1, dt * 3), y: g.center.y + (c.y - g.center.y) * Math.min(1, dt * 3) }
    g.shake = Math.max(0, g.shake - dt * 40)
    if (!g.nudged && performance.now() - g.started > 75000 && !result) {
      g.nudged = true
      sayRef.current('The light is going. Finish when you are ready.', 4200)
    }

    const { k, cx, cy } = view(w, h)
    const visible: Face = g.sx < 0 ? 1 : 0
    const thick = (g.stone.thick[0] + g.stone.thick[1]) / 2
    const outline = g.stone.outline

    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(k * g.sx, k)
    ctx.translate(-g.center.x, -g.center.y)
    const path = new Path2D()
    outline.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)))
    path.closePath()

    // body with its shadow
    ctx.save()
    ctx.shadowColor = 'rgba(12, 6, 3, 0.6)'
    ctx.shadowBlur = 26
    ctx.shadowOffsetX = 10 * Math.sign(g.sx || 1)
    ctx.shadowOffsetY = 14
    const tex = images.current.tex
    if (tex) {
      const s = 0.011
      tex.setTransform(new DOMMatrix([s, 0, 0, s, (g.seed % 5) - 4, (g.seed % 3) - 5]))
      ctx.fillStyle = tex
    } else ctx.fillStyle = '#9a4636'
    ctx.fill(path)
    ctx.restore()

    ctx.save()
    ctx.clip(path)
    // the visible face's flake scars
    for (const s of g.stone.scars) {
      if (s.face !== visible) continue
      const t = { x: s.inward.y, y: -s.inward.x }
      const hw = s.halfWidth
      const tip = { x: s.at.x + s.inward.x * s.travel, y: s.at.y + s.inward.y * s.travel }
      const scar = new Path2D()
      scar.moveTo(s.at.x + t.x * hw, s.at.y + t.y * hw)
      scar.quadraticCurveTo(s.at.x + s.inward.x * s.travel * 0.7 + t.x * hw * 0.9, s.at.y + s.inward.y * s.travel * 0.7 + t.y * hw * 0.9, tip.x, tip.y)
      scar.quadraticCurveTo(s.at.x + s.inward.x * s.travel * 0.7 - t.x * hw * 0.9, s.at.y + s.inward.y * s.travel * 0.7 - t.y * hw * 0.9, s.at.x - t.x * hw, s.at.y - t.y * hw)
      scar.closePath()
      const grad = ctx.createLinearGradient(s.at.x + t.x * hw, s.at.y + t.y * hw, s.at.x - t.x * hw, s.at.y - t.y * hw)
      const lit = t.x + t.y < 0
      grad.addColorStop(0, lit ? 'rgba(255, 232, 210, 0.22)' : 'rgba(45, 12, 12, 0.36)')
      grad.addColorStop(1, lit ? 'rgba(45, 12, 12, 0.36)' : 'rgba(255, 232, 210, 0.22)')
      ctx.fillStyle = grad
      ctx.fill(scar)
      ctx.strokeStyle = 'rgba(255, 236, 220, 0.28)'
      ctx.lineWidth = 1.2 / k
      ctx.stroke(scar)
      // ripples round the point of impact
      ctx.strokeStyle = 'rgba(40, 10, 10, 0.24)'
      const dir = Math.atan2(s.inward.y, s.inward.x)
      for (const f of [0.3, 0.55, 0.8]) {
        ctx.beginPath()
        ctx.arc(s.at.x, s.at.y, s.travel * f, dir - 0.65, dir + 0.65)
        ctx.stroke()
      }
    }
    // the dome of a thick stone, flattening as it thins
    const dome = ctx.createRadialGradient(g.center.x - 0.8, g.center.y - 1.3, 0.2, g.center.x, g.center.y, 6)
    dome.addColorStop(0, `rgba(255, 240, 225, ${0.06 + 0.16 * thick})`)
    dome.addColorStop(0.5, 'rgba(255, 240, 225, 0)')
    dome.addColorStop(1, `rgba(30, 8, 6, ${0.2 + 0.3 * thick})`)
    ctx.fillStyle = dome
    ctx.fillRect(g.center.x - 8, g.center.y - 8, 16, 16)
    // a soft bevel falling in from a thick edge, a translucent rim on a thin one
    ctx.save()
    ctx.shadowColor = `rgba(30, 8, 6, ${0.35 + 0.4 * thick})`
    ctx.shadowBlur = 10 + 26 * thick
    ctx.strokeStyle = `rgba(30, 8, 6, ${0.2 + 0.3 * thick})`
    ctx.lineWidth = 0.12
    ctx.stroke(path)
    ctx.restore()
    ctx.strokeStyle = `rgba(255, 205, 175, ${0.1 + 0.4 * (1 - thick)})`
    ctx.lineWidth = 2.2 / k
    ctx.stroke(path)
    ctx.restore()

    ctx.strokeStyle = 'rgba(30, 12, 10, 0.75)'
    ctx.lineWidth = 1.6 / k
    ctx.stroke(path)

    if (g.guide && !result) {
      ctx.setLineDash([0.22, 0.16])
      ctx.strokeStyle = 'rgba(239, 227, 200, 0.32)'
      ctx.lineWidth = 1.4 / k
      const leaf = new Path2D()
      leafOutline(g.center).forEach((p, i) => (i === 0 ? leaf.moveTo(p.x, p.y) : leaf.lineTo(p.x, p.y)))
      leaf.closePath()
      ctx.stroke(leaf)
      ctx.setLineDash([])
    }
    ctx.restore()

    // aiming, the hammer and the edge marker, in screen space
    if (!result) drawAim(ctx, w, h)

    // flakes and dust
    for (const b of g.bits) {
      b.life -= dt
      b.vy += 900 * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.rot += b.vr * dt
      const alpha = Math.max(0, Math.min(1, b.life * 2))
      if (b.pts.length > 2) {
        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(b.rot)
        ctx.globalAlpha = alpha
        ctx.beginPath()
        b.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
        ctx.closePath()
        ctx.fillStyle = tex ?? '#b5644f'
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 220, 200, 0.5)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.restore()
      } else {
        ctx.globalAlpha = alpha
        ctx.fillStyle = '#e8c3a8'
        ctx.fillRect(b.x, b.y, b.size, b.size)
        ctx.globalAlpha = 1
      }
    }
    g.bits = g.bits.filter((b) => b.life > 0)

    // the swing lands
    if (g.swing) {
      g.swing.t += dt / 0.09
      if (g.swing.t >= 1) {
        const aim = g.swing.aim
        g.swing = null
        land(aim, w, h)
      }
    }
  })

  function drawAim(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const g = world.current
    const hammer = images.current.hammer
    const drawHammer = (p: Pt, size: number) => {
      if (hammer) ctx.drawImage(hammer, p.x - size / 2, p.y - size / 2, size, size)
      else {
        ctx.fillStyle = '#8a8070'
        ctx.beginPath()
        ctx.arc(p.x, p.y, size / 2.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    if (g.swing) {
      const anchor = toScreen(g.stone.outline[g.swing.aim.index] ?? { x: 0, y: 0 }, w, h)
      const t = Math.min(1, g.swing.t)
      drawHammer({ x: g.swing.from.x + (anchor.x - g.swing.from.x) * t, y: g.swing.from.y + (anchor.y - g.swing.from.y) * t }, 74)
      return
    }
    if (g.aim) {
      const anchor = toScreen(g.stone.outline[g.aim.index] ?? { x: 0, y: 0 }, w, h)
      const pull = g.aim.pull
      const l = Math.hypot(pull.x, pull.y)
      const clamped = l > MAX_PULL ? { x: (pull.x / l) * MAX_PULL, y: (pull.y / l) * MAX_PULL } : pull
      const hp = { x: anchor.x + clamped.x, y: anchor.y + clamped.y }
      const color = !g.aim.valid ? 'rgba(205, 191, 159, 0.5)' : g.aim.deg < 20 ? C.ochreBright : g.aim.deg <= 58 ? C.amber : 'rgba(205, 191, 159, 0.85)'
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(anchor.x, anchor.y)
      ctx.lineTo(hp.x, hp.y)
      ctx.strokeStyle = 'rgba(22, 17, 14, 0.55)'
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.setLineDash([])
      // force ring
      ctx.strokeStyle = 'rgba(22, 17, 14, 0.55)'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(anchor.x, anchor.y, 15, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = color
      ctx.lineWidth = 2.6
      ctx.beginPath()
      ctx.arc(anchor.x, anchor.y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.aim.force)
      ctx.stroke()
      drawHammer(hp, 74)
      const label = !g.aim.valid
        ? 'Pull away from the stone'
        : g.aim.force < 0.12
          ? 'Too soft'
          : g.aim.deg < 20
            ? 'Square: bites the edge'
            : g.aim.deg <= 58
              ? 'Slanting: thins the face'
              : g.aim.deg <= 72
                ? 'Shallow: a small flake'
                : 'Glancing: it will skip'
      ctx.font = '600 15px Figtree, sans-serif'
      ctx.textAlign = hp.x > anchor.x ? 'left' : 'right'
      ctx.shadowColor = 'rgba(22, 17, 14, 0.9)'
      ctx.shadowBlur = 6
      ctx.fillStyle = '#efe3c8'
      ctx.fillText(label, hp.x + (hp.x > anchor.x ? 44 : -44), hp.y + 5)
      ctx.shadowBlur = 0
      return
    }
    if (g.pointer && Math.abs(g.sx) === 1) {
      const near = nearestTo(g.pointer, w, h)
      if (near) {
        ctx.fillStyle = C.amber
        ctx.globalAlpha = 0.9
        ctx.beginPath()
        ctx.arc(near.screen.x, near.screen.y, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      drawHammer({ x: g.pointer.x + 30, y: g.pointer.y + 30 }, 60)
    }
  }

  const nearestTo = (p: Pt, w: number, h: number) => {
    const g = world.current
    const { k, cx, cy } = view(w, h)
    const sp = { x: (p.x - cx) / (k * g.sx) + g.center.x, y: (p.y - cy) / k + g.center.y }
    const { index, dist } = nearestVertex(g.stone.outline, sp)
    if (dist * k > SNAP_PX) return null
    return { index, screen: toScreen(g.stone.outline[index] ?? { x: 0, y: 0 }, w, h) }
  }

  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { p: { x: e.clientX - r.left, y: e.clientY - r.top }, w: r.width, h: r.height }
  }

  const updateAim = (aim: Aim, p: Pt, w: number, h: number): Aim => {
    const g = world.current
    const anchor = toScreen(g.stone.outline[aim.index] ?? { x: 0, y: 0 }, w, h)
    const pull = { x: p.x - anchor.x, y: p.y - anchor.y }
    const l = Math.hypot(pull.x, pull.y)
    const n = normalAt(g.stone.outline, aim.index)
    const nS = { x: n.x * Math.sign(g.sx || 1), y: n.y }
    const cos = l > 0 ? (pull.x * nS.x + pull.y * nS.y) / l : 1
    const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
    const tS = { x: -nS.y, y: nS.x }
    const side = l > 0 ? -((pull.x * tS.x + pull.y * tS.y) / l) * Math.sign(g.sx || 1) : 0
    return { ...aim, pull, deg, side, valid: deg <= 88 && l >= 14, force: Math.min(1, l / MAX_PULL) }
  }

  return (
    <MinigameFrame
      title="Shape a spear point"
      background="/art/minigames/knap-bg.webp"
      hint="Press on the edge, pull the hammerstone back and let go. Square blows shape the edge; slanting blows thin the face. Space turns the stone over."
      line={line}
      actions={
        <>
          <TextButton onClick={turn}>Turn over</TextButton>
          <TextButton onClick={toggleGuide}>{guide ? 'Hide the shape' : 'Show the shape'}</TextButton>
          <TextButton onClick={newBlank}>New stone</TextButton>
          <MenuButton primary disabled={strikes < 6} onClick={() => finish(false)}>
            Finish
          </MenuButton>
        </>
      }
      done={
        result && (
          <ResultCard
            heading={result.heading}
            body={result.body}
            onContinue={() => onDone(result.quality)}
            extra={result.spent ? <TextButton onClick={newBlank}>Try another stone</TextButton> : undefined}
          />
        )
      }>
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: result ? 'default' : 'none' }}
        onPointerMove={(e) => {
          const g = world.current
          const { p, w, h } = local(e)
          g.pointer = p
          if (g.aim) g.aim = updateAim(g.aim, p, w, h)
        }}
        onPointerLeave={() => {
          world.current.pointer = null
        }}
        onPointerDown={(e) => {
          const g = world.current
          if (result || g.swing || Math.abs(g.sx) !== 1) return
          const { p, w, h } = local(e)
          const near = nearestTo(p, w, h)
          if (!near) {
            if (!g.said.has('edge')) {
              g.said.add('edge')
              say('Strike at the edge, not the middle.')
            }
            return
          }
          e.currentTarget.setPointerCapture(e.pointerId)
          g.aim = updateAim({ index: near.index, pull: { x: 0, y: 0 }, valid: false, deg: 0, side: 0, force: 0 }, p, w, h)
        }}
        onPointerUp={(e) => {
          const g = world.current
          const aim = g.aim
          g.aim = null
          if (!aim || !aim.valid) return
          const { w, h } = local(e)
          const anchor = toScreen(g.stone.outline[aim.index] ?? { x: 0, y: 0 }, w, h)
          const l = Math.hypot(aim.pull.x, aim.pull.y)
          const s = l > MAX_PULL ? MAX_PULL / l : 1
          g.swing = { from: { x: anchor.x + aim.pull.x * s, y: anchor.y + aim.pull.y * s }, t: 0, aim }
        }}
      />
    </MinigameFrame>
  )
}
