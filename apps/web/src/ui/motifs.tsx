/**
 * The OCHRE motif: the cross-hatched band engraved on the Blombos ochre (two framing lines, a middle line,
 * and a row of crossing diagonals), drawn as scratched strokes with deterministic jitter.
 */
import { C, jitter } from './palette'

type HatchProps = {
  /** number of crossing cells */
  cells?: number
  width?: number | string
  height?: number
  color?: string
  strokeWidth?: number
  className?: string
  /** draw the middle line (the Blombos piece has one) */
  middle?: boolean
  salt?: number
}

export function CrossHatch({
  cells: cellsProp,
  width = '100%',
  height = 22,
  color = C.ochre,
  strokeWidth = 1.6,
  className,
  middle = true,
  salt = 1,
}: HatchProps) {
  // a cell reads best a little narrower than it is tall; a numeric width picks the count itself
  const cells = cellsProp ?? (typeof width === 'number' ? Math.max(3, Math.round(width / (height * 0.7))) : 9)
  const cell = 16
  const w = cells * cell + 6
  const h = 24
  const lines: string[] = []
  const j = (i: number, s: number) => (jitter(i, salt + s) - 0.5) * 1.6
  // the framing lines, each drawn as two overlapping scratches
  lines.push(`M1 ${3 + j(1, 1)} L${w - 1} ${3 + j(2, 1)}`)
  lines.push(`M2 ${21 + j(3, 1)} L${w - 2} ${21 + j(4, 1)}`)
  if (middle) lines.push(`M3 ${12 + j(5, 1)} L${w - 3} ${12 + j(6, 1)}`)
  for (let i = 0; i < cells; i++) {
    const x = 3 + i * cell
    lines.push(`M${x + j(i, 2)} ${3.5} L${x + cell + j(i, 3)} ${20.5}`)
    lines.push(`M${x + cell + j(i, 4)} ${3.5} L${x + j(i, 5)} ${20.5}`)
  }
  return (
    <svg
      aria-hidden
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ overflow: 'visible' }}>
      <g
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={{ filter: 'url(#ui-brush)' }}>
        {lines.map((d, i) => (
          <path key={i} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  )
}

/** a short engraved rule (three strokes) used to separate blocks of text */
export function HatchRule({ className, color = C.ochre }: { className?: string; color?: string }) {
  return (
    <svg aria-hidden className={className} width="64" height="10" viewBox="0 0 64 10">
      <g fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" style={{ filter: 'url(#ui-brush)' }}>
        <path d="M2 5.4 L62 4.6" />
        <path d="M20 1.5 L28 8.5 M28 1.5 L20 8.5" />
        <path d="M36 1.5 L44 8.5 M44 1.5 L36 8.5" />
      </g>
    </svg>
  )
}

/** the OCHRE wordmark: Fraunces capitals over the engraved band */
export function Wordmark({ size = 132, className }: { size?: number; className?: string }) {
  return (
    <div className={className} style={{ width: 'max-content' }}>
      <div
        className="font-serif text-bone ui-halo-soft"
        style={{
          fontSize: size,
          lineHeight: 0.9,
          fontWeight: 560,
          letterSpacing: '0.16em',
          marginRight: '-0.16em',
          fontVariationSettings: '"opsz" 144, "SOFT" 100',
        }}>
        OCHRE
      </div>
      <CrossHatch cells={Math.round(size * 0.22)} height={Math.round(size * 0.2)} color={C.ochreBright} strokeWidth={2} className="mt-3" />
    </div>
  )
}
