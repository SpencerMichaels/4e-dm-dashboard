// Parser regression tests. Each power snippet is copied from content/raw/monsters.json.
import { describe, expect, it } from 'vitest'
import { cleanHeaderKeywords, parseDefenses, parseMonsterHtml, parseRangePart, parseResistValues, parseSavingThrows, splitDamageFromHit } from './html-parser'

/** Minimal monster around real power HTML. */
function parsePowers(powersHtml: string, section = 'Standard Actions', printed = false): any[] {
  const html = '<h1 class=monster>Test<br><span class=type>Medium natural humanoid</span><br>' +
    '<span class=level>Level 5 Brute<span class=xp> XP 200</span></span></h1>' +
    '<table class=bodytable><tr><td><b>HP</b> 70; <b>Bloodied</b> 35</table>' +
    `<h2>${section}</h2>${powersHtml}` +
    "<p class='flavor alt'><b>Str</b> 10 (+0) <b>Con</b> 10 (+0)</p>"
  return (parseMonsterHtml(html, [], { printed }).statBlock as any).actions
}

describe('monster parser fixes', () => {
  it('rejoins words split at fi/fl ligatures (monster3003 Kukri)', () => {
    const [a] = parsePowers("<p class='flavor alt'>(⚔) <b>Kukri</b> (standard, at-will) ✦ <b>Fire, Weapon</b></p><p class=flavorIndent>+25 vs AC; 1d6+4 damage plus 2d6 fi re damage. The human diabolist rerolls any damage die result of 1 until the result is greater than 1.</p>")
    expect(a.damage).toEqual([
      { expr: '1d6+4', type: '', ongoing: false },
      { expr: '2d6', type: 'fire', ongoing: false },
    ])
    expect(a.hit).toBe('The human diabolist rerolls any damage die result of 1 until the result is greater than 1.')
  })

  it('reads a plain-text "✦ Recharge ⚃ ⚄ ⚅" header (monster4940 Dimension Step)', () => {
    const [a] = parsePowers("<p class='flavor alt'> <b>Dimension Step</b> (teleportation) ✦ Recharge ⚃ ⚄ ⚅</p><p class=flavorIndent><i>Effect:</i> The stalker teleports 8 squares.</p>", 'Move Actions')
    expect(a.usage).toBe('recharge')
    expect(a.rechargeCondition).toBe('4-6')
    expect(a.actionType).toBe('move')
    expect(a.keywords).toEqual(['teleportation'])
  })

  it('writes a single recharge die as "6", not "6-6"', () => {
    const [a] = parsePowers("<p class='flavor alt'>⚔ <b>Shadow Strike</b> (necrotic, weapon) ✦ Recharge ⚅</p><p class=flavorIndent><i>Attack:</i> Melee 1 (one creature); +22 vs. AC</p><p class=flavorIndent><i>Hit:</i> 3d10 + 9 damage plus ongoing 5 necrotic damage (save ends).</p>")
    expect(a.rechargeCondition).toBe('6')
    // The orphaned "(save ends)" joins the structured ongoing part.
    expect(a.damage).toEqual([
      { expr: '3d10+9', type: '', ongoing: false },
      { expr: '5', type: 'necrotic', ongoing: true, saveEnds: true },
    ])
    expect(a.hit).toBe('')
  })

  it('moves "N/Encounter" out of keywords (Variable Resistance)', () => {
    const [a] = parsePowers("<p class='flavor alt'> <b>Variable Resistance</b> ✦ <b>2/Encounter</b></p><p class=flavorIndent><i>Trigger:</i> The overgrowth takes acid, cold, fire, lightning, or thunder damage.</p><p class=flavorIndent><i>Effect (Free Action):</i> The overgrowth gains resist 10 to the triggering damage type until the end of the encounter or until it uses variable resistance again.</p>", 'Triggered Actions')
    expect(a.keywords).toEqual([])
    expect(a.usage).toBe('encounter')
    expect(a.encounterUses).toBe(2)
    expect(a.actionType).toBe('free')
  })

  it('keeps text run into the defense out of it (monster5879 Claw "ACIf")', () => {
    const [a] = parsePowers("<p class='flavor alt'>⚔ <b>Claw</b> ✦ <b>At-Will</b></p><p class=flavorIndent><i>Attack:</i> Melee 2 (one or two creatures); +18 vs. ACIf Vestapalk targets only one creature, he can make this attack against it twice.</p><p class=flavorIndent><i>Hit:</i> 3d10 + 5 damage, and Vestapalk can shift up to 2 squares.</p>")
    expect(a.defense).toBe('AC')
    expect(a.attackNotes).toBe('If Vestapalk targets only one creature, he can make this attack against it twice.')
    expect(a.hit).toBe('Vestapalk can shift up to 2 squares.')
  })

  it('splits "targets X" out of the range (Frightful Presence) and keeps the aftereffect separate', () => {
    const [a] = parsePowers("<p class='flavor alt'>ᗕ <b>Frightful Presence</b> (standard, encounter) ✦ <b>Fear</b></p><p class=flavorIndent>Close burst 5; targets enemies; +14 vs Will; the target is stunned until the end of the dragon's next turn. Aftereffect: The target takes a -2 penalty to attack rolls (save ends).</p>")
    expect(a.rangeType).toBe('close-burst')
    expect(a.rangeValue).toBe('5')
    expect(a.target).toBe('enemies')
    expect(a.effect).toBe("The target is stunned until the end of the dragon's next turn")
    expect(a.aftereffect).toBe('The target takes a -2 penalty to attack rolls (save ends).')
  })

  it('moves a utility power\'s leading range out of the effect (Ambassador\'s Sanction)', () => {
    const [a] = parsePowers("<p class='flavor alt'>ᗕ <b>Ambassador's Sanction</b> (standard, at-will) </p><p class=flavorIndent>Close burst 10; targets one ally in burst; the target can move half its speed and make a melee basic attack. The target receives a +2 bonus to the attack roll if it attacks a creature marked by it.</p>")
    expect(a.rangeType).toBe('close-burst')
    expect(a.rangeValue).toBe('10')
    expect(a.target).toBe('one ally in burst')
    expect(a.effect).toMatch(/^The target can move half its speed/)
  })

  it('keeps a secondary attack and its hit apart from the primary hit (Leaping Blast)', () => {
    const [a] = parsePowers("<p class='flavor alt'>(➶) <b>Leaping Blast</b> ✦ <b>At-Will</b></p><p class=flavorIndent><i>Attack:</i> Ranged 10 (one creature); +16 vs. AC</p><p class=flavorIndent><i>Hit:</i> 3d6 + 8 damage, and the target takes a -2 penalty to all defenses (save ends). The infector then makes a secondary attack.</p><p class=flavorIndent>    <i>Secondary Attack:</i> Close burst 2 centered on the primary target (one creature in the burst); +16 vs. Reflex</p><p class=flavorIndent>    <i>Hit:</i> 2d6 + 3 damage, and the target takes a -2 penalty to all defenses (save ends).</p>", 'Standard Actions', true)
    expect(a.damage).toEqual([{ expr: '3d6+8', type: '', ongoing: false }])
    expect(a.hit).toBe('The target takes a -2 penalty to all defenses (save ends). The infector then makes a secondary attack.')
    expect(a.secondary).toBe('Close burst 2 centered on the primary target (one creature in the burst); +16 vs. Reflex Hit: 2d6 + 3 damage, and the target takes a -2 penalty to all defenses (save ends).')
    expect(a.printed['secondary hit']).toBe('2d6 + 3 damage, and the target takes a -2 penalty to all defenses (save ends).')
  })

  it('splits "2d6 damage + 3d6 fire damage" and keeps the aftereffect out of hit (Hurl the Head of Fire)', () => {
    const [a] = parsePowers("<p class='flavor alt'>✻ <b>Hurl the Head of Fire</b> (fire) ✦ <b>Encounter</b></p><p class=flavorIndent><i>Requirement:</i> The scarecrow must be bloodied.</p><p class=flavorIndent><i>Attack:</i> Area burst 3 within 10 (creatures in the burst); +13 vs. AC</p><p class=flavorIndent><i>Hit:</i> 2d6 damage + 3d6 fire damage, and ongoing 5 fire damage (save ends).</p><p class=flavorIndent>    <i>Aftereffect:</i> The scarecrow takes 10 damage.</p>")
    expect(a.damage).toEqual([
      { expr: '2d6', type: '', ongoing: false },
      { expr: '3d6', type: 'fire', ongoing: false },
    ])
    expect(a.hit).toBe('Ongoing 5 fire damage (save ends).')
    expect(a.aftereffect).toBe('The scarecrow takes 10 damage.')
    expect(a.rangeValue).toBe('3 within 10')
    expect(a.target).toBe('creatures in the burst')
  })

  it('leaves conditional extra damage in the hit text (Spear)', () => {
    const [a] = parsePowers("<p class='flavor alt'>(⚔) <b>Spear</b> (weapon) ✦ <b>At-Will</b></p><p class=flavorIndent><i>Attack:</i> Melee 1 (one creature); +6 vs. AC</p><p class=flavorIndent><i>Hit:</i> 2d8 + 2 damage, plus 1d6 extra damage against a prone target.</p>")
    expect(a.damage).toEqual([{ expr: '2d8+2', type: '', ongoing: false }])
    expect(a.hit).toBe('Plus 1d6 extra damage against a prone target.')
  })

  it('reads the action type from "Attack (Immediate Reaction):" labels', () => {
    const [a] = parsePowers("<p class='flavor alt'>⚔ <b>Tail Lash</b> ✦ <b>At-Will</b></p><p class=flavorIndent><i>Trigger:</i> An enemy moves adjacent to the dragon.</p><p class=flavorIndent><i>Attack (Immediate Reaction):</i> Melee 2 (triggering enemy); +15 vs. Reflex</p><p class=flavorIndent><i>Hit:</i> 2d6 + 5 damage.</p>", 'Triggered Actions')
    expect(a.actionType).toBe('immediate-reaction')
  })

  it('keeps a requirement printed with the usage and the printed "when" of a trigger (v12)', () => {
    const [a, b, c] = parsePowers("<p class='flavor alt'> <b>Sweeping Cut</b> (standard; requires greataxe, recharge ⚄⚅) ✦ <b>Weapon</b></p><p class=flavorIndent>close burst 1; +11 vs AC; 1d12+2 damage, and the target is knocked prone.</p>" +
      "<p class='flavor alt'> <b>Warrior's Surge</b> (standard; usable only while bloodied, encounter) ✦ <b>Healing, Weapon</b></p><p class=flavorIndent>+8 vs AC; 1d8+3 damage, and the orc regains 10 hit points.</p>" +
      "<p class='flavor alt'>⚔ <b>Passing Consumption</b> (immediate reaction, when missed by a melee attack made by an adjacent attacker, recharges when first bloodied) </p><p class=flavorIndent>The ghoul can make a gut maw attack that doesn't provoke opportunity attacks.</p>")
    expect(a.requirement).toBe('requires greataxe')
    expect(a.usage).toBe('recharge')
    expect(b.requirement).toBe('usable only while bloodied')
    expect(b.usage).toBe('encounter')
    expect(c.trigger).toBe('when missed by a melee attack made by an adjacent attacker')
    expect(c.triggerEvents).toBeUndefined()
  })

  it('reads a bare "15/30" as ranged and a bare number by the power icon (v13, monster4116 Crossbow)', () => {
    const [a, b, c] = parsePowers("<p class='flavor alt'>(➶) <b>Crossbow</b> (standard, at-will) ✦ <b>Weapon</b></p><p class=flavorIndent>15/30; +11 vs AC; 1d8+5 damage.</p>" +
      "<p class='flavor alt'>➶ <b>Spit</b> (standard, at-will)</p><p class=flavorIndent>20; +15 vs Reflex; 1d8+5 acid damage.</p>" +
      "<p class='flavor alt'>(⚔) <b>Claw</b> (standard, at-will)</p><p class=flavorIndent>2; +15 vs AC; 1d8+5 damage.</p>")
    expect([a.rangeType, a.rangeValue]).toEqual(['ranged', '15/30'])
    expect([b.rangeType, b.rangeValue]).toEqual(['ranged', '20'])
    expect([c.rangeType, c.rangeValue]).toEqual(['melee', '2'])
    const [d] = parsePowers("<p class='flavor alt'>✻ <b>Cloud of Daggers</b> (standard, at-will) ✦ <b>Force </b></p><p class=flavorIndent>1 square within 10; +18 vs Reflex; 1d6+7 force damage.</p>")
    expect([d.rangeType, d.rangeValue]).toEqual(['area-burst', '0 within 10'])
  })

  it('keeps the printed rule of an HP 0 line and a sense printed with no range (v13)', () => {
    const html = '<h1 class=monster>Colossus<br><span class=type>Large elemental animate</span><br>' +
      '<span class=level>Level 10 Solo Brute<span class=xp> XP 0</span></span></h1>' +
      '<p class=flavor><b>Initiative</b> +9 <b>Senses</b> Perception +7; blindsight<br><b>HP</b> 0; <b>Bloodied</b> 0 ; The colossus has infinite hit points; the colossus cannot be bloodied.<br><b>AC</b> 23; <b>Fortitude</b> 22, <b>Reflex</b> 18, <b>Will</b> 22<br><b>Speed</b> 5</p>'
    const sb = parseMonsterHtml(html, [], {}).statBlock as any
    expect(sb.hpText).toBe('The colossus has infinite hit points; the colossus cannot be bloodied.')
    expect(sb.senses).toBe('blindsight')
    // Table stat blocks run the cells together ("your bloodied valueInitiative as conjurer").
    const fig = parseMonsterHtml('<h1 class=monster>Zombie<br><span class=type>Medium natural animate (undead)</span><br><span class=level>Level 1 Brute<span class=xp> XP 0</span></span></h1><table class=bodytable><tr><td><b>HP</b> 0; <b>Bloodied</b> 0 ; your bloodied value<td class=rightalign><b>Initiative</b> as conjurer<tr><td><b>AC</b> 0</table>', [], {}).statBlock as any
    expect(fig.hpText).toBe('your bloodied value')
  })

  it('reads companion surges and class roles, equipment commas and walk notes (v14)', () => {
    const html = '<h1 class=monster>Taloklaxus (Companion)<br><span class=type>Medium natural magical beast</span><br><span class=level>Level 4 Defender<span class=xp>-</span></span></h1>' +
      '<table class=bodytable><tr><td><b>HP</b> 48; <b>Bloodied</b> 24; <b>Healing Surges</b> 11; <b>Surge Value</b> 12<td class=rightalign><b>Initiative</b> +3<tr><td><b>Speed</b> 6 (earth walk), burrow 4 (loose earth only)</table>' +
      "<p class='flavor alt'><b>Str</b> 10 (+0) <b>Con</b> 10 (+0)<br><b>Equipment</b>: chainmail , crossbow , warhammer .</p>"
    const sb = parseMonsterHtml(html, [], {}).statBlock as any
    expect(sb).toMatchObject({ role: '', classRole: 'defender', healingSurges: 11, surgeValue: 12, xp: 0, equipment: 'chainmail, crossbow, warhammer' })
    expect(sb.speedNotes).toBe('earth walk; burrow: loose earth only')
    const npc = (level: string) => parseMonsterHtml(`<h1 class=monster>N<br><span class=type>Medium natural humanoid</span><br><span class=level>${level}</span></h1>`, [], {}).statBlock as any
    expect(npc('Level 5 Leader<span class=xp>-</span>')).toMatchObject({ role: '', classRole: 'leader', leader: undefined })
    expect(npc('Level 2 Controller<span class=xp> XP 125</span>')).toMatchObject({ role: 'controller', classRole: undefined })
    expect(npc('Level 2 Controller (Leader)<span class=xp> XP 125</span>')).toMatchObject({ role: 'controller', leader: true })
  })

  it('reads an attack printed under an Effect label or a named attack label (monster5737, monster6380, v14)', () => {
    const [a] = parsePowers("<p class='flavor alt'>ᗕ <b>Pulsing Ghostfire</b> (fire) ✦ <b>Encounter</b></p><p class=flavorIndent><i>Trigger:</i> The drake is immobilized, restrained, or stunned.</p><p class=flavorIndent><i>Effect (No Action):</i> Close burst 2 (creatures in the burst); +9 vs. Reflex</p><p class=flavorIndent><i>Hit:</i> 3d10 + 4 fire damage, and the target falls prone.</p><p class=flavorIndent><i>Miss:</i> Half damage.</p>", 'Triggered Actions', true)
    expect(a).toMatchObject({ actionType: 'no-action', rangeType: 'close-burst', rangeValue: '2', attackBonus: 9, defense: 'Reflex', miss: 'Half damage.' })
    expect(a.printed.hit).toBe('3d10 + 4 fire damage, and the target falls prone.')
    const [b] = parsePowers("<p class='flavor alt'>⚔ ᗕ <b>Fling</b> ✦ <b>At-Will</b></p><p class=flavorIndent><i>Effect:</i> Melee 3 (one creature grabbed by the kraken); the kraken slides the target up to 5 squares and makes the following attack against the target.</p><p class=flavorIndent>    <i>Tentacle Attack:</i> +19 vs. Fortitude</p><p class=flavorIndent>    <i>Hit:</i> 2d8 + 11 damage, and the target falls prone.</p>", 'Standard Actions', true)
    expect(b).toMatchObject({ attackBonus: 19, defense: 'Fortitude', attackName: 'Tentacle' })
    expect(b.printed.effect).toMatch(/^Melee 3/)
    expect(b.printed.hit).toBe('2d8 + 11 damage, and the target falls prone.')
  })
})

