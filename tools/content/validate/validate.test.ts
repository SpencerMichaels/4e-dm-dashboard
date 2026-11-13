import { describe, expect, it } from 'vitest'
import type { Monster } from '@kit'
import { checkMonsterBands, diceAverage } from './bands'
import { validateEntry } from './index'
import { checkLineSpans, spanProblem } from './spans'

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
      auras: [],
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
      id: 'elite-dragon', name: 'Elite Dragon', kind: 'functional', role: 'any', rankChange: 'down',
      prerequisite: { text: 'Solo dragon', check: { kind: 'all', of: [
        { kind: 'rank', any: ['solo'] }, { kind: 'not', of: { kind: 'keyword', any: ['devil'] } },
        { kind: 'any-of', of: [{ kind: 'keyword', any: ['dragon'] }] },
      ] } },
      senses: [], defenses: {}, hpPerLevel: 8, savingThrows: 2, actionPoints: 1, immune: [], resist: [], vulnerable: [],
      traits: [], auras: [], powers: [], description: '', sources: [{ book: 'DMG' }], provenance: prov,
    }
    expect(validateEntry('templates', template).errors).toEqual([])
    expect(validateEntry('templates', { ...template, rankChange: undefined, raisesRank: true }).errors.map(e => e.path))
      .toEqual(['$.raisesRank', '$.rankChange'])
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

describe('schema v3', () => {
  it('accepts the new clause kinds, durations, Who values and power fields', () => {
    const m = monster({ sources: [{ book: 'The Book of Vile Darkness', page: '2-77' }] })
    const text = 'The dragon uses bite twice. Its breath recharges, and each creature in the zone loses a healing surge and has partial concealment. It makes a saving throw with a +2 bonus. Two kobolds appear. (crit 2d8 + 11) Allies in the aura gain a +2 bonus to attack rolls and damage rolls.'
    const at = (s: string): [number, number] => [text.indexOf(s), text.indexOf(s) + s.length]
    m.powers[0].usesPerRound = 1
    m.powers[0].effect = { text, clauses: [
      { at: at('uses bite twice'), kind: 'use-power', power: 'Bite', times: 2, who: 'self' },
      { at: at('Its breath recharges'), kind: 'recharge-power', power: 'Breath' },
      { at: at('loses a healing surge'), kind: 'lose-healing-surge', count: 1, who: 'creatures-in-area', if: 'in the zone' },
      { at: at('has partial concealment'), kind: 'concealment', who: 'creatures-in-area', duration: { kind: 'while-in-aura' } },
      { at: at('makes a saving throw with a +2 bonus'), kind: 'saving-throw', bonus: 2, who: 'self' },
      { at: at('Two kobolds appear'), kind: 'summon', creature: 'kobold', count: 2 },
      { at: at('(crit 2d8 + 11)'), kind: 'damage', dice: '2d8+11', types: [], who: 'target', critical: true },
      { at: at('+2 bonus to attack rolls and damage rolls'), kind: 'modifier', stat: ['attack', 'damage'], value: 2, who: 'allies-in-area', duration: { kind: 'permanent' }, saveGroup: 'a' },
      { at: at('in the zone'), kind: 'zone', duration: { kind: 'encounter' } },
    ] }
    expect(validateEntry('monsters', m).errors).toEqual([])
  })

  it('rejects unknown clause fields (such as a leftover quote) and bad v3 values', () => {
    const m = monster()
    const cl = m.powers[0].attacks[0].hit!.clauses[0] as any
    cl.quote = '2d8 + 4 damage'
    cl.extra = false
    m.powers[0].usesPerRound = 0
    expect(validateEntry('monsters', m).errors.map(e => e.path)).toEqual(expect.arrayContaining([
      '$.powers[0].usesPerRound', '$.powers[0].attacks[0].hit.clauses[0].quote', '$.powers[0].attacks[0].hit.clauses[0].extra',
    ]))
  })

  it('accepts trap auras, terrain usage, the triggered action and the new item fields', () => {
    const prov = { origin: 'parser', by: 'tools/content@test', at: '2026-11-12' }
    const trap = {
      id: 'trap1', name: 'Pit', kind: 'terrain', usage: 'single-use', level: 1, role: 'obstacle', rank: 'standard', xp: 100,
      detect: [], immune: [], resist: [], traits: [],
      auras: [{ name: 'Spores', keywords: [], range: 1, text: { text: 'Creatures in the aura are slowed.', clauses: [] } }],
      powers: [{ name: 'Collapse', action: 'triggered', usage: 'at-will', keywords: [], attacks: [] }],
      countermeasures: [], flavor: '', description: '', sources: [{ book: 'DMG' }], provenance: prov,
    }
    expect(validateEntry('traps', trap).errors).toEqual([])
    expect(validateEntry('traps', { ...trap, usage: 'once' }).errors.map(e => e.path)).toEqual(['$.usage'])
    const item = {
      id: 'item1', name: 'Alchemist\'s Fire', category: 'alchemical', level: 1, rarity: null, levels: [{ level: 1, price: 20 }],
      properties: [], propertyLevelSteps: [{ level: 11, text: 'Resist 10' }], weight: '1 lb.',
      special: { text: 'You cannot use more than one.', clauses: [] }, requirement: { text: 'You must be a living construct.', clauses: [] },
      powers: [], alchemical: { type: 'Volatile', formulaCost: '20 gp' }, flavor: '', description: [], sources: [{ book: 'AV' }], provenance: prov,
    }
    expect(validateEntry('items', item).errors).toEqual([])
    expect(validateEntry('items', { ...item, alchemical: { cost: 1 } }).errors.map(e => e.path)).toEqual(['$.alchemical.cost'])
  })
})

