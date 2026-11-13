import { describe, expect, it } from 'vitest'
import { tint, withAlpha } from './color'

describe('color helpers', () => {
  it('builds color-mix expressions for hex and tokens alike', () => {
    expect(withAlpha('#8b0000', 0.25)).toBe('color-mix(in srgb, #8b0000 25%, transparent)')
    expect(withAlpha('var(--danger)', 0.5)).toBe('color-mix(in srgb, var(--danger) 50%, transparent)')
    expect(tint('var(--power-daily)', 0.78)).toBe('color-mix(in srgb, var(--power-daily) 78%, var(--surface))')
  })

  it('clamps the amount to 0–100%', () => {
    expect(withAlpha('red', 2)).toBe('color-mix(in srgb, red 100%, transparent)')
    expect(tint('red', -1, 'blue')).toBe('color-mix(in srgb, red 0%, blue)')
  })
})
