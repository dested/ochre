/**
 * The colour script: time of day → sky, light and grade. Keyed by the sun's elevation, with a dawn table (rose
 * and lavender) and a dusk table (amber, then violet), sharing the day and night keys. Writes the shared LIGHT
 * and POST uniforms and returns the key light for the world's directional light.
 */
import { Color, Vector3 } from 'three'
import type { ClockState, WeatherState } from '../contracts'
import { LIGHT, POST } from '../render/uniforms'

type Key = {
  e: number
  zenith: number
  horizon: number
  glow: number
  glowI: number
  key: number
  keyI: number
  sky: number
  skyI: number
  ground: number
  groundI: number
  rim: number
  rimI: number
  cloudLit: number
  cloudShade: number
  haze: number
  exposure: number
  sat: number
  /** −1 cool shadows / warm lights .. +1 the opposite (night): drives the split tone */
  split: number
}

const DUSK: readonly Key[] = [
  { e: -18, zenith: 0x060a1a, horizon: 0x18213a, glow: 0x000000, glowI: 0, key: 0x9ab4e8, keyI: 0.16, sky: 0x1e2c52, skyI: 0.3, ground: 0x12121a, groundI: 0.1, rim: 0x8aa0d0, rimI: 0.2, cloudLit: 0x3a4664, cloudShade: 0x12162a, haze: 0.8, exposure: 1.45, sat: 0.88, split: 1 },
  { e: -9, zenith: 0x161b3e, horizon: 0x40365a, glow: 0x8a4458, glowI: 0.3, key: 0x9ab0e0, keyI: 0.1, sky: 0x2a2a52, skyI: 0.34, ground: 0x2a2028, groundI: 0.14, rim: 0x8090c0, rimI: 0.16, cloudLit: 0x6a5a7c, cloudShade: 0x262640, haze: 0.9, exposure: 1.3, sat: 0.95, split: 0.6 },
  { e: -3.5, zenith: 0x2a3168, horizon: 0xc06a5e, glow: 0xe8604a, glowI: 0.75, key: 0xff7050, keyI: 0.18, sky: 0x4a3c6e, skyI: 0.45, ground: 0x5a3a3a, groundI: 0.22, rim: 0xff7050, rimI: 0.3, cloudLit: 0xe88676, cloudShade: 0x564470, haze: 1.1, exposure: 1.1, sat: 1.05, split: 0 },
  { e: 0.5, zenith: 0x3e4a8a, horizon: 0xf2905a, glow: 0xff7a3a, glowI: 1.3, key: 0xff8a46, keyI: 1.7, sky: 0x5e5a92, skyI: 0.48, ground: 0x9a5a3a, groundI: 0.35, rim: 0xff7a40, rimI: 0.75, cloudLit: 0xffa070, cloudShade: 0x7a5a88, haze: 1.35, exposure: 0.86, sat: 1.12, split: -0.9 },
  { e: 4, zenith: 0x4a5c9c, horizon: 0xf4b47a, glow: 0xff9a50, glowI: 1.1, key: 0xffb066, keyI: 2.5, sky: 0x6a6aa0, skyI: 0.55, ground: 0xb06840, groundI: 0.4, rim: 0xff9a50, rimI: 0.7, cloudLit: 0xffc890, cloudShade: 0x8a7aa0, haze: 1.3, exposure: 0.76, sat: 1.12, split: -1 },
  { e: 10, zenith: 0x4a68a8, horizon: 0xe8c89a, glow: 0xffb070, glowI: 0.7, key: 0xffcf96, keyI: 2.9, sky: 0x6c78a8, skyI: 0.62, ground: 0xb87850, groundI: 0.4, rim: 0xffb070, rimI: 0.55, cloudLit: 0xffe0b0, cloudShade: 0x9a90b0, haze: 1.15, exposure: 0.68, sat: 1.1, split: -0.8 },
  { e: 25, zenith: 0x3f70ae, horizon: 0xc8d4d8, glow: 0xffd8a0, glowI: 0.35, key: 0xffe8c8, keyI: 3.2, sky: 0x7c94b8, skyI: 0.72, ground: 0xb48a62, groundI: 0.38, rim: 0xffc890, rimI: 0.4, cloudLit: 0xfff4e0, cloudShade: 0xa0a8c0, haze: 1.0, exposure: 0.6, sat: 1.06, split: -0.5 },
  { e: 60, zenith: 0x3a6fb0, horizon: 0xb8cfdc, glow: 0xffe8c0, glowI: 0.25, key: 0xfff1dc, keyI: 3.4, sky: 0x7f9cc0, skyI: 0.75, ground: 0xb09070, groundI: 0.35, rim: 0xffd8a0, rimI: 0.3, cloudLit: 0xfffaf0, cloudShade: 0xa8b4c8, haze: 1.0, exposure: 0.58, sat: 1.05, split: -0.4 },
]

