/** Toasts: small bone-paper slips that slide in at the top right ("You learned Shellfish", "New Field Note"). */
import type { ReactNode } from 'react'
import type { Toast } from '~/game/bridge'
import { C } from '../palette'

const MARKS: Record<Toast['kind'], ReactNode> = {
  learned: (
    <g fill="none" stroke={C.ochre} strokeWidth="1.9" strokeLinecap="round">
      <path d="M4 4 L18 18 M18 4 L4 18" />
      <path d="M2.5 11 L19.5 11" strokeOpacity="0.7" />
    </g>
  ),
  note: (
    <g fill="none" stroke={C.ochre} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M4.5 3.5 L15 3.5 L18 6.5 L18 18.5 L4.5 18.5 Z" fill={C.ochre} fillOpacity="0.12" />
      <path d="M7.5 9 L15 9 M7.5 12.5 L15 12.5 M7.5 16 L12 16" strokeWidth="1.2" />
    </g>
  ),
  face: (
    <g fill="none" stroke={C.ochre} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="11" cy="11" r="7.5" />
      <path d="M8 9.6 L8 10.4 M14 9.6 L14 10.4" strokeWidth="2.2" />
      <path d="M7.6 13.6 Q 11 16.4 14.4 13.6" />
    </g>
  ),
  bond: (
    <g fill="none" stroke={C.ochre} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="7" cy="11" r="3.6" fill={C.ochre} fillOpacity="0.2" />
      <circle cx="15" cy="11" r="3.6" fill={C.ochre} fillOpacity="0.2" />
      <path d="M3 17.5 Q 11 21.5 19 17.5" />
    </g>
  ),
  item: (
    <g fill="none" stroke={C.ochre} strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 17.5 C3 13 7 5 14 4 C18.5 3.4 19.5 7.4 17 10.8 C14.4 14.4 9 19 5 17.5 Z" fill={C.ochre} fillOpacity="0.15" />
      <path d="M7.4 15.4 C9.6 11.6 12.4 8.4 16 6.2" strokeWidth="1.1" />
    </g>
  ),
  event: (
    <g fill="none" stroke={C.ochre} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="11" cy="11" r="4.2" fill={C.ochre} fillOpacity="0.2" />
      <path d="M11 2 L11 4.5 M11 17.5 L11 20 M2 11 L4.5 11 M17.5 11 L20 11 M4.6 4.6 L6.4 6.4 M15.6 15.6 L17.4 17.4 M17.4 4.6 L15.6 6.4 M6.4 15.6 L4.6 17.4" strokeWidth="1.3" />
    </g>
  ),
}

export function Toasts({ toasts }: { toasts: readonly Toast[] }) {
  return (
    <div className="flex w-[300px] flex-col items-end gap-2.5" aria-live="polite">
      {toasts.slice(-4).map((t, i) => (
        <ToastSlip key={t.id} toast={t} tilt={i % 2 === 0 ? -0.5 : 0.4} />
      ))}
    </div>
  )
}

function ToastSlip({ toast, tilt }: { toast: Toast; tilt: number }) {
  return (
    <div className="relative animate-ui-slip" style={{ rotate: `${tilt}deg` }}>
      {/* the torn-paper backing, kept separate so the rough filter never touches the text */}
      <div
        className="ui-paper absolute inset-0 rounded-[3px]"
        style={{ filter: 'url(#ui-rough) drop-shadow(0 4px 10px rgb(22 17 14 / 0.45))' }}
      />
      <div className="relative flex min-w-[220px] max-w-[300px] items-start gap-3 px-4 py-3">
        <svg width="22" height="22" viewBox="0 0 22 22" className="mt-0.5 shrink-0" aria-hidden style={{ filter: 'url(#ui-brush)' }}>
          {MARKS[toast.kind]}
        </svg>
        <div className="min-w-0">
          <p
            className="font-serif text-[17px] font-semibold leading-tight text-charcoal"
            style={{ fontVariationSettings: '"opsz" 24, "SOFT" 50' }}>
            {toast.title}
          </p>
          {toast.body && <p className="mt-0.5 font-sans text-[13.5px] leading-snug text-charcoal/75">{toast.body}</p>}
        </div>
      </div>
    </div>
  )
}
