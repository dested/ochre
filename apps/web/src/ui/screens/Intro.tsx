/** The intro: four painted cards with a slow push-in and one caption each. Click or 6 s advances; Esc skips. */
import { useCallback, useEffect, useState } from 'react'
import { bridge } from '~/game/bridge'

export const INTRO_CARDS = [
  { image: '/art/intro/1.webp', text: 'Eighty thousand years ago, at the southern edge of Africa, a cave looked out over the sea.' },
  { image: '/art/intro/2.webp', text: 'The people who lived there were exactly like you. The same hands. The same mind.' },
  { image: '/art/intro/3.webp', text: 'They had no writing, no metal, no farms. Everything they knew, they learned from each other.' },
  { image: '/art/intro/4.webp', text: 'You are born at the end of winter, in the year the whale came ashore.' },
] as const

const CARD_MS = 6000

export function IntroScreen() {
  const [i, setI] = useState(0)
  const next = useCallback(() => {
    setI((n) => {
      if (n + 1 >= INTRO_CARDS.length) {
        bridge.actions.introDone()
        return n
      }
      return n + 1
    })
  }, [])
  useEffect(() => {
    const t = setTimeout(next, CARD_MS)
    return () => clearTimeout(t)
  }, [i, next])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') bridge.actions.introDone()
      else if (e.key === 'Enter' || e.key === ' ') next()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [next])
  const card = INTRO_CARDS[i] ?? INTRO_CARDS[0]
  return (
    <div className="fixed inset-0 cursor-pointer overflow-hidden bg-soot ui-grain" onClick={next}>
      <div
        key={i}
        className="absolute inset-0 animate-ui-fade bg-cover bg-center"
        style={{
          backgroundImage: `url(${card.image})`,
          animation: `ui-fade 1600ms ease both, ui-intro-push ${CARD_MS + 1500}ms linear both`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-soot/85 via-soot/10 to-transparent" />
      <p
        key={`t${i}`}
        className="absolute inset-x-0 bottom-[clamp(48px,11vh,120px)] mx-auto max-w-[min(860px,86vw)] animate-ui-rise px-6 text-center font-serif italic text-bone ui-halo"
        style={{
          fontSize: 'clamp(24px,2.3vw,34px)',
          lineHeight: 1.35,
          fontVariationSettings: '"opsz" 48, "SOFT" 100',
          fontWeight: 380,
          animationDelay: '700ms',
        }}>
        {card.text}
      </p>
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
        {INTRO_CARDS.map((_, n) => (
          <span key={n} className="h-[3px] w-6 rounded-full transition-colors duration-700" style={{ background: n <= i ? '#efe3c8' : 'rgb(239 227 200 / 0.25)' }} />
        ))}
      </div>
      <p className="absolute bottom-5 right-8 font-sans text-[13px] text-bone/50">Esc to skip</p>
      <style>{`@keyframes ui-intro-push{from{transform:scale(1.03)}to{transform:scale(1.1)}}`}</style>
    </div>
  )
}
