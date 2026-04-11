export interface EncounterCreature {
  creatureId?: string            // Campaign creature ID (custom or cloned)
  compendiumId?: string          // Official compendium entry ID (no import needed)
  count: number
  miniIndicators?: string[]   // One per instance
  overrideHp?: number         // optional HP override (e.g. 1 for minions)
  isMinion?: boolean          // mark as minion: HP=1, XP = standard / 4
  monsterTemplates?: string[]  // functional template names, max 2 (1=elite, 2=solo)
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
