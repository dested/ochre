/**
 * /lab/people: the fixed cast on a warm ground disc under a golden-hour key and a sky-blue fill. Orbit camera,
 * an anim picker, an age slider for the selected person, close-ups that frame a face at 40 cm, and (DEV)
 * window.__lab = { anim, age, closeup, lineup, select, talk, carry, held, cam, count, pause, step, only, travel, frame,
 * contact } for bx. ?crowd=N adds N walkers
 * in circles for the budget test; ?animals=1 swaps in the animal lab (animal-lab.ts).
 */
import {
  ACESFilmicToneMapping,
  Box3,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  LOD,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SkinnedMesh,
  SphereGeometry,
  Vector3,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { CarrySlot, HeldItem, PersonActor, PersonAnim } from '../contracts'
import { createHost } from '../engine/host'
import { LAB_CAST, LAB_INFANT } from './cast'
import { createPerson } from './person'
import { mountAnimals } from './animal-lab'
import { randomLook } from './looks'
import { Rng } from '~/core/rng'
import { clamp } from './geo'
import { B } from './rig'

const ANIMS: PersonAnim[] = [
  'idle',
  'walk',
  'run',
  'talk',
  'point',
  'wave',
  'carry',
  'crouch',
  'gather',
  'dig',
  'scrape',
  'grind',
  'sit',
  'knap',
  'engrave',
  'eat',
  'tend-fire',
  'mourn',
  'aim',
  'throw',
  'dance',
  'crawl',
  'sleep',
  'lie-dead',
]
const ITEMS: HeldItem[] = ['none', 'spear', 'digging-stick', 'stick', 'shell', 'stone', 'ochre', 'beads', 'corm', 'firebrand', 'bag', 'meat', 'firewood']
const SLOTS: (CarrySlot | 'none')[] = ['back', 'hip', 'arms', 'none']
const SPACING = 0.82

type Walker = { actor: PersonActor; home: Vector3; radius: number; angle: number; walkSpeed: number }

export function mount(el: HTMLElement): () => void {
  if (new URLSearchParams(window.location.search).get('animals')) return mountAnimals(el)
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

  // (DEV) a hearth marker for the fire anims
  const hearthMark = new Group()
  hearthMark.visible = false
  const coals = new Mesh(new CircleGeometry(0.35, 24), new MeshStandardMaterial({ color: new Color('#3a2418'), emissive: new Color('#c4501c'), emissiveIntensity: 0.6, roughness: 1 }))
  coals.rotation.x = -Math.PI / 2
  coals.position.y = 0.01
  hearthMark.add(coals)
  const stoneGeo = new SphereGeometry(0.075, 10, 7)
  const stoneMat = new MeshStandardMaterial({ color: new Color('#7d6a58'), roughness: 0.9 })
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2
    const st = new Mesh(stoneGeo, stoneMat)
    st.position.set(Math.cos(a) * 0.43, 0.035, Math.sin(a) * 0.43)
    st.scale.set(1, 0.6, 0.8)
    st.castShadow = true
    hearthMark.add(st)
  }
  scene.add(hearthMark)

  // the cast
  const crowdN = Number(query.get('crowd') ?? 0)
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

  // the crowd test looks over the band from where a game camera would, a few metres back and up
  if (crowdN > 0) {
    camera.position.set(0, 3.4, 12.5)
    controls.target.set(0, 0.8, 0)
    controls.update()
  }

  let anim: PersonAnim = 'idle'
  let selected = 4
  let closeIdx: number | null = null
  let lookAtCam = true
  let paused = false
  let traveller: { p: PersonActor; mps: number } | null = null
  const levelZero = (p: PersonActor): Mesh[] => {
    const out: Mesh[] = []
    p.object.traverse((o) => {
      if (!(o instanceof LOD)) return
      o.levels[0]?.object.traverse((m) => {
        if (m instanceof Mesh) out.push(m)
      })
    })
    return out
  }
  /** person i's posed full-detail body (skinned), world space */
  const bodyBox = (i: number): Box3 => {
    const box = new Box3()
    const p = people[i]
    if (!p) return box
    p.object.updateMatrixWorld(true)
    for (const m of levelZero(p)) box.expandByObject(m, true)
    return box
  }

  const setAnim = (a: PersonAnim): void => {
    anim = a
    // the infant crawls, sleeps and lies with the others; otherwise it rides or sits
    const infantOwn = a === 'crawl' || a === 'sleep' || a === 'lie-dead'
    for (const p of people) if (p !== infant || infantOwn) p.setAnim(a)
    if (!infantOwn) infant.setAnim('idle')
    if (a !== 'walk' && a !== 'run') walkers.forEach((w) => w.actor.object.position.copy(w.home))
    // sleepers lie along X (on the right side); turn them so the row lies side by side
    for (const w of walkers) w.actor.object.rotation.y = a === 'sleep' ? Math.PI / 2 : 0
    animSel.value = a
  }
  const lineup = (): void => {
    closeIdx = null
    cradleView = null
    camera.near = 0.05
    camera.fov = 35
    camera.updateProjectionMatrix()
    camera.position.set(0, 1.05, 6.4)
    controls.target.set(0, 0.85, 0)
    controls.update()
  }
  let closeDist = 0.4
  let closeTurn = 0
  let closeDy = 0
  /**
   * frame one face from `dist` metres, swung `turn` radians round the head toward its left (a 3/4 view at ~0.6),
   * aimed `dy` metres above the head centre
   */
  const closeup = (i: number, dist = 0.4, turn = 0, dy = 0): void => {
    const p = people[i]
    if (!p) return
    closeIdx = i
    cradleView = null
    closeDist = dist
    closeTurn = turn
    closeDy = dy
    if (anim === 'walk' || anim === 'run') setAnim('idle')
    camera.near = 0.05
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
    head.y += closeDy
    // in front of the face (40 cm unless asked), along the body's facing, a touch to the key side
    const yaw = (p === infant ? 0 : p.object.rotation.y) + closeTurn
    const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    camera.position.copy(head).addScaledVector(fwd, closeDist).add(new Vector3(-0.06, 0.02, 0).multiplyScalar(closeDist / 0.4))
    controls.target.copy(head)
    controls.update()
  }
  /** the arms carry, framed each frame: from beside Ama (swung `turn` radians from her front toward her left), or
   * from the child's eyes up to hers at the held camera's 60° (stage 1) */
  let cradleView: { mode: 'side' | 'child'; turn: number; dist: number } | null = null
  const viewCradle = (mode: 'side' | 'child', turn = 1.2, dist = mode === 'child' ? 0 : 0.9): void => {
    closeIdx = null
    cradleView = { mode, turn, dist }
    camera.fov = mode === 'child' ? 60 : 40
    // play's near plane, which also clips the child's own brow and lids out of its eyes' view
    camera.near = mode === 'child' ? 0.1 : 0.05
    camera.updateProjectionMatrix()
    frameCradle()
  }
  const frameCradle = (): void => {
    if (!cradleView || !ama) return
    const a = ama.headPosition(new Vector3())
    const c = infant.headPosition(new Vector3())
    if (cradleView.mode === 'child') {
      // at the eye midpoint (inside the child's own nose bridge) unless asked to sit out in front of it
      camera.position.copy(c).addScaledVector(a.clone().sub(c).normalize(), cradleView.dist)
      controls.target.copy(a)
    } else {
      const yaw = ama.object.rotation.y + cradleView.turn
      const mid = a.clone().lerp(c, 0.6)
      mid.y -= 0.06
      camera.position.copy(mid).add(new Vector3(Math.sin(yaw), 0.12, Math.cos(yaw)).multiplyScalar(cradleView.dist))
      controls.target.copy(mid)
    }
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
  const talkBox = document.createElement('input')
  talkBox.type = 'checkbox'
  talkBox.onchange = () => people.forEach((p) => p.setTalking(talkBox.checked))
  r4.append(talkBox, 'Talking')
  const r5 = row()
  const slotSel = document.createElement('select')
  for (const s of SLOTS) {
    const o = document.createElement('option')
    o.value = s
    o.textContent = s
    slotSel.appendChild(o)
  }
  const setCarry = (slot: CarrySlot | 'none'): void => {
    if (!ama) return
    slotSel.value = slot
    if (slot === 'none') {
      ama.carry(null)
      infant.object.position.set(ama.object.position.x + 0.35, 0, 0.45)
    } else ama.carry(infant, slot)
  }
  slotSel.onchange = () => {
    const s = SLOTS.find((x) => x === slotSel.value)
    if (s) setCarry(s)
  }
  r5.append('Baby', slotSel)
  const itemSel = document.createElement('select')
  for (const it of ITEMS) {
    const o = document.createElement('option')
    o.value = it
    o.textContent = it
    itemSel.appendChild(o)
  }
  const setHeld = (i: number, hand: 'left' | 'right', item: HeldItem): void => {
    people[i]?.setHeld(hand, item)
  }
  itemSel.onchange = () => {
    const it = ITEMS.find((x) => x === itemSel.value)
    if (it) setHeld(selected, 'right', it)
  }
  r5.append('Right hand', itemSel)
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
    talk: (on: boolean) => {
      talkBox.checked = on
      people.forEach((p) => p.setTalking(on))
    },
    carry: (slot: string) => {
      const s = SLOTS.find((x) => x === slot)
      if (s) setCarry(s)
    },
    held: (i: number, hand: 'left' | 'right', item: string) => {
      const it = ITEMS.find((x) => x === item)
      if (it) setHeld(i, hand, it)
    },
    look: (on: boolean) => {
      lookBox.checked = on
      lookAtCam = on
    },
    /** the distance between the infant's eyes and the carrier's (the arms-carry rule: 35–45 cm) */
    carryGap: () => {
      if (!ama) return 0
      const a = ama.headPosition(new Vector3())
      return a.distanceTo(infant.headPosition(new Vector3()))
    },
    /**
     * the carried child's head against the carrier's: the gap between the eye points, and the clearance between the
     * two skulls taken as spheres (centre distance less both radii), in metres
     */
    carryHeads: () => {
      if (!ama) return null
      // the carrier's own body mesh and the child's (which rides under the carrier's carry-attach), at full detail
      ama.object.updateMatrixWorld(true)
      const bodies: { mesh: SkinnedMesh; child: boolean }[] = []
      ama.object.traverse((o) => {
        if (!(o instanceof LOD)) return
        let child = false
        for (let q = o.parent; q; q = q.parent) if (q.name === 'carry-attach') child = true
        const first = o.levels[0]?.object.getObjectsByProperty('isSkinnedMesh', true)[0]
        if (first instanceof SkinnedMesh) bodies.push({ mesh: first, child })
      })
      const skull = (child: boolean): Vector3[] => {
        const out: Vector3[] = []
        for (const { mesh: m } of bodies.filter((x) => x.child === child)) {
          const si = m.geometry.getAttribute('skinIndex')
          const sw = m.geometry.getAttribute('skinWeight')
          const n = m.geometry.getAttribute('position').count
          for (let k = 0; k < n; k++) {
            let best = -1
            let bw = 0
            for (let j = 0; j < 4; j++) {
              const w = sw.getComponent(k, j)
              if (w > bw) {
                bw = w
                best = si.getComponent(k, j)
              }
            }
            if (best === B.head || best === B.jaw) out.push(m.getVertexPosition(k, new Vector3()).applyMatrix4(m.matrixWorld))
          }
        }
        return out
      }
      const a = skull(false)
      const b = skull(true)
      let gap = Infinity
      for (const u of a) for (const w of b) gap = Math.min(gap, u.distanceToSquared(w))
      return {
        eyes: Number(ama.headPosition(new Vector3()).distanceTo(infant.headPosition(new Vector3())).toFixed(3)),
        skull: Number(Math.sqrt(gap).toFixed(3)),
        n: [a.length, b.length],
      }
    },
    /** both eye midpoints in the carrier's body frame (+X its left, +Z forward), in cm */
    carryEyes: () => {
      if (!ama) return null
      const cm = (v: Vector3) => [v.x, v.y, v.z].map((n) => Math.round(n * 100))
      return {
        carrier: cm(ama.object.worldToLocal(ama.headPosition(new Vector3()))),
        child: cm(ama.object.worldToLocal(infant.headPosition(new Vector3()))),
      }
    },
    cradle: viewCradle,
    /** hide everyone but Ama and the infant (clean carry shots) */
    solo: (on: boolean) => {
      for (const p of people) if (p !== ama && p !== infant) p.object.visible = !on
    },
    /** free camera for screenshots: eye position and target */
    cam: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
      closeIdx = null
      cradleView = null
      camera.position.set(px, py, pz)
      controls.target.set(tx, ty, tz)
      controls.update()
    },
    /** frame person i's hand from `dist` metres, on the hand's outer side, a little in front */
    hand: (i: number, side: 'left' | 'right', dist = 0.3) => {
      const p = people[i]
      if (!p) return
      closeIdx = null
      cradleView = null
      const h = p.handPosition(side, new Vector3())
      const yaw = p.object.rotation.y
      const out = side === 'left' ? 1 : -1
      const dir = new Vector3(Math.cos(yaw) * out + Math.sin(yaw) * 0.8, 0.15, -Math.sin(yaw) * out + Math.cos(yaw) * 0.8).normalize()
      camera.position.copy(h).addScaledVector(dir, dist)
      controls.target.copy(h)
      controls.update()
    },
    /** a hand's world position, for aiming close-up cameras */
    handAt: (i: number, side: 'left' | 'right') => people[i]?.handPosition(side, new Vector3()).toArray() ?? null,
    count: () => people.length + crowd.length,
    /** show or hide the panel (clean contact sheets) */
    ui: (on: boolean) => {
      panel.style.display = on ? '' : 'none'
    },
    /**
     * a hearth (a ring of stones round a bed of coals, 0.35 m across the bed) where the sim puts the fire a tender
     * works: 1.27 m in front of person i; a negative index takes it away
     */
    hearth: (i: number) => {
      const p = people[i]
      hearthMark.visible = !!p
      if (p) hearthMark.position.set(p.object.position.x, 0, p.object.position.z + 1.27)
    },
    /** freeze the actors (the camera still moves); `step` then advances them by hand */
    pause: (on: boolean) => {
      paused = on
    },
    /** advance every actor `sec` seconds in 1/60 s steps: frames for a contact sheet */
    step: (sec: number) => {
      const n = Math.round(clamp(sec, 0, 30) * 60)
      for (let k = 0; k < n; k++) advance(1 / 60)
    },
    /** show only these people (by index; the infant rides with its carrier), or everyone for an empty list */
    only: (list: number[]) => {
      people.forEach((p, k) => {
        p.object.visible = list.length === 0 || list.includes(k)
      })
    },
    /** move person i forward along +Z at `mps` (0 stops and sends them home): a moving crawl in place of the circle */
    travel: (i: number, mps: number) => {
      const p = people[i]
      if (!p) return
      traveller = mps > 0 ? { p, mps } : null
      if (mps <= 0) {
        const w = walkers.find((x) => x.actor === p)
        if (w) p.object.position.copy(w.home)
        else p.object.position.set(0, 0, 0.45)
        p.setSpeed(0)
      }
    },
    /** a fixed full-body camera on person i from its left side or its front, with room for `pad` × the body */
    frame: (i: number, view: 'side' | 'front' | 'top', pad = 1.3) => {
      const b = bodyBox(i)
      if (b.isEmpty()) return
      closeIdx = null
      cradleView = null
      camera.near = 0.05
      camera.fov = 35
      camera.updateProjectionMatrix()
      const c = b.getCenter(new Vector3())
      const size = b.getSize(new Vector3())
      const th = Math.tan((camera.fov * Math.PI) / 360)
      const across = view === 'side' ? size.z : size.x
      const dist = Math.max(size.y / 2 / th, across / 2 / (th * camera.aspect)) * pad + (view === 'side' ? size.x : size.z) / 2
      if (view === 'top') {
        // from above the left side, 55 degrees down: a body lying on the ground reads whole
        const far = Math.max(size.x, size.z) / 2 / th * pad + size.y
        camera.position.set(c.x + far * 0.57, c.y + far * 0.82, c.z + far * 0.08)
      } else camera.position.set(c.x + (view === 'side' ? dist : 0), c.y + 0.04, c.z + (view === 'side' ? 0 : dist))
      controls.target.copy(c)
      controls.update()
    },
    /**
     * ground contact for person i at full detail: the lowest point of the body, and the lowest point of each foot
     * (vertices bound mostly to that leg's foot or shin), in world metres
     */
    contact: (i: number) => {
      const p = people[i]
      if (!p) return null
      p.object.updateMatrixWorld(true)
      let minY = Infinity
      let lowBone = -1
      const low = new Vector3()
      const foot = [new Vector3(0, Infinity, 0), new Vector3(0, Infinity, 0)]
      const v = new Vector3()
      levelZero(p).forEach((m, mi) => {
        if (!(m instanceof SkinnedMesh) || mi !== 0) return
        const pos = m.geometry.getAttribute('position')
        const si = m.geometry.getAttribute('skinIndex')
        const sw = m.geometry.getAttribute('skinWeight')
        for (let k = 0; k < pos.count; k++) {
          m.getVertexPosition(k, v).applyMatrix4(m.matrixWorld)
          let best = -1
          let bw = 0
          for (let j = 0; j < 4; j++) {
            const w = sw.getComponent(k, j)
            if (w > bw) {
              bw = w
              best = si.getComponent(k, j)
            }
          }
          if (v.y < minY) {
            minY = v.y
            lowBone = best
            low.copy(v)
          }
          const f = best === B.footL || best === B.shinL ? 0 : best === B.footR || best === B.shinR ? 1 : -1
          const fv = foot[f]
          if (fv && v.y < fv.y) fv.copy(v)
        }
      })
      const r = (n: number) => Math.round(n * 1000) / 1000
      const boneName = Object.entries(B).find(([, n]) => n === lowBone)?.[0] ?? String(lowBone)
      return { minY: r(minY), low: [boneName, ...low.toArray().map(r)], left: foot[0]?.toArray().map(r), right: foot[1]?.toArray().map(r) }
    },
    /** triangles per detail level for person i (every level's meshes summed) */
    tris: (i: number) => {
      const p = people[i]
      const out: number[] = []
      p?.object.traverse((o) => {
        if (!(o instanceof LOD)) return
        for (const lv of o.levels) {
          let n = 0
          lv.object.traverse((m) => {
            if (m instanceof Mesh) n += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3
          })
          out.push(n)
        }
      })
      return out
    },
    /** show or hide mesh k (0 skin, 1 gear, 2 detail) at every level of person i and anything it carries */
    part: (i: number, k: number, on: boolean) => {
      people[i]?.object.traverse((o) => {
        if (!(o instanceof LOD)) return
        for (const lv of o.levels) {
          const meshes: Mesh[] = []
          lv.object.traverse((m) => {
            if (m instanceof Mesh) meshes.push(m)
          })
          const m = meshes[k]
          if (m) m.visible = on
        }
      })
    },
    /** mean CPU ms per frame for the actors' update and for render submission since the last call, and the fps */
    perf: () => {
      const n = Math.max(1, perf.n)
      const r = { update: perf.update / n, render: perf.render / n, fps: perf.n / Math.max(1e-3, perf.dt) }
      perf.n = 0
      perf.update = 0
      perf.render = 0
      perf.dt = 0
      return r
    },
  }
  if (import.meta.env.DEV) Object.assign(window, { __lab: api })

  const tmp = new Vector3()
  const perf = { n: 0, update: 0, render: 0, dt: 0 }
  /** move the walkers and update every actor by dt */
  const advance = (dt: number): void => {
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
    if (traveller) {
      const p = traveller.p.object.position
      p.z += traveller.mps * dt
      if (p.z > 1.6) p.z -= 2.4
      traveller.p.setSpeed(traveller.mps)
    }
    camera.getWorldPosition(tmp)
    for (const p of people) p.setLookAt(lookAtCam ? tmp : null)
    for (const p of people) p.update(dt)
    for (const w of crowd) w.actor.update(dt)
  }
  const off = host.onFrame((dt) => {
    const walking = anim === 'walk' || anim === 'run'
    const t0 = performance.now()
    advance(paused ? 0 : dt)
    const t1 = performance.now()
    if (closeIdx !== null && !walking) frameClose()
    else if (cradleView) frameCradle()
    controls.update()
    renderer.render(scene, camera)
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
    for (const p of people) p.dispose()
    for (const w of crowd) w.actor.dispose()
    panel.remove()
    host.dispose()
  }
}
