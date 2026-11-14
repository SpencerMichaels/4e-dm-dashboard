// Encounter adjustments on kit monsters (src/common/rules/adjust-monster.ts) over every published
// template and theme. The snapshots were taken when the kit version replaced the legacy stat block
// appliers (2026-11-13) and matched them, except for two fixed legacy bugs: templates with role "any"
// set the role to "any", and every template made the creature elite (now rank follows the template).

import { describe, expect, it } from 'vitest'
import type { Creature } from '@common/types'
import type { Monster } from '@kit'
import { adjustMonster, templateAllowed } from '@common/rules/adjust-monster'
import { createHash } from 'crypto'
import type { MonsterTemplate, MonsterTheme } from '@kit'
import { contentRepoDir, readRepoEntries } from '../../../tools/content/repo'
import { creatureToMonster } from '../data/legacy-creatures'

// Published templates and themes from the content repo; these tests skip without it.
const templates = readRepoEntries<MonsterTemplate>('templates')
const themes = readRepoEntries<MonsterTheme>('themes')
const hasRepo = !!contentRepoDir()

const statBlock = (level: number) => ({
  level, role: 'soldier', monsterModifier: '', hp: 80, ac: 20, defenses: { fortitude: 18, reflex: 17, will: 16 }, initiative: 5, perception: 4,
  savingThrowBonus: 0, actionPoints: 0, abilities: { str: 16, con: 14, dex: 12, int: 10, wis: 12, cha: 10 },
  subtypes: [], senses: '', immunities: [], resistances: [], weaknesses: [], skills: { athletics: 9 }, origin: 'natural', creatureType: 'humanoid',
  actions: [{ name: 'Mace', entryType: 'action', actionType: 'standard', usage: 'at-will', keywords: [], rangeType: 'melee', rangeValue: '1', target: 'one creature',
    attackBonus: level + 5, defense: 'AC', damage: [{ expr: '2d6+4', type: '', ongoing: false }], hit: '', miss: '', effect: '', trigger: '', requirement: '' }],
})
const creature = (level: number): Creature => ({ id: 'c', name: 'Guard', hp: 80, maxHp: 80, createdAt: '', updatedAt: '', statBlock: statBlock(level) })

/** Printed text as a short hash: the snapshot notices a change without holding book text. */
const h = (text: string | undefined) => text ? createHash('sha256').update(text).digest('hex').slice(0, 12) : ''

/** What an adjustment changes, compactly: numbers, added keywords and senses, damage modifiers, and entries with attack bonuses. */
const summary = (m: Monster) => [
  `${m.rank} ${m.role} L${m.level} hp ${m.hp} xp ${m.xp} ac ${m.defenses.ac} f ${m.defenses.fortitude} r ${m.defenses.reflex} w ${m.defenses.will} saves ${m.savingThrowBonus} ap ${m.actionPoints} origin ${m.origin}${m.leader ? ' leader' : ''}`,
  `skills ${JSON.stringify(m.skills)} regen ${m.regeneration?.value ?? '-'} keywords ${m.keywords.join(',')} senses ${m.senses.map(s => s.kind).join(',')}`,
  `immune ${m.immune.map(i => i.type).join(',')} resist ${m.resist.map(r => `${r.type} ${r.value}`).join(',')} vulnerable ${m.vulnerable.map(r => `${r.type} ${r.value}`).join(',')}`,
  ...m.traits.map(t => `trait ${t.name}: ${h(t.text.text)}`), ...m.auras.map(a => `aura ${a.range} ${a.name}: ${h(a.text.text)}`),
  ...m.powers.map(p => `power ${p.name} (${p.action}, ${p.usage}${p.recharge ? ' ' + JSON.stringify(p.recharge) : ''}) ${p.attacks.map(a => `${a.bonus.kind === 'fixed' ? a.bonus.value : JSON.stringify(a.bonus)} vs ${a.vs}: ${h(a.hit?.text)}`).join(' / ')}${p.effect ? ' effect: ' + h(p.effect.text) : ''}`),
]

