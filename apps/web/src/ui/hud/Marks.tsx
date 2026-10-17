/** The HUD's marks: the interaction prompt, the watch ring, the aim reticle, the objective mark and the name tags. */
import { useRef } from 'react'
import type { NameTag, ObjectiveMark, PromptState } from '~/game/bridge'
import type { SkillId } from '~/game/contracts'
import { SKILL_LABELS } from '~/content/skills'
import { C, mix } from '../palette'

/** a stroked ring that fills clockwise from the top, 0..1 */
function Ring({
  size,
  progress,
  stroke,
  color,
  track,
}: {
  size: number
  progress: number
  stroke: number
  color: string
  track: string
}) {
  const r = size / 2 - stroke
  const len = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, progress))
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0"
      aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={track}
        strokeWidth={stroke * 0.6}
      />
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

const KEY_LABEL: Record<PromptState['key'], string> = {
  E: 'E',
  LMB: 'Click',
  RMB: 'Right',
  Space: 'Space',
}

export function Prompt({ prompt }: { prompt: PromptState }) {
  const wide = prompt.key !== 'E'
  const size = 44
  return (
    <div
      key={prompt.label}
      className="ui-wash animate-ui-rise flex flex-col items-center gap-1.5"
      style={{ opacity: prompt.enabled ? 1 : 0.82 }}>
      <div className="flex items-center gap-3">
        <div
          className="relative grid place-items-center"
          style={{ width: wide ? 'auto' : size, height: size, minWidth: size }}>
          {prompt.holdSeconds > 0 && !wide && (
            <Ring
              size={size}
              progress={prompt.holdProgress}
              stroke={3}
              color={C.amber}
              track="rgb(239 227 200 / 0.18)"
            />
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
          className="ui-halo font-sans text-[18px] font-medium"
          style={{ color: prompt.enabled ? C.bone : C.boneDim }}>
          {prompt.label}
          {prompt.holdSeconds > 0 && prompt.enabled && (
            <span className="text-bone-dim ml-2 text-[13px] font-normal">hold</span>
          )}
        </span>
      </div>
      {!prompt.enabled && prompt.reason && (
        <span
          className="text-bone/90 ui-halo font-serif text-[15px] italic"
          style={{ fontVariationSettings: '"opsz" 24' }}>
          {prompt.reason}
        </span>
      )}
    </div>
  )
}

export function WatchRing({
  watching,
}: {
  watching: { name: string; skill: SkillId; progress: number }
}) {
  const size = 46
  return (
    <div className="animate-ui-rise relative isolate flex items-center gap-3">
      {/* a soft soot wash so the ring reads over a bright sky */}
      <div
        className="absolute -inset-x-10 -inset-y-5 -z-10"
        style={{
          background: 'radial-gradient(closest-side, rgb(22 17 14 / 0.5), rgb(22 17 14 / 0))',
        }}
      />
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <Ring
          size={size}
          progress={watching.progress}
          stroke={3.2}
          color={C.amber}
          track="rgb(239 227 200 / 0.22)"
        />
        {/* an open eye */}
        <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden>
          <g style={{ filter: 'url(#ui-brush)' }}>
            <path
              d="M1.5 7 C5 1.5 17 1.5 20.5 7 C17 12.5 5 12.5 1.5 7 Z"
              fill="none"
              stroke={C.bone}
              strokeWidth="1.5"
            />
            <circle cx="11" cy="7" r="3" fill={C.bone} />
          </g>
        </svg>
      </div>
      <p className="text-bone ui-halo font-sans text-[16px]">
        <span className="text-bone/80">Watching</span>{' '}
        <span className="font-semibold">{watching.name}</span>
        <span className="text-bone-dim mx-2">·</span>
        <span
          className="text-amber font-serif font-semibold"
          style={{ fontVariationSettings: '"opsz" 24' }}>
          {SKILL_LABELS[watching.skill]}
        </span>
      </p>
    </div>
  )
}

export function Reticle() {
  return (
    <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden className="animate-ui-fade">
      <g
        fill="none"
        stroke={C.bone}
        strokeLinecap="round"
        style={{ filter: 'url(#ui-brush) drop-shadow(0 0 3px rgb(22 17 14 / 0.8))' }}>
        <path d="M27 6 A21 21 0 0 1 46.6 19.5" strokeWidth="1.6" />
        <path d="M46.8 34 A21 21 0 0 1 33 47" strokeWidth="1.6" />
        <path d="M21 47.2 A21 21 0 0 1 7.2 34" strokeWidth="1.6" />
        <path d="M7.4 19.8 A21 21 0 0 1 20.6 7" strokeWidth="1.6" />
        <path
          d="M27 21 L27 24.5 M27 29.5 L27 33 M21 27 L24.5 27 M29.5 27 L33 27"
          strokeWidth="1.3"
        />
      </g>
      <circle cx="27" cy="27" r="1.6" fill={C.amber} />
    </svg>
  )
}

/** a soft ring at screen centre while the baby is meant to look at faces: it shows where a face has to rest */
export function GazeMark() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 34 34"
      aria-hidden
      className="animate-ui-fade opacity-55">
      <circle
        cx="17"
        cy="17"
        r="13"
        fill="none"
        stroke={C.bone}
        strokeWidth="1.3"
        strokeDasharray="5 5.2"
        style={{ filter: 'url(#ui-brush) drop-shadow(0 0 3px rgb(22 17 14 / 0.8))' }}
      />
    </svg>
  )
}

