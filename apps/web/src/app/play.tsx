import { ClientMount } from './client-mount'
import { PlayOverlay } from '~/game/play/overlay'

const load = () => import('~/game/play/session')

/** the game route (/): the 3D session and the UI over it */
export function PlayPage() {
  return (
    <>
      <ClientMount load={load} />
      <PlayOverlay />
    </>
  )
}
