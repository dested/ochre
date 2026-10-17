/**
 * Weather as a pure function of the seed, the stage and game time: each day draws its cloud, wind and rain from
 * the season (the Cape rains in winter), blended across midnight so nothing jumps. Provider day 3 brings the
 * scripted storm, from mid-afternoon to the next morning.
 */
import { mix32, Rng } from '../core/rng'
import type { ClockState, LifeStageId, Season, WeatherState } from '../game/contracts'

type DayWeather = {
  cloud: number
  wind: number
  windDir: number
  /** a rain spell: start and end hour within the day, and peak intensity */
  rain: { from: number; to: number; peak: number } | null
  fog: number
  storm: boolean
}

const RAIN_CHANCE: Record<Season, number> = { summer: 0.06, autumn: 0.22, winter: 0.45, spring: 0.2 }
const STORM_CHANCE: Record<Season, number> = { summer: 0, autumn: 0.04, winter: 0.12, spring: 0.03 }
/** the direction the prevailing wind blows toward: winter north-westerlies blow to the south-east,
 *  summer south-easters blow to the north-west (heading: 0 = +Z south, π/2 = +X east) */
const WIND_TOWARD: Record<Season, number> = { summer: Math.PI * 1.25, autumn: Math.PI * 0.4, winter: Math.PI * 0.25, spring: Math.PI * 1.1 }

export function isScriptedStorm(stage: LifeStageId, day: number, hour: number): boolean {
  if (stage !== 'provider') return false
  return (day === 2 && hour >= 14) || (day === 3 && hour < 8)
}

function dayWeather(seed: number, day: number, season: Season): DayWeather {
  const rng = new Rng(mix32(seed ^ 0x3ea7, day + 1000))
  const storm = rng.chance(STORM_CHANCE[season])
  const rainy = storm || rng.chance(RAIN_CHANCE[season])
  const cloud = storm ? rng.range(0.85, 1) : rainy ? rng.range(0.6, 0.9) : rng.range(0.05, season === 'winter' ? 0.6 : 0.4)
  const wind = storm ? rng.range(0.75, 1) : rng.range(0.12, rainy ? 0.6 : 0.45)
  const windDir = WIND_TOWARD[season] + rng.range(-0.6, 0.6)
  let rain: DayWeather['rain'] = null
  if (rainy) {
    const from = rng.range(0, 18)
    rain = { from, to: Math.min(24, from + rng.range(2, storm ? 14 : 7)), peak: storm ? rng.range(0.7, 1) : rng.range(0.25, 0.7) }
  }
  const fog = !rainy && wind < 0.25 && season !== 'summer' ? rng.range(0.2, 0.6) : 0
  return { cloud, wind, windDir, rain, fog, storm }
}

function rainAt(w: DayWeather, hour: number): number {
  if (!w.rain) return 0
  const { from, to, peak } = w.rain
  if (hour < from || hour > to) return 0
  const edge = Math.min(hour - from, to - hour)
  return peak * Math.min(1, edge / 0.75)
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export function weatherAt(seed: number, stage: LifeStageId, clock: ClockState): WeatherState {
  const day = clock.day
  const today = dayWeather(seed, day, clock.season)
  // blend toward the neighbouring day near midnight
  const h = clock.hour
  const other = h < 12 ? dayWeather(seed, day - 1, clock.season) : dayWeather(seed, day + 1, clock.season)
  const blend = h < 12 ? Math.max(0, (3 - h) / 6) : Math.max(0, (h - 21) / 6)
  const mix = (a: number, b: number) => a + (b - a) * blend

  let cloud = mix(today.cloud, other.cloud)
  let wind = mix(today.wind, other.wind)
  const windDir = lerpAngle(today.windDir, other.windDir, blend) + 0.25 * Math.sin(clock.t / 5400)
  let rain = Math.max(rainAt(today, h), blend > 0 ? rainAt(other, h < 12 ? h + 24 : h - 24) * blend : 0)
  // a sea breeze in the afternoon, calm before dawn
  wind = Math.min(1, wind * (0.75 + 0.35 * Math.sin(((h - 9) / 24) * Math.PI * 2)))
  const dawn = h > 3.5 && h < 9 ? Math.sin(((h - 3.5) / 5.5) * Math.PI) : 0
  let fog = today.fog * dawn
  let storm = today.storm && rain > 0.3

  if (isScriptedStorm(stage, day, h)) {
    const ramp = day === 2 ? Math.min(1, (h - 14) / 2) : Math.min(1, (8 - h) / 2)
    cloud = Math.max(cloud, 0.6 + 0.4 * ramp)
    wind = Math.max(wind, 0.5 + 0.5 * ramp)
    rain = Math.max(rain, 0.9 * ramp)
    fog = 0
    storm = ramp > 0.4
  }
  return { cloud, rain, wind, windDir, fog, storm }
}
