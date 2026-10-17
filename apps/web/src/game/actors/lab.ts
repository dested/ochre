/**
 * /lab/people: the fixed cast on a warm ground disc under a golden-hour key and a sky-blue fill. Orbit camera,
 * an anim picker, an age slider for the selected person, close-ups that frame a face at 40 cm, and (DEV)
 * window.__lab = { anim, age, closeup, lineup, select, crowd } for bx.
 */
import {
  ACESFilmicToneMapping,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { PersonActor, PersonAnim } from '../contracts'
import { createHost } from '../engine/host'
import { LAB_CAST, LAB_INFANT } from './cast'
import { createPerson } from './person'
import { randomLook } from './looks'
import { Rng } from '~/core/rng'

const ANIMS: PersonAnim[] = ['idle', 'walk', 'run', 'crouch', 'gather', 'sit', 'carry']
const SPACING = 0.82

type Walker = { actor: PersonActor; home: Vector3; radius: number; angle: number; walkSpeed: number }

export function mount(el: HTMLElement): () => void {
  const host = createHost(el)
  const renderer = host.renderer
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap

  const scene = new Scene()
  const bg = new Color('#d6b48c')
  scene.background = bg
  scene.fog = new Fog(bg, 9, 22)

  const camera = new PerspectiveCamera(35, 1, 0.05, 200)
  camera.position.set(0, 1.05, 6.4)
  const controls = new OrbitControls(camera, host.canvas)
  controls.target.set(0, 0.85, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.12
  controls.update()

  // golden-hour key from the front left, sky-blue fill from above and behind right, warm ground bounce
  const hemi = new HemisphereLight(new Color('#9ec3ea'), new Color('#8a5a36'), 1.15)
  scene.add(hemi)
  const key = new DirectionalLight(new Color('#ffc988'), 3.1)
  key.position.set(-4.5, 3.2, 5.5)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -5
  key.shadow.camera.right = 5
  key.shadow.camera.top = 4
  key.shadow.camera.bottom = -2
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 20
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  scene.add(key)
  const fill = new DirectionalLight(new Color('#a9c9ff'), 0.7)
  fill.position.set(4, 4, -3)
  scene.add(fill)
  const rim = new DirectionalLight(new Color('#ffd9a8'), 1.1)
  rim.position.set(3, 2.5, -5)
  scene.add(rim)

  const ground = new Mesh(new CircleGeometry(7, 64), new MeshStandardMaterial({ color: new Color('#c49a6c'), roughness: 0.95 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // the cast
  const params = new URLSearchParams(window.location.search)
  const crowdN = Number(params.get('crowd') ?? 0)
  const people: PersonActor[] = []
  const walkers: Walker[] = []
  const names: string[] = []
  LAB_CAST.forEach((m, i) => {
    const p = createPerson(m.look)
    p.setHeld('right', m.right)
    p.setHeld('left', m.left)
    const x = (i - (LAB_CAST.length - 1) / 2) * SPACING
    p.object.position.set(x, 0, 0)
    scene.add(p.object)
    people.push(p)
    names.push(m.name)
    walkers.push({ actor: p, home: new Vector3(x, 0, 0), radius: 1.4 + i * 0.55, angle: (i / LAB_CAST.length) * Math.PI * 2, walkSpeed: m.look.ageYears < 12 ? 1.1 : m.look.ageYears > 55 ? 0.9 : 1.3 })
  })
  const infant = createPerson(LAB_INFANT.look)
  scene.add(infant.object)
  const ama = people[1]
  if (ama) ama.carry(infant, 'back')
  people.push(infant)
  names.push(LAB_INFANT.name)

  // crowd test: ?crowd=25 walking in circles
  const crowd: Walker[] = []
  if (crowdN > 0) {
    const rng = new Rng(77)
    for (let i = 0; i < crowdN; i++) {
      const age = rng.pick([4, 7, 10, 14, 19, 24, 28, 33, 38, 45, 52, 61, 68])
      const look = randomLook(1000 + i * 17, rng.chance(0.5) ? 'female' : 'male', age + rng.range(0, 3))
      const p = createPerson(look)
      scene.add(p.object)
      crowd.push({ actor: p, home: new Vector3(), radius: 3 + (i % 5) * 0.9, angle: rng.range(0, Math.PI * 2), walkSpeed: age < 12 ? 1.1 : age > 55 ? 0.9 : 1.3 })
    }
  }

  let anim: PersonAnim = 'idle'
  let selected = 4
  let closeIdx: number | null = null
  let lookAtCam = true

  const setAnim = (a: PersonAnim): void => {
    anim = a
    for (const p of people) if (p !== infant) p.setAnim(a)
    if (a !== 'walk' && a !== 'run') walkers.forEach((w) => w.actor.object.position.copy(w.home))
    for (const w of walkers) w.actor.object.rotation.y = 0
    animSel.value = a
  }
  const lineup = (): void => {
    closeIdx = null
    camera.fov = 35
    camera.updateProjectionMatrix()
    camera.position.set(0, 1.05, 6.4)
    controls.target.set(0, 0.85, 0)
    controls.update()
  }
  const closeup = (i: number): void => {
    const p = people[i]
    if (!p) return
    closeIdx = i
    if (anim === 'walk' || anim === 'run') setAnim('idle')
    camera.fov = 40
    camera.updateProjectionMatrix()
    frameClose()
  }
  const head = new Vector3()
  const frameClose = (): void => {
    if (closeIdx === null) return
    const p = people[closeIdx]
    if (!p) return
    p.headPosition(head)
    // 40 cm in front of the face, along the body's facing, a touch to the key side
    const yaw = p === infant ? 0 : p.object.rotation.y
    const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    camera.position.copy(head).addScaledVector(fwd, 0.4).add(new Vector3(-0.06, 0.02, 0))
    controls.target.copy(head)
    controls.update()
  }
  const setAge = (years: number): void => {
    const p = people[selected]
    if (!p) return
    p.setAge(years)
    ageSlider.value = String(years)
    ageOut.textContent = `${years.toFixed(1)} y`
  }

  /* ── panel ── */
  const panel = document.createElement('div')
  panel.style.cssText =
    'position:absolute;top:12px;left:12px;z-index:40;display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:10px;' +
    'background:rgba(42,36,32,.72);color:#efe3c8;font:12px/1.35 Figtree,system-ui,sans-serif;max-width:260px'
  const title = document.createElement('div')
  title.textContent = 'People lab'
  title.style.cssText = 'font:600 14px Fraunces,Georgia,serif'
  panel.appendChild(title)
  const row = (): HTMLDivElement => {
    const r = document.createElement('div')
    r.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap'
    panel.appendChild(r)
    return r
  }
  const btn = (parent: HTMLElement, label: string, on: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'background:#9c3d20;color:#efe3c8;border:0;border-radius:6px;padding:4px 8px;cursor:pointer;font:inherit'
    b.onclick = on
    parent.appendChild(b)
    return b
  }
  const r1 = row()
  const animSel = document.createElement('select')
  for (const a of ANIMS) {
    const o = document.createElement('option')
    o.value = a
    o.textContent = a
    animSel.appendChild(o)
  }
  animSel.onchange = () => {
    const a = ANIMS.find((x) => x === animSel.value)
    if (a) setAnim(a)
  }
  r1.append('Anim', animSel)
  btn(r1, 'Lineup', lineup)
  const r2 = row()
  const personSel = document.createElement('select')
  names.forEach((n, i) => {
    const o = document.createElement('option')
    o.value = String(i)
    o.textContent = n
    personSel.appendChild(o)
  })
  personSel.value = String(selected)
  personSel.onchange = () => {
    selected = Number(personSel.value)
    const p = people[selected]
    if (p) {
      ageSlider.value = String(p.look.ageYears)
      ageOut.textContent = `${p.look.ageYears.toFixed(1)} y`
    }
  }
  r2.append('Person', personSel)
  btn(r2, 'Close-up', () => closeup(selected))
  const r3 = row()
  const ageSlider = document.createElement('input')
  ageSlider.type = 'range'
  ageSlider.min = '0'
  ageSlider.max = '80'
  ageSlider.step = '0.1'
  ageSlider.style.width = '150px'
  const ageOut = document.createElement('span')
  ageSlider.oninput = () => setAge(Number(ageSlider.value))
  r3.append('Age', ageSlider, ageOut)
  const r4 = row()
  const lookBox = document.createElement('input')
  lookBox.type = 'checkbox'
  lookBox.checked = true
  lookBox.onchange = () => {
    lookAtCam = lookBox.checked
  }
  r4.append(lookBox, 'Look at the camera')
  el.appendChild(panel)
  personSel.onchange(new Event('change'))

  const api = {
    anim: (name: string) => {
      const a = ANIMS.find((x) => x === name)
      if (a) setAnim(a)
    },
    age: (years: number) => setAge(years),
    closeup,
    lineup,
    select: (i: number) => {
      selected = i
      personSel.value = String(i)
    },
    talk: (on: boolean) => people.forEach((p) => p.setTalking(on)),
    /** free camera for screenshots: eye position and target */
    cam: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
      closeIdx = null
      camera.position.set(px, py, pz)
      controls.target.set(tx, ty, tz)
      controls.update()
    },
    count: () => people.length + crowd.length,
  }
  if (import.meta.env.DEV) Object.assign(window, { __lab: api })

  const tmp = new Vector3()
  const off = host.onFrame((dt) => {
    const walking = anim === 'walk' || anim === 'run'
    for (const w of walkers) {
      if (walking) {
        const sp = anim === 'run' ? (w.walkSpeed > 1.2 ? 3.6 : 3.0) : w.walkSpeed
        w.angle += (sp / w.radius) * dt
        w.actor.object.position.set(Math.cos(w.angle) * w.radius, 0, Math.sin(w.angle) * w.radius)
        // heading along the tangent (counter-clockwise seen from above)
        w.actor.object.rotation.y = Math.atan2(-Math.sin(w.angle), Math.cos(w.angle)) + Math.PI
        w.actor.setSpeed(sp)
      } else {
        w.actor.setSpeed(0)
      }
    }
    for (const w of crowd) {
      w.angle += (w.walkSpeed / w.radius) * dt
      w.actor.object.position.set(Math.cos(w.angle) * w.radius, 0, Math.sin(w.angle) * w.radius)
      w.actor.object.rotation.y = Math.atan2(-Math.sin(w.angle), Math.cos(w.angle)) + Math.PI
      w.actor.setSpeed(w.walkSpeed)
      w.actor.setAnim('walk')
    }
    camera.getWorldPosition(tmp)
    for (const p of people) p.setLookAt(lookAtCam ? tmp : null)
    for (const p of people) p.update(dt)
    for (const w of crowd) w.actor.update(dt)
    if (closeIdx !== null && !walking) frameClose()
    controls.update()
    renderer.render(scene, camera)
  })
  const offResize = host.onResize((s) => {
    camera.aspect = s.width / s.height
    camera.updateProjectionMatrix()
  })

  return () => {
    off()
    offResize()
    controls.dispose()
    for (const p of people) p.dispose()
    for (const w of crowd) w.actor.dispose()
    panel.remove()
    host.dispose()
  }
}
