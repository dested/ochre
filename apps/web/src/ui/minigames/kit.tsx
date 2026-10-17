/** Shared pieces for the minigames: the full-screen frame over a painting, the spoken line, and the result card. */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useBridge } from '~/game/bridge'
import { CrossHatch, HatchRule } from '../motifs'
import { MenuButton } from '../widgets'

/** the name of a family member by relation ("Father"), for a voice in the minigame; null when unknown */
export function useRelative(relation: RegExp): string | null {
  const lineage = useBridge((s) => s.lineage)
  return lineage.find((p) => relation.test(p.relation) && p.alive)?.name ?? null
}

export type Line = { id: number; text: string; speaker: string | null }

/** one spoken or narrated line at a time; a new one replaces the old, and it fades after a while */
export function useVoice(speaker: string | null) {
  const [line, setLine] = useState<Line | null>(null)
  const id = useRef(0)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )
  const say = (text: string, ms = 3600, narrate = false) => {
    id.current += 1
    setLine({ id: id.current, text, speaker: narrate ? null : speaker })
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setLine(null), ms)
  }
  return { line, say }
}

export function MinigameFrame({
  title,
  hint,
  background,
  line,
  actions,
  children,
  done,
  lineBottom = 'clamp(64px,11vh,110px)',
}: {
  title: string
  hint: ReactNode
  background: string
  line: Line | null
  actions: ReactNode
  children: ReactNode
  /** the result card replaces the title, hint and actions */
  done?: ReactNode
  /** how far up the spoken line sits */
  lineBottom?: string
}) {
  return (
    <div className="fixed inset-0 animate-ui-fade overflow-hidden bg-soot select-none">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${background})` }} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 50%, transparent 40%, rgb(22 17 14 / 0.6) 100%)' }}
      />
      {children}
      {done ?? (
        <>
          <div
            className="pointer-events-none absolute left-0 top-0 h-[calc(min(420px,55vh)*var(--ui-zoom))] w-[calc(min(820px,75vw)*var(--ui-zoom))]"
            style={{ background: 'radial-gradient(ellipse at 0% 0%, rgb(22 17 14 / 0.6), transparent 70%)' }}
          />
          <div className="ui-scale pointer-events-none absolute left-[clamp(20px,3vw,44px)] top-[clamp(18px,3.4vh,36px)] max-w-[min(440px,60vw)]">
            <h2
              className="animate-ui-rise font-serif text-[clamp(30px,2.6vw,40px)] leading-none text-bone ui-halo"
              style={{ fontVariationSettings: '"opsz" 72, "SOFT" 100', fontWeight: 480 }}>
              {title}
            </h2>
            <CrossHatch width={170} height={12} className="mt-3" />
            <p className="mt-3 font-sans text-[15px] leading-snug text-bone/85 ui-halo">{hint}</p>
          </div>
          <div className="ui-scale absolute bottom-[clamp(18px,3.4vh,36px)] right-[clamp(20px,3vw,44px)] flex items-center gap-6">{actions}</div>
        </>
      )}
      <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: lineBottom }}>
        {line && (
          <p key={line.id} className="ui-scale ui-wash max-w-[min(760px,80vw)] animate-ui-rise text-center text-bone ui-halo" style={{ fontSize: 19, lineHeight: 1.4 }}>
            {line.speaker ? (
              <>
                <span className="mr-2.5 font-serif text-[17px] font-semibold text-amber" style={{ fontVariationSettings: '"opsz" 24, "SOFT" 50' }}>
                  {line.speaker}
                </span>
                <span className="font-sans">{line.text}</span>
              </>
            ) : (
              <span className="font-serif text-[21px] italic" style={{ fontVariationSettings: '"opsz" 36, "SOFT" 100', fontWeight: 380 }}>
                {line.text}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

/** the verdict over the finished piece, bottom left, with Continue (and an optional second action) */
export function ResultCard({
  heading,
  body,
  onContinue,
  extra,
}: {
  heading: string
  body: string
  onContinue: () => void
  extra?: ReactNode
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onContinue()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onContinue])
  return (
    <div className="ui-scale absolute bottom-[clamp(28px,7vh,72px)] left-[clamp(28px,7vw,120px)] isolate max-w-[min(520px,80vw)]">
      <div
        className="pointer-events-none absolute -inset-x-[30%] -inset-y-[45%] -z-10 animate-ui-fade"
        style={{ background: 'radial-gradient(closest-side, rgb(22 17 14 / 0.72), rgb(22 17 14 / 0.35) 60%, transparent)' }}
      />
      <h2
        className="animate-ui-rise font-serif text-[clamp(40px,4vw,60px)] leading-none text-bone ui-halo"
        style={{ fontVariationSettings: '"opsz" 96, "SOFT" 100', fontWeight: 480 }}>
        {heading}
      </h2>
      <p
        className="mt-4 animate-ui-rise font-serif text-[clamp(18px,1.5vw,22px)] italic leading-snug text-bone/90 ui-halo"
        style={{ fontVariationSettings: '"opsz" 36, "SOFT" 100', animationDelay: '250ms' }}>
        {body}
      </p>
      <div className="mt-6 flex animate-ui-rise items-center gap-6" style={{ animationDelay: '500ms' }}>
        <HatchRule />
        <MenuButton primary onClick={onContinue}>
          Continue
        </MenuButton>
        {extra}
      </div>
    </div>
  )
}

/** load an image once in an effect (never during render, so SSR stays clean) */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image ${src}`))
    img.src = src
  })
}

/** a canvas that fills its parent at device resolution; calls draw(ctx, cssWidth, cssHeight) every frame */
export function useCanvasLoop(
  canvas: RefObject<HTMLCanvasElement | null>,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) => void,
) {
  const drawRef = useRef(draw)
  drawRef.current = draw
  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    let raf = 0
    let last = performance.now()
    let w = 0
    let h = 0
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = el.clientWidth
      h = el.clientHeight
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.save()
      ctx.clearRect(0, 0, w, h)
      drawRef.current(ctx, w, h, dt)
      ctx.restore()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [canvas])
}
