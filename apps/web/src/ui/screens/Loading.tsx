/** Loading: the world is being built. The engraved band scratches itself in as the progress grows. */
import { useEffect, useState } from 'react'
import { useBridge } from '~/game/bridge'
import { CrossHatch } from '../motifs'

const LINES = [
  'The lowest tides come near the full and the new moon.',
  'Under the fynbos lie corms, sweet when roasted in the coals.',
  'Fire keeps the cold, the dark and the hyenas away.',
  'Everything the band knows lives in people, and passes by watching.',
  'Silcrete heated under a fire flakes cleaner and sharper.',
]

export function LoadingScreen() {
  const progress = useBridge((s) => s.loadingProgress)
  const [line, setLine] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % LINES.length), 5200)
    return () => clearInterval(t)
  }, [])
  const p = Math.min(1, Math.max(0, progress))
  return (
    <div className="fixed inset-0 overflow-hidden bg-soot ui-grain">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30 blur-[6px]"
        style={{ backgroundImage: 'url(/art/title/key-bg.webp)', transform: 'scale(1.1)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-soot via-soot/60 to-soot/30" />
      <div className="absolute inset-x-0 bottom-[16vh] flex flex-col items-center gap-6">
        <div className="relative h-[22px] w-[min(420px,70vw)]">
          <div className="absolute inset-0 opacity-20">
            <CrossHatch cells={30} height={22} />
          </div>
          <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - p * 100}% 0 0)`, transition: 'clip-path 400ms ease' }}>
            <CrossHatch cells={30} height={22} color="#c4552c" />
          </div>
        </div>
        <p
          key={line}
          className="max-w-[560px] animate-ui-fade px-6 text-center font-serif text-[19px] italic text-bone/85"
          style={{ fontVariationSettings: '"opsz" 24, "SOFT" 100' }}>
          {LINES[line]}
        </p>
      </div>
    </div>
  )
}
