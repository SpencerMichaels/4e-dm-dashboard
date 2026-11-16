import { describe, expect, it } from 'vitest'
import { enhancementTargetsText, impliedEnhancementTargets, parseEnhancementTargets } from './items'

describe('enhancement targets', () => {
  it('reads as the printed line', () => {
    expect(enhancementTargetsText(['attack', 'damage'])).toBe('attack rolls and damage rolls')
    expect(enhancementTargetsText(['ac'])).toBe('AC')
    expect(enhancementTargetsText(['will', 'fortitude', 'reflex'])).toBe('Fortitude, Reflex, and Will')
    expect(enhancementTargetsText(['ac', 'fortitude', 'reflex', 'will'])).toBe('AC, Fortitude, Reflex, and Will')
    expect(enhancementTargetsText([])).toBe('')
  })
  it('parses its own text back', () => {
    for (const t of [['attack', 'damage'], ['ac'], ['fortitude', 'reflex', 'will'], ['ac', 'fortitude', 'reflex', 'will']] as const)
      expect(parseEnhancementTargets(enhancementTargetsText(t))).toEqual(t)
    expect(parseEnhancementTargets('')).toBeUndefined()
  })
  it('falls back to what the category implies', () => {
    expect(impliedEnhancementTargets('implement')).toEqual(['attack', 'damage'])
    expect(impliedEnhancementTargets('armor')).toEqual(['ac'])
    expect(impliedEnhancementTargets('item', 'neck')).toEqual(['fortitude', 'reflex', 'will'])
    expect(impliedEnhancementTargets('item', 'feet')).toBeUndefined()
  })
})
