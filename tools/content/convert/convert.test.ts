import { describe, expect, it } from 'vitest'
import { MONSTER_TEMPLATES } from '../../../src/renderer/components/creature/monster-templates'
import { parseMonsterHtml } from '../html-parser'
import { Notes, damageClauses, parseAttackLine, saveEndsClauses, toRecharge, type ConvertContext } from './common'
import { enduranceFrom } from './disease'
import { convertMonster } from './monster'
import { prereqFromCheck } from './template'
import { parseDetect } from './trap'

const ctx: ConvertContext = { provenance: { origin: 'parser', by: 'tools/content@test', at: '2026-11-12' } }

// From content/raw/monsters.json (monster4940, trimmed to two powers).
const MEENLOCK = "<h1 class=monster>Meenlock Stalker<br><span class=type>Small aberrant humanoid</span><br><span class=level>Level 9 Controller<span class=xp> XP 400</span></span></h1><table class=bodytable><tr><td><b>HP</b> 97; <b>Bloodied</b> 48<td class=rightalign><b>Initiative</b> +8<tr><td><b>AC</b> 23, <b>Fortitude</b> 20, <b>Reflex</b> 21, <b>Will</b> 22<td class=rightalign><b>Perception</b>+4<tr><td><b>Speed</b> 5<td class=rightalign>Darkvision<tr><td colspan=2><b>Immune</b> meenlock corruption<tr><td colspan=2></table><h2>Standard Actions</h2><p class='flavor alt'>➶ <b>Maddening Whispers</b> (psychic) ✦ <b>At-Will</b></p><p class=flavorIndent><i>Attack:</i> Ranged 10 (one creature affected by this stalker's horrid link); +12 vs. Will</p><p class=flavorIndent><i>Hit:</i> 1d6 + 4 psychic damage, and the target is dazed (save ends).</p><h2>Move Actions</h2><p class='flavor alt'> <b>Dimension Step</b> (teleportation) ✦ Recharge ⚃ ⚄ ⚅</p><p class=flavorIndent><i>Effect:</i> The stalker teleports 8 squares.</p><p class='flavor alt'><b>Skills</b> Athletics +9, Stealth +13<br> <b>Str</b> 10 (+4)                <b>Dex</b> 18 (+8)                <b>Wis</b> 11 (+4)<br><b>Con</b> 17 (+7)                <b>Int</b> 13 (+5)                <b>Cha</b> 20 (+9)</p><p class=flavor><b>Alignment</b> chaotic evil       <b> Languages</b> Common, Deep Speech</p><p class=publishedIn>Published in Monster Manual 3, page(s) 132, Dungeon Magazine 190.</p>"

describe('convertMonster', () => {
  const m = convertMonster('monster4940', parseMonsterHtml(MEENLOCK, [], { printed: true }), ctx)

  it('fills the structured fields', () => {
    expect(m).toMatchObject({
      id: 'monster4940', name: 'Meenlock Stalker', level: 9, role: 'controller', rank: 'standard',
      size: 'small', origin: 'aberrant', type: 'humanoid', xp: 400, hp: 97, initiative: 8, perception: 4,
      senses: [{ kind: 'darkvision' }], speed: { walk: 5 },
      defenses: { ac: 23, fortitude: 20, reflex: 21, will: 22 },
      abilities: { str: 10, con: 17, dex: 18, int: 13, wis: 11, cha: 20 },
      skills: { athletics: 9, stealth: 13 },
      sources: [{ book: 'Monster Manual 3', page: 132 }, { book: 'Dungeon Magazine 190' }],
    })
    expect(m.provenance).toEqual(ctx.provenance)
  })

  it('keeps the printed hit line and adds only exact clauses', () => {
    const [whispers, step] = m.powers
    const atk = whispers.attacks[0]
    expect(atk).toMatchObject({ label: 'primary', range: { kind: 'ranged', size: 10 }, bonus: { kind: 'fixed', value: 12 }, vs: 'will' })
    expect(atk.hit!.text).toBe('1d6 + 4 psychic damage, and the target is dazed (save ends).')
    expect(atk.hit!.clauses).toEqual([
      { at: [0, 22], kind: 'damage', dice: '1d6+4', types: ['psychic'], who: 'target' },
      { at: [28, 59], kind: 'condition', condition: 'dazed', who: 'target', duration: { kind: 'save-ends' } },
    ])
    expect(step).toMatchObject({ action: 'move', usage: 'recharge', recharge: { kind: 'roll', min: 4 }, keywords: ['teleportation'] })
    expect(step.effect).toEqual({ text: 'The stalker teleports 8 squares.', clauses: [] })
  })
})

