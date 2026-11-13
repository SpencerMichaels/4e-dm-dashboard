import { describe, expect, it } from 'vitest'
import { fixLigatureSplits, normalizeActionLabel, normalizeRecharge } from './text-utils'
import { normalizeTrapUsage } from './trap-parser'

describe('text-utils', () => {
  it('rejoins ligature splits seen in content/raw', () => {
    expect(fixLigatureSplits('plus 2d6 fi re damage')).toBe('plus 2d6 fire damage')
    expect(fixLigatureSplits('gains fl y 8 (hover)')).toBe('gains fly 8 (hover)')
    expect(fixLigatureSplits('diffi cult terrain; Refl ex')).toBe('difficult terrain; Reflex')
    expect(fixLigatureSplits('if the target is of the fire')).toBe('if the target is of the fire')
  })

  it('normalizes recharge dice', () => {
    expect(normalizeRecharge('⚄ ⚅')).toBe('5-6')
    expect(normalizeRecharge('⚅')).toBe('6')
    expect(normalizeRecharge('4 5 6')).toBe('4-6')
    expect(normalizeRecharge('when first bloodied')).toBe('when first bloodied')
  })

  it('normalizes item and trap action labels', () => {
    expect(normalizeActionLabel('Immediate ReAction')).toBe('Immediate Reaction')
    expect(normalizeActionLabel('No action')).toBe('No Action')
    expect(normalizeActionLabel('Standard Actions')).toBe('Standard Action')
    expect(normalizeActionLabel('1/round; Free Action')).toBe('1/round; Free Action')
  })

  it('normalizes trap recharge usage glyphs', () => {
    expect(normalizeTrapUsage('Recharge ⚃ ⚄ ⚅')).toBe('Recharge 4-6')
    expect(normalizeTrapUsage('Recharge when a captured creature escapes')).toBe('Recharge when a captured creature escapes')
    expect(normalizeTrapUsage('At-Will')).toBe('At-Will')
  })
})
