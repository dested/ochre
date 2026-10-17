/** A choice: the prompt and its options, shown as people where they are people. Over the game, never blocking the view entirely. */
import { bridge, type ChoiceState } from '~/game/bridge'
import { CrossHatch } from '../motifs'

export function ChoiceDialog({ choice }: { choice: ChoiceState }) {
  return (
    <div className="animate-ui-fade pointer-events-auto fixed inset-0 flex items-end justify-center pb-[clamp(40px,12vh,140px)]">
      <div className="from-soot/85 via-soot/35 absolute inset-0 bg-gradient-to-t to-transparent" />
      <div className="ui-scale relative flex max-w-[min(980px,92vw)] flex-col items-center">
        <h2
          className="text-bone ui-halo text-center font-serif text-[clamp(26px,2.4vw,36px)]"
          style={{ fontVariationSettings: '"opsz" 72, "SOFT" 100', fontWeight: 460 }}>
          {choice.prompt.replace(/\.$/, '')}
        </h2>
        <CrossHatch width={180} height={14} className="mt-3" />
        <div className="mt-7 flex flex-wrap justify-center gap-4">
          {choice.options.map((o, i) => (
            <button
              key={o.id}
              type="button"
              onClick={() => bridge.actions.choose(choice.id, o.id)}
              className="group animate-ui-rise relative flex w-[min(280px,80vw)] flex-col text-left outline-none"
              style={{ animationDelay: `${200 + i * 120}ms` }}>
              <div
                className="ui-paper absolute inset-0 rounded-[3px] transition-transform duration-300 group-hover:-translate-y-1 group-focus-visible:-translate-y-1"
                style={{ filter: 'url(#ui-rough) drop-shadow(0 6px 14px rgb(22 17 14 / 0.5))' }}
              />
              <div className="relative px-5 py-4 transition-transform duration-300 group-hover:-translate-y-1 group-focus-visible:-translate-y-1">
                <p
                  className="text-charcoal font-serif text-[21px] leading-tight font-semibold"
                  style={{ fontVariationSettings: '"opsz" 36, "SOFT" 60' }}>
                  {o.label}
                </p>
                {o.detail && (
                  <p className="text-charcoal/75 mt-1 font-sans text-[14px] leading-snug">
                    {o.detail}
                  </p>
                )}
                <span className="mt-3 block h-[8px] w-[80px] origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100">
                  <CrossHatch cells={6} height={8} middle={false} strokeWidth={1.2} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
