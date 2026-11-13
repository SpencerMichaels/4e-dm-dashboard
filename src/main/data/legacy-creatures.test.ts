import { afterAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Monster, Power } from '@kit'
import type { Creature } from '@common/types'
import { scaffold, validate } from '@common/authoring/core'
import { monsterToCreature } from '@common/authoring/legacy'
import { creatureToMonster, migrateLegacyCreatures } from './legacy-creatures'

/** A Workshop monster with kit-only mechanics (a secondary attack, clauses) the legacy stat block can't hold. */
function workshopMonster(): Monster {
  const m = scaffold('monster', 'Ash Wight', 6, 'soldier') as Monster
  const claw: Power = {
    name: 'Ashen claw', action: 'standard', usage: 'at-will', keywords: ['necrotic'],
    attacks: [
      { label: 'primary', range: { kind: 'melee', reach: 1 }, target: 'one creature', bonus: { kind: 'fixed', value: 11 }, vs: 'ac', hit: { text: '2d6 + 5 necrotic damage.', clauses: [] } },
      { label: 'secondary', after: 'hit', range: { kind: 'melee', reach: 1 }, target: 'the same creature', bonus: { kind: 'fixed', value: 9 }, vs: 'fortitude', hit: { text: 'The target is weakened (save ends).', clauses: [] } },
    ],
  }
  const gust: Power = { name: 'Ash gust', action: 'minor', usage: 'encounter', keywords: [], range: { kind: 'personal' }, attacks: [], effect: { text: 'The wight shifts 2 squares.', clauses: [] } }
  m.powers.push(claw, gust)
  return m
}

describe('legacy creature conversion', () => {
  it('uses Workshop content as it is when the stat block was not edited afterwards', () => {
    const kit = workshopMonster()
    const c: Creature = { ...monsterToCreature(kit, 'w1'), authoredContent: kit }
    expect(creatureToMonster(c)).toEqual({ ...kit, id: 'w1' })
  })

  it('applies later Creatures-page edits onto the Workshop content, keeping kit-only mechanics', () => {
    const kit = workshopMonster()
    const c: Creature = { ...monsterToCreature(kit, 'w1'), authoredContent: kit }
    // What the Creatures page did: it changed only the stat block (and name/HP on the wrapper).
    c.name = 'Ash Wight Captain'
    c.hp = c.maxHp = 90
    ;(c.statBlock.actions as any[]).find(a => a.name === 'Ash gust').effect = 'The wight shifts 3 squares.'
    const m = creatureToMonster(c)
    expect(m).toMatchObject({ id: 'w1', name: 'Ash Wight Captain', hp: 90 })
    expect(m.powers.find(p => p.name === 'Ash gust')!.effect!.text).toBe('The wight shifts 3 squares.')
    expect(m.powers.find(p => p.name === 'Ashen claw')).toEqual(kit.powers[0])
    expect(m.description).toBe(kit.description)
    expect(validate('monster', m).errors).toEqual([])
  })
})

const dir = mkdtempSync(join(tmpdir(), 'legacy-creatures-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'))

describe('legacy creature migration', () => {
  it('converts creature files to records with art and basedOn, keeping the originals', async () => {
    const clone: Creature = {
      id: 'goblin', name: 'Goblin Boss', hp: 30, maxHp: 30, compendiumId: 'monster77', imageId: 'img1', tokenImageId: 'tok1', tokenCrop: { x: 1, y: 2, size: 3 },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      statBlock: { level: 3, role: 'skirmisher', size: 'Small', origin: 'natural', creatureType: 'humanoid', ac: 17, defenses: { fortitude: 14, reflex: 16, will: 13 }, actions: [] },
    }
    writeFileSync(join(dir, 'goblin.json'), JSON.stringify(clone))
    const kit = workshopMonster()
    writeFileSync(join(dir, 'wight.json'), JSON.stringify({ ...monsterToCreature(kit, 'wight', '2026-01-03T00:00:00.000Z'), authoredContent: kit }))
    const record = { id: 'already', createdAt: 'a', updatedAt: 'a', content: { ...kit, id: 'already' } }
    writeFileSync(join(dir, 'already.json'), JSON.stringify(record))

    expect(await migrateLegacyCreatures(dir)).toBe(2)
    const goblin = read('goblin.json')
    expect(goblin).toMatchObject({ id: 'goblin', createdAt: clone.createdAt, updatedAt: clone.updatedAt, basedOn: 'published/creature/monster77', art: { imageId: 'img1', tokenImageId: 'tok1', tokenCrop: { x: 1, y: 2, size: 3 } } })
    expect(goblin.content).toMatchObject({ id: 'goblin', name: 'Goblin Boss', level: 3, hp: 30, size: 'small', defenses: { ac: 17, reflex: 16 } })
    expect(goblin.statBlock).toBeUndefined()
    expect(read('wight.json').content).toEqual({ ...kit, id: 'wight' })
    expect(read('wight.json').art).toBeUndefined()
    expect(read('already.json')).toEqual(record)
    expect(read('_legacy-goblin.json')).toEqual(clone)
    expect(existsSync(join(dir, '_legacy-already.json'))).toBe(false)
    expect(await migrateLegacyCreatures(dir)).toBe(0)
  })
})
