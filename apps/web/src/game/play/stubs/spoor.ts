/** Stub spoor until game/world/spoor.ts lands: small dark hoof-print pairs on the ground. */
import { CircleGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import type { WorldData } from '../../contracts'
import type { CreateSpoor } from '../modules'

const MAX = 120

export const createStubSpoor: CreateSpoor = (world: WorldData) => {
  const root = new Group()
  root.name = 'stub-spoor'
  const geo = new CircleGeometry(0.06, 8)
  geo.rotateX(-Math.PI / 2)
  const mat = new MeshBasicMaterial({ color: '#3a2a1c', transparent: true, opacity: 0.7, depthWrite: false })
  const prints: Mesh[] = []
  return {
    root,
    add(x, z, heading, age) {
      const m = prints.length >= MAX ? prints.shift() : undefined
      const mesh = m ?? new Mesh(geo, mat)
      const sx = Math.cos(heading) * 0.05
      const sz = -Math.sin(heading) * 0.05
      mesh.position.set(x + sx, world.heightAt(x, z) + 0.03, z + sz)
      mesh.scale.setScalar(Math.max(0.4, 1 - age / 600))
      root.add(mesh)
      prints.push(mesh)
    },
    clear() {
      for (const p of prints) p.removeFromParent()
      prints.length = 0
    },
  }
}
