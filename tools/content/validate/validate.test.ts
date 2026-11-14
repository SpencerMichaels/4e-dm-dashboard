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

describe('schema v5', () => {
  it("accepts altBonus and 'unknown' vs/usage, and flags 'unknown' for review", () => {
    const m = monster()
    m.powers[0].usage = 'unknown'
    m.powers[0].attacks[0].vs = 'unknown'
    m.powers[0].attacks[0].altBonus = [{ value: 10, if: 'while bloodied' }, { value: 9, if: 'if the target is bloodied', vs: 'reflex' }]
    const { errors, flags } = validateEntry('monsters', m)
    expect(errors).toEqual([])
    expect(flags.filter(f => f.rule === 'unknown').map(f => f.path)).toEqual(['$.powers[0].usage', '$.powers[0].attacks[0].vs'])
    // No attack band for an unknown defense.
    expect(flags.filter(f => f.rule === 'attack')).toEqual([])
  })

  it('rejects malformed altBonus entries', () => {
    const m = monster()
    m.powers[0].attacks[0].altBonus = [{ value: 'x', if: '', vs: 'any', extra: 1 } as any]
    const paths = validateEntry('monsters', m).errors.map(e => e.path)
    for (const p of ['value', 'if', 'vs', 'extra']) expect(paths).toContain(`$.powers[0].attacks[0].altBonus[0].${p}`)
  })
})

