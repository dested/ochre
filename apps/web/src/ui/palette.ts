/** OCHRE palette (mirrors the @theme tokens in styles/app.css and ui.md) for inline SVG and computed colours */
export const C = {
  ochre: '#9c3d20',
  ochreBright: '#c4552c',
  burnt: '#c2602e',
  bone: '#efe3c8',
  boneDim: '#cdbf9f',
  charcoal: '#2a2420',
  soot: '#16110e',
  teal: '#2f6f73',
  deep: '#173a52',
  sage: '#7d8b5a',
  violet: '#4a3a5c',
  amber: '#f2a03d',
} as const

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** linear mix of two #rrggbb colours, t in 0..1 */
export function mix(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t))
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const r = Math.round(ar + (br - ar) * k)
  const g = Math.round(ag + (bg - ag) * k)
  const bl = Math.round(ab + (bb - ab) * k)
  return `rgb(${r} ${g} ${bl})`
}

/** a small deterministic hash in 0..1, for hand-drawn jitter that matches on server and client */
export function jitter(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}