describe('span keywords', () => {
  const ok = (clause: any, span: string) => expect(spanProblem(clause, span)).toBeUndefined()
  const bad = (clause: any, span: string) => expect(spanProblem(clause, span)).toBeDefined()
  const cond = (condition: string) => ({ kind: 'condition', condition, who: 'target', duration: { kind: 'save-ends' } })

  it('accepts inflections and common phrasings of conditions', () => {
    ok(cond('grabbed'), 'The devil grabs the target')
    ok(cond('grabbed'), 'the target is grabbed')
    ok(cond('prone'), 'knocks the target prone')
    ok(cond('prone'), 'is knocked prone')
    ok(cond('dazed'), 'dazes the target')
    ok(cond('stunned'), 'stuns it')
    ok(cond('immobilized'), 'immobilizes the target')
    ok(cond('marked'), 'marks the target')
    ok(cond('slowed'), 'slows each enemy')
    ok(cond('weakened'), 'weakens the target')
    ok(cond('petrified'), 'petrifies the target')
    ok(cond('removed-from-play'), 'is removed from play')
    ok(cond('dominated'), 'dominates the target')
    ok(cond('blinded'), 'blinds the target')
    bad(cond('grabbed'), 'the target is restrained')
    bad(cond('dazed'), 'the target is stunned')
    bad(cond('slowed'), 'slowly')
  })

  it('accepts forms of movement, healing and the other kinds', () => {
    ok({ kind: 'forced-move', move: 'push', squares: 2, who: 'target' }, 'the target is pushed 2 squares')
    ok({ kind: 'forced-move', move: 'slide', squares: 3, who: 'target' }, 'slides the target three squares')
    ok({ kind: 'forced-move', move: 'slide', squares: 1, who: 'target' }, 'is slid 1 square')
    ok({ kind: 'forced-move', move: 'pull', squares: 1, who: 'target' }, 'pulls the target')
    bad({ kind: 'forced-move', move: 'push', squares: 3, who: 'target' }, 'pushes the target 2 squares')
    ok({ kind: 'move', move: 'shift', who: 'self' }, 'shifts up to its speed')
    ok({ kind: 'move', move: 'teleport', squares: 5, who: 'self' }, 'teleports 5 squares')
    ok({ kind: 'move', move: 'swap', who: 'self' }, 'switches places with an ally')
    ok({ kind: 'heal', amount: 10, who: 'self' }, 'regains 10 hit points')
    ok({ kind: 'temp-hp', amount: 5, who: 'ally' }, 'gains 5 temporary hit points')
    ok({ kind: 'grants-ca', to: 'source', who: 'target', duration: { kind: 'permanent' } }, 'gains combat advantage against the target')
    ok({ kind: 'saving-throw', who: 'self' }, 'saves')
    bad({ kind: 'grants-ca', to: 'source', who: 'target', duration: { kind: 'permanent' } }, 'flanks the target')
  })

  it('checks the v4 kinds', () => {
    const turn = { kind: 'turn-end', whose: 'source', next: true }
    ok({ kind: 'redirect-attack', who: 'self' }, 'The triggering attack targets the guard instead')
    bad({ kind: 'redirect-attack', who: 'self' }, 'The guard shifts 1 square')
    ok({ kind: 'crit-range', min: 18, who: 'self', duration: turn }, 'scores a critical hit on a roll of 18-20')
    bad({ kind: 'crit-range', min: 19, who: 'self', duration: turn }, 'scores a critical hit on a roll of 18-20')
    ok({ kind: 'power-restriction', what: ['encounter', 'daily'], who: 'target', duration: turn }, 'cannot use encounter or daily powers')
    ok({ kind: 'power-restriction', what: 'attack', who: 'self', duration: turn }, 'can’t attack')
    bad({ kind: 'power-restriction', what: 'daily', who: 'target', duration: turn }, "can't use encounter powers")
    ok({ kind: 'status', status: 'phasing', who: 'self', duration: turn }, 'gains phasing')
    ok({ kind: 'status', status: 'insubstantial', who: 'self', duration: turn }, 'becomes insubstantial')
    ok({ kind: 'opportunity-reach', who: 'self' }, 'can make opportunity attacks against all enemies within its reach')
    ok({ kind: 'damage', dice: '4d10+6', types: [], typeChoice: ['acid', 'fire'], who: 'target' }, '4d10 + 6 damage of one of the following types')
    bad({ kind: 'damage', dice: '4d10+6', types: [], typeChoice: ['acid', 'fire'], who: 'target' }, '4d10 + 6 damage')
  })
})

