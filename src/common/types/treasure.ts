// Treasure and level plans. A campaign may span several levels, so plannable things carry the party
// level they are planned for (their level frame): a treasure's `level` now, encounters later. A
// LevelPlan holds what belongs to a level as a whole (for now its treasure mode and rolled slots).

/** An item by reference: a campaign item record, a Library one, or a published item. */
export interface ItemRef {
  itemId?: string
  /** A Library entry (shared by every campaign), used live like a published one. */
  libraryId?: string
  compendiumId?: string
}

/** One treasure: a magic item (or potion) by reference, or monetary treasure as text and its gp value. */
export interface Treasure {
  id: string
  /** The party level this treasure is planned for (its level frame). */
  level: number
  /** An item; `itemLevel` picks the version of a multi-level item (default its lowest). */
  item?: ItemRef & { itemLevel?: number }
  /** Coins, gems and art objects: what they are ("a jade idol and 40 gp") and their total value. */
  money?: { text: string; gp: number }
  /** The level plan's slot this treasure fills (a TreasureSlot key). */
  slot?: string
  /** Where it is placed: a location or an encounter (unplaced with neither). */
  locationId?: string
  encounterId?: string
  /** The party has found it. */
  found?: boolean
  createdAt: string
  updatedAt: string
}

/** How a level's treasure is budgeted: DMG parcels, RC rolled treasures, or free (no slots). */
export type TreasureMode = 'dmg' | 'rc' | 'free'

/** A slot a treasure can fill: a magic item of a level (and, rolled, a rarity), or monetary treasure of a value. */
export interface TreasureSlot {
  key: string
  kind: 'item' | 'money'
  /** Item slots: the item's level. */
  itemLevel?: number
  rarity?: 'common' | 'uncommon' | 'rare'
  /** Money slots: the value in gp. */
  gp?: number
  /** "Parcel 5", "Treasure 3". */
  label: string
  /** Money slots: what was rolled ("2 gems worth 100 gp, 120 gp"). */
  text?: string
}

/** What belongs to one level as a whole. Stored per level (`levels/<level>.json`, id = the level). */
export interface LevelPlan {
  id: string
  level: number
  treasure?: {
    mode: TreasureMode
    /** The RC treasures rolled for this level, as slots (DMG slots are derived from the level and party size). */
    rolled?: TreasureSlot[]
  }
  updatedAt: string
}