describe('clause helpers', () => {
  it('damageClauses finds each part in order, and skips "or" type choices', () => {
    const text = '2d8 + 5 damage plus 1d6 cold or fire damage.'
    expect(damageClauses(text, [{ expr: '2d8+5', type: '', ongoing: false }, { expr: '1d6', type: 'cold, fire', ongoing: false }]))
      .toEqual([{ at: [0, 14], kind: 'damage', dice: '2d8+5', types: [], who: 'target' }])
  })

  it('saveEndsClauses only takes the exact patterns', () => {
    const text = '2d6 + 5 fire damage, and ongoing 5 fire damage (save ends).'
    expect(saveEndsClauses(text)).toEqual([
      { at: [25, 58], kind: 'ongoing-damage', amount: 5, types: ['fire'], who: 'target', duration: { kind: 'save-ends' } },
    ])
    expect(saveEndsClauses('the target is slowed and dazed (save ends both).')).toEqual([])
    expect(saveEndsClauses('The scarecrow takes ongoing 5 fire damage (save ends).')).toEqual([])
  })

  it('parseAttackLine reads trap and item attack lines', () => {
    expect(parseAttackLine('Ranged 5 (one creature); +21 vs. Will')).toEqual({
      range: { kind: 'ranged', size: 5 }, target: 'one creature', bonus: { kind: 'fixed', value: 21 }, vs: 'will',
    })
    expect(parseAttackLine('Ranged 5 (one beast); item level + 3 vs. Will')).toMatchObject({
      bonus: { kind: 'formula', text: 'item level + 3' }, vs: 'will', target: 'one beast',
    })
    expect(parseAttackLine('Area burst 1 within 10 (creatures in burst); +12 vs. Reflex')).toMatchObject({
      range: { kind: 'area-burst', size: 1, within: 10 },
    })
  })

  it('toRecharge', () => {
    expect(toRecharge('5-6')).toEqual({ kind: 'roll', min: 5 })
    expect(toRecharge('when first bloodied')).toEqual({ kind: 'bloodied' })
    expect(toRecharge('if the power misses')).toEqual({ kind: 'text', text: 'if the power misses' })
  })
})

describe('templates, traps, diseases', () => {
  it('turns prereqCheck functions into TemplatePrereq data', () => {
    const byName = Object.fromEntries(MONSTER_TEMPLATES.map(t => [t.name, t]))
    expect(prereqFromCheck(byName['Battle Champion'].prereqCheck)).toEqual({ kind: 'type', any: ['humanoid'] })
    // Death Knight's text says "Humanoid, level 11" but its check is level only; the check wins.
    expect(prereqFromCheck(byName['Death Knight'].prereqCheck)).toEqual({ kind: 'min-level', level: 11 })
    expect(prereqFromCheck((sb: any) => sb.creatureType === 'humanoid' && sb.level >= 11)).toEqual({
      kind: 'all', of: [{ kind: 'type', any: ['humanoid'] }, { kind: 'min-level', level: 11 }],
    })
    expect(prereqFromCheck(byName['Victim of the Mad Dance'].prereqCheck)).toBeUndefined()
  })

  it('parseDetect reads DC lines', () => {
    const notes = new Notes()
    expect(parseDetect('✦     DC 21: The character notices strange growths.', 'Perception', notes))
      .toEqual([{ skill: 'Perception', dc: 21, text: 'The character notices strange growths.' }])
    expect(parseDetect('Arcana or Perception DC 15', 'Perception', notes)).toEqual([{ skill: 'Arcana or Perception', dc: 15, text: '' }])
  })

  it('enduranceFrom reads the check table', () => {
    const d = { name: '', level: 4, flavor: '', stages: [], check: '', source: '', checkTable: [
      { result: '9 or lower', effect: 'The stage of the disease increases by one.' },
      { result: '10-13', effect: 'No Change' },
      { result: '14 or higher', effect: 'The stage of the disease decreases by one.' },
    ] }
    expect(enduranceFrom(d, new Notes())).toEqual({ improveDc: 14, maintainDc: 10 })
  })
})
