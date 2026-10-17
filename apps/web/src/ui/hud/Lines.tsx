/** The HUD's text: the objective line (top left) and the captions (bottom centre). */
import type { Caption, Objective } from '~/game/contracts'
import { C } from '../palette'

export function ObjectiveLine({ objective, dim }: { objective: Objective; dim: boolean }) {
  const counted = objective.total !== null && objective.total > 1
  return (
    <div
      key={objective.id + objective.text}
      className="ui-wash ui-wash-tight flex max-w-[min(44vw,520px)] animate-ui-rise items-start gap-3"
      style={{ opacity: dim ? 0.6 : 1, transition: 'opacity 1.6s ease' }}>
      <svg width="16" height="22" viewBox="0 0 16 22" className="mt-[3px] shrink-0" aria-hidden>
        <g fill="none" stroke={C.ochreBright} strokeWidth="1.8" strokeLinecap="round" style={{ filter: 'url(#ui-brush)' }}>
          <path d="M2 3 L14 19 M14 3 L2 19" />
          <path d="M1.5 11 L14.5 11" strokeOpacity="0.8" />
        </g>
      </svg>
      <p className="font-sans text-[17px] font-medium leading-snug text-bone ui-halo">
        {objective.text.replace(/\s*\(\d+\/\d+\)\s*$/, '')}
        {counted && (
          <span className="ml-2 font-serif text-[16px] text-amber tabular-nums" style={{ fontVariationSettings: '"opsz" 24' }}>
            {objective.done ?? 0}/{objective.total}
          </span>
        )}
      </p>
    </div>
  )
}

const MAX_CAPTIONS = 3

/** ambient talk between two other people (sim's "chat-" ids): overheard, not said to you */
function isChatter(c: Caption): boolean {
  return c.kind === 'speech' && c.id.startsWith('chat-')
}

/** the newest three; when more are waiting, overheard chatter goes first, then the oldest of the rest */
export function pickCaptions(captions: readonly Caption[]): Caption[] {
  const shown = [...captions]
  while (shown.length > MAX_CAPTIONS) {
    const chatter = shown.findIndex(isChatter)
    shown.splice(chatter >= 0 ? chatter : 0, 1)
  }
  return shown
}

export function Captions({ captions, large }: { captions: readonly Caption[]; large: boolean }) {
  const shown = pickCaptions(captions)
  return (
    <div className="flex w-[min(820px,86vw)] flex-col items-center gap-2 text-center" aria-live="polite">
      {shown.map((c) => (
        <CaptionLine key={c.id} caption={c} large={large} />
      ))}
    </div>
  )
}

function CaptionLine({ caption, large }: { caption: Caption; large: boolean }) {
  const scale = large ? 1.28 : 1
  if (isChatter(caption)) {
    // softer than talk aimed at you: smaller, dimmer, the name in the same muted tone as the words
    return (
      <p
        className="ui-wash ui-wash-tight animate-ui-rise font-sans text-bone ui-halo"
        style={{ fontSize: 16 * scale, lineHeight: 1.4, opacity: 0.72 }}>
        {caption.speaker && <span className="mr-2 opacity-75">{caption.speaker}</span>}
        <span>{caption.text}</span>
      </p>
    )
  }
  if (caption.kind === 'speech') {
    return (
      <p className="ui-wash animate-ui-rise text-bone ui-halo" style={{ fontSize: 19 * scale, lineHeight: 1.4 }}>
        {caption.speaker && (
          <span
            className="mr-2.5 font-serif font-semibold text-amber"
            style={{ fontSize: 17 * scale, fontVariationSettings: '"opsz" 24, "SOFT" 50' }}>
            {caption.speaker}
          </span>
        )}
        <span className="font-sans">{caption.text}</span>
      </p>
    )
  }
  if (caption.kind === 'song') {
    return (
      <p
        className="ui-wash flex animate-ui-rise items-center justify-center gap-3 font-serif italic text-bone ui-halo"
        style={{ fontSize: 21 * scale, lineHeight: 1.4, fontVariationSettings: '"opsz" 36, "SOFT" 100' }}>
        <SongMark />
        <span>{caption.text}</span>
        <SongMark />
      </p>
    )
  }
  return (
    <p
      className="ui-wash animate-ui-rise font-serif italic text-bone ui-halo"
      style={{ fontSize: 22 * scale, lineHeight: 1.4, fontVariationSettings: '"opsz" 36, "SOFT" 100', fontWeight: 380 }}>
      {caption.text}
    </p>
  )
}

/** a small sung-line mark: three rising strokes like a voice */
function SongMark() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden className="shrink-0">
      <g fill="none" stroke={C.amber} strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#ui-brush)' }}>
        <path d="M1 9 Q 4 4 7 9 T 13 9 T 17 6" />
        <path d="M3 12.5 Q 6 9.5 9 12.5 T 15 12" strokeOpacity="0.55" />
      </g>
    </svg>
  )
}
