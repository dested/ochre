import { ClientMount } from '../client-mount'

const load = () => import('~/sim/lab')

export function SimLab() {
  return <ClientMount load={load} />
}
