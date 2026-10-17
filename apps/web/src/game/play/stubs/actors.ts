/** Stub actors until game/actors lands: capsule people and blob animals with the PersonActor/AnimalActor API. */
import {
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Vector3,
} from 'three'
import type {
  AnimalKind,
  CarrySlot,
  CreateAnimal,
  CreatePerson,
  Hand,
  HeldItem,
  PersonActor,
  PersonAnim,
  PersonLook,
  Sex,
} from '../../contracts'

export function stubHeightFor(age: number, sex: Sex): number {
  const adult = sex === 'female' ? 1.55 : 1.65
  const k: [number, number][] = [
    [0, 0.55],
    [1, 0.75],
    [6, 1.12],
    [14, 1.52],
    [20, adult],
    [55, adult],
    [80, adult * 0.95],
  ]
  for (let i = 1; i < k.length; i++) {
    const a = k[i - 1]
    const b = k[i]
    if (!a || !b) continue
    if (age <= b[0]) return a[1] + ((b[1] - a[1]) * (age - a[0])) / (b[0] - a[0])
  }
  return adult * 0.95
}

const skinLight = new Color('#8a5a3c')
const skinDark = new Color('#3b2418')
const hideMat = new MeshStandardMaterial({ color: '#a8754a', roughness: 0.9 })
const unitCapsule = new CapsuleGeometry(0.5, 1, 4, 10)
const unitSphere = new SphereGeometry(0.5, 16, 12)

export const createStubPerson: CreatePerson = (look: PersonLook): PersonActor => {
  const object = new Group()
  const body = new Group()
  object.add(body)
  const skin = new MeshStandardMaterial({
    color: skinLight.clone().lerp(skinDark, look.skin),
    roughness: 0.85,
  })
  const torso = new Mesh(unitCapsule, skin)
  const head = new Mesh(unitSphere, skin)
  const kaross = new Mesh(unitCapsule, hideMat)
  body.add(torso, head, kaross)
  const sling = new Group()
  body.add(sling)

  let age = look.ageYears
  let height = 1
  let anim: PersonAnim = 'idle'
  let speed = 0
  let phase = 0
  let talking = false
  let carried: PersonActor | null = null

  const layout = () => {
    height = stubHeightFor(age, look.sex) * look.height
    const w = height * (0.17 + look.build * 0.04)
    torso.scale.set(w, (height * 0.78 - w) / 1, w * 0.8)
    torso.position.y = height * 0.42
    head.scale.setScalar(height * (age < 4 ? 0.2 : 0.14))
    head.position.y = height - head.scale.y * 0.5
    kaross.scale.set(w * 1.15, height * 0.28, w * 0.95)
    kaross.position.y = height * 0.58
    kaross.visible = look.garment === 'kaross' || look.garment === 'kaross-apron'
  }
  layout()

  const placeCarried = (slot: CarrySlot) => {
    if (slot === 'back') sling.position.set(0, height * 0.52, -0.2)
    else if (slot === 'hip') sling.position.set(0.22, height * 0.5, 0.05)
    else sling.position.set(0, height * 0.5, 0.42)
  }

  return {
    object,
    look,
    setAnim(a) {
      anim = a
    },
    setSpeed(mps) {
      speed = mps
    },
    setLookAt() {},
    setHeld(_hand: Hand, _item: HeldItem) {},
    carry(child, slot = 'back') {
      if (carried) sling.remove(carried.object)
      carried = child
      if (child) {
        child.object.position.set(0, 0, 0)
        child.object.rotation.set(0, 0, 0)
        sling.add(child.object)
        placeCarried(slot)
      }
    },
    setAge(years) {
      age = years
      layout()
    },
    setTalking(on) {
      talking = on
    },
    update(dt) {
      phase += dt * (speed > 0.1 ? 2 + speed * 2.2 : 1.2)
      const bob = speed > 0.1 ? Math.abs(Math.sin(phase)) * 0.04 * Math.min(2, speed) : Math.sin(phase) * 0.006
      body.position.y = bob
      const low = anim === 'crouch' || anim === 'gather' || anim === 'dig' || anim === 'sit' || anim === 'knap'
      body.scale.y = low ? 0.62 : 1
      body.rotation.x = anim === 'sleep' || anim === 'lie-dead' ? -Math.PI / 2 : 0
      head.rotation.y = talking ? Math.sin(phase * 3) * 0.1 : 0
    },
    headPosition(out: Vector3) {
      out.set(0, head.position.y, 0.04)
      return body.localToWorld(out)
    },
    handPosition(hand, out) {
      out.set(hand === 'right' ? -0.22 : 0.22, height * 0.5, 0.12)
      return body.localToWorld(out)
    },
    dispose() {
      skin.dispose()
    },
  }
}

const ANIMAL_SIZE: Record<AnimalKind, [number, number, number, string]> = {
  eland: [0.9, 1.1, 2.4, '#b08a5a'],
  seal: [0.5, 0.45, 1.6, '#4a4038'],
  gull: [0.15, 0.15, 0.4, '#e8e4dc'],
  hyena: [0.45, 0.6, 1.2, '#8a7a5a'],
  lion: [0.55, 0.8, 1.8, '#c09a5a'],
  tortoise: [0.25, 0.15, 0.3, '#6a5a3a'],
  whale: [3, 2.5, 14, '#2a2a30'],
}

export const createStubAnimal: CreateAnimal = (kind) => {
  const object = new Group()
  const [w, h, l, color] = ANIMAL_SIZE[kind]
  const mat = new MeshStandardMaterial({ color, roughness: 0.9 })
  const body = new Mesh(unitSphere, mat)
  body.scale.set(w, h, l)
  body.position.y = kind === 'gull' ? 0 : h * 0.7
  object.add(body)
  let phase = 0
  let speed = 0
  return {
    object,
    kind,
    setAnim() {},
    setSpeed(mps) {
      speed = mps
    },
    update(dt) {
      phase += dt * (1 + speed * 2)
      body.rotation.z = Math.sin(phase) * 0.03
    },
    dispose() {
      mat.dispose()
    },
  }
}
