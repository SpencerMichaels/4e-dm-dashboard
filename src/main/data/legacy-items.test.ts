import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { scaffold, validate } from '@common/authoring/core'
import type { Item as KitItem } from '@kit'
import { migrateLegacyItems } from './legacy-items'

const dir = mkdtempSync(join(tmpdir(), 'legacy-items-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'))

describe('legacy campaign item migration', () => {
  it('converts editor items and Workshop items to kit records, keeping the originals', async () => {
    const editorItem = {
      id: 'blade', name: 'Ember Blade', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      extra: {
        name: 'Ember Blade', category: 'weapon', level: 5, rarity: 'Uncommon', price: '1,000 gp', flavor: 'It smolders.', slot: 'Weapon',
        itemType: 'Any heavy blade', enhancement: 'attack rolls and damage rolls', critDie: '1d6', critType: 'fire', critExtra: '',
        properties: ['Resist 5 fire.'], groups: ['Heavy Blade'], damage: '1d8', proficiency: '+3',
        powers: [{ name: 'Flare', entryType: 'action', actionType: 'minor', usage: 'encounter', keywords: ['Fire'], rangeType: '', rangeValue: '', target: '', attackBonus: null, attackNotes: '', defense: '', damage: [], hit: '', miss: '', effect: 'The blade sheds bright light 5.', trigger: '', requirement: '', sustain: '' }],
      },
    }
    const authored = { ...(scaffold('item', 'Workshop Ring', 8) as KitItem), slot: 'ring' as const, flavor: 'Made with an agent.' }
    const workshopItem = { id: 'ring', name: 'Workshop Ring', tags: [], createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z', extra: {}, authoredContent: authored }
    writeFileSync(join(dir, 'blade.json'), JSON.stringify(editorItem))
    writeFileSync(join(dir, 'ring.json'), JSON.stringify(workshopItem))
    const record = { id: 'already', createdAt: 'a', updatedAt: 'a', content: { ...authored, id: 'already' } }
    writeFileSync(join(dir, 'already.json'), JSON.stringify(record))

    expect(await migrateLegacyItems(dir)).toBe(2)
    const blade = read('blade.json')
    expect(blade).toMatchObject({ id: 'blade', createdAt: editorItem.createdAt, updatedAt: editorItem.updatedAt })
    const kit = blade.content as KitItem
    expect(kit).toMatchObject({ id: 'blade', name: 'Ember Blade', category: 'weapon', level: 5, rarity: 'uncommon', flavor: 'It smolders.' })
    expect(kit.critical?.text).toBe('+1d6 fire damage per plus')
    expect(kit.properties.map(p => p.text)).toEqual(['Resist 5 fire.'])
    expect(kit.powers).toMatchObject([{ name: 'Flare', action: 'minor', usage: 'encounter', effect: { text: 'The blade sheds bright light 5.' } }])
    expect(validate('item', kit).errors).toEqual([])
    expect(read('ring.json').content).toEqual({ ...authored, id: 'ring' })
    expect(read('already.json')).toEqual(record)
    expect(read('_legacy-blade.json')).toEqual(editorItem)
    expect(existsSync(join(dir, '_legacy-already.json'))).toBe(false)
    // Running again changes nothing.
    expect(await migrateLegacyItems(dir)).toBe(0)
  })
})
