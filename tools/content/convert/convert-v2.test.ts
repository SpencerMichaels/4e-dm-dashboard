// Converter tests for the 4e-kit schema v2 and v3 fields.

import { describe, expect, it } from 'vitest'
import { MONSTER_TEMPLATES } from '../../../src/renderer/components/creature/monster-templates'
import { auraRangeIf, parseMonsterHtml } from '../html-parser'
import { parseTrapHtml } from '../trap-parser'
import { Notes, damageModifier, parseSources, splitRangePrefix, type ConvertContext } from './common'
import { checkFrom, enduranceFrom } from './disease'
import { armorFrom, cleanWeight, parsePrice, tierOf } from './item'
import { convertMonster, convertPower } from './monster'
import { convertTemplate, convertTheme, prereqFromCheck } from './template'
import { convertTrap, isSkillHeading, parseTrapSpeed } from './trap'

const ctx: ConvertContext = { provenance: { origin: 'parser', by: 'tools/content@test', at: '2026-11-12' } }

describe('shared v2 pieces', () => {
  it('parseSources lists every publication', () => {
    const notes = new Notes()
    expect(parseSources('Monster Manual 3, page(s) 132, Dungeon Magazine 190.', notes)).toEqual([
      { book: 'Monster Manual 3', page: 132 }, { book: 'Dungeon Magazine 190' },
    ])
    expect(parseSources("Dungeon Master's Guide 2, page(s) 73.", notes)).toEqual([{ book: "Dungeon Master's Guide 2", page: 73 }])
    expect(parseSources('Dungeon Magazine 156, page(s) 59, 68.', notes)).toEqual([
      { book: 'Dungeon Magazine 156', page: 59 }, { book: 'Dungeon Magazine 156', page: 68 },
    ])
    expect(notes.list).toEqual([])
    expect(parseSources('The Book of Vile Darkness, page(s) 2-77.', notes)).toEqual([{ book: 'The Book of Vile Darkness', page: '2-77' }])
    expect(notes.list).toEqual([])
  })

  it('keeps text-only resistances as text', () => {
    expect(damageModifier('fire', 10)).toEqual({ type: 'fire', value: 10 })
    expect(damageModifier('radiant', undefined, 'see text')).toEqual({ type: 'radiant', note: 'see text' })
    expect(damageModifier('insubstantial')).toEqual({ type: 'special', text: 'insubstantial' })
    expect(damageModifier('against close and area attacks', 10)).toEqual({ type: 'special', value: 10, text: 'against close and area attacks' })
    expect(damageModifier('half damage from melee and ranged attacks')).toEqual({ type: 'special', text: 'half damage from melee and ranged attacks' })
    expect(damageModifier('20/variable', undefined, '3/encounter')).toEqual({ type: 'variable', value: 20, note: '3/encounter' })
  })
})

describe('monster powers', () => {
  it('maps vs Any, failed saves and lines with no field', () => {
    const notes = new Notes()
    const p = convertPower({
      name: 'Petrifying Gaze', actionType: 'standard', usage: 'recharge', rechargeCondition: '6',
      attackBonus: 12, defense: 'Any', rangeType: 'close-blast', rangeValue: '5', target: 'creatures in the blast', damage: [],
      printed: {
        attack: 'Close blast 5 (creatures in the blast); +12 vs. any defense', hit: 'The target is slowed (save ends).',
        'first failed saving throw': 'The target is immobilized instead of slowed (save ends).',
        'second failed saving throw': 'The target is petrified.',
        'each failed saving throw': 'The target takes 5 damage.',
        'ooze form': 'The mimic becomes an ooze.',
        '1. fire ray (fire)': 'Ranged 8; +10 vs. Reflex; 2d6 + 6 fire damage.',
      },
    }, notes)
    expect(notes.list).toEqual([])
    expect(p.attacks[0].vs).toBe('any')
    expect(p.attacks[0].failedSaves!.map(f => [f.n, f.line.text])).toEqual([
      [1, 'The target is immobilized instead of slowed (save ends).'], [2, 'The target is petrified.'], ['each', 'The target takes 5 damage.'],
    ])
    expect(p.extraLines!.map(x => x.label)).toEqual(['Ooze Form', '1. Fire Ray (fire)'])
  })

  it('keeps an unparsed secondary attack as extra lines', () => {
    const p = convertPower({
      name: 'Mangle', actionType: 'standard', usage: 'at-will', attackBonus: 8, defense: 'AC', rangeType: 'melee', rangeValue: '1', damage: [],
      printed: { hit: '1d8 + 4 damage.', secondary: '1d8 + 4 damage (no attack roll needed).' },
    }, new Notes())
    expect(p.attacks).toHaveLength(1)
    expect(p.extraLines).toEqual([{ label: 'Secondary Attack', line: { text: '1d8 + 4 damage (no attack roll needed).', clauses: [] } }])
  })

  it('moves a utility power\'s printed range out of its effect', () => {
    expect(splitRangePrefix('Close burst 5; one ally within the area regains 11 hit points.')).toEqual({
      range: { kind: 'close-burst', size: 5 }, rest: 'one ally within the area regains 11 hit points.',
    })
    expect(splitRangePrefix('Ranged 5 (one ally). The target can make a basic attack as a free action.')).toEqual({
      range: { kind: 'ranged', size: 5, note: 'one ally' }, rest: 'The target can make a basic attack as a free action.',
    })
    expect(splitRangePrefix('Area wall 10 within 10; conjures a wall.')?.range).toEqual({ kind: 'area-wall', size: 10, within: 10 })
    expect(splitRangePrefix('The stalker teleports 8 squares.')).toBeUndefined()
    const p = convertPower({ name: 'Succor', actionType: 'minor', usage: 'encounter', printed: { body: 'Close burst 5; allies in the burst regain 10 hit points.' } }, new Notes())
    expect(p).toMatchObject({ range: { kind: 'close-burst', size: 5 }, effect: { text: 'allies in the burst regain 10 hit points.' } })
  })
})

