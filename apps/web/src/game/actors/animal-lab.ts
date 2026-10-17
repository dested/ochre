/**
 * /lab/people?animals=1: every animal kind in a lineup on a warm ground under the golden-hour key, the stranded
 * whale behind, and a herd of 12 eland circling out beyond the whale (walking, grazing, running or a mix). An anim
 * picker drives the lineup; (DEV) window.__lab = { anim, herd, view, focus, cam, perf } for bx.
 */
import { ACESFilmicToneMapping, CircleGeometry, Color, DirectionalLight, Fog, HemisphereLight, Mesh, MeshStandardMaterial, PCFShadowMap, PerspectiveCamera, Scene, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { AnimalActor, AnimalAnim, AnimalKind } from '../contracts'
import { createHost } from '../engine/host'
import { createAnimal } from './animals'
import { clamp } from './geo'
import { Rng } from '~/core/rng'

const ANIMS: AnimalAnim[] = ['idle', 'walk', 'run', 'graze', 'alert', 'lie', 'swim', 'fly', 'fall', 'dead']
type HerdMode = 'walk' | 'graze' | 'run' | 'mixed'
const HERD_MODES: HerdMode[] = ['mixed', 'walk', 'graze', 'run']

/** lineup order, the space each takes along x, and a height above the ground (the flying gull) */
const LINEUP: { kind: AnimalKind; seed: number; room: number; y?: number; fly?: boolean }[] = [
  { kind: 'tortoise', seed: 3, room: 0.7 },
  { kind: 'gull', seed: 5, room: 0.8 },
  { kind: 'gull', seed: 6, room: 1.4, y: 1.7, fly: true },
  { kind: 'seal', seed: 7, room: 2.0 },
  { kind: 'seal', seed: 12, room: 2.2 },
  { kind: 'hyena', seed: 9, room: 1.9 },
  { kind: 'lion', seed: 3, room: 2.4 },
  { kind: 'lion', seed: 4, room: 2.6 },
  { kind: 'eland', seed: 1, room: 3.0 },
  { kind: 'eland', seed: 5, room: 3.2 },
]

type Member = { actor: AnimalActor; x: number; y: number; fly: boolean; room: number }
type Grazer = { actor: AnimalActor; lane: number; angle: number; speed: number; mode: AnimalAnim; next: number }

export function mountAnimals(el: HTMLElement): () => void {
  const host = createHost(el)
  const renderer = host.renderer
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  const query = new URLSearchParams(window.location.search)
  renderer.shadowMap.enabled = query.get('shadows') !== '0'
  renderer.shadowMap.type = PCFShadowMap

  const scene = new Scene()
  const bg = new Color('#d6b48c')
  scene.background = bg
  scene.fog = new Fog(bg, 40, 110)

  const camera = new PerspectiveCamera(35, 1, 0.1, 400)
  const controls = new OrbitControls(camera, host.canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.12

  const hemi = new HemisphereLight(new Color('#9ec3ea'), new Color('#8a5a36'), 1.15)
  scene.add(hemi)
  const key = new DirectionalLight(new Color('#ffc988'), 3.1)
  // aimed between the lineup and the herd so one shadow map covers both
  key.position.set(-14, 10, 3)
  key.target.position.set(0, 0, -14)
  scene.add(key.target)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -30
  key.shadow.camera.right = 30
  key.shadow.camera.top = 26
  key.shadow.camera.bottom = -26
  key.shadow.camera.near = 1
  key.shadow.camera.far = 90
  key.shadow.bias = -0.0008
  key.shadow.normalBias = 0.09
  scene.add(key)
  const fill = new DirectionalLight(new Color('#a9c9ff'), 0.7)
  fill.position.set(12, 12, -9)
  scene.add(fill)
  const rim = new DirectionalLight(new Color('#ffd9a8'), 1.1)
  rim.position.set(9, 7, -15)
  scene.add(rim)

  const ground = new Mesh(new CircleGeometry(60, 96), new MeshStandardMaterial({ color: new Color('#c49a6c'), roughness: 0.95 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // the lineup, turned three-quarters toward the camera so the silhouettes read
  const members: Member[] = []
  const total = LINEUP.reduce((a, m) => a + m.room, 0)
  let cursor = -total / 2
  for (const m of LINEUP) {
    const a = createAnimal(m.kind, m.seed)
    const x = cursor + m.room / 2
    cursor += m.room
    a.object.position.set(x, m.y ?? 0, 0)
    a.object.rotation.y = Math.PI / 2 - 0.55
    a.setAnim(m.fly ? 'fly' : 'idle', 0)
    scene.add(a.object)
    members.push({ actor: a, x, y: m.y ?? 0, fly: m.fly ?? false, room: m.room })
  }
  // the stranded whale lies broadside behind the lineup
  const whale = createAnimal('whale', 11)
  whale.object.position.set(1, 0, -9)
  whale.object.rotation.y = -Math.PI / 2 + 0.25
  scene.add(whale.object)

  // the herd drifts as one loose group along a wide circle out beyond the whale, so the lineup stays clear and the
  // herd reads in depth behind it: four lanes of three, each eland keeping its place by the group's centre
  const HERD_Z = -32
  const HERD_R = 16
  const herd: Grazer[] = []
  const rng = new Rng(31)
  for (let i = 0; i < 12; i++) {
    const a = createAnimal('eland', 100 + i * 7)
    scene.add(a.object)
    const lane = ((i % 4) - 1.5) * 1.9 + rng.range(-0.3, 0.3)
    const angle = Math.PI + ((Math.floor(i / 4) - 1) * 4.5 + (i % 2) * 2 + rng.range(-0.6, 0.6)) / HERD_R
    herd.push({ actor: a, lane, angle, speed: 0, mode: 'walk', next: rng.range(2, 8) })
  }
  const herdCentre = (out: Vector3): Vector3 => {
    out.set(0, 0, 0)
    for (const h of herd) out.add(h.actor.object.position)
    return out.multiplyScalar(1 / Math.max(1, herd.length))
  }
  const centre = herdCentre(new Vector3())
  const lastCentre = centre.clone()
  let follow = false
  let herdMode: HerdMode = 'mixed'
  const setHerd = (mode: HerdMode): void => {
    herdMode = mode
    herd.forEach((h, i) => {
      h.next = 0
      h.mode = mode === 'mixed' ? (['walk', 'graze', 'graze', 'alert', 'walk', 'graze'] as const)[i % 6] ?? 'walk' : mode
      h.actor.setAnim(h.mode, 0.4)
    })
  }
  setHerd('mixed')

  let anim: AnimalAnim = 'idle'
  const setAnim = (a: AnimalAnim): void => {
    anim = a
    for (const m of members) {
      const flying = m.fly && (a === 'idle' || a === 'walk' || a === 'run' || a === 'fly')
      m.actor.setAnim(flying ? 'fly' : a, 0.3)
      // the flying gull comes down to the sand for everything else
      m.actor.object.position.y = flying ? m.y : 0
    }
    whale.setAnim(a === 'swim' || a === 'dead' || a === 'fall' || a === 'alert' ? a : 'idle', 0.5)
  }

  type View = 'lineup' | 'herd' | 'whale' | 'wide'
  const view = (v: View): void => {
    follow = v === 'herd'
    if (v === 'lineup') {
      camera.position.set(0, 2.6, 21.5)
      controls.target.set(0, 0.8, 0)
    } else if (v === 'herd') {
      // a three-quarter view of the group from inside its circle (open ground behind it); the camera then rides along
      herdCentre(centre)
      lastCentre.copy(centre)
      const ox = centre.x
      const oz = centre.z - HERD_Z
      const ol = Math.hypot(ox, oz) || 1
      camera.position.set(centre.x - (ox / ol) * 19 + (oz / ol) * 6, 3.4, centre.z - (oz / ol) * 19 - (ox / ol) * 6)
      controls.target.set(centre.x, 0.9, centre.z)
    } else if (v === 'whale') {
      // three-quarters from the front, from behind the lineup: the head is what reads
      camera.position.set(-12, 4.5, -1.5)
      controls.target.set(-1, 1.2, -8.5)
    } else {
      camera.position.set(0, 24, 32)
      controls.target.set(0, 0, -12)
    }
    controls.update()
  }
  view(query.get('view') === 'herd' ? 'herd' : 'lineup')
  const focus = (i: number): void => {
    const m = members[i]
    if (!m) return
    // broadside and a little above, at a distance that fits the animal: the profile reads best
    camera.position.set(m.x - 0.35 * m.room, m.y + 0.45 * m.room + 0.1, 1.5 * m.room + 0.4)
    controls.target.set(m.x, m.y + 0.18 * m.room, 0)
    controls.update()
  }

  // the panel
  const panel = document.createElement('div')
  panel.style.cssText =
    'position:absolute;left:12px;top:12px;z-index:40;display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:10px;' +
    'background:rgba(42,36,32,.72);color:#efe3c8;font:12px/1.35 Figtree,system-ui,sans-serif;max-width:280px'
  const row = (label: string): HTMLDivElement => {
    const r = document.createElement('div')
    r.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center'
    const l = document.createElement('span')
    l.textContent = label
    l.style.cssText = 'opacity:.7;margin-right:2px'
    r.append(l)
    panel.append(r)
    return r
  }
  const btn = (parent: HTMLElement, label: string, on: () => void): void => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'background:#9c3d20;color:#efe3c8;border:0;border-radius:6px;padding:3px 7px;cursor:pointer;font:inherit'
    b.onclick = on
    parent.append(b)
  }
  const animRow = row('Anim')
  for (const a of ANIMS) btn(animRow, a, () => setAnim(a))
  const herdRow = row('Herd')
  for (const h of HERD_MODES) btn(herdRow, h, () => setHerd(h))
  const viewRow = row('View')
  for (const v of ['lineup', 'herd', 'whale', 'wide'] as const) btn(viewRow, v, () => view(v))
  el.append(panel)

  const perf = { n: 0, update: 0, render: 0, dt: 0, gpu: 0, gpuN: 0 }
  // (DEV) GPU time per frame from timer queries: the bx browser shares its GPU, so fps alone says little
  const ctx = renderer.getContext()
  const gl = ctx instanceof WebGL2RenderingContext ? ctx : null
  const timer = import.meta.env.DEV && gl ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null
  const queries: WebGLQuery[] = []
  const api = {
    anim: (name: string) => {
      const a = ANIMS.find((x) => x === name)
      if (a) setAnim(a)
    },
    herd: (mode: string) => {
      const h = HERD_MODES.find((x) => x === mode)
      if (h) setHerd(h)
    },
    view: (v: string) => {
      if (v === 'lineup' || v === 'herd' || v === 'whale' || v === 'wide') view(v)
    },
    focus,
    cam: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
      camera.position.set(px, py, pz)
      controls.target.set(tx, ty, tz)
      controls.update()
    },
    count: () => members.length + herd.length + 1,
    perf: () => {
      const n = Math.max(1, perf.n)
      const r = { update: perf.update / n, render: perf.render / n, gpu: perf.gpu / Math.max(1, perf.gpuN), fps: perf.n / Math.max(1e-3, perf.dt) }
      perf.n = 0
      perf.update = 0
      perf.render = 0
      perf.dt = 0
      perf.gpu = 0
      perf.gpuN = 0
      return r
    },
  }
  if (import.meta.env.DEV) Object.assign(window, { __lab: api })

  const walkSpeed = 1.3
  const runSpeed = 8
  const off = host.onFrame((dt) => {
    const lineSpeed = anim === 'walk' ? 1 : anim === 'run' ? 3 : anim === 'swim' ? 1 : 0
    for (const m of members) m.actor.setSpeed(m.fly ? 9 : lineSpeed)
    whale.setSpeed(anim === 'swim' ? 2 : 0)
    let sx = 0
    let sy = 0
    for (const h of herd) {
      sx += Math.cos(h.angle)
      sy += Math.sin(h.angle)
    }
    const mean = Math.atan2(sy, sx)
    for (const h of herd) {
      // metres behind (+) or ahead (-) of the group's centre along the path
      const gap = Math.atan2(Math.sin(mean - h.angle), Math.cos(mean - h.angle)) * HERD_R
      // in the mix each eland changes its mind now and then; stragglers walk to catch up, leaders stop to graze
      if (herdMode === 'mixed') {
        h.next -= dt
        let mode = h.mode
        if (h.next <= 0) {
          const r = rng.next()
          mode = r < 0.45 ? 'graze' : r < 0.85 ? 'walk' : r < 0.95 ? 'alert' : 'idle'
          h.next = rng.range(4, 12)
        }
        if (gap > 5) mode = 'walk'
        else if (gap < -5 && mode === 'walk') mode = 'graze'
        if (mode !== h.mode) {
          h.mode = mode
          h.actor.setAnim(mode, 0.5)
        }
      }
      let target = h.mode === 'run' ? runSpeed : h.mode === 'walk' ? walkSpeed : h.mode === 'graze' ? 0.12 : 0
      if (h.mode === 'walk' || h.mode === 'run') target *= 1 + clamp(gap * 0.06, -0.3, 0.4)
      // never walk up the back of the one ahead in the same lane
      for (const o of herd) {
        if (o === h || Math.abs(o.lane - h.lane) > 1) continue
        const ahead = Math.atan2(Math.sin(o.angle - h.angle), Math.cos(o.angle - h.angle)) * HERD_R
        if (ahead > 0 && ahead < 3.6) target = Math.min(target, o.speed * clamp((ahead - 2.6) / 1, 0, 1))
      }
      h.speed += (target - h.speed) * (1 - Math.exp(-2 * dt))
      h.angle += (h.speed / (HERD_R + h.lane)) * dt
      const r = HERD_R + h.lane
      h.actor.object.position.set(Math.cos(h.angle) * r, 0, HERD_Z + Math.sin(h.angle) * r)
      // facing along the path: the tangent of a growing angle
      h.actor.object.rotation.y = Math.atan2(-Math.sin(h.angle), Math.cos(h.angle))
      h.actor.setSpeed(h.speed)
    }
    if (follow) {
      herdCentre(centre)
      const step = lastCentre.sub(centre).negate()
      camera.position.add(step)
      controls.target.add(step)
      lastCentre.copy(centre)
    }
    const t0 = performance.now()
    for (const m of members) m.actor.update(dt)
    for (const h of herd) h.actor.update(dt)
    whale.update(dt)
    const t1 = performance.now()
    controls.update()
    const q = gl && timer && queries.length < 4 ? gl.createQuery() : null
    if (gl && timer && q) gl.beginQuery(timer.TIME_ELAPSED_EXT, q)
    renderer.render(scene, camera)
    if (gl && timer && q) {
      gl.endQuery(timer.TIME_ELAPSED_EXT)
      queries.push(q)
    }
    while (gl && timer) {
      const head = queries[0]
      if (!head || !gl.getQueryParameter(head, gl.QUERY_RESULT_AVAILABLE)) break
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
        perf.gpu += Number(gl.getQueryParameter(head, gl.QUERY_RESULT)) / 1e6
        perf.gpuN++
      }
      gl.deleteQuery(head)
      queries.shift()
    }
    const t2 = performance.now()
    perf.n++
    perf.update += t1 - t0
    perf.render += t2 - t1
    perf.dt += dt
  })
  const offResize = host.onResize((s) => {
    camera.aspect = s.width / s.height
    camera.updateProjectionMatrix()
  })

  return () => {
    off()
    offResize()
    controls.dispose()
    for (const m of members) m.actor.dispose()
    for (const h of herd) h.actor.dispose()
    whale.dispose()
    panel.remove()
    host.dispose()
  }
}
