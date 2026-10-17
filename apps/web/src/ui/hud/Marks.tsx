/** The HUD's marks: the interaction prompt, the watch ring, the aim reticle and the name tags. */
import type { NameTag, PromptState } from '~/game/bridge'
import type { SkillId } from '~/game/contracts'
import { SKILL_LABELS } from '~/content/skills'
import { C, mix } from '../palette'

/** a stroked ring that fills clockwise from the top, 0..1 */
function Ring({ size, progress, stroke, color, track }: { size: number; progress: number; stroke: number; color: string; track: string }) {
  const r = size / 2 - stroke
  const len = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, progress))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke * 0.6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${len * p} ${len}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: 'url(#ui-brush)', transition: 'stroke-dasharray 120ms linear' }}
      />
    </svg>
  )
}

const KEY_LABEL: Record<PromptState['key'], string> = { E: 'E', LMB: 'Click', RMB: 'Right', Space: 'Space' }

export function Prompt({ prompt }: { prompt: PromptState }) {
  const wide = prompt.key !== 'E'
  const size = 44
  return (
    <div
      key={prompt.label}
      className="flex animate-ui-rise flex-col items-center gap-1.5"
      style={{ opacity: prompt.enabled ? 1 : 0.82 }}>
      <div className="flex items-center gap-3">
        <div className="relative grid place-items-center" style={{ width: wide ? 'auto' : size, height: size, minWidth: size }}>
          {prompt.holdSeconds > 0 && !wide && (
            <Ring size={size} progress={prompt.holdProgress} stroke={3} color={C.amber} track="rgb(239 227 200 / 0.18)" />
          )}
          <span
            className="grid h-[30px] min-w-[30px] place-items-center rounded-[7px] border px-2 font-sans text-[14px] font-semibold"
            style={{
              borderColor: prompt.enabled ? 'rgb(239 227 200 / 0.85)' : 'rgb(239 227 200 / 0.4)',
              color: prompt.enabled ? C.bone : C.boneDim,
              background: 'rgb(22 17 14 / 0.55)',
              boxShadow: '0 2px 10px rgb(22 17 14 / 0.4)',
            }}>
            {KEY_LABEL[prompt.key]}
          </span>
        </div>
        <span
          className="font-sans text-[18px] font-medium ui-halo"
          style={{ color: prompt.enabled ? C.bone : C.boneDim }}>
          {prompt.label}
          {prompt.holdSeconds > 0 && prompt.enabled && (
            <span className="ml-2 text-[13px] font-normal text-bone-dim">hold</span>
          )}
        </span>
      </div>
      {!prompt.enabled && prompt.reason && (
        <span className="font-serif text-[15px] italic text-bone-dim ui-halo" style={{ fontVariationSettings: '"opsz" 24' }}>
          {prompt.reason}
        </span>
      )}
    </div>
  )
}

export function WatchRing({ watching }: { watching: { name: string; skill: SkillId; progress: number } }) {
  const size = 46
  return (
    <div className="relative isolate flex animate-ui-rise items-center gap-3">
      {/* a soft soot wash so the ring reads over a bright sky */}
      <div
        className="absolute -inset-x-10 -inset-y-5 -z-10"
        style={{ background: 'radial-gradient(closest-side, rgb(22 17 14 / 0.5), rgb(22 17 14 / 0))' }}
      />
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <Ring size={size} progress={watching.progress} stroke={3.2} color={C.amber} track="rgb(239 227 200 / 0.22)" />
        {/* an open eye */}
        <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden>
          <g style={{ filter: 'url(#ui-brush)' }}>
            <path d="M1.5 7 C5 1.5 17 1.5 20.5 7 C17 12.5 5 12.5 1.5 7 Z" fill="none" stroke={C.bone} strokeWidth="1.5" />
            <circle cx="11" cy="7" r="3" fill={C.bone} />
          </g>
        </svg>
      </div>
      <p className="font-sans text-[16px] text-bone ui-halo">
        <span className="text-bone/80">Watching</span> <span className="font-semibold">{watching.name}</span>
        <span className="mx-2 text-bone-dim">·</span>
        <span className="font-serif font-semibold text-amber" style={{ fontVariationSettings: '"opsz" 24' }}>
          {SKILL_LABELS[watching.skill]}
        </span>
      </p>
    </div>
  )
}

export function Reticle() {
  return (
    <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden className="animate-ui-fade">
      <g fill="none" stroke={C.bone} strokeLinecap="round" style={{ filter: 'url(#ui-brush) drop-shadow(0 0 3px rgb(22 17 14 / 0.8))' }}>
        <path d="M27 6 A21 21 0 0 1 46.6 19.5" strokeWidth="1.6" />
        <path d="M46.8 34 A21 21 0 0 1 33 47" strokeWidth="1.6" />
        <path d="M21 47.2 A21 21 0 0 1 7.2 34" strokeWidth="1.6" />
        <path d="M7.4 19.8 A21 21 0 0 1 20.6 7" strokeWidth="1.6" />
        <path d="M27 21 L27 24.5 M27 29.5 L27 33 M21 27 L24.5 27 M29.5 27 L33 27" strokeWidth="1.3" />
      </g>
      <circle cx="27" cy="27" r="1.6" fill={C.amber} />
    </svg>
  )
}

export function NameTags({ tags }: { tags: readonly NameTag[] }) {
  return (
    <>
      {tags.map((t) => {
        const warm = mix(C.bone, C.amber, t.bond)
        return (
          <div
            key={t.id}
            className="absolute flex flex-col items-center"
            style={{
              left: t.x,
              top: t.y,
              transform: 'translate(-50%, -100%)',
              opacity: Math.min(1, Math.max(0, t.opacity)),
              transition: 'opacity 300ms ease',
            }}>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                className="font-serif text-[16px] font-semibold ui-halo"
                style={{ color: warm, fontVariationSettings: '"opsz" 24, "SOFT" 60' }}>
                {t.name}
              </span>
              {t.speaking && <SpeakingMark />}
            </span>
            {t.relation && (
              <span className="-mt-0.5 whitespace-nowrap font-sans text-[12px] text-bone-dim ui-halo">{t.relation}</span>
            )}
            {/* a short engraved tick down to the head, warmer with the bond */}
            <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden className="mt-0.5">
              <path d="M5 1 L5 9" stroke={warm} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.8" />
              <circle cx="5" cy="10.6" r="1.1" fill={warm} />
            </svg>
          </div>
        )
      })}
    </>
  )
}

function SpeakingMark() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-label="speaking" className="animate-ui-breathe">
      <g fill="none" stroke={C.amber} strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 4 Q 3.5 6 2 8" />
        <path d="M5.5 2.5 Q 7.7 6 5.5 9.5" />
        <path d="M9 1 Q 11.8 6 9 11" />
      </g>
    </svg>
  )
}
