import { describe, expect, it } from 'vitest'
import type { Monster } from '@kit'
import { checkMonsterBands, diceAverage } from './bands'
import { validateEntry } from './index'
import { checkLineSpans } from './spans'

function monster(over: Partial<Monster> = {}): Monster {
  return {
    id: 'monster1', name: 'Test Brute', level: 5, role: 'brute', rank: 'standard', size: 'medium',
    origin: 'natural', type: 'humanoid', keywords: [], xp: 200, hp: 74, initiative: 2, perception: 3,
    senses: [], speed: { walk: 6 }, defenses: { ac: 17, fortitude: 18, reflex: 16, will: 16 },
    savingThrowBonus: 0, actionPoints: 0, immune: [], resist: [], vulnerable: [],
    abilities: { str: 18, con: 14, dex: 12, int: 8, wis: 10, cha: 10 }, skills: {},
    alignment: 'unaligned', languages: 'Common', equipment: '', traits: [], auras: [],
    powers: [{
      name: 'Club', action: 'standard', usage: 'at-will', keywords: ['weapon'], basic: 'melee',
      attacks: [{
        label: 'primary', range: { kind: 'melee', reach: 1 }, target: 'one creature', bonus: { kind: 'fixed', value: 8 }, vs: 'ac',
        hit: { text: '2d8 + 4 damage.', clauses: [{ at: [0, 14], kind: 'damage', dice: '2d8+4', types: [], who: 'target' }] },
      }],
    }],
    description: '', source: { book: 'Test' },
    provenance: { origin: 'parser', by: 'tools/content@test', at: '2026-11-12' },
    ...over,
  }
}

describe('shape', () => {
  it('accepts a well-formed monster', () => {
    expect(validateEntry('monsters', monster())).toEqual({ errors: [], flags: [] })
  })

  it('rejects bad enums, unknown fields and missing values', () => {
    const bad = { ...monster({ size: 'enormous' as never, role: 'tank' as never }), extra: 1 } as unknown as Monster
    delete (bad as any).hp
    const { errors } = validateEntry('monsters', bad)
    expect(errors.map(e => e.path)).toEqual(expect.arrayContaining(['$.size', '$.role', '$.extra', '$.hp']))
  })

  it('checks clause fields', () => {
    const m = monster()
    ;(m.powers[0].attacks[0].hit!.clauses[0] as any).types = ['sonic']
    expect(validateEntry('monsters', m).errors).toContainEqual(
      { path: '$.powers[0].attacks[0].hit.clauses[0].types[0]', message: expect.stringContaining('"sonic" is not one of') })
  })
})

describe('spans', () => {
  it('flags spans outside the text and spans that do not state the clause', () => {
    expect(checkLineSpans({ text: '2d8 + 4 damage.', clauses: [{ at: [0, 40], kind: 'damage', dice: '2d8+4', types: [], who: 'target' }] }, '$'))
      .toEqual([{ path: '$.clauses[0]', message: 'span [0, 40) outside text (length 15)' }])
    expect(checkLineSpans({ text: 'The target is dazed (save ends).', clauses: [
      { at: [0, 19], kind: 'condition', condition: 'stunned', who: 'target', duration: { kind: 'save-ends' } },
    ] }, '$')[0].message).toMatch(/condition "stunned" not in span/)
    expect(checkLineSpans({ text: 'The target is dazed (save ends).', clauses: [
      { at: [0, 31], kind: 'condition', condition: 'dazed', who: 'target', duration: { kind: 'save-ends' } },
      { at: [0, 10], kind: 'unparsed', text: 'The' },
    ] }, '$')).toEqual([{ path: '$.clauses[1]', message: 'unparsed: unparsed text differs from span ("The target")' }])
  })
})

describe('math bands', () => {
  it('computes dice averages', () => {
    expect(diceAverage('2d8+4')).toBe(13)
    expect(diceAverage('3d6 + 10')).toBe(20.5)
    expect(diceAverage('15')).toBe(15)
    expect(diceAverage('Strength modifier')).toBeUndefined()
  })

  it('passes a benchmark monster and flags outliers', () => {
    expect(checkMonsterBands(monster())).toEqual([])
    const rules = checkMonsterBands(monster({ xp: 400, hp: 200, defenses: { ac: 30, fortitude: 18, reflex: 16, will: 5 } })).map(f => f.rule)
    expect(rules).toEqual(['xp', 'hp', 'ac', 'defense'])
    expect(checkMonsterBands(monster({ rank: 'minion', hp: 74, xp: 50 })).map(f => f.rule)).toEqual(['hp'])
  })
})
