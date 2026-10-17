/**
 * Game time → ClockState: the sun and moon for latitude 34° S, the moon's phase, and a semi-diurnal tide whose
 * range swells at new and full moon. Pure and three-free. Owned by the lead; the sim drives it.
 */
import type { ClockState, Season, Vec3 } from '../game/contracts'

export const DAY_SECONDS = 86_400
/** game seconds per real second: one day per 20 real minutes */
export const DEFAULT_TIME_SCALE = 72
export const SYNODIC_DAYS = 29.530588
export const LATITUDE_DEG = -34

/** where the life's clock starts */
export type ClockEpoch = { dayOfYear: number; hour: number; moonPhase: number; year: number }

const TAU = Math.PI * 2
const DEG = Math.PI / 180
/** phase offset that puts the low spring tide at about 09:00 and 21:00 on the day of a full or new moon */
const TIDE_LAG = 1.5 * Math.PI

function frac(x: number): number {
  return x - Math.floor(x)
}

export function seasonOf(dayOfYear: number): Season {
  if (dayOfYear >= 335 || dayOfYear < 59) return 'summer'
  if (dayOfYear < 151) return 'autumn'
  if (dayOfYear < 243) return 'winter'
  return 'spring'
}

/** solar declination in radians (northern-hemisphere sign convention: + in June) */
function declination(dayOfYear: number): number {
  return -23.44 * DEG * Math.cos((TAU * (dayOfYear + 10)) / 365)
}

/** unit vector toward a body with hour angle h and declination d, in world axes (+X east, +Y up, +Z south) */
function bodyDirection(h: number, d: number): Vec3 {
  const phi = LATITUDE_DEG * DEG
  const east = -Math.cos(d) * Math.sin(h)
  const north = Math.cos(phi) * Math.sin(d) - Math.sin(phi) * Math.cos(d) * Math.cos(h)
  const up = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(h)
  const len = Math.hypot(east, north, up) || 1
  return { x: east / len, y: up / len, z: -north / len }
}

export function sunDirection(dayOfYear: number, hour: number): Vec3 {
  return bodyDirection(((hour - 12) / 24) * TAU, declination(dayOfYear))
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function clockAt(t: number, epoch: ClockEpoch): ClockState {
  const totalHours = epoch.hour + t / 3600
  const day = Math.floor(totalHours / 24)
  const hour = totalHours - day * 24
  const absDay = epoch.dayOfYear + day
  const dayOfYear = ((absDay % 365) + 365) % 365
  const year = epoch.year + Math.floor(absDay / 365)
  const moonPhase = frac(epoch.moonPhase + totalHours / 24 / SYNODIC_DAYS)

  const moonH = ((totalHours - 12) / 24) * TAU - moonPhase * TAU
  const sunDir = sunDirection(dayOfYear, hour)
  const moonDir = bodyDirection(moonH, declination(dayOfYear) * Math.cos(moonPhase * TAU))

  const tide = Math.cos(2 * moonH + TIDE_LAG)
  const tideRange = 0.5 + 0.5 * Math.cos(2 * moonPhase * TAU)
  const seaLevel = tide * (0.5 + 0.9 * tideRange)

  return {
    t,
    day,
    hour,
    dayOfYear,
    year,
    season: seasonOf(dayOfYear),
    moonPhase,
    tide,
    tideRange,
    seaLevel,
    daylight: smoothstep(-0.1, 0.15, sunDir.y),
    sunDir,
    moonDir,
  }
}

/** game seconds from t until the clock next reads `hour` (0 < result ≤ one day) */
export function secondsUntilHour(t: number, epoch: ClockEpoch, hour: number): number {
  const now = clockAt(t, epoch).hour
  let dh = hour - now
  if (dh <= 0) dh += 24
  return dh * 3600
}