const MAX_TAGS = 4

/** your own family ("Mother", "Sister"), as against the rest of the band ("Keda's daughter") */
const isKin = (t: NameTag) => t.relation !== null && !t.relation.includes("'s ")

/**
 * At most four tags at once, so a crowded shore doesn't become a wall of labels: whoever is speaking, then family,
 * then the closest bonds and the nearest. The rest fade out but stay mounted, so a tag never pops.
 */
export function shownTags(
  tags: readonly NameTag[],
  view: { width: number; height: number } = { width: Infinity, height: Infinity }
): Set<string> {
  const rank = (t: NameTag) => (t.speaking ? 4 : 0) + (isKin(t) ? 2 : 0) + t.bond + t.opacity
  // a head off the screen gets no tag: the edge clamp would pin it where nobody stands
  const inView = (t: NameTag) => t.x >= 0 && t.x <= view.width && t.y >= 0 && t.y <= view.height
  return new Set(
    [...tags]
      .filter((t) => t.opacity > 0.05 && inView(t))
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, MAX_TAGS)
      .map((t) => t.id)
  )
}

export function NameTags({ tags }: { tags: readonly NameTag[] }) {
  const shown = shownTags(
    tags,
    typeof window === 'undefined'
      ? undefined
      : { width: window.innerWidth, height: window.innerHeight }
  )
  return (
    <>
      {tags.map((t) => {
        const warm = mix(C.bone, C.amber, t.bond)
        // the band's "Keda's daughter" lines only while that person speaks; family relations always
        const relation = t.relation && (isKin(t) || t.speaking) ? t.relation : null
        return (
          <div
            key={t.id}
            className="ui-wash ui-wash-tight absolute top-0 left-0 flex flex-col items-center"
            style={{
              // positions arrive at ~15 Hz: glide between them so tags don't step; keep them clear of the screen edge
              transform: `translate(clamp(80px, ${t.x}px, calc(100vw - 80px)), clamp(64px, ${t.y}px, 100vh)) translate(-50%, -100%)`,
              opacity: shown.has(t.id) ? Math.min(1, Math.max(0, t.opacity)) : 0,
              transition: 'opacity 300ms ease, transform 70ms linear',
            }}>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                className="ui-halo font-serif text-[16px] font-semibold"
                style={{ color: warm, fontVariationSettings: '"opsz" 24, "SOFT" 60' }}>
                {t.name}
              </span>
              {t.speaking && <SpeakingMark />}
            </span>
            {relation && (
              <span className="text-bone-dim ui-halo -mt-0.5 font-sans text-[12px] font-medium whitespace-nowrap">
                {relation}
              </span>
            )}
            {/* a short engraved tick down to the head, warmer with the bond */}
            <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden className="mt-0.5">
              <path
                d="M5 1 L5 9"
                stroke={warm}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeOpacity="0.8"
              />
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
    <svg
      width="16"
      height="12"
      viewBox="0 0 16 12"
      aria-label="speaking"
      className="animate-ui-breathe">
      <g fill="none" stroke={C.amber} strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 4 Q 3.5 6 2 8" />
        <path d="M5.5 2.5 Q 7.7 6 5.5 9.5" />
        <path d="M9 1 Q 11.8 6 9 11" />
      </g>
    </svg>
  )
}

/** keeps the objective mark this far inside the screen edge, so the arrow is never cut */
const MARK_EDGE = 44
/** a soft soot pool behind the mark, so ochre reads on bright sand and on dark rock alike */
const MARK_POOL =
  'radial-gradient(closest-side, rgb(22 17 14 / 0.42), rgb(22 17 14 / 0.14) 65%, transparent)'

/**
 * The objective's target: a small ochre diamond floating over it while on screen, and an edge arrow at the clamped
 * point turned toward it (angle clockwise from up) while off screen. `show` gates the fade; the last mark is kept
 * so a null fades out in place instead of vanishing.
 */
/** how far the on-screen diamond rides above its point: clear of the head, or clear of the target's name tag */
const MARK_LIFT = 18
const MARK_LIFT_TAG = 82

export function ObjectiveMarker({
  mark,
  show,
  aboveTag = false,
}: {
  mark: ObjectiveMark | null
  show: boolean
  /** the target's name tag is up: sit above it rather than over its name */
  aboveTag?: boolean
}) {
  const last = useRef<ObjectiveMark | null>(null)
  if (mark) last.current = mark
  const m = mark ?? last.current
  if (!m) return null
  const visible = show && mark !== null
  const deg = (m.angle * 180) / Math.PI
  return (
    <div
      className="absolute top-0 left-0"
      aria-hidden
      style={{
        // ~15 Hz positions: glide like the name tags; clamp inside the edge so the arrow stays whole
        transform: `translate(clamp(${MARK_EDGE}px, ${m.x}px, calc(100vw - ${MARK_EDGE}px)), clamp(${MARK_EDGE}px, ${m.y}px, calc(100vh - ${MARK_EDGE}px))) translate(-50%, -50%)`,
        opacity: visible ? 1 : 0,
        transition: visible
          ? 'opacity 900ms ease, transform 70ms linear'
          : 'opacity 400ms ease, transform 70ms linear',
        filter: 'drop-shadow(0 1px 3px rgb(22 17 14 / 0.75))',
      }}>
      <div className="relative h-[46px] w-[46px]">
        {/* on screen: the diamond rides a little above the target point */}
        <svg
          width="46"
          height="46"
          viewBox="0 0 36 36"
          className="absolute inset-0"
          style={{
            opacity: m.onScreen ? 1 : 0,
            transition: 'opacity 250ms ease, translate 300ms ease',
            translate: `0 -${aboveTag ? MARK_LIFT_TAG : MARK_LIFT}px`,
            background: MARK_POOL,
          }}>
          <g style={{ filter: 'url(#ui-brush-soft)' }}>
            <path
              d="M18 9 L25 18 L18 27 L11 18 Z"
              fill={C.ochreBright}
              fillOpacity="0.9"
              stroke={C.bone}
              strokeOpacity="0.85"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path
              d="M18 27 L18 33"
              stroke={C.bone}
              strokeOpacity="0.7"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </g>
        </svg>
        {/* off screen: a small diamond with a chevron ahead of it, turned toward the target */}
        <svg
          width="46"
          height="46"
          viewBox="0 0 36 36"
          className="absolute inset-0"
          style={{
            opacity: m.onScreen ? 0 : 1,
            transition: 'opacity 250ms ease',
            rotate: `${deg}deg`,
            background: MARK_POOL,
          }}>
          <g style={{ filter: 'url(#ui-brush-soft)' }}>
            <path
              d="M18 14 L23 20 L18 26 L13 20 Z"
              fill={C.ochreBright}
              fillOpacity="0.9"
              stroke={C.bone}
              strokeOpacity="0.85"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path
              d="M11 10.5 L18 3.5 L25 10.5"
              fill="none"
              stroke={C.bone}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  )
}