const DAWN: readonly Key[] = [
  DUSK[0] ?? (() => { throw new Error('colour: empty table') })(),
  { e: -9, zenith: 0x1a2048, horizon: 0x4a4268, glow: 0x7a5a78, glowI: 0.3, key: 0xa0a8e0, keyI: 0.1, sky: 0x2c2c56, skyI: 0.34, ground: 0x2a2430, groundI: 0.14, rim: 0x9090c8, rimI: 0.16, cloudLit: 0x6a6088, cloudShade: 0x282844, haze: 1.0, exposure: 1.3, sat: 0.95, split: 0.6 },
  { e: -3.5, zenith: 0x343a74, horizon: 0xa87890, glow: 0xc87a8a, glowI: 0.6, key: 0xc08090, keyI: 0.16, sky: 0x4a4478, skyI: 0.42, ground: 0x4a3a44, groundI: 0.2, rim: 0xc08090, rimI: 0.25, cloudLit: 0xc09ab0, cloudShade: 0x5a5280, haze: 1.3, exposure: 1.1, sat: 1.0, split: 0 },
  { e: 0.5, zenith: 0x50589a, horizon: 0xf0a0a0, glow: 0xff9080, glowI: 1.2, key: 0xff9a78, keyI: 1.5, sky: 0x7068a8, skyI: 0.5, ground: 0x9a6a5a, groundI: 0.32, rim: 0xff9a80, rimI: 0.7, cloudLit: 0xf8b0b0, cloudShade: 0x8a78a8, haze: 1.5, exposure: 0.86, sat: 1.08, split: -0.7 },
  { e: 4, zenith: 0x6070b0, horizon: 0xf6c0a8, glow: 0xffa888, glowI: 1.0, key: 0xffbc90, keyI: 2.3, sky: 0x7a74b0, skyI: 0.55, ground: 0xa87458, groundI: 0.36, rim: 0xffa888, rimI: 0.65, cloudLit: 0xffc8b8, cloudShade: 0x9a88b8, haze: 1.4, exposure: 0.76, sat: 1.08, split: -0.8 },
  { e: 10, zenith: 0x5070ae, horizon: 0xf0d0b0, glow: 0xffc8a0, glowI: 0.6, key: 0xffd8b0, keyI: 2.8, sky: 0x7a80b0, skyI: 0.62, ground: 0xb08060, groundI: 0.38, rim: 0xffc0a0, rimI: 0.5, cloudLit: 0xffe8d0, cloudShade: 0xa098b8, haze: 1.2, exposure: 0.68, sat: 1.06, split: -0.6 },
  ...DUSK.slice(6),
]

type Mixed = {
  zenith: Color
  horizon: Color
  glow: Color
  key: Color
  sky: Color
  ground: Color
  rim: Color
  cloudLit: Color
  cloudShade: Color
  glowI: number
  keyI: number
  skyI: number
  groundI: number
  rimI: number
  haze: number
  exposure: number
  sat: number
  split: number
}

const tmpA = new Color()
const tmpB = new Color()

