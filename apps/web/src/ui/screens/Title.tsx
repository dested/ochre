/**
 * The title: the painted key art drifting in slow parallax (sky and sea behind, fynbos in front), the OCHRE
 * wordmark over the Blombos band, and a short menu. "Chapters" opens the five stages over the same painting.
 */
import { useEffect, useRef, useState } from 'react'
import { bridge, useBridge, type BridgeState } from '~/game/bridge'
import { LIFE_STAGES } from '~/game/contracts'
import { STAGES } from '~/content/stages'
import { ageLabel } from '../format'
import { CrossHatch, Wordmark } from '../motifs'
import { jitter } from '../palette'
import { MenuButton } from '../widgets'
import { clearHints } from '../hud/Hints'
import { AboutScreen } from './About'

export function TitleScreen() {
  const hasLife = useBridge((s) => s.hasLife)
  const saved = useBridge((s) => s.saved)
  const notesCount = useBridge((s) => s.notesUnlocked.length)
  const [name, setName] = useState('Teni')
  const [picker, setPicker] = useState(false)
  const [about, setAbout] = useState(false)
  const begin = () => {
    clearHints()
    bridge.actions.newLife(name.trim() || 'Teni')
  }

  return (
    <div className="bg-soot fixed inset-0 overflow-hidden">
      <KeyArt />
      {/* a warm wash from the left so the type always reads */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 70% at 18% 58%, rgb(22 17 14 / 0.55) 0%, rgb(22 17 14 / 0.25) 55%, rgb(22 17 14 / 0) 80%), linear-gradient(0deg, rgb(22 17 14 / 0.5) 0%, rgb(22 17 14 / 0) 26%)',
        }}
      />

      {!picker && !about && (
        <div className="absolute inset-y-0 left-[clamp(28px,7vw,120px)] flex flex-col justify-center">
          <div className="animate-ui-fade" style={{ animationDuration: '1800ms' }}>
            <Wordmark size={128} className="max-lg:hidden" />
            <Wordmark size={88} className="lg:hidden" />
            <p
              className="text-bone ui-halo mt-6 font-serif text-[clamp(20px,1.7vw,26px)] italic"
              style={{ fontVariationSettings: '"opsz" 36, "SOFT" 100', fontWeight: 360 }}>
              One life, eighty thousand years ago
            </p>
          </div>

          <nav
            className="animate-ui-rise mt-[clamp(28px,6vh,64px)] flex flex-col items-start gap-[clamp(6px,1.2vh,12px)]"
            style={{ animationDelay: '600ms' }}>
            <form
              className="mb-2 flex items-end gap-5"
              onSubmit={(e) => {
                e.preventDefault()
                begin()
              }}>
              <MenuButton primary type="submit">
                Begin a life
              </MenuButton>
              <label className="mb-[9px] flex flex-col gap-0.5">
                <span className="text-bone-dim ui-halo font-sans text-[12px]">Your name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 14))}
                  maxLength={14}
                  spellCheck={false}
                  className="border-bone/45 text-bone ui-halo-soft focus:border-amber w-[130px] border-b bg-transparent pb-0.5 font-serif text-[20px] outline-none"
                  style={{ fontVariationSettings: '"opsz" 24' }}
                />
              </label>
            </form>
            {saved ? (
              <ContinueCard saved={saved} />
            ) : (
              hasLife && (
                <MenuButton onClick={() => bridge.actions.continueLife()}>Continue</MenuButton>
              )
            )}
            <MenuButton onClick={() => setPicker(true)}>Chapters</MenuButton>
            <MenuButton onClick={() => bridge.actions.openNotes()}>
              Field Notes
              {notesCount > 0 && (
                <span className="text-bone-dim ml-3 font-sans text-[14px]">{notesCount}</span>
              )}
            </MenuButton>
            <MenuButton onClick={() => setAbout(true)}>About this world</MenuButton>
          </nav>
        </div>
      )}

      {picker && <ChapterPicker onClose={() => setPicker(false)} />}
      {about && <AboutScreen onClose={() => setAbout(false)} />}

      {!about && (
        <p className="text-bone/60 ui-halo-soft pointer-events-none absolute bottom-5 left-[clamp(28px,7vw,120px)] font-sans text-[12px]">
          The southern Cape, about 80,000 years ago
        </p>
      )}
    </div>
  )
}

/** the two painted layers, a drifting light and floating motes; the pointer nudges the layers apart */
function KeyArt() {
  const bg = useRef<HTMLDivElement>(null)
  const fg = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    let tx = 0
    let ty = 0
    let x = 0
    let y = 0
    const start = performance.now()
    const move = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2
      ty = (e.clientY / window.innerHeight - 0.5) * 2
    }
    const tick = (now: number) => {
      x += (tx - x) * 0.03
      y += (ty - y) * 0.03
      const t = (now - start) / 1000
      // a very slow breathing drift, plus the pointer
      const dx = Math.sin(t * 0.05) * 10 + x * 10
      const dy = Math.cos(t * 0.04) * 5 + y * 6
      if (bg.current) bg.current.style.transform = `translate3d(${-dx}px, ${-dy}px, 0) scale(1.08)`
      if (fg.current)
        fg.current.style.transform = `translate3d(${-dx * 2.6}px, ${-dy * 1.6}px, 0) scale(1.06)`
      raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', move)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
    }
  }, [])
  return (
    <div className="absolute inset-0">
      <div
        ref={bg}
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: 'url(/art/title/key-bg.webp)',
          transform: 'scale(1.08)',
          willChange: 'transform',
        }}
      />
      {/* the low sun's glow, breathing */}
      <div
        className="animate-ui-breathe pointer-events-none absolute inset-0 mix-blend-screen"
        style={{
          background:
            'radial-gradient(38% 42% at 9% 34%, rgb(255 196 110 / 0.32), transparent 70%)',
          animationDuration: '9s',
        }}
      />
      <Motes />
      <div
        ref={fg}
        className="absolute inset-x-0 -bottom-[3%] h-[42%] bg-cover bg-top"
        style={{
          backgroundImage: 'url(/art/title/key-fg.webp)',
          transform: 'scale(1.06)',
          willChange: 'transform',
        }}
      />
    </div>
  )
}

