import { expect, test } from 'bun:test'
import type { Toast } from '~/game/bridge'
import { EMPTY_QUEUE, noteToasts, tickQueue, visibleToasts } from './toast-queue'

const t = (id: string): Toast => ({ id, kind: 'note', title: id, body: null, noteId: null })

test('toasts under a card wait, then come one at a time after it closes', () => {
  // two toasts land under the chapter card; the session expires them before the card closes
  let q = noteToasts(EMPTY_QUEUE, [t('a'), t('b')], false)
  q = tickQueue(q, false, 0)
  expect(visibleToasts(q, [])).toEqual([])

  // the card closes at 10 s: nothing during the settle, then a, then b a gap later
  q = tickQueue(q, true, 10_000)
  expect(visibleToasts(q, []).map((x) => x.id)).toEqual([])
  q = tickQueue(q, true, 10_900)
  expect(visibleToasts(q, []).map((x) => x.id)).toEqual(['a'])
  q = tickQueue(q, true, 11_500)
  expect(visibleToasts(q, []).map((x) => x.id)).toEqual(['a'])
  q = tickQueue(q, true, 12_400)
  expect(visibleToasts(q, []).map((x) => x.id)).toEqual(['a', 'b'])
  q = tickQueue(q, true, 20_000)
  expect(visibleToasts(q, [])).toEqual([])
})

test('toasts during live play show straight from the bridge and never queue', () => {
  const live = [t('c')]
  const q = noteToasts(EMPTY_QUEUE, live, true)
  expect(q.queued).toEqual([])
  expect(visibleToasts(q, live).map((x) => x.id)).toEqual(['c'])
  // the session expired it: gone
  expect(visibleToasts(q, [])).toEqual([])
})

test('a held toast still on the bridge is shown once, from the queue', () => {
  let q = noteToasts(EMPTY_QUEUE, [t('d')], false)
  q = noteToasts(q, [t('d')], true)
  q = tickQueue(q, true, 0)
  q = tickQueue(q, true, 1000)
  expect(visibleToasts(q, [t('d')]).map((x) => x.id)).toEqual(['d'])
})
