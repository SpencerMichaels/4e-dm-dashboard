import { describe, expect, it } from 'vitest'
import type { Item } from '@kit'
import { cbItemsByName, itemNameKey, readCbItems, splitPlus } from './cb-datapack'
import { crossCheck } from './cb-items'

// Shaped like the Character Builder datapack's records; the values are made up.
const XML = `<D20Rules>
  <RulesElement internal-id="A1" name="Sample Weapon +1" type="Magic Item" source="Book">
    <Flavor> x </Flavor>
    <specific name="Level"> 5 </specific>
    <specific name="Gold"> 1000 </specific>
    <specific name="Magic Item Type"> Weapon </specific>
    <specific name="Tier" />
    <specific name="Enhancement"> +1 attack rolls and damage rolls </specific>
    <specific name="Rarity"> Uncommon </specific>
  </RulesElement>
  <RulesElement internal-id="A2" name="Sample Weapon +2" type="Magic Item" source="Book">
    <specific name="Level"> 11 </specific>
    <specific name="Gold"> 5000 </specific>
    <specific name="Enhancement"> +2 attack rolls and damage rolls </specific>
  </RulesElement>
  <RulesElement internal-id="B1" name="Sample Boots (paragon tier)" type="Magic Item" source="Book">
    <specific name="Level"> 12 </specific>
    <specific name="Gold"> 13000 </specific>
  </RulesElement>
  <RulesElement internal-id="P1" name="Sample Power" type="Power" source="Book" />
</D20Rules>`

const item = (o: Partial<Item>): Item => ({
  id: 'x', name: '', category: 'item', level: 1, rarity: null, levels: [], properties: [], powers: [],
  flavor: '', description: [], sources: [], provenance: { origin: 'parser', by: 't', at: '' }, ...o,
})

describe('Character Builder items', () => {
  it('reads item records and groups versions by base name', () => {
    const cb = readCbItems(XML)
    expect(cb.map(c => c.name)).toEqual(['Sample Weapon +1', 'Sample Weapon +2', 'Sample Boots (paragon tier)'])
    expect(cb[0]).toMatchObject({ level: 5, gold: 1000, magicItemType: 'Weapon', rarity: 'Uncommon' })
    expect(splitPlus('Elven Boots (paragon tier)')).toEqual({ base: 'Elven Boots' })
    expect(splitPlus('Flaming Weapon +6')).toEqual({ base: 'Flaming Weapon', plus: 6 })
    expect(itemNameKey("Kord’s  Relentlessness")).toBe("kord's relentlessness")
    expect(cbItemsByName(cb).get('sample weapon')?.length).toBe(2)
  })

  it('reports version mismatches and fillable prices without changing items', () => {
    const weapon = item({
      id: 'w1', name: 'Sample Weapon', category: 'weapon', rarity: 'uncommon', enhancementTargets: ['attack', 'damage'],
      levels: [{ level: 5, enhancement: 1, price: 1000 }, { level: 10, enhancement: 2, price: 5000 }],
    })
    const boots = item({ id: 'b1', name: 'Sample Boots', level: 12, levels: [{ level: 12, price: null }] })
    const r = crossCheck([weapon, boots, item({ id: 'z', name: 'Unknown' })], readCbItems(XML))
    expect(r.levelMismatch).toEqual([{ id: 'w1', name: 'Sample Weapon', enhancement: 2, ddi: 10, cb: 11 }])
    expect(r.fillable).toEqual([{ id: 'b1', name: 'Sample Boots', level: 12, cb: 13000 }])
    expect(r.priceMismatch).toEqual([])
    expect(r.enhancementMismatch).toEqual([])
    expect(r.unmatched.map(u => u.id)).toEqual(['z'])
    expect(boots.levels[0].price).toBeNull()
  })
})
