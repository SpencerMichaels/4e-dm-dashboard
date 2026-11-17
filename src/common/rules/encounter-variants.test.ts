import { describe, expect, it } from 'vitest'
import type { Encounter } from '../types'
import { groupVariants, makeVariant, pickVariant, variantLabel, variantsOf } from './encounter-variants'

const enc = (id: string, patch: Partial<Encounter> = {}): Encounter => ({ id, name: id, creatures: [], tags: [], createdAt: '', updatedAt: '', ...patch })

describe('encounter variants', () => {
  it('copies an encounter to another level, shifting each row\'s level adjustment, in one group', () => {
    const original = enc('fight', { level: 3, locationId: 'vault', creatures: [
      { compendiumId: 'goblin', count: 4, isMinion: true },
      { compendiumId: 'boss', count: 1, levelAdjust: -2, monsterTemplates: ['Champion'] },
    ], traps: [{ compendiumId: 'pit', count: 1 }] })
    const { variant, original: grouped } = makeVariant(original, { level: 5, size: 5 }, { level: 3, size: 5 }, 'fight-5', 'now')
    expect(grouped).toMatchObject({ id: 'fight', level: 3, partySize: 5, variantGroup: 'fight' })
    expect(variant).toMatchObject({ id: 'fight-5', level: 5, partySize: 5, variantGroup: 'fight', locationId: 'vault', createdAt: 'now', traps: [{ compendiumId: 'pit', count: 1 }] })
    expect(variant.creatures).toEqual([
      { compendiumId: 'goblin', count: 4, isMinion: true, levelAdjust: 2 },
      { compendiumId: 'boss', count: 1, monsterTemplates: ['Champion'] },
    ])
    // The original is untouched.
    expect(original.creatures[1].levelAdjust).toBe(-2)
    // An encounter without its own frame is copied from the party's now, which it then keeps.
    expect(makeVariant(enc('loose'), { level: 2, size: 6 }, { level: 4, size: 4 }, 'loose-2', 'now').original).toMatchObject({ level: 4, partySize: 4 })
    expect(makeVariant(enc('bridge', { level: 3, challenges: [{ challengeId: 'c', level: 3, successes: 2 }, { compendiumId: 'p' }] }), { level: 5, size: 5 }, { level: 3, size: 5 }, 'bridge-5', 'now').variant.challenges).toEqual([{ challengeId: 'c', level: 5 }, { compendiumId: 'p' }])
  })

  it('lists a group by level then size, and picks the variant for the party\'s level, then the closest size', () => {
    const p = (level: number | undefined, size = 5) => ({ level, size })
    const all = [enc('a5', { level: 5, variantGroup: 'a' }), enc('solo', { level: 4 }), enc('a3', { level: 3, variantGroup: 'a' }), enc('a9', { level: 9, variantGroup: 'a' })]
    const group = variantsOf(all[0], all, p(5))
    expect(group.map(e => e.id)).toEqual(['a3', 'a5', 'a9'])
    expect(pickVariant(group, p(5)).id).toBe('a5')
    expect(pickVariant(group, p(7)).id).toBe('a5')
    expect(pickVariant(group, p(1)).id).toBe('a3')
    expect(pickVariant(group, p(undefined)).id).toBe('a3')
    expect(variantsOf(all[1], all, p(5))).toEqual([all[1]])
    expect(groupVariants(all, p(9)).map(g => [g.shown.id, g.variants.length])).toEqual([['a9', 3], ['solo', 1]])
    // "6 level 8 PCs": the same level for 4 and for 6 PCs.
    const sized = [enc('b4', { level: 8, partySize: 4, variantGroup: 'b' }), enc('b6', { level: 8, partySize: 6, variantGroup: 'b' })]
    expect(pickVariant(sized, p(8, 6)).id).toBe('b6')
    expect(pickVariant(sized, p(8, 3)).id).toBe('b4')
    expect(pickVariant(sized, p(8, 5)).id).toBe('b6')
    expect(variantLabel(sized[1], sized, p(8))).toBe('L8 · 6 PCs')
    expect(variantLabel(all[0], group, p(8))).toBe('L5')
  })
})
