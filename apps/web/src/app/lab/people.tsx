import { ClientMount } from '../client-mount'

const load = () => import('~/game/actors/lab')

export function PeopleLab() {
  return <ClientMount load={load} />
}
