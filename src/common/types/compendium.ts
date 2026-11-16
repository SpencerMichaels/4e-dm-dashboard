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
  source: string       // Publication name (e.g., "Monster Manual") or "Custom"
}

/** Compact index entry for trap/hazard compendium browsing */
export interface TrapIndexEntry {
  id: string
  name: string
  trapType: string    // Trap, Hazard, Object, Terrain
  level: number
  role: string
  xp: number
  source: string
}

/** Compact index entry for disease compendium browsing */
export interface DiseaseIndexEntry {
  id: string
  name: string
  level: number
  source: string
}

/** Compact index entry for item compendium browsing */
export interface ItemIndexEntry {
  id: string
  name: string
  category: string    // item, weapon, armor, implement, ritual, set
  level: number
  maxLevel?: number   // highest level variant (if multi-level)
  /** Each version of a multi-level item: its level and price in gp (null when none is printed). */
  versions?: { level: number; gp: number | null }[]
  rarity: string
  price: string
  slot: string
  source: string
  /** Lowest version's price in gp; null when none is printed ("Special", "Priceless", artifacts, sets). */
  priceGp: number | null
  /** Subtype Consumable or Ammunition, or a power with usage 'consumable'. */
  consumable: boolean
  /** Kit Item.subtype: "Consumable", "Ammunition", "Divine Boon", "Artifact", ... */
  subtype?: string
  /** Tier-only items (artifacts, boons). */
  tier?: 'heroic' | 'paragon' | 'epic'
  /** Lowest version's enhancement bonus. */
  enhancement?: number
  /** Kit Item.enhancementTargets: what the enhancement bonus applies to. */
  enhancementTargets?: ('attack' | 'damage' | 'ac' | 'fortitude' | 'reflex' | 'will')[]
}