function lerpKey(table: readonly Key[], e: number, out: Mixed): void {
  let i = 0
  while (i < table.length - 2 && e > (table[i + 1]?.e ?? 0)) i++
  const a = table[i]
  const b = table[i + 1]
  if (!a || !b) return
  const t = Math.min(1, Math.max(0, (e - a.e) / (b.e - a.e)))
  const c = (dst: Color, x: number, y: number) => dst.copy(tmpA.setHex(x)).lerp(tmpB.setHex(y), t)
  c(out.zenith, a.zenith, b.zenith)
  c(out.horizon, a.horizon, b.horizon)
  c(out.glow, a.glow, b.glow)
  c(out.key, a.key, b.key)
  c(out.sky, a.sky, b.sky)
  c(out.ground, a.ground, b.ground)
  c(out.rim, a.rim, b.rim)
  c(out.cloudLit, a.cloudLit, b.cloudLit)
  c(out.cloudShade, a.cloudShade, b.cloudShade)
  const n = (x: number, y: number) => x + (y - x) * t
  out.glowI = n(a.glowI, b.glowI)
  out.keyI = n(a.keyI, b.keyI)
  out.skyI = n(a.skyI, b.skyI)
  out.groundI = n(a.groundI, b.groundI)
  out.rimI = n(a.rimI, b.rimI)
  out.haze = n(a.haze, b.haze)
  out.exposure = n(a.exposure, b.exposure)
  out.sat = n(a.sat, b.sat)
  out.split = n(a.split, b.split)
}

function mixed(): Mixed {
  return {
    zenith: new Color(),
    horizon: new Color(),
    glow: new Color(),
    key: new Color(),
    sky: new Color(),
    ground: new Color(),
    rim: new Color(),
    cloudLit: new Color(),
    cloudShade: new Color(),
    glowI: 0,
    keyI: 0,
    skyI: 0,
    groundI: 0,
    rimI: 0,
    haze: 1,
    exposure: 1,
    sat: 1,
    split: 0,
  }
}

export type KeyLight = { dir: Vector3; color: Color; intensity: number; isMoon: boolean }

const M = mixed()
const SUN = new Vector3()
const MOON = new Vector3()
const key: KeyLight = { dir: new Vector3(0, 1, 0), color: new Color(), intensity: 0, isMoon: false }