describe('items', () => {
  it('reads prices, tiers and armor stats', () => {
    expect(parsePrice('2,625,000 gp')).toEqual({ price: 2625000 })
    expect(parsePrice('150 gp.Published in Adventurer\'s Vault, page(s) 14.')).toEqual({ price: 150 })
    expect(parsePrice('5 sp')).toEqual({ price: 0.5, priceText: '5 sp' })
    expect(parsePrice('Special')).toEqual({ price: null, priceText: 'Special' })
    expect(parsePrice('')).toEqual({ price: null })
    expect(tierOf('Paragon Tier Group Set')).toBe('paragon')
    expect(tierOf('Epic Level')).toBe('epic')
    expect(tierOf('Heroic to Epic Tier')).toBeUndefined()
    expect(cleanWeight('15 lbPublished in Player\'s Handbook, page(s) 220.')).toBe('15 lb')
    expect(cleanWeight('1 lb.Cost: Special')).toBe('1 lb.')
    expect(armorFrom('Masterwork mail.\nAC Bonus: +8\nMinimum Enhancement Value: +3\nCheck: -1\nSpeed: -1\nWeight: 40 lb.\nType: Chainmail')).toEqual({
      armor: { category: 'Chainmail', acBonus: 8, check: -1, speed: -1, minEnhancement: 3 }, rest: 'Masterwork mail.\nWeight: 40 lb.',
    })
  })
})

// Trimmed and combined from content/raw/trap.json (trap940 and trap1023).
const TRAP = '<h1 class=thHead>Wall of Tentacles<br><span class=thSubHead>Object</span><br><span class=thLevel>Level 13 Elite Trap<span class=thXP>XP 1600</span></span></h1><p class=thStat><b>Detect</b> automatic</p><span class=thInit><b>Initiative</b> -</span><p class=thStat><b>HP</b> 60 in each of six 5-foot sections</p><p class=thStat><b>AC</b> 20, <b>Fortitude</b> 20, <b>Reflex</b> 20, <b>Will</b> -</p><h2 class=thHead>Traits</h2><p class=th2>☼ <b>Writhing Tentacles</b> ✦ <b>Aura 1</b></p><p class=thStat>Enemies treat squares within the aura as difficult terrain.</p><p class=th2><b>Arcana</b> </p><p class=thStat>DC 20: The character discerns the wall is a link to the Far Realm.</p><h2 class=thHead>Triggered Actions</h2><p class=th2><b>Madness</b> (charm) ✦ <b>At-Will</b></p><p class=tbod><i>Trigger</i>: A creature moves within 2 squares of the wall.</p><p class=tbod><i>Attack</i> (<i>Free Action</i>): Ranged 10 (one creature); +16 vs. Will</p><p class=tbod><i>Hit</i>: The target is dominated (save ends).</p><p class=tbod>    <i>First Failed Saving Throw</i>: The target is dominated (save ends; -2 penalty to the saving throw).</p><p class=tbod>    <i>Third Failed Saving Throw</i>: The target drops to 0 hit points.</p><p class=publishedIn>Published in Dungeon Magazine 197.</p>'

