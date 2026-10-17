/**
 * Animals. P1 placeholder: a static, correctly sized silhouette per kind (the real rigged animals land in P3).
 * Same API and materials as the people.
 */
import { Color, Group, Mesh, Sphere, Vector3 } from 'three'
import type { AnimalAnim, AnimalKind, CreateAnimal } from '../contracts'
import { MeshBuilder, T, rigid } from './geo'
import { actorMaterials } from './materials'

type Spec = { len: number; height: number; color: string; legs: boolean }

const SPECS: Record<AnimalKind, Spec> = {
  eland: { len: 2.6, height: 1.6, color: '#b38a5c', legs: true },
  seal: { len: 1.8, height: 0.5, color: '#4a3d34', legs: false },
  gull: { len: 0.55, height: 0.35, color: '#e8e4dc', legs: true },
  hyena: { len: 1.4, height: 0.85, color: '#9a8466', legs: true },
  lion: { len: 2.2, height: 1.15, color: '#b8925a', legs: true },
  tortoise: { len: 0.25, height: 0.14, color: '#6b5a3a', legs: false },
  whale: { len: 14, height: 3, color: '#2b2e33', legs: false },
}

export const createAnimal: CreateAnimal = (kind, _seed) => {
  const sp = SPECS[kind]
  const mb = new MeshBuilder()
  const c = new Color(sp.color)
  const bodyH = sp.legs ? sp.height * 0.42 : sp.height * 0.5
  const bodyY = sp.legs ? sp.height - bodyH * 0.9 : bodyH
  mb.at(T(0, bodyY, 0), rigid(0)).ellipsoid(sp.len * 0.18, bodyH * 0.5, sp.len * 0.42, c, 16, 10)
  if (sp.legs) {
    for (const [x, z] of [
      [0.12, 0.3],
      [-0.12, 0.3],
      [0.12, -0.3],
      [-0.12, -0.3],
    ] as const) {
      const lh = bodyY - bodyH * 0.2
      mb.at(T(x * sp.len, lh / 2, z * sp.len), rigid(0)).ellipsoid(sp.len * 0.035, lh / 2, sp.len * 0.035, c.clone().multiplyScalar(0.8), 8, 6)
    }
  }
  mb.at(T(0, bodyY + bodyH * 0.45, sp.len * 0.5), rigid(0)).ellipsoid(sp.len * 0.08, bodyH * 0.3, sp.len * 0.12, c, 12, 8)
  const geo = mb.build()
  const mesh = new Mesh(geo, actorMaterials().gear)
  mesh.castShadow = true
  geo.boundingSphere = new Sphere(new Vector3(0, sp.height / 2, 0), Math.max(sp.len, sp.height))
  const object = new Group()
  object.add(mesh)
  let anim: AnimalAnim = 'idle'
  let t = 0
  return {
    object,
    kind,
    setAnim(a) {
      anim = a
    },
    setSpeed() {},
    update(dt) {
      t += dt
      mesh.position.y = anim === 'walk' || anim === 'run' ? Math.abs(Math.sin(t * 6)) * 0.03 * sp.height : 0
      mesh.rotation.z = anim === 'dead' || anim === 'fall' ? Math.PI / 2 : 0
    },
    dispose() {
      geo.dispose()
      object.removeFromParent()
    },
  }
}