describe('schema v4', () => {
  it('accepts the new clause kinds, typeChoice, perTarget, until, inline sustain and skillNotes', () => {
    const m = monster({ skillNotes: ['+5 to Stealth checks when in ice or snow'] })
    const text = 'Resist 30 to one of the following damage types: acid or fire. It regains 5 hit points for each creature damaged. It becomes insubstantial until it attacks.'
    const at = (s: string): [number, number] => [text.indexOf(s), text.indexOf(s) + s.length]
    m.powers[0].sustain = { action: 'minor' }
    m.powers[0].effect = { text, clauses: [
      { at: at('Resist 30 to one of the following damage types: acid or fire'), kind: 'resistance', type: 'choice', typeChoice: ['acid', 'fire'], value: 30, who: 'self', duration: { kind: 'encounter' } },
      { at: at('regains 5 hit points for each creature damaged'), kind: 'heal', amount: 5, who: 'self', perTarget: true },
      { at: at('becomes insubstantial until it attacks'), kind: 'status', status: 'insubstantial', who: 'self', duration: { kind: 'until', text: 'until it attacks' } },
    ] }
    expect(validateEntry('monsters', m).errors).toEqual([])
  })

  it('rejects malformed v4 values', () => {
    const m = monster()
    m.powers[0].attacks[0].hit!.clauses = [
      { at: [0, 14], kind: 'damage', dice: '2d8+4', types: ['fire'], typeChoice: ['acid'], who: 'target' } as any,
    ]
    m.powers[0].effect = { text: 'x', clauses: [
      { at: [0, 1], kind: 'resistance', type: 'fire', typeChoice: ['acid', 'cold'], value: 5, who: 'self', duration: { kind: 'until' } } as any,
      { at: [0, 1], kind: 'status', status: 'flying', who: 'self', duration: { kind: 'permanent' } } as any,
      { at: [0, 1], kind: 'crit-range', min: 21, who: 'self', duration: { kind: 'permanent' } } as any,
      { at: [0, 1], kind: 'power-restriction', what: ['at-will'], who: 'self', duration: { kind: 'save-ends', whose: 'source' } } as any,
    ] }
    const paths = validateEntry('monsters', m).errors.map(e => e.path)
    for (const p of ['hit.clauses[0].typeChoice', 'hit.clauses[0].types', 'effect.clauses[0].type', 'effect.clauses[0].duration.text',
      'effect.clauses[1].status', 'effect.clauses[2].min', 'effect.clauses[3].what[0]', 'effect.clauses[3].duration.whose']) {
      expect(paths).toContain(`$.powers[0].${p.startsWith('hit') ? 'attacks[0].' : ''}${p}`)
    }
  })

  it('accepts a trap speed', () => {
    const prov = { origin: 'parser', by: 'tools/content@test', at: '2026-11-12' }
    const trap = {
      id: 'trap1', name: 'Curse', kind: 'hazard', level: 1, role: 'lurker', rank: 'standard', xp: 100, speed: { walk: 0, fly: 4, notes: '(hover)' },
      detect: [], immune: [], resist: [], traits: [], auras: [], powers: [], countermeasures: [], flavor: '', description: '',
      sources: [{ book: 'DMG' }], provenance: prov,
    }
    expect(validateEntry('traps', trap).errors).toEqual([])
    expect(validateEntry('traps', { ...trap, speed: { fly: 4 } }).errors.map(e => e.path)).toEqual(['$.speed.walk'])
  })
})
