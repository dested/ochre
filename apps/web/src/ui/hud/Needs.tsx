/**
 * The four needs as small painted marks (never bars): a mussel shell (fed), a flame (warmth), a crescent
 * (energy) and an ochre hand (health). Each dims and cools as it falls, and breathes when it is low.
 */
import type { ReactNode } from 'react'
import type { Needs } from '~/game/contracts'
import { C, mix } from '../palette'

type Key = keyof Needs

const GLYPHS: { key: Key; label: string; color: string; draw: (fill: string) => ReactNode }[] = [
  {
    key: 'fed',
    label: 'Fed',
    color: C.bone,
    draw: (fill) => (
      <>
        <path d="M5.5 19.5 C2.6 14.6 7.4 4.4 15 3.2 C20.4 2.4 21.6 7.4 18.4 11.6 C15.2 15.8 9.6 21.4 5.5 19.5 Z" fill={fill} />
        <path
          d="M7.6 17.2 C9.6 13 12.6 8.6 17 5.6 M9.4 18 C12 14.8 15 11.4 18.6 8.6 M6.6 14.6 C8 10.8 10.6 7.2 14 4.8"
          fill="none"
          stroke={C.soot}
          strokeOpacity="0.45"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    key: 'warmth',
    label: 'Warmth',
    color: C.amber,
    draw: (fill) => (
      <>
        <path
          d="M12 1.8 C14.4 6.6 19.2 9.2 18.4 15 C17.8 19.6 14.8 22.2 12 22.2 C8.4 22.2 5.4 19.2 5.8 15 C6.2 11.8 8.6 10.8 9 7.6 C10.6 9.6 11.2 10.8 11.6 12.2 C12.8 9 13.2 5.8 12 1.8 Z"
          fill={fill}
        />
        <path d="M12 13.4 C13.8 15.4 14.6 17 13.8 19 C13.2 20.4 10.8 20.4 10.4 18.8 C10 17.2 11.4 16 12 13.4 Z" fill={C.bone} fillOpacity="0.55" />
      </>
    ),
  },
  {
    key: 'energy',
    label: 'Energy',
    color: '#c9d3d6',
    draw: (fill) => (
      <>
        <path d="M15.6 2.6 C9.4 3 4.8 7.8 4.8 13.4 C4.8 18.6 9.2 22 14 21.6 C17.2 21.4 19.6 19.8 20.8 17.6 C14.6 18.8 9.8 15 10.2 9.6 C10.4 6.6 12.6 3.8 15.6 2.6 Z" fill={fill} />
        <circle cx="17.6" cy="6.4" r="0.9" fill={fill} />
        <circle cx="20.2" cy="10.6" r="0.6" fill={fill} />
      </>
    ),
  },
  {
    key: 'health',
    label: 'Health',
    color: C.ochreBright,
    draw: (fill) => (
      <g fill="none" stroke={fill} strokeLinecap="round">
        <path d="M12.2 20.6 C8.6 20.6 7 18 7.2 14.6 L7.6 12.4" strokeWidth="3.4" />
        <ellipse cx="12.4" cy="15.4" rx="3.9" ry="4.4" fill={fill} stroke="none" />
        <path d="M9.4 12 L8.6 5.6" strokeWidth="2.2" />
        <path d="M11.8 11 L11.6 3.6" strokeWidth="2.3" />
        <path d="M14.2 11.2 L14.8 4.4" strokeWidth="2.2" />
        <path d="M16.2 12.6 L17.8 7.4" strokeWidth="1.9" />
        <path d="M7.4 15 L4 11.4" strokeWidth="2.2" />
      </g>
    ),
  },
]

export function NeedGlyphs({ needs, show }: { needs: Needs; show: boolean }) {
  return (
    <div className="flex items-end gap-2.5" role="group" aria-label="Needs">
      {GLYPHS.map((g) => {
        const v = Math.min(1, Math.max(0, needs[g.key]))
        const low = v < 0.25
        const fill = mix(C.charcoal, g.color, 0.25 + v * 0.75)
        // a full mark is always visible while the HUD is awake; low marks stay up even when idle
        const opacity = show ? 0.35 + v * 0.65 : low ? 0.9 : 0
        return (
          <div
            key={g.key}
            title={`${g.label}`}
            aria-label={`${g.label} ${Math.round(v * 100)}%`}
            className={low ? 'animate-ui-breathe' : undefined}
            style={{ opacity, transition: 'opacity 1.2s ease' }}>
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              style={{
                filter: `url(#ui-brush-soft) drop-shadow(0 1px 2px rgb(22 17 14 / 0.75)) saturate(${0.35 + v * 0.65})`,
                transform: `scale(${0.86 + v * 0.14})`,
                transformOrigin: '50% 100%',
                transition: 'transform 1.2s ease',
              }}>
              {g.draw(fill)}
            </svg>
          </div>
        )
      })}
    </div>
  )
}
