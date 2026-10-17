import { ClientMount } from '../client-mount'

const load = () => import('~/game/world/lab')

export function WorldLab() {
  return <ClientMount load={load} />
}
