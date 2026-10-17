/** Settings: volume, music, quality, large captions, mouse. Writes through bridge.actions.setSettings. */
import { bridge, useBridge, type Settings } from '~/game/bridge'
import type { Quality } from '~/game/contracts'
import { TextButton } from '../widgets'

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="flex items-center justify-between gap-6">
      <span className="font-sans text-[15px] text-bone/90">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-[180px] accent-[#f2a03d]"
      />
    </label>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6">
      <span className="font-sans text-[15px] text-bone/90">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[#f2a03d]" />
    </label>
  )
}

const QUALITIES: Quality[] = ['low', 'medium', 'high']

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const s = useBridge((st) => st.settings)
  const set = (patch: Partial<Settings>) => bridge.actions.setSettings(patch)
  return (
    <div className="flex w-[340px] flex-col gap-4">
      <h3 className="font-serif text-[26px] text-bone" style={{ fontVariationSettings: '"opsz" 48, "SOFT" 100' }}>
        Settings
      </h3>
      <Slider label="Volume" value={s.master} onChange={(v) => set({ master: v })} />
      <Slider label="Music" value={s.music} onChange={(v) => set({ music: v })} />
      <div className="flex items-center justify-between gap-6">
        <span className="font-sans text-[15px] text-bone/90">Picture</span>
        <div className="flex gap-1">
          {QUALITIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => set({ quality: q })}
              className={
                'rounded-[4px] px-2.5 py-1 font-sans text-[13px] capitalize transition-colors ' +
                (s.quality === q ? 'bg-bone text-charcoal' : 'text-bone/75 hover:text-amber')
              }>
              {q}
            </button>
          ))}
        </div>
      </div>
      <Toggle label="Large captions" value={s.largeCaptions} onChange={(v) => set({ largeCaptions: v })} />
      <Toggle label="Invert mouse" value={s.invertY} onChange={(v) => set({ invertY: v })} />
      <Slider label="Mouse speed" value={s.sensitivity} min={0.3} max={2} step={0.1} onChange={(v) => set({ sensitivity: v })} />
      <div className="mt-2">
        <TextButton onClick={onBack}>Back</TextButton>
      </div>
    </div>
  )
}
