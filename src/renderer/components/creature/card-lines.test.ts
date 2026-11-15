import { describe, expect, it } from 'vitest'
import type { Power } from '@kit'
import { kitCardGroups, legacyCardGroups } from './card-lines'
import { cardApplies } from '../combat/card-actions'
import { quotedLine } from '@common/authoring/fixtures'

// Invented power: a primary attack with a failed save, a secondary attack on a hit, an effect.
const line = (text: string) => ({ text, clauses: [] })
const power: Power = {
  name: 'Grasping mire', action: 'standard', usage: 'encounter', keywords: ['zone'],
  attacks: [
    { label: 'primary', range: { kind: 'area-burst', size: 1, within: 10 }, target: 'each creature in the burst', bonus: { kind: 'fixed', value: 9 }, vs: 'reflex',
      hit: quotedLine('2d6 + 4 damage, and the target is slowed and dazed (save ends both).', [
        { quote: 'slowed', kind: 'condition', condition: 'slowed', who: 'target', duration: { kind: 'save-ends' }, saveGroup: 'a' },
        { quote: 'dazed (save ends both)', kind: 'condition', condition: 'dazed', who: 'target', duration: { kind: 'save-ends' }, saveGroup: 'a' },
      ]),
      miss: line('Half damage.'),
      failedSaves: [{ n: 1, line: line('The target is restrained instead.') }] },
    { label: 'secondary', after: 'hit', range: { kind: 'melee', reach: 1 }, target: 'the same target', bonus: { kind: 'fixed', value: 7 }, vs: 'fortitude',
      hit: line('The target falls prone.') },
  ],
  effect: line('The burst becomes a zone of mud until the end of the encounter.'),
} as unknown as Power

describe('power card lines', () => {
  it('draws a kit power in book order, each later attack with its own attack row', () => {
    const groups = kitCardGroups(power)
    expect(groups.map(g => [g.attack?.label, g.lines.map(l => `${l.key} ${l.label}`)])).toEqual([
      [undefined, ['a0.hit Hit', 'a0.miss Miss', 'a0.fs0 First Failed Saving Throw']],
      ['Secondary Attack', ['a1.hit Hit']],
      [undefined, ['effect Effect']],
    ])
    expect(groups[1]!.attack).toMatchObject({ after: 'hit', rangeType: 'melee', rangeValue: '1', target: 'the same target', bonus: '+7', vs: 'Fortitude' })
  })

  it('folds structured damage into the Hit line', () => {
    const e = { name: 'Bite', usage: 'at-will', hit: 'and the target is knocked prone.', miss: 'Half damage.' }
    expect(legacyCardGroups(e, true, true).groups[0]!.lines).toEqual([
      { key: 'a0.hit', label: 'Hit', text: 'and the target is knocked prone.', damage: true },
      { key: 'a0.miss', label: 'Miss', text: 'Half damage.' },
    ])
    // Damage alone is a Hit line of its own, before the effect.
    expect(legacyCardGroups({ name: 'Slam', usage: 'at-will', effect: 'It shifts 1 square.' }, true, true).groups.map(g => g.lines.map(l => l.key))).toEqual([['a0.hit'], ['effect']])
  })

  it('applies the clauses of every attack, and falls back to text only where no clause is', () => {
    const applies = cardApplies({ name: power.name, usage: 'encounter', kit: power }, [])
    expect(applies['a0.hit']!.map(a => [a.label, a.group])).toEqual([
      ['Slowed and Dazed (save ends both)', 'a0.hit:a'],
      ['Slowed and Dazed (save ends both)', 'a0.hit:a'],
    ])
    // A secondary attack's Hit with no clauses: the fallback finds the condition.
    expect(applies['a1.hit']!.map(a => a.label)).toEqual(['Prone'])
    // A failed save line has no clauses and is not a fallback line.
    expect(applies['a0.fs0']).toBeUndefined()
  })
})
