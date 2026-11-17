import { describe, expect, it } from 'vitest'
import { generateId } from './id'

describe('generateId', () => {
  it('never starts with "_" (listings skip those files) or "-"', () => {
    for (let i = 0; i < 20000; i++) {
      const id = generateId()
      expect(id).toHaveLength(12)
      expect(id[0]).not.toMatch(/[_-]/)
    }
  })
})
