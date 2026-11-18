import { describe, expect, it } from 'vitest'
import { moveWithin } from './drag-reorder'

describe('moveWithin', () => {
  // A creature's actions: traits and powers interleaved in one list.
  const list = ['t1', 'p1', 't2', 'p2', 't3']
  const traits = [0, 2, 4]

  it('reorders entries among their own slots only', () => {
    expect(moveWithin(list, traits, 2, 0)).toEqual(['t3', 'p1', 't1', 'p2', 't2'])
    expect(moveWithin(list, traits, 0, 1)).toEqual(['t2', 'p1', 't1', 'p2', 't3'])
  })

  it('leaves the list alone past either end or onto itself', () => {
    expect(moveWithin(list, traits, 0, -1)).toBe(list)
    expect(moveWithin(list, traits, 2, 3)).toBe(list)
    expect(moveWithin(list, traits, 1, 1)).toBe(list)
  })
})