/** pollen and sea-spray motes catching the low sun */
function Motes() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: 18 }, (_, i) => {
        const left = jitter(i, 1) * 100
        const top = 30 + jitter(i, 2) * 60
        const size = 2 + jitter(i, 3) * 3
        const dur = 14 + jitter(i, 4) * 16
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              background: 'rgb(255 226 170 / 0.85)',
              boxShadow: '0 0 6px rgb(255 200 120 / 0.8)',
              animation: `ui-mote ${dur}s ease-in-out ${-jitter(i, 5) * dur}s infinite`,
            }}
          />
        )
      })}
      <style>{`@keyframes ui-mote{0%{transform:translate(0,0);opacity:0}15%{opacity:.9}50%{transform:translate(38px,-46px);opacity:.6}85%{opacity:.85}100%{transform:translate(70px,-90px);opacity:0}}`}</style>
    </div>
  )
}

/** the five stages, each with its painting; choosing one starts that chapter with a generated band */
export function ChapterPicker({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="animate-ui-fade bg-soot/70 absolute inset-0 flex flex-col justify-center px-[clamp(24px,5vw,80px)] backdrop-blur-[2px]">
      <div className="mb-6 flex items-end justify-between gap-6">
        <div>
          <h2
            className="text-bone ui-halo-soft font-serif text-[clamp(34px,3.4vw,52px)]"
            style={{ fontVariationSettings: '"opsz" 96, "SOFT" 100', fontWeight: 480 }}>
            Chapters of a life
          </h2>
          <CrossHatch width={220} height={16} className="mt-2" />
        </div>
        <MenuButton onClick={onClose}>Back</MenuButton>
      </div>
      <div className="grid grid-cols-5 gap-[clamp(10px,1.4vw,22px)]">
        {LIFE_STAGES.map((id, i) => {
          const s = STAGES[id]
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                clearHints()
                bridge.actions.chooseChapter(id)
              }}
              className="group animate-ui-rise ring-amber/80 relative aspect-[3/4] overflow-hidden rounded-[4px] text-left outline-none focus-visible:ring-2"
              style={{ animationDelay: `${i * 90}ms` }}>
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-[1600ms] ease-out group-hover:scale-[1.06]"
                style={{ backgroundImage: `url(${s.painting})` }}
              />
              <div className="from-soot/95 via-soot/30 absolute inset-0 bg-gradient-to-t to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-[clamp(10px,1.2vw,18px)]">
                <h3
                  className="text-bone font-serif text-[clamp(20px,1.8vw,28px)] leading-tight"
                  style={{ fontVariationSettings: '"opsz" 48, "SOFT" 100', fontWeight: 500 }}>
                  {s.title}
                </h3>
                <p className="text-amber mt-0.5 font-sans text-[13px]">
                  {s.ageYears === 0 ? 'Birth' : `Age ${s.ageYears}`}
                </p>
                <p className="text-bone/80 mt-1.5 font-sans text-[13px] leading-snug max-xl:hidden xl:min-h-[4.125em]">
                  {s.line}
                </p>
              </div>
              <div className="border-bone/0 group-hover:border-bone/40 absolute inset-0 rounded-[4px] border transition-colors" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** the saved life: its chapter's painting, the name and where the life stands; a click picks it up again */
function ContinueCard({ saved }: { saved: NonNullable<BridgeState['saved']> }) {
  const stage = STAGES[saved.stage]
  return (
    <button
      type="button"
      onClick={() => bridge.actions.continueLife()}
      className="group bg-soot/45 ring-amber/80 hover:bg-soot/65 my-1 flex items-center gap-4 rounded-[4px] p-2 pr-6 text-left backdrop-blur-[2px] transition-colors duration-300 outline-none focus-visible:ring-2">
      <span className="relative block aspect-[3/2] w-[112px] shrink-0 overflow-hidden rounded-[3px]">
        <span
          className="absolute inset-0 bg-cover bg-center transition-transform duration-[1200ms] ease-out group-hover:scale-[1.08]"
          style={{ backgroundImage: `url(${stage.painting})` }}
        />
        <span className="border-bone/15 group-hover:border-bone/45 absolute inset-0 rounded-[3px] border transition-colors" />
      </span>
      <span className="flex flex-col">
        <span
          className="text-bone group-hover:text-amber font-serif text-[clamp(22px,1.9vw,28px)] leading-tight transition-colors duration-300"
          style={{ fontVariationSettings: '"opsz" 72, "SOFT" 100', fontWeight: 420 }}>
          Continue as {saved.name}
        </span>
        <span
          className="text-amber mt-0.5 font-serif text-[16px] italic"
          style={{ fontVariationSettings: '"opsz" 24' }}>
          {stage.title} · {ageLabel(saved.ageYears)}
        </span>
      </span>
    </button>
  )
}