describe('encounter adjustments on kit monsters', () => {
  it.skipIf(!hasRepo)('applies every published template', () => {
    expect(Object.fromEntries(templates.flatMap(t => [3, 13, 25].map(level =>
      [`${t.name} at ${level}`, summary(adjustMonster(creatureToMonster(creature(level)), { templates: [t] }).monster)])))).toMatchSnapshot()
  })

  it.skipIf(!hasRepo)('applies every published theme with its first attack and utility power', () => {
    expect(Object.fromEntries(themes.flatMap(t => [3, 13].map(level => {
      const attack = t.powers.find(p => p.category === 'attack')?.name ?? '', utility = t.powers.find(p => p.category === 'utility')?.name ?? ''
      return [`${t.name} at ${level}`, summary(adjustMonster(creatureToMonster(creature(level)), { theme: { theme: t, attack, utility, skillChoice: 0 } }).monster)]
    })))).toMatchSnapshot()
  })

  it.skipIf(!hasRepo)('checks template prerequisites across creature types, levels, keywords, and ranks', () => {
    const grid = ['humanoid', 'beast', 'magical beast', 'animate'].flatMap(creatureType => [1, 11, 21].flatMap(level =>
      [[], ['undead'], ['undead', 'zombie'], ['swarm'], ['devil'], ['dragon'], ['reptile']].flatMap(subtypes =>
        ['', 'elite', 'solo'].map(monsterModifier => creatureToMonster({ ...creature(level), statBlock: { ...statBlock(level), creatureType, subtypes, monsterModifier } })))))
    // One character per grid creature: + allowed, . not.
    expect(Object.fromEntries(templates.map(t => [t.name, grid.map(m => templateAllowed(m, t) ? '+' : '.').join('')]))).toMatchSnapshot()
  })

  it.skipIf(!hasRepo)('two templates make a solo with +5 saves', () => {
    const { monster, attribution } = adjustMonster(creatureToMonster(creature(5)), { templates: [templates[0], templates[1]] })
    expect(monster).toMatchObject({ rank: 'solo', savingThrowBonus: 5 })
    expect(attribution.sources.rank).toEqual({ name: templates[1].name, index: 1 })
  })

  it.skipIf(!hasRepo)('a template on an elite makes a solo; Elite Dragon lowers a solo', () => {
    const elite = { ...creatureToMonster(creature(5)), rank: 'elite' as const }
    expect(adjustMonster(elite, { templates: [templates[0]] }).monster.rank).toBe('solo')
    const eliteDragon = templates.find(t => t.rankChange === 'down')!
    expect(adjustMonster({ ...elite, rank: 'solo' }, { templates: [eliteDragon] }).monster.rank).toBe('elite')
  })

  it('level adjustment raises defenses, HP, attacks, and damage', () => {
    const { monster, attribution } = adjustMonster(creatureToMonster(creature(5)), { levelAdjust: 3 })
    expect(monster).toMatchObject({ level: 8, hp: 104, defenses: { ac: 23, fortitude: 21, reflex: 20, will: 19 } })
    expect(monster.powers[0].attacks[0]).toMatchObject({ bonus: { value: 13 }, hit: { text: '2d6 + 5 damage.' } })
    expect(attribution.levelAdjust[0]).toEqual({ attackDelta: 3, damageDelta: 1, source: 'Level +3' })
    expect(adjustMonster(creatureToMonster(creature(5)), { levelAdjust: -2 }).monster.powers[0].attacks[0].hit?.text).toBe('2d6 + 3 damage.')
  })

  it('minions have 1 HP and minion XP', () => {
    expect(adjustMonster(creatureToMonster(creature(5)), { minion: true }).monster).toMatchObject({ rank: 'minion', hp: 1, xp: 50 })
  })
})