/** run the colour script for this clock and weather; returns the key light */
export function applyColourScript(clock: ClockState, weather: WeatherState): KeyLight {
  SUN.set(clock.sunDir.x, clock.sunDir.y, clock.sunDir.z).normalize()
  MOON.set(clock.moonDir.x, clock.moonDir.y, clock.moonDir.z).normalize()
  const e = (Math.asin(Math.max(-1, Math.min(1, SUN.y))) * 180) / Math.PI
  lerpKey(clock.hour < 12 ? DAWN : DUSK, e, M)

  const moonIllum = 0.5 - 0.5 * Math.cos(clock.moonPhase * Math.PI * 2)
  const moonUp = Math.max(0, Math.min(1, (MOON.y + 0.03) * 8))
  const night = Math.max(0, Math.min(1, (-e - 4) / 10))
  const cloud = weather.cloud
  const storm = weather.storm ? 1 : 0
  const overcast = Math.min(1, cloud * 0.9 + weather.rain * 0.5 + storm * 0.4)

  LIGHT.uSunDir.value.copy(SUN)
  LIGHT.uMoonDir.value.copy(MOON)
  LIGHT.uZenith.value.copy(M.zenith)
  LIGHT.uHorizon.value.copy(M.horizon)
  // moonlight brightens the night sky a little
  const moonSky = night * moonIllum * moonUp
  LIGHT.uZenith.value.lerp(tmpA.setHex(0x14204a), moonSky * 0.6)
  LIGHT.uHorizon.value.lerp(tmpA.setHex(0x2a3858), moonSky * 0.6)
  LIGHT.uSunGlow.value.copy(M.glow).multiplyScalar(M.glowI * (1 - overcast * 0.7))
  const discI = Math.max(0, Math.min(1, (e + 0.6) * 2)) * (1 - overcast * 0.85)
  LIGHT.uSunDisc.value.copy(M.key).multiplyScalar(26 * discI)
  LIGHT.uSkyState.value.set(clock.daylight, clock.moonPhase, Math.max(0, Math.min(1, (-e - 3) / 9)) * (1 - overcast), moonIllum * moonUp)
  LIGHT.uWeather.value.set(cloud, weather.rain, weather.fog, storm)
  LIGHT.uCloudLit.value.copy(M.cloudLit).lerp(tmpA.setHex(0x8a909c), overcast * 0.5)
  LIGHT.uCloudShade.value.copy(M.cloudShade).lerp(tmpA.setHex(0x4a505c), overcast * 0.5)
  if (moonSky > 0) LIGHT.uCloudLit.value.lerp(tmpA.setHex(0x8090b0), moonSky * 0.5)
  LIGHT.uWind.value.set(Math.sin(weather.windDir), weather.wind, Math.cos(weather.windDir))
  LIGHT.uStarSpin.value = (clock.hour / 24 + clock.dayOfYear / 365.25) * Math.PI * 2
  // the dawn mist on the lagoon, 04:30–09:00, thinned by wind
  const mist = Math.max(0, 1 - Math.abs(clock.hour - 6.6) / 2.4) * (1 - weather.wind * 0.8)
  LIGHT.uHaze.value.set(0.000105 * M.haze * (1 + overcast * 0.8), 300, 0.00045 * M.haze, mist)

  // the key light: the sun while it is up, the moon after dark, never both
  const sunK = Math.max(0, Math.min(1, (e + 3.5) / 4.5))
  const moonK = night * moonUp * (0.25 + 0.75 * moonIllum)
  const shade = 1 - overcast * 0.75
  if (sunK >= moonK * 0.5 || e > -4) {
    key.dir.copy(SUN)
    if (key.dir.y < 0.035) key.dir.y = 0.035
    key.dir.normalize()
    key.color.copy(M.key)
    key.intensity = M.keyI * sunK * shade
    key.isMoon = false
  } else {
    key.dir.copy(MOON)
    if (key.dir.y < 0.06) key.dir.y = 0.06
    key.dir.normalize()
    key.color.copy(M.key)
    key.intensity = M.keyI * moonK * 3 * shade
    key.isMoon = true
  }
  LIGHT.uKeyDir.value.copy(key.dir)
  LIGHT.uKeyColor.value.copy(key.color).multiplyScalar(key.intensity)
  const ambBoost = 1 + overcast * 0.35
  LIGHT.uSkyAmb.value.copy(M.sky).multiplyScalar(M.skyI * ambBoost)
  LIGHT.uGroundAmb.value.copy(M.ground).multiplyScalar(M.groundI)
  LIGHT.uRimColor.value.copy(M.rim).multiplyScalar(M.rimI * shade)

  // the grade
  POST.exposure.value = M.exposure
  POST.saturation.value = M.sat * (1 - overcast * 0.2)
  const warm = Math.max(0, -M.split)
  const cool = Math.max(0, M.split)
  POST.splitShadow.value.setRGB(0.95 - 0.02 * cool, 0.97, 1 + 0.08 * warm + 0.1 * cool)
  POST.splitHighlight.value.setRGB(1 + 0.07 * warm - 0.03 * cool, 1, 1 - 0.09 * warm + 0.04 * cool)
  POST.bloom.value.set(0.045 + 0.03 * night, 0.55, 1.25)
  const golden = Math.max(0, 1 - Math.abs(e - 3) / 10)
  POST.rays.value.x = (0.18 + 0.7 * golden) * sunK * (1 - overcast * 0.6)
  POST.rayColor.value.copy(M.glow).lerp(M.key, 0.5)
  return key
}
