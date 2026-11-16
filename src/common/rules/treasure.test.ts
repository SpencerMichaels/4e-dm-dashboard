import { describe, expect, it } from 'vitest'
import type { Treasure } from '../types/treasure'
import { DMG_MONEY_PARCELS, DMG_MONEY_TOTAL, RC_TABLE, dmgSlots, parseRcLine, pickBand, rollRcLevel, rollRcTreasure, tallyTreasure, treasureBudget } from './treasure'

/** A fixed sequence of d20/die results as an rng: each value v of a die with `sides` faces needs rng() in [(v-1)/sides, v/sides). */
function scripted(values: number[], sides: number[]) {
  let i = 0
  return () => { const v = values[i], s = sides[i]; i++; return (v - 0.5) / s }
}

describe('DMG parcels', () => {
  it('adds up to each level\'s printed monetary total', () => {
    for (let level = 1; level <= 30; level++) {
      expect(DMG_MONEY_PARCELS[level]).toHaveLength(6)
      expect(DMG_MONEY_PARCELS[level].reduce((a, b) => a + b, 0)).toBe(DMG_MONEY_TOTAL[level])
    }
  })

  it('gives a party of five four items from level + 4 down to level + 1 and six money parcels', () => {
    const slots = dmgSlots(6, 5)
    expect(slots.filter(s => s.kind === 'item').map(s => s.itemLevel)).toEqual([10, 9, 8, 7])
    expect(slots.filter(s => s.kind === 'money').map(s => s.gp)).toEqual([1000, 900, 600, 600, 300, 200])
    expect(treasureBudget('dmg', 6, 5)).toEqual({ items: 4, gp: 3600 })
  })

  it('caps item levels at 30, and level 30\'s parcel 1 is two items', () => {
    expect(dmgSlots(27, 5).filter(s => s.kind === 'item').map(s => s.itemLevel)).toEqual([30, 30, 29, 28])
    const top = dmgSlots(30, 5).filter(s => s.kind === 'item')
    expect(top.map(s => s.key)).toEqual(['dmg:1a', 'dmg:1b', 'dmg:2', 'dmg:3', 'dmg:4'])
    expect(top.every(s => s.itemLevel === 30)).toBe(true)
  })

  it('adjusts for party size as DMG p. 125 lists', () => {
    const items = (size: number) => dmgSlots(10, size).filter(s => s.kind === 'item').map(s => s.itemLevel)
    const money = (size: number) => dmgSlots(10, size).filter(s => s.kind === 'money').length
    expect(items(8)).toEqual([14, 13, 12, 11, 13, 12, 11])
    expect(items(7)).toEqual([14, 13, 12, 11, 12, 11])
    expect(items(6)).toEqual([14, 13, 12, 11, 12])
    expect(items(4)).toEqual([14, 13, 11])
    expect(items(3)).toEqual([14, 12])
    expect(items(2)).toEqual([12])
    expect(items(1)).toEqual([12])
    expect(money(2)).toBe(6)
    expect(money(1)).toBe(5)
    expect(items(12)).toEqual(items(8))
  })
})

