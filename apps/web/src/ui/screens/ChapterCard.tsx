/** A chapter card: the stage's painting with a slow push-in, its title and the age. Click, Enter or 7 s to go on. */
import { useEffect } from 'react'
import { bridge, useBridge } from '~/game/bridge'
import { STAGES } from '~/content/stages'
import { useAfter } from '../hooks'
import { CrossHatch } from '../motifs'

const AUTO_MS = 7000

export function ChapterCardScreen() {
  const card = useBridge((s) => s.chapter)
  const hint = useAfter(2200)

  useEffect(() => {
    const done = () => bridge.actions.chapterCardDone()
    const t = setTimeout(done, AUTO_MS)
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') done()
    }
    window.addEventListener('keydown', key)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', key)
    }
  }, [card])

  if (!card) return null
  const stage = STAGES[card.stage]
  const age = card.ageYears === 0 ? 'Born at the end of winter' : `Age ${card.ageYears}`
  return (
    <div
      className="fixed inset-0 animate-ui-fade cursor-pointer overflow-hidden bg-soot ui-grain"
      style={{ animationDuration: '1400ms' }}
      onClick={() => bridge.actions.chapterCardDone()}>
      <div
        key={card.stage}
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${stage.painting})`, animation: `ui-push ${AUTO_MS + 2000}ms linear both` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(0deg, rgb(22 17 14 / 0.82) 0%, rgb(22 17 14 / 0.35) 34%, rgb(22 17 14 / 0) 60%), linear-gradient(90deg, rgb(22 17 14 / 0.45) 0%, rgb(22 17 14 / 0) 50%)',
        }}
      />
      <div className="absolute bottom-[clamp(40px,10vh,110px)] left-[clamp(28px,7vw,120px)] max-w-[min(680px,80vw)]">
        <h1
          className="animate-ui-rise font-serif leading-[0.95] text-bone ui-halo-soft"
          style={{
            fontSize: 'clamp(64px,7.5vw,120px)',
            fontVariationSettings: '"opsz" 144, "SOFT" 100',
            fontWeight: 480,
            animationDelay: '500ms',
          }}>
          {card.title}
        </h1>
        <div className="mt-4 animate-ui-rise" style={{ animationDelay: '900ms' }}>
          <CrossHatch width={260} height={18} />
        </div>
        <p
          className="mt-4 animate-ui-rise font-serif text-[clamp(22px,2vw,30px)] italic text-amber ui-halo"
          style={{ fontVariationSettings: '"opsz" 36, "SOFT" 100', animationDelay: '1200ms' }}>
          {age}
        </p>
        <p
          className="mt-2 animate-ui-rise font-sans text-[clamp(15px,1.2vw,18px)] leading-relaxed text-bone/85 ui-halo"
          style={{ animationDelay: '1500ms' }}>
          {(card.subtitle || stage.line).replace(/\.\s*$/, '')}
        </p>
      </div>
      <p
        className="absolute bottom-6 right-8 font-sans text-[13px] text-bone/55 ui-halo-soft"
        style={{ opacity: hint ? 1 : 0, transition: 'opacity 1.2s ease' }}>
        Click to continue
      </p>
      <style>{`@keyframes ui-push{from{transform:scale(1.02)}to{transform:scale(1.09) translate(-0.6%,-0.4%)}}`}</style>
    </div>
  )
}
