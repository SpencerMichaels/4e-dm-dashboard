export interface EncounterCreature {
  creatureId: string
  count: number
  miniIndicators?: string[]   // One per instance
  overrideHp?: number         // optional HP override (e.g. 1 for minions)
}

export interface Encounter {
  id: string
  name: string
  description?: string
  creatures: EncounterCreature[]
  locationId?: string
  tags: string[]
  createdAt: string
  updatedAt: string
}
