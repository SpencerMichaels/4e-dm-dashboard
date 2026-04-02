// D&D 4e creature importer — runtime module
// Reads pre-parsed structured JSON from data/parsed/monsters.json.
// The HTML parser lives in html-parser.ts and is only used by the build script.

import { generateId } from '../../src/common/utils/id'
import type { Creature } from '../../src/common/types'
import parsedMonsters from './data/parsed/monsters.json'
import parsedItems from './data/parsed/items.json'

/** All parsed monster data — used by the compendium handler to build indexes */
export const allParsedMonsters = parsedMonsters as Record<string, any>

/** All parsed item data — used by the compendium handler */
export const allParsedItems = parsedItems as Record<string, any>

/** Create a Creature from a compendium entry, generating fresh id/timestamps */
export function creatureFromCompendium(monsterId: string): Creature {
  const entry = allParsedMonsters[monsterId]
  if (!entry) throw new Error('Monster not found: ' + monsterId)
  const now = new Date().toISOString()
  return {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    ...entry,
  }
}
