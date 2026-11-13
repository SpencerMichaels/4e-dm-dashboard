import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Creature } from '@common/types'
import * as facts from '@common/combat/facts'
import { creatureToMonster } from '../data/legacy-creatures'
import { publishedMonster } from './published-monsters'

const root = join(__dirname, '../../../content')
const parsedFile = join(root, 'parsed/monsters.json')
const hasContent = existsSync(parsedFile)

/** The facts combat read from a legacy stat block before it moved to kit content. */
function legacyFacts(c: Creature) {
  const sb = c.statBlock as Record<string, any>
  const powers = (sb.actions ?? []).filter((a: any) => a.entryType !== 'trait' && a.entryType !== 'aura')
  return {
    save: sb.savingThrowBonus ?? 0, minion: !!sb.isMinion,
    defenses: { ac: sb.ac, fortitude: sb.defenses?.fortitude, reflex: sb.defenses?.reflex, will: sb.defenses?.will },
    initiative: sb.initiative,
    resist: (sb.resistances ?? []).filter((r: any) => r.value !== undefined && !/variable/i.test(r.type)).map((r: any) => `${r.type.toLowerCase()} ${r.value}`),
    immune: (sb.immunities ?? []).map((i: any) => i.type.toLowerCase()),
    vulnerable: (sb.weaknesses ?? []).filter((r: any) => r.value !== undefined).map((r: any) => `${r.type.toLowerCase()} ${r.value}`),
    regeneration: sb.regeneration?.value, revival: sb.revival?.hp,
    powers: powers.map((a: any) => [a.name, a.usage === 'recharge' ? parseInt(a.rechargeCondition) || 6 : 0, (a.triggerEvents ?? []).join('+'), a.selfTurnOnly ? 'self' : ''].join('|')),
  }
}

function kitFacts(c: facts.WithContent) {
  const mods = facts.damageModifiers(c)
  return {
    save: facts.saveBonus(c), minion: facts.isMinion(c), defenses: facts.defenses(c), initiative: facts.initiativeBonus(c),
    // Accepted: the kit parses "20/variable" as a variable resistance (no damage type, so no change in play).
    resist: mods.resist.filter(r => r.value !== undefined && !/variable/i.test(r.type)).map(r => `${r.type} ${r.value}`), immune: mods.immune.map(i => i.type),
    vulnerable: mods.vulnerable.filter(r => r.value !== undefined).map(r => `${r.type} ${r.value}`),
    regeneration: facts.regeneration(c)?.value, revival: facts.revival(c)?.hp,
    powers: facts.combatEntries(c).filter(e => e.group === 'powers').map(e => [e.name, e.rechargeMin ?? 0, (e.hints.triggerEvents ?? []).join('+'), e.hints.selfTurnOnly ? 'self' : ''].join('|')),
  }
}

function compare(name: string, toKit: (id: string, c: Creature) => facts.WithContent | null) {
  const parsed: Record<string, Creature> = JSON.parse(readFileSync(parsedFile, 'utf-8'))
  const diffs: Record<string, string[]> = {}
  for (const [id, c] of Object.entries(parsed)) {
    const kit = toKit(id, c)
    const before = legacyFacts(c), after = kitFacts(kit!) as Record<string, unknown>
    for (const [key, value] of Object.entries(before)) {
      if (JSON.stringify(value) !== JSON.stringify(after[key])) (diffs[key] ??= []).push(`${id} ${c.name}: ${JSON.stringify(value)} -> ${JSON.stringify(after[key])}`)
    }
  }
  return Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, { count: v.length, examples: v.slice(0, 3) }]))
}

describe.skipIf(!hasContent)('combat facts from converted monsters', () => {
  it('campaign creatures convert with the same combat facts', () => {
    const diffs = compare('campaign', (id, c) => ({ kind: 'creature', content: creatureToMonster({ ...c, id }) }))
    expect(diffs).toEqual({})
  })

  it('published monsters from the raw corpus keep the combat facts of the parsed corpus', () => {
    const diffs = compare('published', id => ({ kind: 'creature', content: publishedMonster(root, id, () => null)! }))
    expect(diffs).toEqual({})
  }, 120_000)
})

describe('campaign creature conversion', () => {
  it('keeps power text from the editor fields and accepts editor-shaped rows', () => {
    const creature: Creature = {
      id: 'stalker', name: 'Stalker', hp: 97, maxHp: 97, createdAt: '', updatedAt: '',
      statBlock: {
        level: 12, role: 'lurker', ac: 26, defenses: { fortitude: 23, reflex: 25, will: 24 }, initiative: 15, perception: 9,
        senses: ['Darkvision'], languages: ['Common', 'Deep Speech'], speed: 6, speeds: { climb: 4 }, savingThrowBonus: 0,
        immunities: [], resistances: [{ type: 'necrotic', value: 10 }], weaknesses: [], abilities: { str: 14, con: 16, dex: 20, int: 10, wis: 16, cha: 12 },
        actions: [
          { name: 'Whispers', entryType: 'action', actionType: 'standard', usage: 'recharge', rechargeCondition: '5', keywords: ['psychic'], rangeType: 'ranged', rangeValue: '10',
            target: 'one creature', attackBonus: 15, defense: 'Will', damage: [{ expr: '1d6+4', type: 'psychic', ongoing: false }], hit: 'The target is dazed (save ends).',
            miss: 'Half damage.', effect: 'The stalker becomes invisible.', trigger: '', requirement: '' },
          { name: 'Rise Again', entryType: 'trait', effect: 'The first time the stalker drops to 0 hit points, it rises with 20 hit points.' },
        ],
      },
    }
    const c = { kind: 'creature' as const, content: creatureToMonster(creature) }
    const power = c.content.powers[0]
    expect(power.attacks[0]).toMatchObject({ bonus: { kind: 'fixed', value: 15 }, vs: 'will', target: 'one creature', hit: { text: '1d6+4 psychic damage. The target is dazed (save ends).' }, miss: { text: 'Half damage.' } })
    expect(power.effect?.text).toBe('The stalker becomes invisible.')
    expect(c.content.senses).toEqual([{ kind: 'darkvision' }])
    expect(c.content.languages).toBe('Common, Deep Speech')
    expect(facts.revival(c)).toEqual({ hp: 20, abilityName: 'Rise Again' })
    expect(facts.combatEntries(c).map(e => [e.group, e.name, e.rechargeMin])).toEqual([['traits', 'Rise Again', undefined], ['powers', 'Whispers', 5]])
    expect(facts.damageModifiers(c).resist).toEqual([{ type: 'necrotic', value: 10 }])
  })

})