describe('traps', () => {
  it('converts traits, skill sections, failed saves and text HP', () => {
    const t = convertTrap('trap1', parseTrapHtml(TRAP), ctx)
    expect(t).toMatchObject({
      kind: 'object', hp: 60, hpText: '60 in each of six 5-foot sections',
      detect: [
        { skill: 'Perception', dc: null, text: 'automatic' },
        { skill: 'Arcana', dc: 20, text: 'The character discerns the wall is a link to the Far Realm.' },
      ],
      traits: [],
      auras: [{ name: 'Writhing Tentacles', keywords: [], range: 1, text: { text: 'Enemies treat squares within the aura as difficult terrain.', clauses: [] } }],
      sources: [{ book: 'Dungeon Magazine 197' }],
    })
    expect(t.powers).toHaveLength(1)
    expect(t.powers[0]).toMatchObject({ name: 'Madness', action: 'free', keywords: ['charm'] })
    expect(t.powers[0].attacks[0].failedSaves!.map(f => f.n)).toEqual([1, 3])
    expect(t.provenance.notes).toBeUndefined()
    expect(t.usage).toBeUndefined()
  })

  it('reads terrain usage and a Triggered Action with no action type', () => {
    const html = TRAP.replace('>Object<', '>Single-Use Terrain<').replace(' (<i>Free Action</i>)', '')
    const t = convertTrap('trap2', parseTrapHtml(html), ctx)
    expect(t).toMatchObject({ kind: 'terrain', usage: 'single-use' })
    expect(t.powers[0].action).toBe('triggered')
    expect(t.provenance.notes).toBeUndefined()
  })

  it('tells skill sections from traits', () => {
    expect(isSkillHeading('Arcana or Religion')).toBe(true)
    expect(isSkillHeading('Arcana (trained only)')).toBe(true)
    expect(isSkillHeading('Portal Effects')).toBe(false)
  })
})

describe('diseases', () => {
  const base = { name: '', level: 21, flavor: '', stages: [], source: '' }

  it('keeps level-relative DCs as text, including a row left in the check text', () => {
    const notes = new Notes()
    const mummy = {
      ...base,
      check: "At the end of each extended rest, the target makes an Endurance check if it is at stage 1 or 2. 10 + two-thirds mummy's level-14 + two-thirds mummy's level: No Change",
      checkTable: [
        { result: "9 + two-thirds mummy's level or lower", effect: 'The stage of the disease increases by one.' },
        { result: "15 + two-thirds mummy's level or higher", effect: 'The stage of the disease decreases by one.' },
      ],
    }
    expect(enduranceFrom(mummy, notes)).toEqual({ improveDc: { text: "15 + two-thirds mummy's level" }, maintainDc: { text: "10 + two-thirds mummy's level" } })
    expect(checkFrom(mummy)).toBeUndefined()
    expect(notes.list).toEqual([])
  })

  it('reads Easy/Moderate DC tables and a non-Endurance check', () => {
    const notes = new Notes()
    const d = { ...base, check: 'At the end of each extended rest, the target makes an Arcana or Insight check if it is at stage 1 or 2.', checkTable: [
      { result: 'Lower than Easy DC', effect: 'The stage of the disease increases by one.' },
      { result: 'Easy DC', effect: 'No Change' },
      { result: 'Moderate DC', effect: 'The stage of the disease decreases by one.' },
    ] }
    expect(enduranceFrom(d, notes)).toEqual({ improveDc: { text: 'Moderate DC' }, maintainDc: { text: 'Easy DC' } })
    expect(checkFrom(d)).toEqual({ skill: 'Arcana or Insight', text: d.check })
    expect(notes.list).toEqual([])
  })
})

describe('templates and themes', () => {
  it('expresses the not, rank and any-role templates', () => {
    const byName = Object.fromEntries(MONSTER_TEMPLATES.map(t => [t.name, t]))
    expect(prereqFromCheck(byName['Elite Dragon'].prereqCheck)).toEqual({
      kind: 'all', of: [{ kind: 'rank', any: ['solo'] }, { kind: 'keyword', any: ['dragon'] }],
    })
    const nondevil = MONSTER_TEMPLATES.find(t => t.prerequisite === 'Nondevil humanoid')!
    expect(prereqFromCheck(nondevil.prereqCheck)).toEqual({
      kind: 'all', of: [{ kind: 'type', any: ['humanoid'] }, { kind: 'not', of: { kind: 'keyword', any: ['devil'] } }],
    })
    const anyRole = convertTemplate(MONSTER_TEMPLATES.find(t => t.role === 'any')!, ctx)
    expect(anyRole.role).toBe('any')
    expect(anyRole.provenance.notes ?? []).not.toContainEqual(expect.stringMatching(/role/))
    expect(anyRole.rankChange).toBe('up')
    expect(convertTemplate(byName['Elite Dragon'], ctx).rankChange).toBe('down')
  })

  it('keeps theme recommendations that are not just roles', () => {
    const theme = convertTheme({
      name: 'Test Theme', source: 'Test', description: '',
      powers: [{ name: 'Rally', category: 'utility', description: 'Allies shift 1 square.', recommendedFor: 'controllers, leaders' }],
    } as any, ctx)
    expect(theme.powers[0]).toMatchObject({ recommendedFor: ['controller'], recommendedText: 'controllers, leaders' })
    expect(theme.sources).toEqual([{ book: 'Test' }])
  })
})

