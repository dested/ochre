import { ClientMount } from '../client-mount'

const load = () => import('~/game/play/lab')

export function PlayLab() {
  return <ClientMount load={load} />
}
