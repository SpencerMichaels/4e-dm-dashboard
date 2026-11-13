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
    description: '', sources: [{ book: 'Test' }],
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

  it('accepts the v2 fields', () => {
    const m = monster({
      resist: [{ type: 'fire', value: 10 }, { type: 'special', text: 'insubstantial' }],
      vulnerable: [{ type: 'radiant', note: 'see text' }],
      sources: [{ book: 'Monster Manual 3', page: 132 }, { book: 'Dungeon Magazine 190' }],
    })
    const atk = m.powers[0].attacks[0]
    atk.vs = 'any'
    atk.failedSaves = [{ n: 2, line: { text: 'The target is petrified.', clauses: [] } }, { n: 'each', line: { text: 'It takes 5 damage.', clauses: [] } }]
    m.powers.push({
      name: 'Rally', action: 'minor', usage: 'encounter', keywords: [], attacks: [],
      range: { kind: 'close-burst', size: 5, note: 'allies in the burst' },
      effect: { text: 'Each target gains 5 temporary hit points.', clauses: [] },
      extraLines: [{ label: 'Ooze Form', line: { text: 'The mimic becomes an ooze.', clauses: [] } }],
    })
    expect(validateEntry('monsters', m).errors).toEqual([])
  })

  it('rejects the v1 fields and malformed v2 ones', () => {
    const m = { ...monster(), source: { book: 'Test' } } as any
    m.powers[0].attacks[0].firstFailedSave = { text: 'x', clauses: [] }
    m.powers[0].attacks[0].failedSaves = [{ n: 0, line: { text: 'x', clauses: [] } }]
    m.resist = [{ type: 'fire', value: -1 }]
    const paths = validateEntry('monsters', m).errors.map(e => e.path)
    expect(paths).toEqual(expect.arrayContaining([
      '$.source', '$.powers[0].attacks[0].firstFailedSave', '$.powers[0].attacks[0].failedSaves[0].n', '$.resist[0].value',
    ]))
    delete m.sources
    expect(validateEntry('monsters', m).errors.map(e => e.path)).toContain('$.sources')
  })

  it('checks item, trap, disease and template v2 shapes', () => {
    const prov = { origin: 'parser', at: '2026-11-12' }
    const item = {
      id: 'armor60', name: 'Baazrag Leather Armor', category: 'armor', level: 0, rarity: null, tier: 'heroic',
      levels: [{ level: 0, price: null, priceText: 'Special' }, { level: 1, price: 0.5, priceText: '5 sp' }],
      subtype: 'Gear', armor: { category: 'Leather', acBonus: 3, minEnhancement: 4 },
      properties: [], powers: [], flavor: '',
      description: [{ type: 'power', power: { name: 'Power', action: 'standard', usage: 'daily', keywords: [], attacks: [] } }],
      sources: [{ book: 'Dark Sun Campaign Setting', page: 118 }], provenance: prov,
    }
    expect(validateEntry('items', item).errors).toEqual([])
    expect(validateEntry('items', { ...item, tier: 'mythic' }).errors.map(e => e.path)).toEqual(['$.tier'])

    const trap = {
      id: 'trap1', name: 'Wall', kind: 'area', level: 13, role: 'warder', rank: 'elite', xp: 1600,
      detect: [{ skill: 'Perception', dc: null, text: 'automatic' }], hp: 60, hpText: '60 in each of six 5-foot sections',
      immune: [], resist: [{ type: 'special', text: 'half damage from melee attacks' }],
      traits: [{ name: 'Writhing Tentacles', keywords: [], text: { text: 'Enemies treat the squares as difficult terrain.', clauses: [] } }],
      powers: [], countermeasures: [], flavor: '', description: '', sources: [{ book: 'Dungeon Magazine 197' }], provenance: prov,
    }
    expect(validateEntry('traps', trap).errors).toEqual([])

    const disease = {
      id: 'disease1', name: 'Mummy Rot', level: 21,
      endurance: { improveDc: { text: "15 + two-thirds mummy's level" }, maintainDc: 10 },
      check: { skill: 'Insight', text: 'The target makes an Insight check.' },
      stages: [], flavor: '', sources: [{ book: 'Monster Manual' }], provenance: prov,
    }
    expect(validateEntry('diseases', disease).errors).toEqual([])
    expect(validateEntry('diseases', { ...disease, endurance: { improveDc: { text: '' }, maintainDc: 0 } }).errors.map(e => e.path))
      .toEqual(['$.endurance.improveDc.text', '$.endurance.maintainDc'])

    const template = {
      id: 'elite-dragon', name: 'Elite Dragon', kind: 'functional', role: 'any', raisesRank: true,
      prerequisite: { text: 'Solo dragon', check: { kind: 'all', of: [
        { kind: 'rank', any: ['solo'] }, { kind: 'not', of: { kind: 'keyword', any: ['devil'] } },
        { kind: 'any-of', of: [{ kind: 'keyword', any: ['dragon'] }] },
      ] } },
      senses: [], defenses: {}, hpPerLevel: 8, savingThrows: 2, actionPoints: 1, immune: [], resist: [], vulnerable: [],
      traits: [], auras: [], powers: [], description: '', sources: [{ book: 'DMG' }], provenance: prov,
    }
    expect(validateEntry('templates', template).errors).toEqual([])
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

  it('checks XP up to level 40', () => {
    const epic = { level: 35, xp: 47000, hp: 260, defenses: { ac: 49, fortitude: 46, reflex: 44, will: 44 } }
    expect(checkMonsterBands(monster(epic)).filter(f => f.rule === 'xp')).toEqual([])
    expect(checkMonsterBands(monster({ ...epic, xp: 19000 })).filter(f => f.rule === 'xp')[0].message).toMatch(/expected 47000/)
  })
})
