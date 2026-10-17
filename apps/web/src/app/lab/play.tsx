import { ClientMount } from '../client-mount'
import { GameUI } from '~/ui/GameUI'

const load = () => import('~/game/play/lab')

/** /lab/play: the controller sandbox (?stage=held|small|youth|provider|elder) */
export function PlayLab() {
  return (
    <>
      <ClientMount load={load} />
      <GameUI />
    </>
  )
}
