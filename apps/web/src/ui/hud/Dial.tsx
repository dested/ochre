/**
 * The sun and moon dial: a small painted medallion. The sky inside follows the daylight, the sun and the moon
 * ride a circle (dawn on the left, noon at the top, dusk on the right), and the sea at the bottom rises and
 * falls with the tide. The wind mark rides the rim.
 */
import type { ClockState } from '~/game/contracts'
import { C, mix } from '../palette'

const R = 30
const CX = 34
const CY = 34

function skyColor(daylight: number, hour: number): { top: string; bottom: string } {
  const night = { top: '#0f1630', bottom: '#27304f' }
  const day = { top: '#7fb4cc', bottom: '#e4e2cc' }
  const top = mix(night.top, day.top, daylight)
  // dawn and dusk warm the horizon
  const twilight = Math.max(0, 1 - Math.abs(daylight - 0.45) / 0.4) * (hour < 12 ? 0.8 : 1)
  const bottom = mix(mix(night.bottom, day.bottom, daylight), hour < 12 ? '#e6a3a0' : C.amber, twilight * 0.85)
  return { top, bottom }
}

/** position on the dial's orbit for an hour of the day (6 → left, 12 → top, 18 → right) */
function orbit(hour: number, radius: number): { x: number; y: number } {
  const phi = ((hour - 6) / 24) * Math.PI * 2
  return { x: CX - Math.cos(phi) * radius, y: CY - Math.sin(phi) * radius }
}

/** the lit part of the moon as an SVG path, phase 0 new .. 0.5 full .. 1 new; waxing lit on the left (south) */
function moonPath(cx: number, cy: number, r: number, phase: number): string {
  const p = ((phase % 1) + 1) % 1
  const k = Math.cos(p * Math.PI * 2) // 1 new, −1 full
  const waxing = p < 0.5
  const sweepOuter = waxing ? 0 : 1
  const rx = Math.abs(k) * r
  const sweepInner = waxing ? (k > 0 ? 1 : 0) : k > 0 ? 0 : 1
  return `M${cx} ${cy - r} A${r} ${r} 0 0 ${sweepOuter} ${cx} ${cy + r} A${rx} ${r} 0 0 ${sweepInner} ${cx} ${cy - r} Z`
}

function tideWords(clock: ClockState): string | null {
  if (clock.tide < -0.72) return clock.tideRange > 0.6 ? 'Spring low tide' : 'Low tide'
  if (clock.tide > 0.72) return 'High tide'
  return null
}

export function Dial({
  clock,
  wind,
  showWords,
}: {
  clock: ClockState
  wind: { dir: number; strength: number } | null
  showWords: boolean
}) {
  const sky = skyColor(clock.daylight, clock.hour)
  const sun = orbit(clock.hour, R * 0.62)
  const moon = orbit(clock.hour - clock.moonPhase * 24, R * 0.62)
  // the sea line: low tide sits low in the disc, high tide high
  const seaY = CY + 15 - clock.tide * 7
  const waveA = `M${CX - R} ${seaY} Q ${CX - 18} ${seaY - 2.4} ${CX - 8} ${seaY} T ${CX + 12} ${seaY} T ${CX + R} ${seaY}`
  const words = tideWords(clock)
  const night = clock.daylight < 0.35
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="68" height="68" viewBox="0 0 68 68" aria-label={`Hour ${Math.floor(clock.hour)}`}>
        <defs>
          <clipPath id="dial-clip">
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
          <linearGradient id="dial-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky.top} />
            <stop offset="1" stopColor={sky.bottom} />
          </linearGradient>
          <linearGradient id="dial-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={night ? '#2a4d66' : '#3f8f8f'} />
            <stop offset="1" stopColor={C.deep} />
          </linearGradient>
          <radialGradient id="dial-sun">
            <stop offset="0" stopColor="#fff2c8" />
            <stop offset="0.45" stopColor={C.amber} stopOpacity="0.9" />
            <stop offset="1" stopColor={C.amber} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g clipPath="url(#dial-clip)" style={{ filter: 'url(#ui-brush)' }}>
          <rect x="0" y="0" width="68" height="68" fill="url(#dial-sky)" />
          {night &&
            [
              [22, 18],
              [40, 14],
              [47, 24],
              [16, 28],
              [30, 10],
              [52, 33],
            ].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.7} fill={C.bone} opacity={0.8 - clock.daylight} />)}
          <circle cx={sun.x} cy={sun.y} r="9" fill="url(#dial-sun)" />
          <circle cx={sun.x} cy={sun.y} r="3.6" fill="#fff0c4" />
          <circle cx={moon.x} cy={moon.y} r="3.8" fill={C.charcoal} opacity="0.35" />
          <path d={moonPath(moon.x, moon.y, 3.8, clock.moonPhase)} fill="#ece6d4" />
          <path d={`${waveA} L ${CX + R} 68 L ${CX - R} 68 Z`} fill="url(#dial-sea)" />
          <path d={waveA} fill="none" stroke={C.bone} strokeOpacity="0.7" strokeWidth="1.1" />
        </g>
        {/* the engraved rim with four hour ticks */}
        <g fill="none" stroke={C.bone} strokeLinecap="round" style={{ filter: 'url(#ui-brush)' }}>
          <circle cx={CX} cy={CY} r={R + 0.6} strokeWidth="1.6" strokeOpacity="0.85" />
          <path d={`M${CX} ${CY - R - 3} L${CX} ${CY - R + 2}`} strokeWidth="1.4" />
          <path d={`M${CX - R - 3} ${CY} L${CX - R + 2} ${CY}`} strokeWidth="1.1" strokeOpacity="0.7" />
          <path d={`M${CX + R - 2} ${CY} L${CX + R + 3} ${CY}`} strokeWidth="1.1" strokeOpacity="0.7" />
        </g>
        {wind && wind.strength > 0.02 && <WindMark dir={wind.dir} strength={wind.strength} />}
      </svg>
      <div
        className="font-sans text-[11px] tracking-wide text-bone ui-halo"
        style={{ opacity: showWords && words ? 0.9 : 0, transition: 'opacity 1s ease', minHeight: 14 }}>
        {words ?? ''}
      </div>
    </div>
  )
}

/** a brushed arrow on the dial's rim pointing the way the wind blows (screen space, 0 = up) */
function WindMark({ dir, strength }: { dir: number; strength: number }) {
  const deg = (dir * 180) / Math.PI
  const s = Math.min(1, strength)
  const len = 6 + s * 8
  return (
    <g transform={`rotate(${deg} ${CX} ${CY})`} opacity={0.45 + s * 0.55}>
      <g fill="none" stroke={C.bone} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'url(#ui-brush)' }}>
        <path d={`M${CX} ${CY - R + 4 + len} L${CX} ${CY - R - 1}`} strokeWidth="1.8" />
        <path d={`M${CX - 3.2} ${CY - R + 2.6} L${CX} ${CY - R - 1.2} L${CX + 3.2} ${CY - R + 2.6}`} strokeWidth="1.8" />
        {s > 0.45 && <path d={`M${CX - 4.5} ${CY - R + 8 + len * 0.5} L${CX - 4.5} ${CY - R + 3}`} strokeWidth="1" strokeOpacity="0.7" />}
        {s > 0.75 && <path d={`M${CX + 4.5} ${CY - R + 8 + len * 0.5} L${CX + 4.5} ${CY - R + 3}`} strokeWidth="1" strokeOpacity="0.7" />}
      </g>
    </g>
  )
}
