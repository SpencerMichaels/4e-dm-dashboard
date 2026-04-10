// D&D 4e creature importer — runtime module
// Reads pre-parsed structured JSON from data/parsed/monsters.json.
// The HTML parser lives in html-parser.ts and is only used by the build script.

import { generateId } from '../../src/common/utils/id'
import type { Creature } from '../../src/common/types'

let _monsters: Record<string, any> | null = null
let _items: Record<string, any> | null = null

/** Lazy-load a JSON file. Called by compendium handler which provides the resolved path. */
export function loadMonsters(jsonPath: string): void {
  if (!_monsters) {
    const fs = require('fs')
    _monsters = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  }
}

export function loadItems(jsonPath: string): void {
  if (!_items) {
    const fs = require('fs')
    _items = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  }
}

export function getAllParsedMonsters(): Record<string, any> {
  return _monsters!
}

export function getAllParsedItems(): Record<string, any> {
  return _items!
}

/** Create a Creature from a compendium entry, generating fresh id/timestamps */
export function creatureFromCompendium(monsterId: string): Creature {
  const entry = getAllParsedMonsters()[monsterId]
  if (!entry) throw new Error('Monster not found: ' + monsterId)
  const now = new Date().toISOString()
  return {
    id: generateId(),
    compendiumId: monsterId,
    createdAt: now,
    updatedAt: now,
    ...entry,
  }
}
