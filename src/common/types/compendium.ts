/** Compact index entry for creature compendium browsing */
export interface CompendiumEntry {
  id: string
  name: string
  level: number
  role: string
  modifier: string
  size: string
  type: string
  origin: string
  alignment: string
  xp: number
}

/** Compact index entry for item compendium browsing */
export interface ItemIndexEntry {
  id: string
  name: string
  category: string    // item, weapon, armor, implement, ritual
  level: number
  rarity: string
  price: string
  slot: string
}
