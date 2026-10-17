import { ClientMount } from '../client-mount'
import { PlayOverlay } from '~/game/play/overlay'

const load = () => import('~/game/play/lab')

/** /lab/play: the controller sandbox (?stage=held|small|youth|provider|elder) */
export function PlayLab() {
  return (
    <>
      <ClientMount load={load} />
      <PlayOverlay />
    </>
  )
}