describe('schema v4 fields', () => {
  it('reads trap speeds', () => {
    const notes = new Notes()
    expect(parseTrapSpeed('5', notes)).toEqual({ walk: 5 })
    expect(parseTrapSpeed('0, fly 4 (hover)', notes)).toEqual({ walk: 0, fly: 4, notes: '(hover)' })
    expect(parseTrapSpeed("8(consider altering this based on the PCs' speeds)", notes)).toEqual({ walk: 8, notes: "(consider altering this based on the PCs' speeds)" })
    expect(notes.list).toEqual([])
    expect(parseTrapSpeed("1d6+8 (Roll at the start of each cyclone's move)", notes)).toBeUndefined()
    expect(notes.list[0]).toMatch(/not a number/)
  })

  it('keeps conditional skill bonuses as notes, not as the bonus', () => {
    const html = "<h1 class=monster>Mimic<br><span class=type>Medium aberrant magical beast</span><br><span class=level>Level 5 Lurker<span class=xp> XP 200</span></span></h1><table class=bodytable><tr><td><b>HP</b> 50; <b>Bloodied</b> 25<td class=rightalign><b>Initiative</b> +8<tr><td><b>AC</b> 19, <b>Fortitude</b> 17, <b>Reflex</b> 16, <b>Will</b> 16<td class=rightalign><b>Perception</b>+4<tr><td><b>Speed</b> 5<td class=rightalign></table><p class='flavor alt'><b>Skills</b> Bluff +19, Stealth +17 (Bluff +23 while the mimic is duplicating a creature)<br> <b>Str</b> 10 (+4) <b>Dex</b> 18 (+8) <b>Wis</b> 11 (+4)<br><b>Con</b> 17 (+7) <b>Int</b> 13 (+5) <b>Cha</b> 20 (+9)</p><p class=flavor><b>Alignment</b> unaligned <b> Languages</b> -</p>"
    const m = convertMonster('monster1', parseMonsterHtml(html, [], { printed: true }), { provenance: { origin: 'parser', at: '2026-11-12' } })
    expect(m.skills).toEqual({ bluff: 19, stealth: 17 })
    expect(m.skillNotes).toEqual(['Bluff +23 while the mimic is duplicating a creature'])
  })

  it('keeps conditional saving throw bonuses as notes, not as the bonus (v8)', () => {
    const html = "<h1 class=monster>Knight<br><span class=type>Medium natural humanoid</span><br><span class=level>Level 5 Soldier<span class=xp> XP 200</span></span></h1><table class=bodytable><tr><td><b>HP</b> 50; <b>Bloodied</b> 25<td class=rightalign><b>Initiative</b> +8<tr><td><b>AC</b> 19, <b>Fortitude</b> 17, <b>Reflex</b> 16, <b>Will</b> 16<td class=rightalign><b>Perception</b>+4<tr><td><b>Speed</b> 5<td class=rightalign><tr><td><b>Saving Throws</b> +5 against fear effects</table>"
    const m = convertMonster('monster1', parseMonsterHtml(html, [], { printed: true }), { provenance: { origin: 'parser', at: '2026-11-12' } })
    expect(m.savingThrowBonus).toBe(0)
    expect(m.savingThrowNotes).toEqual(['+5 against fear effects'])
  })

  it('keeps printed conditional defenses in defensesIf with the base in defenses (v9)', () => {
    const html = "<h1 class=monster>Guard<br><span class=type>Medium natural humanoid</span><br><span class=level>Level 5 Soldier<span class=xp> XP 200</span></span></h1><table class=bodytable><tr><td><b>HP</b> 50; <b>Bloodied</b> 25<td class=rightalign><b>Initiative</b> +8<tr><td><b>AC</b> 21 (23 with phalanx soldier); <b>Fortitude</b> 21 (see also mirage), <b>Reflex</b> 16, <b>Will</b> 18<td class=rightalign><b>Perception</b>+4<tr><td><b>Speed</b> 5<td class=rightalign></table>"
    const m = convertMonster('monster1', parseMonsterHtml(html, [], { printed: true }), { provenance: { origin: 'parser', at: '2026-11-12' } })
    expect(m.defenses).toEqual({ ac: 21, fortitude: 21, reflex: 16, will: 18 })
    expect(m.defensesIf).toEqual([{ defense: 'ac', value: 23, if: 'with phalanx soldier' }])
    expect(m.provenance.notes).toContainEqual('defense note "fortitude 21 (see also mirage)" has no field (not a conditional value)')
  })

  it('records a sustain printed only inside a line', () => {
    const p = convertPower({
      name: 'Breath', actionType: 'standard', usage: 'encounter', keywords: ['zone'], damage: [],
      printed: { effect: 'The blast creates a zone that lasts until the end of the dragon\'s next turn (sustain minor).' },
    }, new Notes())
    expect(p.sustain).toEqual({ action: 'minor' })
  })
})

