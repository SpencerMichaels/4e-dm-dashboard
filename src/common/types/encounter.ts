export interface EncounterCreature {
  creatureId?: string            // Campaign creature ID (custom or cloned)
  compendiumId?: string          // Official compendium entry ID (no import needed)
  count: number
  overrideName?: string       // optional rename for this encounter only
  miniIndicators?: string[]   // One per instance
  overrideHp?: number         // optional HP override (e.g. 1 for minions)
  isMinion?: boolean          // mark as minion: HP=1, XP = standard / 4
  levelAdjust?: number         // ±1 to ±5 level adjustment (DMG p.174)
  monsterTemplates?: string[]  // functional template names, max 2 (1=elite, 2=solo)
  monsterTheme?: {
    name: string              // theme name (lookup key into MONSTER_THEMES)
    attackPower: string       // selected attack power name
    utilityPower: string      // selected utility power name
    skillChoice?: number      // index into parsed skill choice groups (when theme has "X or Y" skills)
  }
}

export interface Encounter {
  id: string
  name: string
  description?: string
  creatures: EncounterCreature[]
  locationId?: string
  backgroundImageId?: string  // encounter-specific background for player display
  tags: string[]
  createdAt: string
  updatedAt: string
}
