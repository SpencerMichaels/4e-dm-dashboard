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


/**
 * A skill challenge in an encounter (RC p. 157: on its own as a noncombat encounter, or part of a combat one),
 * by reference like a trap: a campaign challenge record, a Library one, or a published one.
 */
export interface EncounterChallenge {
  challengeId?: string
  /** A Library entry (shared by every campaign), used live like a published one. */
  libraryId?: string
  compendiumId?: string
  /** Its level here: default the challenge's own, or for one that follows the party's, the encounter's. */
  level?: number
  /** Progress while it runs: checks that succeeded and failed so far. */
  successes?: number
  failures?: number
}

export interface Encounter {
  id: string
  name: string
  description?: string
  creatures: EncounterCreature[]
  traps?: EncounterTrap[]
  /** Its skill challenges; with no creatures or traps, the encounter is a skill challenge on its own. */
  challenges?: EncounterChallenge[]
  locationId?: string
  /** The party level this encounter is planned for (its level frame); without one, the party's current level. */
  level?: number
  /** Level variants of one encounter (the same encounter for several party levels) share this id. */
  variantGroup?: string
  /** The party has overcome it (set when its combat ends; the DM can change it). */
  done?: boolean
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