describe('schema v5', () => {
  it('moves printed conditional attack bonuses from the range note to altBonus', () => {
    const power = (attackNotes: string) => convertPower({
      name: 'Greatsword', actionType: 'standard', usage: 'at-will', attackBonus: 35, defense: 'AC',
      rangeType: 'melee', rangeValue: '2', attackNotes, target: 'one creature', damage: [], printed: {},
    }, new Notes()).attacks[0]
    const a = power('the annihilator attacks the triggering enemy; +37 while bloodied')
    expect(a.altBonus).toEqual([{ value: 37, if: 'while bloodied' }])
    expect(a.range.note).toBe('the annihilator attacks the triggering enemy')
    const b = power('or +20 vs. Reflex if the target is bloodied')
    expect(b.altBonus).toEqual([{ value: 20, if: 'if the target is bloodied', vs: 'reflex' }])
    expect(b.range.note).toBeUndefined()
    expect(power('The vanguard has a +2 bonus to hit while bloodied.').altBonus).toBeUndefined()
  })

  it("records an unprinted defense as 'unknown'", () => {
    const notes = new Notes()
    const p = convertPower({
      name: 'Wrath', actionType: 'standard', usage: 'at-will', attackBonus: 34, defense: '', rangeType: 'melee', rangeValue: '1',
      target: 'one creature', damage: [], printed: {},
    }, notes)
    expect(p.attacks[0].vs).toBe('unknown')
    expect(notes.list[0]).toMatch(/not a kit Defense/)
  })
})

describe('schema v7', () => {
  it('reads printed alternative aura sizes into rangeIf', () => {
    const html = "<h1 class=monster>Balor<br><span class=type>Huge elemental humanoid (demon)</span><br><span class=level>Level 27 Elite Brute<br>XP 22,000</span></h1><table class=bodytable><tr><td><b>HP</b> 620<td class=rightalign><b>Initiative</b> +18<tr><td><b>AC</b> 41, <b>Fortitude</b> 41, <b>Reflex</b> 37, <b>Will</b> 37<td class=rightalign><b>Perception</b> +18<tr><td><b>Speed</b> 8, fly 12<td class=rightalign>Truesight 6</table><h2>Traits</h2><p class='flavor alt'>☼ <b>Flaming Body</b> (fire) ✦ <b>Aura</b> 2, or 3 while the balor is bloodied</p><p class=flavorIndent>Any enemy that starts its turn in the aura takes 10 fire damage.</p><p class=flavor><b>Str</b> 32 (+24) <b>Dex</b> 21 (+18) <b>Wis</b> 21 (+18)<br><b>Con</b> 26 (+21) <b>Int</b> 12 (+14) <b>Cha</b> 12 (+14)</p><p class=flavor><b>Alignment</b> Chaotic evil <b>Languages</b> Abyssal</p><p class=publishedIn>Published in Monster Manual, page(s) 53.</p>"
    const m = convertMonster('monster32', parseMonsterHtml(html, [], { printed: true }), ctx)
    expect(m.auras[0]).toMatchObject({ name: 'Flaming Body', range: 2, rangeIf: [{ value: 3, if: 'while the balor is bloodied' }] })
    expect(auraRangeIf('Aura 1 (aura 3 while bloodied)')).toEqual([{ value: 3, if: 'while bloodied' }])
    expect(auraRangeIf('Aura 1 (3 while the Voidharrow is bloodied)')).toEqual([{ value: 3, if: 'while the Voidharrow is bloodied' }])
    expect(auraRangeIf('Aura 5')).toBeUndefined()
  })
})
