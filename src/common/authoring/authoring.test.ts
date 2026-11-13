import { describe, it, expect } from 'vitest'
import { benchmarks, scaffold, validate, normalizeContent, search } from './core'
import { monsterToCreature } from './legacy'
import type { Monster } from '@kit'
import { testPower } from './fixtures'
import { suggestNumbers } from './numbers'
import type { Draft } from './types'

describe('authoring calculations and schema', () => {
  it('scaffolds every supported kind without fabricating a published source', () => {
    for (const kind of ['monster', 'item', 'trap', 'disease'] as const) expect(validate(kind, scaffold(kind, 'Synthetic', 7)).errors).toEqual([])
  })
  it('rejects unsupported inputs instead of clamping and respects ranks', () => {
    expect(() => benchmarks(31, 'lurker')).toThrow('1–30')
    expect(() => benchmarks(7.5, 'lurker')).toThrow()
    expect(benchmarks(7, 'lurker', 'minion').hp).toBe(1)
    expect(benchmarks(7, 'lurker', 'elite').hp).toBe(benchmarks(7, 'lurker').hp * 2)
    expect(benchmarks(8, 'lurker').ac - benchmarks(7, 'lurker').ac).toBe(1)
  })
  it('uses the latest published rule for each number', () => {
    // Solos are x4 at every level (DMG2 p. 133 replaced the DMG's x5 from level 11).
    expect(benchmarks(15, 'brute', 'solo', { con: 20 }).hp).toBe((10 + 20 + 150) * 4)
    // Elites and solos get no defense bonus (DMG2 p. 133); saves and action points are DMG p. 185.
    expect(benchmarks(15, 'brute', 'elite')).toMatchObject({ ac: 27, otherDefense: 27, savingThrowBonus: 2, actionPoints: 1 })
    expect(benchmarks(15, 'brute', 'solo')).toMatchObject({ ac: 27, savingThrowBonus: 5, actionPoints: 2 })
    // DCs by level (Rules Compendium p. 126) and minion damage (DMG2 p. 133).
    expect(benchmarks(1, 'brute').dc).toEqual({ easy: 8, moderate: 12, hard: 19 })
    expect(benchmarks(30, 'brute').dc).toEqual({ easy: 24, moderate: 32, hard: 42 })
    expect(benchmarks(17, 'brute', 'minion').minionDamage).toEqual({ standard: 10, brute: 12 })
    expect(benchmarks(7, 'brute').policy).toBe('published-rules-v2')
  })
  it('uses the DMG errata monster math that Monster Manual 3 introduced (Rules Update 08/2012 p. 46)', () => {
    // Accuracy is level + 5 vs. AC and level + 3 vs. other defenses for every role.
    for (const role of ['brute', 'soldier', 'artillery'] as const) expect(benchmarks(10, role)).toMatchObject({ attackVsAC: 15, attackVsOther: 13 })
    // Printed columns: one target (medium) and several targets (low); brutes +25% (high); limited +25%.
    expect(benchmarks(12, 'brute').normalDamage).toEqual({ low: '2d8+6', medium: '3d6+10', high: '3d6+15' })
    expect(benchmarks(30, 'brute').normalDamage).toMatchObject({ low: '4d6+15', medium: '4d8+20' })
    expect(benchmarks(1, 'brute').limitedDamage.medium).toBe('1d8+6')
  })
  it('resolves quoted mechanics and rejects contradictory clause spans', () => {
    const m = scaffold('monster', 'Test', 7) as Monster
    const p = testPower(); m.powers.push(p)
    const hit = p.attacks[0].hit!
    ;(hit as any).clauses = [{ kind: 'lose-healing-surge', count: 1, who: 'target', quote: 'loses one healing surge' }]
    const normalized = normalizeContent(m)
    expect(validate('monster', normalized).errors).toEqual([])
    expect(normalized.powers[0].attacks[0].hit!.clauses[0].at).toBeDefined()
    normalized.powers[0].attacks[0].hit!.text = 'Nothing happens.'
    expect(validate('monster', normalized).errors.length).toBeGreaterThan(0)
  })
  it('separates numeric warnings from malformed data and avoids out-of-range bands', () => {
    const m = scaffold('monster', 'Test', 7) as Monster
    m.hp = 900
    expect(validate('monster', m).errors).toEqual([])
    expect(validate('monster', m).flags.some(f => f.path === '$.hp')).toBe(true)
    m.level = 35
    expect(validate('monster', m).flags).toHaveLength(1)
    m.hp = -1
    expect(validate('monster', m).errors.length).toBeGreaterThan(0)
  })
  it('searches prose-only powers and filters results by kind and level', () => {
    const m = scaffold('monster', 'Unrelated creature', 7) as Monster; m.powers.push(testPower())
    const entries = [{ key: 'test', kind: 'monster' as const, content: m, source: 'Synthetic' }]
    expect(search(entries, { text: 'healing surge' })[0].target).toBe('powers/0')
    expect(search(entries, { text: 'healing surge', level: 8 })).toEqual([])
    expect(search(entries, { clause: 'summon' })).toEqual([])
    expect(search([], { text: 'anything' })).toEqual([])
  })
  it('shows kit-only mechanics when projecting into the existing viewer', () => {
    const m = scaffold('monster', 'Test', 7) as Monster; const p = testPower(); m.powers.push(p)
    p.usesPerRound = 1; p.special = { text: 'The summoned creature disappears at encounter end.', clauses: [] }
    p.attacks.push({ ...p.attacks[0], label: 'secondary', after: 'hit' })
    m.speed.notes = 'hover; phasing'
    const c = monsterToCreature(m)
    expect((c.statBlock.actions as any[])[0].text).toContain('secondary attack')
    expect((c.statBlock.actions as any[])[0].special).toBe(p.special.text)
    expect(c.statBlock.description).toContain(m.speed.notes)
  })
  it('derives HP from Con and initiative from Dex plus the role bonus, and honors a recorded HP multiplier', () => {
    // The Shadow: level 7 lurker, Con 12, Dex 22.
    const b = benchmarks(7, 'lurker', 'standard', { con: 12, dex: 22 })
    expect(b.hp).toBe(60)
    expect(b.initiative).toBe(13)
    expect(benchmarks(7, 'lurker').hp).toBe(62)
    expect(benchmarks(7, 'soldier', 'standard', { dex: 14 }).initiative).toBe(7)
    const m = scaffold('monster', 'Shade', 7, 'lurker') as Monster
    expect(validate('monster', m).flags).toEqual([])
    // Just past each tolerance: HP 30% of 60, initiative ±2.
    Object.assign(m, { hp: 40, initiative: 10, abilities: { ...m.abilities, con: 12, dex: 22 } })
    const flagged = (recipe?: { hpMultiplier: number }) => validate('monster', m, recipe).flags.map(f => f.path)
    expect(flagged()).toEqual(['$.hp', '$.initiative'])
    expect(flagged({ hpMultiplier: 0.7 })).toEqual(['$.initiative'])
    m.initiative = 13
    expect(flagged({ hpMultiplier: 0.7 })).toEqual([])
  })
  it('turns explicit preferences into numeric proposals while preserving DM overrides', () => {
    const content = scaffold('monster', 'Test', 7, 'lurker') as Monster
    content.powers.push(testPower())
    const d: Pick<Draft, 'kind' | 'revision' | 'content' | 'nodes' | 'overrides'> = { kind: 'monster', revision: 1, content, nodes: { powers: ['touch'] }, overrides: ['/content/defenses/ac'] }
    const result = suggestNumbers(d, { hpMultiplier: 0.75, powers: { touch: { accuracy: 2, damageBand: 'low' } } })
    expect(result.protectedFields).toContain('/content/defenses/ac')
    expect(result.changes.find(c => c.path.endsWith('/bonus'))!.value).toEqual({ kind: 'fixed', value: 12 })
    expect(result.changes.find(c => c.path === '/content/hp')!.value).toBe(Math.round(content.hp * 0.75))
    expect(result.damageGuidance[0].dice).toBeDefined()
    expect(() => suggestNumbers(d, { hpMultiplier: -1 })).toThrow()
  })
})

describe('item numbers', () => {
  it('prices and enhancement follow the item tables, and differences are flagged', async () => {
    const { itemBenchmarks } = await import('../rules/items')
    expect(itemBenchmarks(8)).toMatchObject({ price: 3400, enhancement: 2, salePrice: { common: 680, uncommon: 1700, rare: 3400 } })
    expect(itemBenchmarks(18).ladder.map(l => `${l.level}:+${l.enhancement}:${l.price}`)).toEqual(['18:+4:85000', '23:+5:425000', '28:+6:2125000'])
    const item = scaffold('item', 'Synthetic blade', 3) as any
    expect(item.levels).toEqual([{ level: 3, price: 680 }])
    expect(validate('item', item).flags).toEqual([])
    item.category = 'weapon'; item.levels = [{ level: 3, enhancement: 1, price: 680 }, { level: 8, enhancement: 3, price: 3000 }]
    expect(validate('item', item).flags.map(f => f.path)).toEqual(['$.levels[1].price', '$.levels[1].enhancement'])
    item.subtype = 'Consumable'; item.levels = [{ level: 8, price: 125 }]
    expect(validate('item', item).flags).toEqual([])
  })
})
