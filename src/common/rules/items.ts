// D&D 4e magic item numbers, from the latest published rule for each (as in benchmarks.ts).
//   PHB  Player's Handbook (2008) p. 223 Magic Item Prices; p. 225 item level and enhancement bonus.
//   RC   Rules Compendium (2010) p. 278 Magic Item Values: the same gold piece values, with the
//        sale price set by rarity (common 20%, uncommon 50%, rare 100%), replacing the PHB's
//        flat one-fifth.
// Consumables (potions, elixirs, alchemical items) have their own, much lower prices, and no
// book here prints a rule for them; use published precedents.

export type Rarity = 'common' | 'uncommon' | 'rare'

/** Gold piece value of a permanent magic item by level (PHB p. 223, RC p. 278). */
export const MAGIC_ITEM_VALUE: Record<number, number> = {
  1: 360, 2: 520, 3: 680, 4: 840, 5: 1000, 6: 1800, 7: 2600, 8: 3400, 9: 4200, 10: 5000,
  11: 9000, 12: 13000, 13: 17000, 14: 21000, 15: 25000, 16: 45000, 17: 65000, 18: 85000, 19: 105000, 20: 125000,
  21: 225000, 22: 325000, 23: 425000, 24: 525000, 25: 625000, 26: 1125000, 27: 1625000, 28: 2125000, 29: 2625000, 30: 3125000,
}

/** Enhancement bonus of an item of this level: +1 at 1-5 ... +6 at 26-30 (PHB p. 225). */
export function enhancementForLevel(level: number): number {
  return Math.min(6, Math.max(1, Math.ceil(level / 5)))
}

/** Sale price (or the residuum from disenchanting) by rarity (RC p. 278). */
export function salePrice(level: number, rarity: Rarity): number {
  return MAGIC_ITEM_VALUE[level] * { common: 0.2, uncommon: 0.5, rare: 1 }[rarity]
}

/** Categories whose magic versions carry an enhancement bonus (PHB p. 224); neck items are category 'item' with slot 'neck'. */
export function hasEnhancement(category: string, slot?: string): boolean {
  return category === 'weapon' || category === 'armor' || category === 'implement' || slot === 'neck'
}

/** Is this item priced by the permanent-item table? Consumables, rituals, alchemy and priceless items are not. */
export function priceFollowsTable(item: { category: string; subtype?: string; powers?: { usage?: string }[] }): boolean {
  if (['ritual', 'alchemical', 'set'].includes(item.category)) return false
  if (/consumable|ammunition/i.test(item.subtype ?? '')) return false
  return !(item.powers ?? []).some(p => p.usage === 'consumable')
}

/**
 * Item numbers for a level: its value and sale prices, its enhancement bonus, and the
 * standard five-level ladder of versions (L, L+5, ...) that "+"-items such as a magic weapon use.
 */
export function itemBenchmarks(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > 30) throw new Error('Item math covers levels 1–30')
  const ladder: { level: number; enhancement: number; price: number }[] = []
  for (let l = level; l <= 30; l += 5) ladder.push({ level: l, enhancement: enhancementForLevel(l), price: MAGIC_ITEM_VALUE[l] })
  return {
    level, price: MAGIC_ITEM_VALUE[level], enhancement: enhancementForLevel(level),
    salePrice: { common: salePrice(level, 'common'), uncommon: salePrice(level, 'uncommon'), rare: salePrice(level, 'rare') },
    ladder,
    assumptions: 'Permanent items (PHB p. 223, RC p. 278). Enhancement bonuses only for weapons, armor, implements, and neck items (PHB p. 224–225). Consumables cost much less and have no rule table; use precedents.',
  }
}
