import { expect, test } from 'bun:test'
import type { NameTag } from '~/game/bridge'
import { shownTags } from './Marks'

const tag = (id: string, x: number, y: number, relation: string | null = null): NameTag => ({
  id,
  name: id,
  relation,
  x,
  y,
  bond: 0.5,
  opacity: 1,
  speaking: null,
})

test('a head off the screen gets no tag, and does not take one of the four slots', () => {
  const view = { width: 1280, height: 800 }
  const tags = [
    tag('off-left', -40, 300, 'Mother'),
    tag('a', 200, 300),
    tag('b', 400, 300),
    tag('c', 600, 300),
    tag('d', 800, 300),
  ]
  expect([...shownTags(tags, view)].sort()).toEqual(['a', 'b', 'c', 'd'])
})

test('kin and speakers win the four slots', () => {
  const tags = [
    tag('a', 100, 100),
    tag('b', 200, 100),
    tag('c', 300, 100),
    tag('d', 400, 100),
    tag('mum', 500, 100, 'Mother'),
  ]
  expect(shownTags(tags).has('mum')).toBe(true)
})
