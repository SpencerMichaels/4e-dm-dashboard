// D&D 4e CompendiumProvider implementation
// Reads pre-parsed JSON data from content/parsed/ and exposes it via the plugin interface.

import { readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { generateId } from '../../common/utils/id'
import type { CompendiumProvider } from '../../common/types/system-plugin'
import type { CompendiumEntry, ItemIndexEntry, TrapIndexEntry, DiseaseIndexEntry } from '../../common/types/compendium'
import type { Creature } from '../../common/types/creature'

function dataDir(): string {
  return join(app.getAppPath(), 'content/parsed')
}

// Caches — lazily populated on first access
let monsterIndexCache: CompendiumEntry[] | null = null
let monsterDataCache: Record<string, any> | null = null
let itemIndexCache: ItemIndexEntry[] | null = null
let itemDataCache: Record<string, any> | null = null
let glossaryCache: Record<string, any> | null = null
let trapIndexCache: TrapIndexEntry[] | null = null
let trapDataCache: Record<string, any> | null = null
let diseaseIndexCache: DiseaseIndexEntry[] | null = null
let diseaseDataCache: Record<string, any> | null = null

function ensureMonsterData(): void {
  if (!monsterDataCache) {
    monsterDataCache = JSON.parse(readFileSync(join(dataDir(), 'monsters.json'), 'utf-8'))
  }
}

function ensureItemData(): void {
  if (!itemDataCache) {
    itemDataCache = JSON.parse(readFileSync(join(dataDir(), 'items.json'), 'utf-8'))
  }
}

export const dnd4eCompendium: CompendiumProvider = {
  getCreatureIndex(): CompendiumEntry[] {
    if (!monsterIndexCache) {
      monsterIndexCache = JSON.parse(readFileSync(join(dataDir(), 'monsters-index.json'), 'utf-8'))
    }
    return monsterIndexCache!
  },

  resolveCreature(id: string): (Record<string, unknown> & { compendiumId: string }) | null {
    ensureMonsterData()
    const entry = monsterDataCache![id]
    if (!entry) return null
    return { ...entry, compendiumId: id }
  },

  getItemIndex(): ItemIndexEntry[] {
    if (!itemIndexCache) {
      itemIndexCache = JSON.parse(readFileSync(join(dataDir(), 'items-index.json'), 'utf-8'))
    }
    return itemIndexCache!
  },

  getItem(id: string): Record<string, unknown> | null {
    ensureItemData()
    return itemDataCache![id] ?? null
  },

  getGlossary(): Record<string, unknown> {
    if (!glossaryCache) {
      glossaryCache = JSON.parse(readFileSync(join(dataDir(), 'glossary.json'), 'utf-8'))
    }
    return glossaryCache!
  },

  getTrapIndex(): TrapIndexEntry[] {
    if (!trapIndexCache) {
      trapIndexCache = JSON.parse(readFileSync(join(dataDir(), 'traps-index.json'), 'utf-8'))
    }
    return trapIndexCache!
  },

  getTrap(id: string): Record<string, unknown> | null {
    if (!trapDataCache) {
      trapDataCache = JSON.parse(readFileSync(join(dataDir(), 'traps.json'), 'utf-8'))
    }
    return trapDataCache![id] ?? null
  },

  getDiseaseIndex(): DiseaseIndexEntry[] {
    if (!diseaseIndexCache) {
      diseaseIndexCache = JSON.parse(readFileSync(join(dataDir(), 'diseases-index.json'), 'utf-8'))
    }
    return diseaseIndexCache!
  },

  getDisease(id: string): Record<string, unknown> | null {
    if (!diseaseDataCache) {
      diseaseDataCache = JSON.parse(readFileSync(join(dataDir(), 'diseases.json'), 'utf-8'))
    }
    return diseaseDataCache![id] ?? null
  },
}
