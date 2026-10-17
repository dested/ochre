/**
 * Calendar helpers: the epoch each stage starts from, sunrise and sunset, and when the shellfish beds are out.
 */
import { clockAt, sunDirection, type ClockEpoch } from '../core/clock'
import type { LifeStageId, Poi } from '../game/contracts'
import type { SimCtx } from './ctx'
import { STAGE_AGE } from './band'

/**
 * Each stage opens on a morning with a low spring tide around 09:00 (full or new moon, see core/clock). On this
 * coast the sun sets over the sea only from December to February, so the evening chapters sit in summer: Held,
 * Small and Coming of age in high summer, Elder in late summer. Provider is midwinter, for the storm on day 3.
 */
export const STAGE_EPOCH: Record<LifeStageId, ClockEpoch> = {
  // held opens on the evening fire, about forty minutes before the sun goes down
  held: { dayOfYear: 12, hour: 18.33, moonPhase: 0.5, year: STAGE_AGE.held },
  small: { dayOfYear: 24, hour: 6.25, moonPhase: 0.5, year: STAGE_AGE.small },
  youth: { dayOfYear: 36, hour: 6.25, moonPhase: 0, year: STAGE_AGE.youth },
  provider: { dayOfYear: 196, hour: 6.5, moonPhase: 0.5, year: STAGE_AGE.provider },
  elder: { dayOfYear: 52, hour: 6.25, moonPhase: 0.5, year: STAGE_AGE.elder },
}

function sunUp(dayOfYear: number, hour: number): number {
  return sunDirection(dayOfYear, hour).y
}

/** the hour the sun's centre crosses the horizon, by bisection between a and b */
function crossing(dayOfYear: number, a: number, b: number): number {
  let lo = a
  let hi = b
  const rising = sunUp(dayOfYear, lo) < 0
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    const up = sunUp(dayOfYear, mid) > 0
    if (up === rising) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

export function sunTimes(ctx: SimCtx, dayOfYear: number): { rise: number; set: number } {
  const key = Math.floor(dayOfYear)
  let v = ctx.sunCache.get(key)
  if (!v) {
    v = { rise: crossing(key, 0, 12), set: crossing(key, 12, 24) }
    ctx.sunCache.set(key, v)
  }
  return v
}

/** sea level at game time t */
export function seaAt(ctx: SimCtx, t: number): number {
  return clockAt(t, ctx.epoch).seaLevel
}

/**
 * Is it worth walking to this bed now? It must be out (or out within `leadHours`), stay out for at least
 * `minHours`, and it must be daylight for the trip.
 */
export function bedWorthGoing(ctx: SimCtx, bed: Poi, leadHours: number, minHours: number): boolean {
  const tideMax = bed.tideMax ?? 0
  const t = ctx.state.clock.t
  const step = 600
  let start = -1
  for (let s = 0; s <= (leadHours + minHours) * 3600; s += step) {
    const out = seaAt(ctx, t + s) < tideMax - 0.05
    if (out && start < 0) {
      if (s > leadHours * 3600) return false
      start = s
    }
    if (!out && start >= 0) return s - start >= minHours * 3600
  }
  return start >= 0
}

export function bedOut(ctx: SimCtx, bed: Poi): boolean {
  return ctx.state.clock.seaLevel < (bed.tideMax ?? 0)
}

/** the hour, as a number that keeps growing past midnight (so 01:00 after a 19:00 sunset reads 25) */
export function eveningHour(hour: number): number {
  return hour < 12 ? hour + 24 : hour
}