describe('schema v6: if / unless / optional', () => {
  const text = 'At the start of an encounter, the wolf deals 2d6 + 3 extra damage against any enemy that has not yet acted during the encounter. The target is slowed (save ends). If the target is already slowed, it is instead immobilized. The wolf can shift 4 squares.'
  const at = (s: string): [number, number] => [text.indexOf(s), text.indexOf(s) + s.length]
  function withClauses(clauses: any[]) {
    const m = monster()
    m.powers[0].effect = { text, clauses }
    return validateEntry('monsters', m).errors
  }
  const damage = { at: at('2d6 + 3 extra damage'), kind: 'damage', dice: '2d6+3', types: [], who: 'target', extra: true }
  const slowed = { at: at('slowed (save ends)'), kind: 'condition', condition: 'slowed', who: 'target', duration: { kind: 'save-ends' } }
  const shift = { at: at('can shift 4 squares'), kind: 'move', move: 'shift', squares: 4, who: 'self', optional: true }

  it('accepts split fragments, unless and optional', () => {
    expect(withClauses([
      { ...damage, if: ['At the start of an encounter', 'against any enemy that has not yet acted during the encounter'] },
      { ...slowed, unless: 'If the target is already slowed' },
      shift,
    ])).toEqual([])
  })

  it('matches fragments ignoring case, dashes and dice spacing', () => {
    expect(withClauses([{ ...slowed, if: 'AT THE START OF AN ENCOUNTER' }])).toEqual([])
    expect(withClauses([{ ...slowed, if: 'deals 2d6+3' }])).toEqual([])
  })

  it('rejects joins, "not:" prefixes, missing words, empty fragments and overlap with the own quote', () => {
    const messages = (cl: any) => withClauses([cl]).map(e => e.message).join('\n')
    expect(messages({ ...damage, if: 'At the start of an encounter ... against any enemy' })).toMatch(/do not join fragments/)
    expect(messages({ ...damage, if: 'At the start of an encounter … against any enemy' })).toMatch(/do not join fragments/)
    expect(messages({ ...slowed, if: 'not: If the target is already slowed' })).toMatch(/"not:" prefix.*unless/)
    expect(messages({ ...slowed, unless: 'if the target is bloodied' })).toMatch(/not in the line text/)
    expect(messages({ ...shift, if: 'can shift' })).toMatch(/overlaps the clause's own quote.*optional/)
    expect(withClauses([{ ...slowed, if: '' }]).map(e => e.path)).toEqual(['$.powers[0].effect.clauses[0].if'])
    expect(withClauses([{ ...slowed, unless: [] }]).map(e => e.path)).toEqual(['$.powers[0].effect.clauses[0].unless'])
    expect(withClauses([{ ...slowed, optional: false }]).map(e => e.path)).toEqual(['$.powers[0].effect.clauses[0].optional'])
  })

  it('accepts a fragment that also occurs outside the own quote', () => {
    const t = 'The target is slowed. If the target is slowed, it takes 5 damage.'
    const m = monster()
    m.powers[0].effect = { text: t, clauses: [{ at: [t.indexOf('it takes'), t.length - 1], kind: 'damage', dice: '5', types: [], who: 'target', if: 'the target is slowed' }] }
    expect(validateEntry('monsters', m).errors).toEqual([])
  })
})

describe('schema v7', () => {
  /** A hit line with clauses given as [quote, fields]; spans are found in order. */
  function hit(text: string, clauses: [string, any][]) {
    let from = 0
    const m = monster()
    m.powers[0].attacks[0].hit = { text, clauses: clauses.map(([q, cl]) => {
      const start = text.indexOf(q, from)
      from = start + q.length
      return { at: [start, start + q.length], ...cl }
    }) }
    return validateEntry('monsters', m).errors
  }
  const dmg = (dice: string, types: string[] = []) => ({ kind: 'damage', dice, types, who: 'target' })
  const ongoing = (amount: number, types: string[]) => ({ kind: 'ongoing-damage', amount, types, who: 'target', duration: { kind: 'save-ends' } })

  it('structures multi-part damage: a damage quote needs the dice, not the word "damage"', () => {
    expect(hit('2d8+10 plus 2d6 lightning damage, and the target is pushed 3 squares.', [
      ['2d8+10', dmg('2d8+10')], ['2d6 lightning damage', dmg('2d6', ['lightning'])],
      ['pushed 3 squares', { kind: 'forced-move', move: 'push', squares: 3, who: 'target' }],
    ])).toEqual([])
    expect(hit('1d10+6 and ongoing 5 poison damage (save ends).', [
      ['1d10+6', dmg('1d10+6')], ['ongoing 5 poison damage (save ends)', ongoing(5, ['poison'])],
    ])).toEqual([])
    expect(hit('1d8+5 plus 1d10 cold damage.', [['1d8+5', dmg('1d8+5')], ['1d10 cold damage', dmg('1d10', ['cold'])]])).toEqual([])
    expect(hit('3d6 + 7 damage, or 5d6 + 7 against a prone target.', [
      ['3d6 + 7 damage', { ...dmg('3d6+7'), unless: 'against a prone target' }],
      ['5d6 + 7', { ...dmg('5d6+7'), if: 'against a prone target' }],
    ])).toEqual([])
  })

  it('takes a damage type from the clause or the words after it, and matches whole dice', () => {
    expect(hit('2d6 + 5 or 3d6 + 5 fire damage.', [['2d6 + 5', dmg('2d6+5', ['fire'])], ['3d6 + 5 fire damage', dmg('3d6+5', ['fire'])]])).toEqual([])
    expect(hit('5 fire damage plus 2d6 damage.', [['5 fire damage', dmg('5', ['fire'])], ['2d6 damage', dmg('2d6', ['fire'])]])
      .map(e => e.message)).toEqual([expect.stringMatching(/type "fire" not in span or the words after it/)])
    expect(spanProblem(dmg('10') as any, '2d8+10')).toMatch(/dice "10" not in span/)
    expect(spanProblem(dmg('1d10') as any, '1d10+6')).toMatch(/not in span/)
    expect(spanProblem(dmg('2d8+1') as any, '2d8+10')).toMatch(/not in span/)
    expect(spanProblem(dmg('5', ['cold']) as any, 'deals +5 cold damage')).toBeUndefined()
    expect(spanProblem(dmg('10', ['fire']) as any, 'takes 10 fire damage')).toBeUndefined()
    expect(spanProblem({ ...dmg('2d12+18'), critical: true } as any, '(crit 2d12 + 18)')).toBeUndefined()
    expect(spanProblem({ ...dmg('2d12+18'), critical: true } as any, '2d12 + 18')).toMatch(/crit/)
  })

  it('accepts difficult-terrain, fly/move, no-provoke, who lists and escapeDc', () => {
    const turn = { kind: 'turn-end', whose: 'source', next: true }
    expect(spanProblem({ kind: 'difficult-terrain', who: 'enemies-in-area', duration: { kind: 'permanent' } } as any, 'is difficult terrain for enemies')).toBeUndefined()
    expect(spanProblem({ kind: 'difficult-terrain', duration: { kind: 'permanent' } } as any, 'is hindering terrain')).toMatch(/difficult terrain/)
    expect(spanProblem({ kind: 'move', move: 'fly', squares: 12, who: 'self' } as any, 'flies up to 12 squares')).toBeUndefined()
    expect(spanProblem({ kind: 'move', move: 'move', who: 'self' } as any, 'moves its speed')).toBeUndefined()
    expect(spanProblem({ kind: 'move', move: 'move', squares: 5, who: 'self' } as any, 'jumps 5 squares')).toBeUndefined()
    expect(spanProblem({ kind: 'move', move: 'fly', who: 'self' } as any, 'shifts 2 squares')).toMatch(/no "fly"/)
    expect(spanProblem({ kind: 'status', status: 'no-provoke', who: 'self', duration: { kind: 'instant' } } as any, 'without provoking opportunity attacks')).toBeUndefined()
    expect(spanProblem({ kind: 'condition', condition: 'grabbed', who: 'target', duration: { kind: 'indefinite' }, escapeDc: 19 } as any, 'the target is grabbed (escape DC 19)')).toBeUndefined()
    expect(spanProblem({ kind: 'condition', condition: 'grabbed', who: 'target', duration: { kind: 'indefinite' }, escapeDc: 20 } as any, 'the target is grabbed (escape DC 19)')).toMatch(/escape DC 20/)

    const m = monster()
    const t = 'The overseer and one ally turn invisible until the end of the overseer\'s next turn. The ground in the aura is difficult terrain for enemies.'
    m.powers[0].effect = { text: t, clauses: [
      { at: [t.indexOf('turn invisible'), t.indexOf('turn invisible') + 14], kind: 'condition', condition: 'invisible', who: ['self', 'ally'], duration: turn } as any,
      { at: [t.indexOf('is difficult'), t.length - 1], kind: 'difficult-terrain', who: 'enemies-in-area', duration: { kind: 'permanent' } } as any,
    ] }
    m.auras = [{ name: 'Flaming Body', keywords: ['fire'], range: 2, rangeIf: [{ value: 3, if: 'while the balor is bloodied' }], text: { text: 'Fire.', clauses: [] } }]
    expect(validateEntry('monsters', m).errors).toEqual([])
  })

  it('rejects malformed v7 values', () => {
    const m = monster()
    const cl = (over: any) => ({ at: [0, 14], kind: 'condition', condition: 'dazed', who: 'target', duration: { kind: 'save-ends' }, ...over })
    m.powers[0].attacks[0].hit = { text: '2d8 + 4 damage.', clauses: [cl({ who: [] }), cl({ who: ['self', 'self'] }), cl({ who: ['self', 'foe'] }), cl({ escapeDc: 12 })] }
    m.auras = [{ name: 'A', keywords: [], range: 2, rangeIf: [{ value: 3 }, { value: 3, if: [] }], text: { text: '', clauses: [] } } as any]
    const paths = validateEntry('monsters', m).errors.map(e => e.path)
    for (const p of ['clauses[0].who', 'clauses[1].who', 'clauses[2].who[1]']) expect(paths).toContain(`$.powers[0].attacks[0].hit.${p}`)
    expect(paths).toEqual(expect.arrayContaining(['$.auras[0].rangeIf[0].if', '$.auras[0].rangeIf[1].if']))
  })
})

describe('schema v8', () => {
  const p = (cl: any, span: string, after = '') => spanProblem(cl, span, after)

  it('checks the keywords of charge, disease, reroll and action-point', () => {
    expect(p({ kind: 'charge', who: 'self' }, 'charges and makes the following attack')).toBeUndefined()
    expect(p({ kind: 'charge', who: 'self' }, 'shifts and makes the following attack')).toMatch(/charge/)
    const rot = { kind: 'disease', disease: 'mummy rot', who: 'target' }
    expect(p(rot, 'the target contracts level 6 mummy rot')).toBeUndefined()
    expect(p({ ...rot, disease: 'Mummy  Rot' }, 'contracts mummy rot')).toBeUndefined()
    expect(p(rot, 'contracts filth fever')).toMatch(/disease "mummy rot" not in span/)
    expect(p({ ...rot, disease: 'werewolf moon frenzy', stage: 1 }, 'contracts werewolf moon frenzy (stage 1)')).toBeUndefined()
    expect(p({ ...rot, stage: 2 }, 'contracts mummy rot (stage 1)')).toMatch(/stage 2/)
    expect(p({ kind: 'reroll', what: 'attack', who: 'other' }, 'forces the attacker to reroll the attack')).toBeUndefined()
    expect(p({ kind: 'reroll', what: 'save', who: 'self', keep: 'higher' }, 'rolls again and uses the higher result')).toBeUndefined()
    expect(p({ kind: 'reroll', what: 'attack', who: 'other' }, 'the attack misses')).toMatch(/reroll/)
    expect(p({ kind: 'action-point', amount: 1, who: 'self' }, 'gains 1 action point')).toBeUndefined()
    expect(p({ kind: 'action-point', amount: 1, who: 'self' }, 'gains an action point')).toBeUndefined()
    expect(p({ kind: 'action-point', amount: 2, who: 'self' }, 'gains an action point')).toMatch(/amount 2/)
    expect(p({ kind: 'action-point', amount: 1, who: 'self' }, 'gains 1 extra action')).toMatch(/action point/)
  })

  it('finds an escape DC later in the grab sentence, not in the next one', () => {
    const grab = { kind: 'condition', condition: 'grabbed', who: 'target', duration: { kind: 'indefinite' }, escapeDc: 21 }
    expect(p(grab, 'the target is grabbed', ' and takes ongoing 10 fire damage until it escapes (DC 21).')).toBeUndefined()
    expect(p(grab, 'the target is restrained (until it escapes (DC 21))'.replace('restrained', 'grabbed'))).toBeUndefined()
    expect(p(grab, 'the target is grabbed', '. The dragon can escape DC 21.')).toMatch(/escape DC 21/)
  })

  it('accepts the v8 fields, Who values, this-power duration and savingThrowNotes', () => {
    const m = monster()
    const t = 'The hippogriff charges and makes the following attack, and its rider gains 1 action point. Each attack is at a -2 penalty, and the target contracts mummy rot (stage 1). The attacker must reroll the attack and use the second result.'
    const at = (q: string) => { const i = t.indexOf(q); return [i, i + q.length] }
    m.powers[0].effect = { text: t, clauses: [
      { at: at('charges'), kind: 'charge', who: 'self', optional: true },
      { at: at('gains 1 action point'), kind: 'action-point', amount: 1, who: 'rider' },
      { at: at('-2 penalty'), kind: 'modifier', stat: 'attack', value: -2, who: 'self', duration: { kind: 'this-power' } },
      { at: at('contracts mummy rot (stage 1)'), kind: 'disease', disease: 'mummy rot', diseaseId: 'disease30', stage: 1, who: 'target' },
      { at: at('must reroll the attack'), kind: 'reroll', what: 'attack', keep: 'new', who: ['other', 'mount'] },
    ] } as any
    ;(m as any).savingThrowNotes = ['+5 against fear effects']
    expect(validateEntry('monsters', m).errors).toEqual([])
  })

  it('rejects malformed v8 values', () => {
    const m = monster()
    const t = '2d8 + 4 damage.'
    m.powers[0].attacks[0].hit = { text: t, clauses: [
      { at: [0, 3], kind: 'disease', disease: '', stage: -1, who: 'target' },
      { at: [0, 3], kind: 'reroll', what: 'initiative', keep: 'best', who: 'self' },
      { at: [0, 3], kind: 'action-point', amount: 0, who: 'driver' },
      { at: [0, 3], kind: 'charge' },
    ] } as any
    ;(m as any).savingThrowNotes = ['']
    const paths = validateEntry('monsters', m).errors.map(e => e.path)
    for (const q of ['clauses[0].disease', 'clauses[0].stage', 'clauses[1].what', 'clauses[1].keep', 'clauses[2].amount', 'clauses[2].who', 'clauses[3].who']) {
      expect(paths).toContain(`$.powers[0].attacks[0].hit.${q}`)
    }
    expect(paths).toContain('$.savingThrowNotes[0]')
  })
})

describe('schema v9', () => {
  const p = (cl: any, span: string, after = '') => spanProblem(cl, span, after)

  it('checks the sense keyword and range, "halved" and "roll ... again"', () => {
    const sense = { kind: 'sense', sense: 'tremorsense', range: 10, who: 'self', duration: { kind: 'permanent' } }
    expect(p(sense, 'gains tremorsense 10')).toBeUndefined()
    expect(p(sense, 'gains tremorsense 5')).toMatch(/range 10/)
    expect(p({ ...sense, sense: 'truesight' }, 'gains tremorsense 10')).toMatch(/truesight/)
    expect(p({ ...sense, sense: 'low-light-vision', range: undefined }, 'has low-light vision')).toBeUndefined()
    const invisible = { kind: 'sense', sense: 'see-invisible', who: 'self', duration: { kind: 'permanent' } }
    expect(p(invisible, 'can see invisible creatures and objects')).toBeUndefined()
    expect(p(invisible, 'sees through illusions')).toMatch(/see invisible/)
    expect(p({ kind: 'half-damage' }, 'the damage is halved')).toBeUndefined()
    expect(p({ kind: 'half-damage' }, 'takes half as much damage')).toBeUndefined()
    expect(p({ kind: 'half-damage' }, 'takes no damage')).toMatch(/half/)
    expect(p({ kind: 'reroll', what: 'attack', who: 'self' }, 'can roll the attack again')).toBeUndefined()
    expect(p({ kind: 'reroll', what: 'attack', who: 'self' }, 'can roll the attack. It attacks again')).toMatch(/reroll/)
  })

  it('accepts sense clauses and defensesIf, and rejects malformed ones', () => {
    const m = monster()
    const t = 'The wraith gains tremorsense 10 and can see invisible creatures.'
    const at = (q: string) => { const i = t.indexOf(q); return [i, i + q.length] }
    m.powers[0].effect = { text: t, clauses: [
      { at: at('gains tremorsense 10'), kind: 'sense', sense: 'tremorsense', range: 10, who: 'self', duration: { kind: 'permanent' } },
      { at: at('can see invisible creatures'), kind: 'sense', sense: 'see-invisible', who: 'self', duration: { kind: 'permanent' } },
    ] } as any
    ;(m as any).defensesIf = [{ defense: 'ac', value: 28, if: 'against opportunity attacks' }, { defense: 'fortitude', value: 25, if: ['while bloodied'] }]
    expect(validateEntry('monsters', m).errors).toEqual([])

    m.powers[0].effect = { text: t, clauses: [{ at: [0, 3], kind: 'sense', sense: 'x-ray', range: 0, who: 'self' }] } as any
    ;(m as any).defensesIf = [{ defense: 'armor', value: -1, if: '' }, { defense: 'ac', value: 20, if: [], note: 'x' }]
    const paths = validateEntry('monsters', m).errors.map(e => e.path)
    for (const q of ['clauses[0].sense', 'clauses[0].range', 'clauses[0].duration']) expect(paths).toContain(`$.powers[0].effect.${q}`)
    for (const q of ['[0].defense', '[0].value', '[0].if', '[1].if', '[1].note']) expect(paths).toContain(`$.defensesIf${q}`)
  })
})

describe('schema v10', () => {
  const p = (cl: unknown, span: string, after = '') => spanProblem(cl as any, span, after)
  const t = 'The target slides 4 squares or is knocked prone.'
  const at = (q: string, text = t) => { const i = text.indexOf(q); return [i, i + q.length] }
  const choice = (options: unknown[][], q = 'slides 4 squares or is knocked prone') => ({ at: at(q), kind: 'choice', options })
  const slide = { at: at('slides 4 squares'), kind: 'forced-move', move: 'slide', squares: 4, who: 'target' }
  const prone = { at: at('knocked prone'), kind: 'condition', condition: 'prone', who: 'target', duration: { kind: 'indefinite' } }
  const errors = (clauses: unknown[], text = t) => {
    const m = monster()
    m.powers[0].effect = { text, clauses } as any
    return validateEntry('monsters', m).errors
  }

  it('accepts a choice whose options lie inside its span', () => {
    expect(errors([choice([[slide], [prone]])])).toEqual([])
    expect(errors([{ ...choice([[slide], [{ at: at('knocked prone'), kind: 'unparsed', text: 'knocked prone' }]]), chooser: 'target' }])).toEqual([])
  })

  it('rejects options outside the span, overlapping options, nesting, one option and no "or"', () => {
    const short = errors([choice([[slide], [prone]], 'slides 4 squares or is knocked')])
    expect(short.map(e => e.message).join('\n')).toMatch(/outside its choice's span/)
    const overlap = errors([choice([[slide], [{ ...prone, at: at('squares or is knocked prone') }]])])
    expect(overlap.map(e => e.message).join('\n')).toMatch(/overlaps another option/)
    const nested = errors([choice([[slide], [choice([[prone], [prone]])]])])
    expect(nested.map(e => e.message).join('\n')).toMatch(/cannot hold another choice/)
    expect(errors([choice([[slide]])]).map(e => e.message).join('\n')).toMatch(/two or more options/)
    expect(errors([{ ...choice([[slide], [prone]]), chooser: 'dm' }]).map(e => e.path)).toContain('$.powers[0].effect.clauses[0].chooser')
    expect(p({ kind: 'choice', options: [] }, 'slides 4 squares and is knocked prone')).toMatch(/"or"/)
    expect(p({ kind: 'choice', options: [] }, 'either slides 4 squares')).toBeUndefined()
  })

  it('accepts third-party grants-ca, check stats and reroll lists', () => {
    const text = "The dire wolf's rider gains combat advantage against the target, a +2 bonus to Athletics checks and Strength checks, and can reroll an attack roll or save."
    expect(errors([
      { at: at('gains combat advantage', text), kind: 'grants-ca', to: 'rider', who: 'target', duration: { kind: 'permanent' } },
      { at: at('+2 bonus to Athletics checks and Strength checks', text), kind: 'modifier', stat: ['skill:athletics', 'ability:str'], value: 2, who: 'rider', duration: { kind: 'permanent' } },
      { at: at('can reroll an attack roll or save', text), kind: 'reroll', what: ['attack', 'save'], who: 'rider', optional: true },
    ], text)).toEqual([])
    const bad = errors([{ at: at('gains combat advantage', text), kind: 'modifier', stat: ['skill:flying', 'ability:luck'], value: 2, who: 'rider', duration: { kind: 'permanent' } }], text)
    expect(bad.map(e => e.path)).toEqual(expect.arrayContaining(['$.powers[0].effect.clauses[0].stat[0]', '$.powers[0].effect.clauses[0].stat[1]']))
  })

  it('needs the skill or ability name for a check stat, and reads "asleep" as unconscious', () => {
    const mod = { kind: 'modifier', stat: 'skill:stealth', value: 5, who: 'self', duration: { kind: 'permanent' } }
    expect(p(mod, '+5 bonus to Stealth checks')).toBeUndefined()
    expect(p(mod, '+5 bonus', ' to Stealth checks.')).toBeUndefined()
    expect(p(mod, '+5 bonus to Perception checks')).toMatch(/stealth/)
    expect(p({ ...mod, stat: 'ability:str' }, '+5 bonus to Strength checks')).toBeUndefined()
    expect(p({ ...mod, stat: 'skill-checks' }, '+5 bonus to all skill checks')).toBeUndefined()
    const asleep = { kind: 'condition', condition: 'unconscious', who: 'target', duration: { kind: 'until', text: 'until woken' } }
    expect(p(asleep, 'falls asleep until woken')).toBeUndefined()
    expect(p(asleep, 'falls down')).toMatch(/unconscious/)
  })
})

describe('schema v11', () => {
  const p = (cl: unknown, span: string, after = '', before = '') => spanProblem(cl as any, span, after, before)
  const at = (q: string, text: string) => { const i = text.indexOf(q); return [i, i + q.length] }
  const errors = (clauses: unknown[], text: string) => {
    const m = monster()
    m.powers[0].effect = { text, clauses } as any
    return validateEntry('monsters', m).errors
  }

  it('accepts speed clauses and checks the mode word, number and hover', () => {
    const fly = { kind: 'speed', mode: 'fly', value: 12, who: 'self', duration: { kind: 'encounter' } }
    expect(p(fly, 'gains a fly speed of 12')).toBeUndefined()
    expect(p({ ...fly, value: 8, hover: true }, 'gains fly 8 (hover)')).toBeUndefined()
    expect(p({ ...fly, hover: true }, 'gains a fly speed of 12')).toMatch(/hover/)
    expect(p({ ...fly, mode: 'climb', value: undefined }, 'gains a climb speed equal to its speed')).toBeUndefined()
    expect(p({ ...fly, mode: 'swim' }, 'gains a fly speed of 12')).toMatch(/no "swim"/)
    expect(p({ ...fly, value: 10 }, 'gains a fly speed of 12')).toMatch(/10 not in span/)
    const text = 'The dragon gains a fly speed of 12 until the end of the encounter.'
    expect(errors([{ at: at('gains a fly speed of 12 until the end of the encounter', text), ...fly }], text)).toEqual([])
    const bad = errors([{ at: at('gains a fly speed of 12', text), ...fly, mode: 'jump', change: 2 }], text).map(e => e.message).join('\n')
    expect(bad).toMatch(/"jump" is not one of/)
    expect(bad).toMatch(/value or change, not both/)
  })

  it('accepts no-concealment, initiative and saveModifier', () => {
    const status = { kind: 'status', status: 'no-concealment', who: 'target', duration: { kind: 'save-ends' } }
    expect(p(status, 'cannot benefit from invisibility or concealment')).toBeUndefined()
    expect(p(status, 'is blinded')).toMatch(/no-concealment/)
    const init = { kind: 'modifier', stat: 'initiative', value: 2, who: 'allies-in-area', duration: { kind: 'permanent' } }
    expect(p(init, '+2 power bonus to initiative')).toBeUndefined()
    expect(p(init, '+2 power bonus to attack rolls')).toMatch(/initiative/)
    const dominated = { kind: 'condition', condition: 'dominated', who: 'target', duration: { kind: 'save-ends' }, saveModifier: -2 }
    expect(p(dominated, 'dominated (save ends, with a -2 penalty to the saving throw)')).toBeUndefined()
    expect(p(dominated, 'dominated (save ends', '; the target takes a -2 penalty to the saving throw). Next.')).toBeUndefined()
    expect(p(dominated, 'dominated (save ends)')).toMatch(/saveModifier/)
    expect(p({ ...dominated, saveModifier: -4 }, 'dominated (save ends, with a -2 penalty to the saving throw)')).toMatch(/4 penalty/)
    const text = 'The target is dominated (save ends, with a -2 penalty to the saving throw).'
    expect(errors([{ at: at('dominated (save ends, with a -2 penalty to the saving throw)', text), ...dominated, saveModifier: 0 }], text)
      .map(e => e.message)).toContain('expected a non-zero modifier')
  })

  it('accepts area words for zones and comma-listed resistances', () => {
    const zone = { kind: 'zone', duration: { kind: 'turn-end', whose: 'source', next: true } }
    for (const q of ['creates an area of swirling sand', 'a field of grasping vines', 'the cloud', 'a wall of fire']) expect(p(zone, q), q).toBeUndefined()
    expect(p(zone, 'creates swirling sand')).toMatch(/no "zone"/)
    const res = { kind: 'resistance', type: 'fire', value: 10, who: 'self', duration: { kind: 'permanent' } }
    expect(p(res, '10 fire', ', 10 acid.', 'The golem gains resist 10 necrotic, ')).toBeUndefined()
    expect(p(res, '10 fire', '.', 'The golem gains resist 10 necrotic, 10 cold, and ')).toBeUndefined()
    expect(p(res, '10 fire', '.', 'The golem gains resist 10 necrotic. It takes ')).toMatch(/resist/)
    expect(p({ ...res, kind: 'vulnerability' }, '5 cold', '.', 'It gains vulnerable 5 fire, ')).toBeUndefined()
    const text = 'The golem gains resist 10 necrotic, 10 fire, 10 acid until the end of its next turn.'
    const dur = { kind: 'turn-end', whose: 'source', next: true }
    expect(errors(['resist 10 necrotic', '10 fire', '10 acid'].map((q, i) =>
      ({ at: at(q, text), kind: 'resistance', type: ['necrotic', 'fire', 'acid'][i], value: 10, who: 'self', duration: dur })), text)).toEqual([])
  })

  it('accepts "recharging", burrowing moves and if fragments from the trait or aura name', () => {
    expect(p({ kind: 'recharge-power', power: 'breath weapon' }, 'recharging its breath weapon')).toBeUndefined()
    expect(p({ kind: 'move', move: 'move', squares: 6, who: 'self' }, 'burrows 6 squares')).toBeUndefined()
    const text = 'Enemies in the aura take a -2 penalty to attack rolls against the necrosphinx.'
    const mod = { at: at('-2 penalty to attack rolls', text), kind: 'modifier', stat: 'attack', value: -2, who: 'enemies-in-area', duration: { kind: 'while-in-aura' } }
    const aura = (name: string, clauses: unknown[]) => monster({ auras: [{ name, keywords: [], range: 3, text: { text, clauses } }] as any })
    const ok = aura('Billowing Winds (while bloodied)', [{ ...mod, if: ['while bloodied', 'against the necrosphinx'] }])
    expect(validateEntry('monsters', ok).errors).toEqual([])
    const missing = aura('Billowing Winds', [{ ...mod, if: 'while bloodied' }])
    expect(validateEntry('monsters', missing).errors.map(e => e.message).join('\n')).toMatch(/not in the line text/)
  })

  it('accepts an aura size that is not a number as rangeText', () => {
    const aura = (over: Record<string, unknown>) => monster({ auras: [{ name: 'Lolth\'s Authority', keywords: [], text: { text: 'Allies gain a bonus.', clauses: [] }, ...over }] as any })
    expect(validateEntry('monsters', aura({ rangeText: 'sight' })).errors).toEqual([])
    expect(validateEntry('monsters', aura({})).errors.map(e => e.message)).toEqual(['expected range, or rangeText for a size that is not a number'])
    expect(validateEntry('monsters', aura({ range: 5, rangeText: 'sight' })).errors.map(e => e.message)).toEqual(['rangeText only when the size is not a number'])
  })
})

describe('schema v12', () => {
  const p = (cl: unknown, span: string, after = '', before = '') => spanProblem(cl as any, span, after, before)
  const at = (q: string, text: string) => { const i = text.indexOf(q); return [i, i + q.length] }
  const errors = (clauses: unknown[], text: string) => {
    const m = monster()
    m.powers[0].effect = { text, clauses } as any
    return validateEntry('monsters', m).errors.map(e => e.message)
  }
  const turn = { kind: 'turn-end', whose: 'source', next: true }

  it('accepts lingering, dealt-by and scaled damage', () => {
    const text = "Until the end of the hunter's next turn, the hunter's attacks against the target deal 1d6 extra damage, plus 1 extra damage for each creature in the burst."
    const linger = { at: at('1d6 extra damage', text), kind: 'damage', dice: '1d6', types: [], who: 'target', extra: true, by: 'self', duration: turn, if: "Until the end of the hunter's next turn" }
    const per = { at: at('1 extra damage', text), kind: 'damage', dice: '1', types: [], who: 'target', extra: true, per: 'for each creature in the burst' }
    expect(errors([linger, per], text)).toEqual([])
    expect(errors([{ ...per, per: 'per creature' }], text).join('\n')).toMatch(/not in the line text/)
    expect(errors([{ ...per, per: 'in the burst' }], text).join('\n')).toMatch(/"for each \.\.\." words/)
    expect(errors([{ ...linger, by: 'friend', duration: { kind: 'soon' } }], text).join('\n')).toMatch(/"friend" is not one of[\s\S]*"soon" is not one of/)
  })

  it('finds "crit" anywhere in the sentence of a critical damage clause', () => {
    const crit = { kind: 'damage', dice: '8', types: ['thunder'], who: 'target', critical: true }
    expect(p(crit, '8 thunder damage', ')', '1d8 + 5 damage (crit 4d8+23 damage plus ')).toBeUndefined()
    expect(p({ ...crit, dice: '4d8+39', types: [] }, '4d8 + 39', '.', 'If the titan scores a critical hit, the damage is ')).toBeUndefined()
    expect(p({ ...crit, dice: '6d10+41', types: [] }, '6d10 + 41 damage', ' if the stormsword scores a critical hit.')).toBeUndefined()
    expect(p(crit, '8 thunder damage', '. Next.', 'Crit sentence. The target takes ')).toMatch(/crit/)
  })

  it('accepts dice and damage-dealt heals, dice temp-hp, and half-damage who and duration', () => {
    const heal = { kind: 'heal', amount: '1d4+5', who: 'self' }
    expect(p(heal, 'regains 1d4 + 5 hit points')).toBeUndefined()
    expect(p(heal, 'regains 1d6 + 5 hit points')).toMatch(/dice "1d4\+5"/)
    expect(p({ ...heal, amount: 'half-damage-dealt' }, 'regains hit points equal to half the damage dealt')).toBeUndefined()
    expect(p({ kind: 'temp-hp', amount: '1d10+3', who: 'self' }, 'gains 1d10 + 3 temporary hit points')).toBeUndefined()
    const text = 'It takes half damage from weapon attacks until the end of its next turn.'
    expect(errors([{ at: at('half damage from weapon attacks until the end of its next turn', text), kind: 'half-damage', who: 'self', duration: turn }], text)).toEqual([])
    expect(errors([{ at: at('half damage', text), kind: 'half-damage', who: 'self' }, { at: at('gains', 'x'), kind: 'heal', amount: 'lots', who: 'self' }], text).join('\n'))
      .toMatch(/expected a number, dice/)
  })

  it('checks ongoing-damage increases, statuses, restrictions and stats', () => {
    const inc = { kind: 'ongoing-damage', amount: 5, types: ['fire'], who: 'target', duration: { kind: 'save-ends' }, increase: true }
    expect(p(inc, 'that damage increases by 5', '.', 'If the target is already taking ongoing fire damage, ')).toBeUndefined()
    expect(p(inc, 'that damage increases by 5', '.', 'The target burns. ')).toMatch(/ongoing/)
    const status = (s: string) => ({ kind: 'status', status: s, who: 'target', duration: { kind: 'save-ends' } })
    expect(p(status('no-regain-hp'), 'cannot regain hit points')).toBeUndefined()
    expect(p(status('no-healing-surges'), 'cannot spend healing surges')).toBeUndefined()
    expect(p(status('ignore-difficult-terrain'), 'ignores difficult terrain')).toBeUndefined()
    const restrict = { kind: 'power-restriction', what: ['immediate', 'opportunity'], who: 'target', duration: { kind: 'save-ends' } }
    expect(p(restrict, "can't take immediate or opportunity actions")).toBeUndefined()
    expect(p({ ...restrict, what: 'shift' }, 'cannot teleport')).toMatch(/no "shift"/)
    expect(p({ ...restrict, what: 'named', powers: ['shadow cloak'] }, 'cannot use its shadow cloak power')).toBeUndefined()
    expect(p({ ...restrict, what: 'named', powers: ['howling charge'] }, 'cannot use its shadow cloak power')).toMatch(/howling charge/)
    const text = 'The target cannot shift.'
    expect(errors([{ at: at('cannot shift', text), ...restrict, what: 'shift', powers: ['x'] }], text)).toContain('powers only with what "named"')
    const fewer = { kind: 'modifier', stat: 'forced-movement', value: -1, who: 'self', duration: { kind: 'permanent' } }
    expect(p(fewer, 'moves 1 square fewer than the effect specifies')).toBeUndefined()
    expect(p({ ...fewer, stat: 'recharge', value: 1 }, '+1 bonus to recharge rolls')).toBeUndefined()
    expect(p({ ...fewer, stat: 'recharge', value: 1 }, '+1 bonus to attack rolls')).toMatch(/recharg/)
  })

  it('checks the new clause kinds', () => {
    const d = { kind: 'save-ends' }
    expect(p({ kind: 'automatic', what: 'save', who: 'self', duration: { kind: 'permanent' } }, 'automatically succeeds on saving throws')).toBeUndefined()
    expect(p({ kind: 'automatic', what: 'hit', who: 'self', duration: { kind: 'permanent' } }, 'automatically hits')).toBeUndefined()
    expect(p({ kind: 'automatic', what: 'critical', who: 'self', duration: { kind: 'permanent' } }, 'automatically hits')).toMatch(/critical/)
    expect(p({ kind: 'lose-resistance', types: ['all'], value: 10, who: 'target', duration: d }, 'ignores 10 points of resist all')).toBeUndefined()
    expect(p({ kind: 'lose-resistance', types: ['fire'], who: 'target', duration: d }, "the target's fire vulnerability")).toMatch(/resist/)
    expect(p({ kind: 'immunity', to: ['all'], who: 'self', duration: d }, 'is immune to all damage')).toBeUndefined()
    expect(p({ kind: 'end-effect', conditions: ['marked'], who: 'self' }, 'is no longer marked')).toBeUndefined()
    expect(p({ kind: 'end-effect', who: 'self' }, 'is marked')).toMatch(/end\(s\)/)
    expect(p({ kind: 'extra-action', action: 'move', who: 'ally' }, 'can take an extra move action')).toBeUndefined()
    expect(p({ kind: 'extra-action', action: 'minor', who: 'ally' }, 'can take an extra move action')).toMatch(/minor/)
    const text = 'The target loses resist fire and is immune to fear. It is no longer dazed.'
    expect(errors([
      { at: at('loses resist fire', text), kind: 'lose-resistance', types: [], who: 'target', duration: d },
      { at: at('immune to fear', text), kind: 'immunity', to: [], who: 'target', duration: d },
      { at: at('no longer dazed', text), kind: 'end-effect', conditions: ['sleepy'], who: 'target' },
    ], text).join('\n')).toMatch(/at least one type[\s\S]*at least one name[\s\S]*"sleepy" is not one of/)
  })

  it('accepts older save wording, obscured areas, lines of sight and other v12 span wordings', () => {
    const slowed = { kind: 'condition', condition: 'slowed', who: 'target', duration: { kind: 'save-ends' }, saveModifier: -2 }
    expect(p(slowed, 'slowed (save at -2 ends)')).toBeUndefined()
    const conceal = { kind: 'concealment', who: 'creatures-in-area', duration: { kind: 'sustain', action: 'minor' } }
    expect(p(conceal, 'is lightly obscured')).toBeUndefined()
    expect(p({ ...conceal, total: true }, 'is heavily obscured')).toBeUndefined()
    const zone = { kind: 'zone', duration: { kind: 'sustain', action: 'minor' }, blocksLineOfSight: true }
    expect(p(zone, 'conjures a wall of swirling snow', '. The wall blocks line of sight.')).toBeUndefined()
    expect(p(zone, 'conjures a wall of swirling snow', '. The wall is cold.')).toMatch(/line of sight/)
    const reroll = { kind: 'reroll', what: 'attack', keep: 'lower', who: 'other' }
    expect(p(reroll, 'must make two attack rolls and use the lower result')).toBeUndefined()
    expect(p({ ...reroll, keep: 'new' }, 'must make a second attack roll and use the new result')).toBeUndefined()
    expect(p({ kind: 'recharge-power', power: 'bladerager rend' }, 'regains the use of bladerager rend')).toBeUndefined()
    expect(p({ kind: 'action-point', amount: 1, who: 'self' }, 'regains a spent action point')).toBeUndefined()
    expect(p({ kind: 'redirect-attack', who: 'ally' }, "can change the triggering attack's target to an adjacent ally")).toBeUndefined()
  })

  it('accepts Attack.name, hpIf and regeneration suppressedText', () => {
    const m = monster({ hpIf: [{ value: 99, if: 'if in a possessed body' }], regeneration: { value: 10, suppressedBy: [], suppressedText: 'while exposed to direct sunlight', text: '10 (while exposed to direct sunlight, it does not regenerate)' } })
    m.powers[0].attacks[0].name = 'Earth Shock'
    expect(validateEntry('monsters', m).errors).toEqual([])
    const bad = monster({ hpIf: [{ value: 99 }] as any })
    bad.powers[0].attacks[0].name = ''
    expect(validateEntry('monsters', bad).errors.map(e => e.path)).toEqual(['$.hpIf[0].if', '$.powers[0].attacks[0].name'])
  })
})

describe('schema v13', () => {
  const p = (cl: unknown, span: string, after = '', before = '') => spanProblem(cl as any, span, after, before)
  const at = (q: string, text: string) => { const i = text.indexOf(q); return [i, i + q.length] }
  const errors = (clauses: unknown[], text: string) => {
    const m = monster()
    m.powers[0].effect = { text, clauses } as any
    return validateEntry('monsters', m).errors.map(e => e.message)
  }
  const se = { kind: 'save-ends' }

  it('checks the new clause kinds', () => {
    expect(p({ kind: 'no-damage', who: 'self' }, 'it takes no damage')).toBeUndefined()
    expect(p({ kind: 'no-damage', who: 'self' }, 'it takes half damage')).toMatch(/no damage/)
    expect(p({ kind: 'drop-to-zero', who: 'self' }, 'reduces it to 0 hit points')).toBeUndefined()
    expect(p({ kind: 'drop-to-zero', who: 'target' }, 'kills the target instantly')).toBeUndefined()
    const limit = { kind: 'move-limit', limit: 'away', who: 'target', duration: se }
    expect(p(limit, "can't move away from the dragon")).toBeUndefined()
    expect(p({ ...limit, limit: 'leave' }, "can't leave the zone")).toBeUndefined()
    expect(p({ ...limit, limit: 'within', squares: 2 }, 'cannot move more than 2 squares from the post')).toBeUndefined()
    expect(p({ ...limit, limit: 'closer' }, "can't move away from the dragon")).toMatch(/closer/)
    const swallow = { kind: 'swallow', who: 'target', duration: { kind: 'indefinite' }, escapeDc: 22 }
    expect(p(swallow, 'the target is swallowed', ' (escape DC 22).')).toBeUndefined()
    expect(p(swallow, 'the target is grabbed', ' (escape DC 22).')).toMatch(/swallow/)
    expect(p({ kind: 'share-damage', part: 'rest', transfer: true, who: 'ally' }, 'the ally takes the rest of the damage')).toBeUndefined()
    expect(p({ kind: 'share-damage', part: 'half', who: 'target' }, 'the target takes the same damage')).toMatch(/half/)
    expect(p({ kind: 'aura-size', aura: 'noxious fumes', value: 3, duration: { kind: 'encounter' } }, 'noxious fumes expands to aura 3')).toBeUndefined()
    expect(p({ kind: 'size-change', size: 'large', reach: 2, who: 'self', duration: { kind: 'encounter' } }, 'becomes Large, and its reach becomes 2')).toBeUndefined()
    expect(p({ kind: 'size-change', size: 'huge', who: 'self', duration: { kind: 'encounter' } }, 'becomes Large')).toMatch(/huge/)
    const text = 'It takes no damage. The target is swallowed. Its size changes.'
    expect(errors([
      { at: at('takes no damage', text), kind: 'no-damage', who: 'self', duration: { kind: 'soon' } },
      { at: at('swallowed', text), kind: 'swallow', who: 'target' },
      { at: at('size changes', text), kind: 'size-change', who: 'self', duration: se },
    ], text).join('\n')).toMatch(/"soon" is not one of[\s\S]*expected an object[\s\S]*expected size or reach/)
  })

  it('accepts the new fields and values', () => {
    const forced = { kind: 'forced-move', move: 'slide', squaresText: 'to the edge of the burst', who: 'target' }
    expect(p(forced, 'slides the target to the edge of the burst')).toBeUndefined()
    expect(p(forced, 'slides the target 2 squares')).toMatch(/squaresText/)
    const text = 'The target slides to the edge of the burst. It treats the dragon as invisible (save ends).'
    expect(errors([
      { at: at('slides to the edge of the burst', text), ...forced },
      { at: at('treats the dragon as invisible (save ends)', text), kind: 'condition', condition: 'invisible', who: 'self', observer: 'target', duration: se, saveGroup: 'a' },
    ], text)).toEqual([])
    expect(errors([{ at: at('slides', text), kind: 'forced-move', move: 'slide', who: 'target' }], text).join('\n')).toMatch(/expected squares, or squaresText/)
    const roll = { kind: 'modifier', stat: 'roll', value: '1d6', who: 'ally', duration: { kind: 'instant' } }
    expect(p(roll, 'adds 1d6 to the triggering roll')).toBeUndefined()
    expect(p({ ...roll, value: '-1d6' }, 'subtracts 1d6 from the triggering roll')).toBeUndefined()
    expect(p({ ...roll, value: '1d8' }, 'adds 1d6 to the triggering roll')).toMatch(/1d8/)
    expect(p({ ...roll, stat: 'death-saves', value: -2 }, 'take a -2 penalty to death saving throws')).toBeUndefined()
    expect(p({ ...roll, stat: 'escape', value: -4 }, 'takes a -4 penalty to the check', ' to escape the grab.')).toBeUndefined()
    expect(p({ ...roll, stat: ['skill-checks', 'ability-checks'], value: -2 }, 'takes a -2 penalty to checks')).toBeUndefined()
    expect(p({ kind: 'heal', amount: 'surge-value', spendSurge: true, who: 'ally' }, 'spends a healing surge')).toBeUndefined()
    const recharge = { kind: 'recharge-power', power: 'raging storm', others: ['fist of the storm'] }
    expect(p(recharge, 'Raging storm and fist of the storm recharge')).toBeUndefined()
    expect(p({ ...recharge, others: ['storm maw'] }, 'Raging storm and fist of the storm recharge')).toMatch(/storm maw/)
    expect(p({ kind: 'automatic', what: 'miss', who: 'other', duration: { kind: 'instant' } }, 'the attack automatically misses')).toBeUndefined()
    expect(p({ kind: 'automatic', what: 'critical', who: 'self', duration: { kind: 'instant' } }, 'the attack is treated as a critical hit')).toBeUndefined()
    expect(p({ kind: 'lose-resistance', types: ['radiant'], what: ['vulnerability'], who: 'self', duration: se }, 'loses vulnerability to radiant damage')).toBeUndefined()
    expect(p({ kind: 'lose-resistance', types: ['poison'], what: ['immunity', 'resistance'], who: 'self', duration: se }, 'loses any immunity to poison')).toMatch(/resist/)
    expect(p({ kind: 'immunity', to: ['prone'], who: 'self', duration: { kind: 'permanent' } }, 'cannot be knocked prone')).toBeUndefined()
    const restrict = { kind: 'power-restriction', who: 'target', duration: se }
    expect(p({ ...restrict, what: 'fly' }, 'cannot fly')).toBeUndefined()
    expect(p({ ...restrict, what: 'non-basic' }, 'can make only basic attacks')).toBeUndefined()
    expect(p({ kind: 'status', status: 'no-stand', who: 'target', duration: se }, 'cannot stand up')).toBeUndefined()
    expect(p({ kind: 'status', status: 'ignore-cover', who: 'self', duration: { kind: 'permanent' } }, 'ignores cover')).toBeUndefined()
    expect(p({ kind: 'sense', sense: 'sight-limit', range: 2, who: 'target', duration: se }, 'cannot see more than 2 squares away')).toBeUndefined()
    expect(p({ kind: 'condition', condition: 'removed-from-play', who: 'target', duration: se }, 'is banished')).toBeUndefined()
    expect(p({ kind: 'move', move: 'move', who: 'self' }, 'leaps up to 8 squares')).toBeUndefined()
    expect(p({ kind: 'redirect-attack', who: 'other' }, "becomes the attack's target")).toBeUndefined()
    expect(p({ kind: 'crit-range', min: 17, who: 'self', duration: { kind: 'permanent' } }, 'can score a critical hit', ' against a prone creature on a roll of 17-20.')).toBeUndefined()
    expect(p({ kind: 'concealment', who: 'other', observer: 'target', duration: se, saveGroup: 'a' }, 'have concealment against the target')).toBeUndefined()
  })

  it('accepts roll tables, shared option words and "one of the following"', () => {
    const text = 'Roll a d6: 1-3, the target is dazed; 4-6, the target is slowed. It recharges cascade of fire or grasping tendrils.'
    const cond = (c: string) => ({ at: at(c, text), kind: 'condition', condition: c, who: 'target', duration: se })
    const table = { at: at('Roll a d6: 1-3, the target is dazed; 4-6, the target is slowed', text), kind: 'choice', chooser: 'roll', rolls: ['1-3', '4-6'], options: [[cond('dazed')], [cond('slowed')]] }
    const shared = { at: at('recharges cascade of fire or grasping tendrils', text), kind: 'choice', options: [
      [{ at: at('recharges cascade of fire', text), kind: 'recharge-power', power: 'cascade of fire' }],
      [{ at: at('grasping tendrils', text), kind: 'recharge-power', power: 'grasping tendrils' }],
    ] }
    expect(errors([table, shared], text)).toEqual([])
    expect(errors([{ ...table, rolls: ['1-3'] }], text).join('\n')).toMatch(/one roll result per option/)
    expect(errors([{ ...table, chooser: 'self' }], text).join('\n')).toMatch(/rolls only with chooser "roll"/)
    expect(p({ kind: 'choice', options: [] }, 'gains one of the following benefits')).toBeUndefined()
  })

  it('accepts hp 0 only with hpText, and immunity notes', () => {
    expect(validateEntry('monsters', monster({ hp: 0, hpText: 'The colossus has infinite hit points', immune: [{ type: 'fear', note: 'while bloodied only' }] })).errors).toEqual([])
    expect(validateEntry('monsters', monster({ hp: 0 })).errors.map(e => e.path)).toEqual(['$.hp'])
    expect(validateEntry('monsters', monster({ immune: [{ type: 'fear', when: 'x' }] as any })).errors.map(e => e.path)).toEqual(['$.immune[0].when'])
  })
})

describe('schema v14', () => {
  const p = (cl: unknown, span: string, after = '', before = '') => spanProblem(cl as any, span, after, before)
  const at = (q: string, text: string) => { const i = text.indexOf(q); return [i, i + q.length] }
  const errors = (clauses: unknown[], text: string) => {
    const m = monster()
    m.powers[0].effect = { text, clauses } as any
    return validateEntry('monsters', m).errors.map(e => e.message)
  }
  const se = { kind: 'save-ends' }
  const perm = { kind: 'permanent' }

  it('checks the new clause kinds', () => {
    expect(p({ kind: 'double-damage', who: 'self' }, 'deals double damage')).toBeUndefined()
    expect(p({ kind: 'max-damage', who: 'self' }, 'The attack deals maximum damage')).toBeUndefined()
    expect(p({ kind: 'max-damage', who: 'self' }, 'deals double damage')).toMatch(/maximum/)
    expect(p({ kind: 'set-hp', hp: 1, who: 'self' }, 'is instead reduced to 1 hit point')).toBeUndefined()
    expect(p({ kind: 'set-hp', hp: 1, who: 'self' }, 'is instead reduced to 0')).toMatch(/hit point/)
    const swap = { kind: 'condition-swap', from: ['dominated', 'stunned'], to: 'dazed', who: 'self' }
    expect(p(swap, 'he is instead dazed', ' for the same duration.', 'If Torg would be dominated or stunned, ')).toBeUndefined()
    expect(p(swap, 'it is dazed', '.', 'If it would be dominated or stunned, ')).toMatch(/instead/)
    expect(p({ ...swap, from: ['slowed'] }, 'he is instead dazed', '.', 'If dominated, ')).toMatch(/slowed/)
    expect(p({ kind: 'move-zone', squares: 5 }, 'can move the zone up to 5 squares')).toBeUndefined()
    expect(p({ kind: 'state', name: 'grief-stricken', who: 'target', duration: se }, 'is grief-stricken (save ends)')).toBeUndefined()
    expect(p({ kind: 'state', name: 'cursed', who: 'target', duration: se }, 'is hexed (save ends)')).toMatch(/cursed/)
    const heal = { kind: 'reduced-healing', who: 'enemies-in-area', duration: { kind: 'while-in-aura' } }
    expect(p({ ...heal, half: true }, 'regain only half the normal hit points from healing effects')).toBeUndefined()
    expect(p({ ...heal, value: 10 }, 'regains 10 fewer hit points')).toBeUndefined()
    expect(p({ kind: 'damage', amount: 'half-bloodied-value', types: [], who: 'target' }, 'takes damage equal to half its bloodied value')).toBeUndefined()
    expect(p({ kind: 'damage', amount: 'surge-value', types: [], who: 'self' }, 'takes damage equal to half its bloodied value')).toMatch(/surge/)
    expect(p({ kind: 'damage', amount: 'half-damage-dealt', types: ['fire'], who: 'other' }, 'takes fire damage equal to the damage dealt')).toMatch(/half/)
  })

  it('accepts the new values and wordings', () => {
    for (const [status, words] of [['no-flank', "Enemies can't gain combat advantage by flanking"], ['move-through', "can move through enemies' spaces"],
      ['carry-grabbed', 'pulls the grabbed creature with it'], ['no-temp-hp', 'cannot gain temporary hit points']]) {
      expect(p({ kind: 'status', status, who: 'self', duration: perm }, words)).toBeUndefined()
    }
    const restrict = { kind: 'power-restriction', who: 'target', duration: se }
    expect(p({ ...restrict, what: 'basic' }, 'cannot make basic attacks')).toBeUndefined()
    expect(p({ ...restrict, what: 'all', except: ['thundering claws'] }, 'cannot use any power except thundering claws')).toBeUndefined()
    expect(p({ ...restrict, what: 'all', except: ['bite'] }, 'cannot use any power except thundering claws')).toMatch(/bite/)
    expect(p({ kind: 'reroll', what: 'attack', keep: 'higher', who: 'self' }, 'rolls the attack twice and uses the higher result')).toBeUndefined()
    expect(p({ kind: 'reroll', what: 'save', who: 'target' }, 'makes the saving throw again')).toBeUndefined()
    expect(p({ kind: 'automatic', what: 'hit', who: 'self', duration: { kind: 'instant' } }, 'The attack instead hits')).toBeUndefined()
    expect(p({ kind: 'automatic', what: 'miss', who: 'other', duration: { kind: 'instant' } }, 'the attack misses')).toBeUndefined()
    expect(p({ kind: 'automatic', what: 'critical', who: 'self', duration: { kind: 'instant' } }, 'the hit is considered to be a critical hit')).toBeUndefined()
    expect(p({ kind: 'end-effect', conditions: ['removed-from-play'], who: 'self' }, 'reappears in an unoccupied square')).toBeUndefined()
    expect(p({ kind: 'end-effect', who: 'self' }, 'All effects on the siphon end')).toBeUndefined()
    expect(p({ kind: 'modifier', stat: 'forced-movement', value: 1, who: 'self', duration: perm }, 'can push or slide enemies in the aura 1 extra square')).toBeUndefined()
    const text = 'The target is restrained (escape DC 25). Its attacks deal half its bloodied value; it rolls twice and uses the lower result (save ends).'
    expect(errors([
      { at: at('restrained (escape DC 25)', text), kind: 'condition', condition: 'restrained', who: 'target', duration: { kind: 'indefinite' }, escapeDc: 25 },
      { at: at('rolls twice and uses the lower result (save ends)', text), kind: 'reroll', what: 'attack', keep: 'lower', who: 'target', duration: se, saveGroup: 'a' },
    ], text)).toEqual([])
    expect(errors([{ at: at('half its bloodied value', text), kind: 'damage', dice: '2d6', amount: 'half-bloodied-value', types: [], who: 'target' }], text).join('\n')).toMatch(/not both/)
    expect(errors([{ at: at('half its bloodied value', text), kind: 'reduced-healing', half: true, value: 5, who: 'target', duration: se }], text).join('\n')).toMatch(/half or value/)
  })

  it('lets a forced move hold its condition between the verb and the squares', () => {
    const text = 'The dragon slides any enemy that ends its turn in the aura 2 squares. Any enemy that starts its turn in the aura takes 5 damage.'
    const slide = { at: at('slides any enemy that ends its turn in the aura 2 squares', text), kind: 'forced-move', move: 'slide', squares: 2, who: 'enemies-in-area', if: 'any enemy that ends its turn in the aura' }
    expect(errors([slide], text)).toEqual([])
    // Other kinds, and a condition at the quote's edge, still may not overlap.
    expect(errors([{ ...slide, at: at('slides any enemy that ends its turn in the aura', text), squares: undefined, squaresText: 'any' }], text).join('\n')).toMatch(/overlaps/)
    const dmg = { at: at('Any enemy that starts its turn in the aura takes 5 damage', text), kind: 'damage', dice: '5', types: [], who: 'enemies-in-area', if: 'that starts its turn in the aura' }
    expect(errors([dmg], text).join('\n')).toMatch(/overlaps/)
  })

  it('accepts companion fields and skips their XP and rider damage flags', () => {
    const companion = monster({ role: null, classRole: 'defender', xp: 0, healingSurges: 11, surgeValue: 12, abilities: { str: 18, con: 14, dex: 12, int: 0, wis: 10, cha: 10 } })
    expect(validateEntry('monsters', companion).errors).toEqual([])
    expect(checkMonsterBands(companion).filter(f => f.rule === 'xp')).toEqual([])
    expect(validateEntry('monsters', monster({ classRole: 'defender' })).errors.map(e => e.path)).toEqual(['$.classRole'])
    const m = monster()
    m.powers[0].attacks[0].hit = { text: '1d8 + 1 damage plus 1d8 + 2 fire damage, and 10 damage if bloodied.', clauses: [
      { at: [0, 7], kind: 'damage', dice: '1d8+1', types: [], who: 'target' },
      { at: [20, 41], kind: 'damage', dice: '1d8+2', types: ['fire'], who: 'target' },
      { at: [47, 49], kind: 'damage', dice: '10', types: [], who: 'target', if: 'if bloodied' },
    ] } as any
    expect(checkMonsterBands(m).filter(f => f.rule === 'damage')).toEqual([])
  })
})
