import { expect, test } from 'bun:test'
import type { Toast } from '~/game/bridge'
import { mergeToasts } from './Toasts'

const learned = (id: string, title: string, body: string | null = 'From watching you'): Toast => ({
  id,
  kind: 'learned',
  title,
  body,
  noteId: null,
})

test('folds others learning the same skill into one slip', () => {
  const out = mergeToasts([
    learned('a', 'Rebal learned Tides'),
    learned('b', 'Wume learned Tides'),
    learned('c', 'You learned Engraving', null),
    learned('d', 'Mile learned Tides'),
    learned('e', 'Huko learned Tides'),
  ])
  expect(out.map((t) => t.title)).toEqual([
    'Rebal, Wume and 2 others learned Tides',
    'You learned Engraving',
  ])
  expect(out[0]?.id).toBe('a')
})

test('two and three names read as a list', () => {
  expect(
    mergeToasts([learned('a', 'A learned Fire'), learned('b', 'B learned Fire')])[0]?.title
  ).toBe('A and B learned Fire')
  expect(
    mergeToasts([
      learned('a', 'A learned Fire'),
      learned('b', 'B learned Fire'),
      learned('c', 'C learned Fire'),
    ])[0]?.title
  ).toBe('A, B and C learned Fire')
})
