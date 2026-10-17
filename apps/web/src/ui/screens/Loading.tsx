/**
 * Loading: the painting of the stage you are about to play, with a slow push-in, while the world is built. The
 * engraved band scratches itself in with the real progress (bridge.loadingProgress), and a line from the Field
 * Notes turns over every few seconds.
 */
import { useEffect, useState } from 'react'
import { useBridge } from '~/game/bridge'
import { STAGES } from '~/content/stages'
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
  const stage = useBridge((s) => s.chapter?.stage ?? s.hud.stage)
  const [line, setLine] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % LINES.length), 5200)
    return () => clearInterval(t)
  }, [])
  const p = Math.min(1, Math.max(0, progress))
  return (
    <div className="fixed inset-0 overflow-hidden bg-soot ui-grain">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${STAGES[stage].painting})`, animation: 'ui-load-push 30s linear both', opacity: 0.75 }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-soot via-soot/55 to-soot/10" />
      <div className="ui-scale absolute inset-x-0 bottom-[16vh] flex flex-col items-center gap-6">
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
          className="max-w-[560px] animate-ui-fade px-6 text-center font-serif text-[19px] italic text-bone/85 ui-halo"
          style={{ fontVariationSettings: '"opsz" 24, "SOFT" 100' }}>
          {LINES[line]}
        </p>
        <p className="font-sans text-[12px] tabular-nums text-bone/50">Building the world · {Math.round(p * 100)}%</p>
      </div>
      <style>{`@keyframes ui-load-push{from{transform:scale(1.03)}to{transform:scale(1.12)}}`}</style>
    </div>
  )
}
