import { describe, expect, it } from 'vitest'
import type { Encounter } from '../types'
import { groupVariants, makeVariant, pickVariant, variantsOf } from './encounter-variants'

const enc = (id: string, patch: Partial<Encounter> = {}): Encounter => ({ id, name: id, creatures: [], tags: [], createdAt: '', updatedAt: '', ...patch })

describe('encounter variants', () => {
  it('copies an encounter to another level, shifting each row\'s level adjustment, in one group', () => {
    const original = enc('fight', { level: 3, locationId: 'vault', creatures: [
      { compendiumId: 'goblin', count: 4, isMinion: true },
      { compendiumId: 'boss', count: 1, levelAdjust: -2, monsterTemplates: ['Champion'] },
    ], traps: [{ compendiumId: 'pit', count: 1 }] })
    const { variant, original: grouped } = makeVariant(original, 5, 3, 'fight-5', 'now')
    expect(grouped).toMatchObject({ id: 'fight', level: 3, variantGroup: 'fight' })
    expect(variant).toMatchObject({ id: 'fight-5', level: 5, variantGroup: 'fight', locationId: 'vault', createdAt: 'now', traps: [{ compendiumId: 'pit', count: 1 }] })
    expect(variant.creatures).toEqual([
      { compendiumId: 'goblin', count: 4, isMinion: true, levelAdjust: 2 },
      { compendiumId: 'boss', count: 1, monsterTemplates: ['Champion'] },
    ])
    // The original is untouched.
    expect(original.creatures[1].levelAdjust).toBe(-2)
    // An encounter without its own level is copied from its frame (the party's level), which it then keeps.
    expect(makeVariant(enc('loose'), 2, 4, 'loose-2', 'now').original.level).toBe(4)
    expect(makeVariant(enc('bridge', { level: 3, challenge: { level: 3, complexity: 2 } }), 5, 3, 'bridge-5', 'now').variant.challenge).toEqual({ level: 5, complexity: 2 })
  })

  it('lists a group by level and picks the variant for the party\'s level', () => {
    const all = [enc('a5', { level: 5, variantGroup: 'a' }), enc('solo', { level: 4 }), enc('a3', { level: 3, variantGroup: 'a' }), enc('a9', { level: 9, variantGroup: 'a' })]
    const group = variantsOf(all[0], all)
    expect(group.map(e => e.id)).toEqual(['a3', 'a5', 'a9'])
    expect(pickVariant(group, 5).id).toBe('a5')
    expect(pickVariant(group, 7).id).toBe('a5')
    expect(pickVariant(group, 1).id).toBe('a3')
    expect(pickVariant(group, undefined).id).toBe('a3')
    expect(variantsOf(all[1], all)).toEqual([all[1]])
    expect(groupVariants(all, 9).map(g => [g.shown.id, g.variants.length])).toEqual([['a9', 3], ['solo', 1]])
  })
})
