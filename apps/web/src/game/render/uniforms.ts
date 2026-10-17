/**
 * The world's light, shared by reference: every painted material (paint(), the terrain, the sea, the sky) and
 * the post chain point their uniforms at these objects, and the world view writes them once per frame from the
 * colour script. Module-level so paint() can be a free function (the people agent calls it with no handle).
 */
import { Color, Vector2, Vector3, Vector4 } from 'three'

export const LIGHT = {
  /** unit vector toward the sun */
  uSunDir: { value: new Vector3(0.3, 0.6, 0.5).normalize() },
  /** unit vector toward the moon */
  uMoonDir: { value: new Vector3(-0.3, 0.4, 0.5).normalize() },
  /** the key light's colour × intensity (sun by day, moon by night) */
  uKeyColor: { value: new Color(3, 2.8, 2.5) },
  /** direction of the key light (sun or moon) */
  uKeyDir: { value: new Vector3(0.3, 0.6, 0.5).normalize() },
  /** ambient from the sky dome (cool), × intensity */
  uSkyAmb: { value: new Color(0.5, 0.6, 0.8) },
  /** ambient bounced from the ground (warm), × intensity */
  uGroundAmb: { value: new Color(0.4, 0.3, 0.2) },
  /** warm rim colour × intensity */
  uRimColor: { value: new Color(1, 0.7, 0.4) },
  // sky
  uZenith: { value: new Color(0.1, 0.25, 0.6) },
  uHorizon: { value: new Color(0.7, 0.75, 0.8) },
  /** the sun's glow in the sky (and in the haze toward it) */
  uSunGlow: { value: new Color(1, 0.7, 0.4) },
  /** colour of the sun disc × intensity */
  uSunDisc: { value: new Color(20, 16, 10) },
  /** x: daylight 0..1, y: moon phase 0..1, z: stars 0..1, w: moon illumination 0..1 */
  uSkyState: { value: new Vector4(1, 0.5, 0, 0) },
  /** x: cloud cover 0..1, y: rain 0..1, z: fog 0..1, w: storm 0..1 */
  uWeather: { value: new Vector4(0.35, 0, 0, 0) },
  /** cloud lit colour (sun side) and shadow colour */
  uCloudLit: { value: new Color(1, 0.95, 0.9) },
  uCloudShade: { value: new Color(0.55, 0.6, 0.75) },
  /** x, z: wind direction (blowing toward), y: strength 0..1 */
  uWind: { value: new Vector3(0.7, 0.3, 0.7) },
  /** x: haze density, y: height falloff (m), z: ground fog, w: lagoon mist */
  uHaze: { value: new Vector4(0.00012, 260, 0.0006, 0) },
  /** star field rotation (radians), sidereal */
  uStarSpin: { value: 0 },
  // the world
  uTime: { value: 0 },
  uSeaLevel: { value: 0 },
  /** the cave: x, z of the drip line, cos/sin of the facing */
  uCave: { value: new Vector4(-40, 88, 0, 1) },
  /** floor height, depth, half-width, ceiling */
  uCave2: { value: new Vector4(33.5, 22, 12.5, 7.5) },
  /** where detail centres (the player) */
  uFocus: { value: new Vector3() },
  /** 0..1 how much the people's paint uses the cave's darkness (always 1; kept for tuning) */
  uCaveDark: { value: 1 },
  /** the two fires nearest the focus as soft fill lights: xyz the flame's heart, w strength (0 = none) */
  uFireGlow: { value: new Vector4(0, -1000, 0, 0) },
  uFireGlow2: { value: new Vector4(0, -1000, 0, 0) },
  /** the camera's world position */
  uCamPos: { value: new Vector3() },
  /** viewport size in pixels */
  uViewport: { value: new Vector2(1, 1) },
}

export type LightUniforms = typeof LIGHT

/** the post chain's grade, written by the world view's colour script each frame */
export const POST = {
  exposure: { value: 1 },
  saturation: { value: 1.05 },
  /** multiplied into the shadows and the highlights after tone mapping */
  splitShadow: { value: new Color(0.92, 0.95, 1.08) },
  splitHighlight: { value: new Color(1.06, 1.0, 0.92) },
  /** x: mix of the blur pyramid (energy-conserving bloom), y: added excess over the knee, z: knee */
  bloom: { value: new Vector3(0.05, 0.6, 1.4) },
  /** vignette colour (multiplied at the corners) and strength */
  vignette: { value: new Vector4(0.55, 0.42, 0.36, 0.5) },
  /** x: god-ray strength, y, z: sun position on screen (uv), w: sun visible 0..1 */
  rays: { value: new Vector4(0, 0.5, 0.5, 0) },
  /** the god rays' colour */
  rayColor: { value: new Color(1, 0.75, 0.45) },
}