describe('parser helpers', () => {
  it('cleanHeaderKeywords drops usage words and recharge fragments', () => {
    expect(cleanHeaderKeywords(['Recharge', 'Fire'])).toMatchObject({ keywords: ['Fire'], usage: 'recharge' })
    expect(cleanHeaderKeywords(['Weapon; Cold'])).toMatchObject({ keywords: ['Weapon', 'Cold'] })
    expect(cleanHeaderKeywords(['At-Will (1/round)'])).toMatchObject({ keywords: [], frequency: ['1/round'] })
    expect(cleanHeaderKeywords(['Acid, Cold, or Poison'])).toMatchObject({ keywords: ['Acid', 'Cold', 'Poison'] })
  })

  it('parseRangePart separates range, target and notes', () => {
    expect(parseRangePart('Ranged 10; targets a stunned or dazed creature')).toEqual({ rangeType: 'ranged', rangeValue: '10', target: 'a stunned or dazed creature', notes: [] })
    expect(parseRangePart('Targets the triggering enemy')).toEqual({ rangeType: 'melee', rangeValue: '', target: 'the triggering enemy', notes: [] })
    expect(parseRangePart('Range 5/10 (one creature)')).toEqual({ rangeType: 'ranged', rangeValue: '5/10', target: 'one creature', notes: [] })
    expect(parseRangePart('Melee 1 or Ranged 10')).toEqual({ rangeType: 'ranged', rangeValue: '1', target: '', notes: ['or Ranged 10'] })
  })

  it('parseDefenses keeps base values and printed conditional ones', () => {
    expect(parseDefenses('AC 24 (28 against opportunity attacks); Fortitude 20, Reflex 24, Will 20')).toEqual({
      defenses: { ac: 24, fortitude: 20, reflex: 24, will: 20 },
      defensesIf: [{ defense: 'ac', value: 28, if: 'against opportunity attacks' }],
    })
    expect(parseDefenses('AC 30 (28 while bloodied); Fortitude 29, Reflex 30 (29 while bloodied), Will 28')?.defensesIf).toEqual([
      { defense: 'ac', value: 28, if: 'while bloodied' }, { defense: 'reflex', value: 29, if: 'while bloodied' },
    ])
    expect(parseDefenses('AC 22 (AC 25 against opportunity attacks); Fortitude 18, Reflex 22, Will 20')?.defensesIf).toEqual([{ defense: 'ac', value: 25, if: 'against opportunity attacks' }])
    expect(parseDefenses('AC 20 (+2 while flying); Fortitude 18, Reflex 19 (-1 when bloodied), Will 18')?.defensesIf).toEqual([
      { defense: 'ac', value: 22, if: 'while flying' }, { defense: 'reflex', value: 18, if: 'when bloodied' },
    ])
    expect(parseDefenses('AC 42 (44); Fortitude 39, Reflex 41, Will 27 (+1 to all defenses against bloodied enemies)')).toEqual({
      defenses: { ac: 42, fortitude: 39, reflex: 41, will: 27 },
      unplaced: ['ac 42 (44)', 'will 27 (+1 to all defenses against bloodied enemies)'],
    })
    expect(parseDefenses('AC 17, Fortitude 18, Reflex 16, Will 16')).toEqual({ defenses: { ac: 17, fortitude: 18, reflex: 16, will: 16 } })
    expect(parseDefenses('HP 30')).toBeUndefined()
  })

  it('parseSavingThrows keeps only the unconditional bonus and the rest as notes', () => {
    expect(parseSavingThrows('+2; ')).toEqual({ bonus: 2 })
    expect(parseSavingThrows('+5 against fear effects')).toEqual({ bonus: 0, notes: ['+5 against fear effects'] })
    expect(parseSavingThrows('5 against charm effects')).toEqual({ bonus: 0, notes: ['5 against charm effects'] })
    expect(parseSavingThrows('+2 (+4 against charm effects)')).toEqual({ bonus: 2, notes: ['+4 against charm effects'] })
    expect(parseSavingThrows('+2; +5 against charm effects, immobilized, restrained, and slowed')).toEqual({ bonus: 2, notes: ['+5 against charm effects, immobilized, restrained, and slowed'] })
    expect(parseSavingThrows('+2, +4 against poison')).toEqual({ bonus: 2, notes: ['+4 against poison'] })
    expect(parseSavingThrows('+12 (+14 vs. effects with the fear or charm keywords)')).toEqual({ bonus: 12, notes: ['+14 vs. effects with the fear or charm keywords'] })
    expect(parseSavingThrows('+5; see also unstoppable')).toEqual({ bonus: 5, notes: ['see also unstoppable'] })
    expect(parseSavingThrows('')).toEqual({ bonus: 0 })
    const html = '<h1 class=monster>Test<br><span class=type>Medium natural humanoid</span><br><span class=level>Level 5 Brute<span class=xp> XP 200</span></span></h1>' +
      '<table class=bodytable><tr><td><b>HP</b> 70; <b>Bloodied</b> 35</td></tr><tr><td><b>Saving Throws</b> +2 (+4 against charm effects); <b>Action Points</b> 1</td></tr></table>'
    expect(parseMonsterHtml(html, []).statBlock).toMatchObject({ savingThrowBonus: 2, savingThrowNotes: ['+4 against charm effects'], actionPoints: 1 })
  })

  it('parseResistValues handles trailing semicolons, notes, and text-only entries', () => {
    expect(parseResistValues('10 necrotic;')).toEqual([{ type: 'necrotic', value: 10 }])
    expect(parseResistValues('10 necrotic, insubstantial')).toEqual([{ type: 'necrotic', value: 10 }, { type: 'insubstantial' }])
    expect(parseResistValues('5 fire (a magma runner that takes fire damage gains +2 speed until the end of its next turn)'))
      .toEqual([{ type: 'fire', value: 5, note: 'a magma runner that takes fire damage gains +2 speed until the end of its next turn' }])
    expect(parseResistValues('fire 20')).toEqual([{ type: 'fire', value: 20 }])
  })

  it('splitDamageFromHit keeps the hit text as printed', () => {
    expect(splitDamageFromHit('1d6 + 4 psychic damage, and the target is dazed (save ends).'))
      .toEqual({ damage: '1d6 + 4 psychic damage,', hit: 'the target is dazed (save ends).', critical: '' })
  })
})
