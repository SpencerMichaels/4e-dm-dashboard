import type { TrapRef } from './campaign'

export interface EncounterCreature {
  creatureId?: string            // Campaign creature ID (custom or cloned)
  libraryId?: string             // Library creature ID: shared by every campaign, used live like a published one
  compendiumId?: string          // Official compendium entry ID (no import needed)
  count: number
  overrideName?: string       // optional rename for this encounter only
  miniIndicators?: string[]   // One per instance
  overrideHp?: number         // optional HP override (e.g. 1 for minions)
  isMinion?: boolean          // mark as minion: HP=1, XP = standard / 4
  levelAdjust?: number         // ±1 to ±5 level adjustment (DMG p.174)
  monsterTemplates?: string[]  // functional template names, max 2 (1=elite, 2=solo)
  monsterTheme?: {
    name: string              // theme ref: a published theme's name, campaign:<id>, or library:<id>
    attackPower: string       // selected attack power name
    utilityPower: string      // selected utility power name
    skillChoice?: number      // index into parsed skill choice groups (when theme has "X or Y" skills)
  }
}

/** A trap or hazard in an encounter: a campaign trap record or a published trap. */
export interface EncounterTrap extends TrapRef {
  count: number
  overrideName?: string
  /** Shown in the Player window from the start; traps start hidden unless this is set. */
  visible?: boolean
}

export interface Encounter {
  id: string
  name: string
  description?: string
  creatures: EncounterCreature[]
  traps?: EncounterTrap[]
  locationId?: string
  /** The party level this encounter is planned for (its level frame); without one, the party's current level. */
  level?: number
  backgroundImageId?: string  // encounter-specific background for player display
  tags: string[]
  createdAt: string
  updatedAt: string
}

/** An encounter row resolved for preview and combat: the kit monster with the row's adjustments applied. */
export interface EncounterRowPreview {
  monster: import('@kit').Monster
  attribution: import('../rules/adjust-monster').Attribution
  entityId?: string
  imageId?: string
  tokenImageId?: string
  /** Rank before the row's adjustments (a printed minion can't take templates). */
  baseRank: import('@kit').Rank
  /** Refs of the templates whose prerequisites the adjusted monster meets. */
  eligible: string[]
}