describe('RC treasure by party level', () => {
  it('parses every line of every level', () => {
    for (let level = 1; level <= 30; level++) for (const line of RC_TABLE[level]) expect(parseRcLine(line).length).toBeGreaterThan(0)
    expect(parseRcLine('11-14 2d6x100 sp; 15+ 2d6x10 gp')).toEqual([
      { min: 11, max: 14, result: { kind: 'coins', dice: { n: 2, sides: 6, plus: 0 }, mult: 100, coin: 'sp' } },
      { min: 15, max: undefined, result: { kind: 'coins', dice: { n: 2, sides: 6, plus: 0 }, mult: 10, coin: 'gp' } },
    ])
    expect(parseRcLine('13-18 item 30; 19+ 2 item 30')[1].result).toEqual({ kind: 'item', count: 2, level: { n: 0, sides: 0, plus: 30 } })
  })

  it('picks bands by the modified roll, the best on a natural 20 unless none applies (RC p. 299)', () => {
    const gems = parseRcLine('14-19 1d4 gems 100; 20+ 1 gems 500')
    expect(pickBand(gems, 13, 0)).toBeUndefined()
    expect(pickBand(gems, 15, 0)).toBe(gems[0])
    expect(pickBand(gems, 18, 2)).toBe(gems[1])
    // The book's example: three characters (-4), a natural 20 for gems still gives the 500 gp gem ...
    expect(pickBand(gems, 20, -4)).toBe(gems[1])
    // ... and for art objects (18+) the lesser (only) result, though 16 would normally give none.
    const art = parseRcLine('18+ 1d3 art 250')
    expect(pickBand(art, 20, -4)).toBe(art[0])
    expect(pickBand(art, 19, -4)).toBeUndefined()
    // The top band is open-ended for big parties.
    expect(pickBand(parseRcLine('11-20 1d8x100 pp'), 18, 6)).toBeDefined()
  })

  it('rolls a treasure into a money slot and an item slot with rarity from the unmodified roll', () => {
    // Level 6, five PCs: coins 15 -> 8d8 (all 4s) x 10 = 320 gp; gems 20 -> one 500 gp gem; art 3 -> none; item 14 (even) -> uncommon, 1d4 = 2 -> level 8.
    const rng = scripted([15, 4, 4, 4, 4, 4, 4, 4, 4, 20, 3, 14, 2], [20, 8, 8, 8, 8, 8, 8, 8, 8, 20, 20, 20, 4])
    expect(rollRcTreasure(6, 5, 1, rng)).toEqual([
      { key: 'rc:1:money', kind: 'money', gp: 820, label: 'Treasure 1', text: '320 gp, 1 gem worth 500 gp' },
      { key: 'rc:1:item', kind: 'item', itemLevel: 8, rarity: 'uncommon', label: 'Treasure 1' },
    ])
  })

  it('counts silver at a tenth of a gp and rolls ten treasures per level', () => {
    // Level 1: coins 12 -> 2d6 (1, 1) x 100 sp = 200 sp = 20 gp; the rest miss.
    const rng = scripted([12, 1, 1, 2, 2, 2], [20, 6, 6, 20, 20, 20])
    expect(rollRcTreasure(1, 5, 2, rng)).toEqual([{ key: 'rc:2:money', kind: 'money', gp: 20, label: 'Treasure 2', text: '200 sp' }])
    const level = rollRcLevel(12, 5)
    expect(new Set(level.map(s => s.label)).size).toBeLessThanOrEqual(10)
    expect(level.every(s => s.kind === 'money' ? s.gp! > 0 : s.itemLevel! >= 13 && s.itemLevel! <= 16)).toBe(true)
  })
})

describe('tally', () => {
  const t = (patch: Partial<Treasure>): Treasure => ({ id: Math.random().toString(), level: 5, createdAt: '', updatedAt: '', ...patch })
  it('counts permanent items as items, money and consumables as gp, by stage', () => {
    const potion = { name: 'Potion', level: 5, consumable: true, priceGp: 50 }
    const sword = { name: 'Sword', level: 8, consumable: false, priceGp: 3400 }
    const list = [
      t({ money: { text: '200 gp', gp: 200 }, found: true }),
      t({ money: { text: '50 gp', gp: 50 }, locationId: 'loc' }),
      t({ item: { compendiumId: 'potion' } }),
      t({ item: { compendiumId: 'sword' }, encounterId: 'enc' }),
      t({ item: { compendiumId: 'gone' } }),
    ]
    const facts = (x: Treasure) => x.item?.compendiumId === 'potion' ? potion : x.item?.compendiumId === 'sword' ? sword : null
    expect(tallyTreasure(list, facts, x => !!(x.locationId || x.encounterId))).toEqual({
      items: { found: 0, placed: 1, planned: 0 },
      gp: { found: 200, placed: 50, planned: 50 },
    })
  })
})
