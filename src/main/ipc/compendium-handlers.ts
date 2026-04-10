import { readFileSync } from 'fs'
import { join } from 'path'
import { ipcMain, app } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { CompendiumEntry, ItemIndexEntry, TrapIndexEntry, DiseaseIndexEntry, CompendiumAnnotation } from '@common/types'
import { loadMonsters, loadItems, getAllParsedMonsters, creatureFromCompendium, getAllParsedItems } from '../../../plugins/dnd-4e/importer'
import * as store from '../data/campaign-store'
import { broadcastToDm } from '../windows'

const DATA_DIR = join(app.getAppPath(), 'plugins/dnd-4e/data/parsed')

let monsterIndexCache: CompendiumEntry[] | null = null
let itemIndexCache: ItemIndexEntry[] | null = null
let glossaryCache: Record<string, any> | null = null
let trapIndexCache: TrapIndexEntry[] | null = null
let trapDataCache: Record<string, any> | null = null
let diseaseIndexCache: DiseaseIndexEntry[] | null = null
let diseaseDataCache: Record<string, any> | null = null

function getGlossary(): Record<string, any> {
  if (!glossaryCache) {
    glossaryCache = JSON.parse(readFileSync(join(DATA_DIR, 'glossary.json'), 'utf-8'))
  }
  return glossaryCache!
}

function getMonsterIndex(): CompendiumEntry[] {
  if (!monsterIndexCache) {
    monsterIndexCache = JSON.parse(readFileSync(join(DATA_DIR, 'monsters-index.json'), 'utf-8'))
  }
  return monsterIndexCache!
}

function getItemIndex(): ItemIndexEntry[] {
  if (!itemIndexCache) {
    itemIndexCache = JSON.parse(readFileSync(join(DATA_DIR, 'items-index.json'), 'utf-8'))
  }
  return itemIndexCache!
}

// Merged creature index cache (official + custom)
let mergedMonsterIndexCache: CompendiumEntry[] | null = null

async function getMergedMonsterIndex(): Promise<CompendiumEntry[]> {
  if (mergedMonsterIndexCache) return mergedMonsterIndexCache
  await rebuildMergedMonsterIndex()
  return mergedMonsterIndexCache!
}

async function rebuildMergedMonsterIndex(): Promise<void> {
  const official = getMonsterIndex()
  const campaignId = store.getActiveCampaignId()
  const custom = campaignId ? await store.buildCreatureIndex(campaignId) : []
  mergedMonsterIndexCache = [...official, ...custom]
}

/** Call after creature save/delete to refresh the merged index */
export function invalidateCreatureIndex(): void {
  mergedMonsterIndexCache = null
}

export function registerCompendiumHandlers(): void {
  // Creature index — merged (official + custom)
  ipcMain.handle(CMD.COMPENDIUM_INDEX, async (_e, systemId: string) => {
    if (systemId !== 'dnd-4e') return []
    return getMergedMonsterIndex()
  })

  // Get full creature — creates a new campaign copy with fresh ID (for cloning)
  ipcMain.handle(CMD.COMPENDIUM_GET, async (_e, systemId: string, monsterId: string) => {
    if (systemId !== 'dnd-4e') throw new Error('Unsupported system: ' + systemId)
    loadMonsters(join(DATA_DIR, 'monsters.json'))
    return creatureFromCompendium(monsterId)
  })

  // Resolve compendium creature — returns raw data without creating a campaign copy (for combat/preview)
  ipcMain.handle(CMD.COMPENDIUM_RESOLVE, async (_e, systemId: string, monsterId: string) => {
    if (systemId !== 'dnd-4e') throw new Error('Unsupported system: ' + systemId)
    loadMonsters(join(DATA_DIR, 'monsters.json'))
    const entry = getAllParsedMonsters()[monsterId]
    if (!entry) throw new Error('Monster not found: ' + monsterId)
    return { ...entry, compendiumId: monsterId }
  })

  // Annotations
  ipcMain.handle(CMD.ANNOTATION_GET_ALL, async () => {
    const campaignId = store.getActiveCampaignId()
    if (!campaignId) return {}
    return store.loadAnnotations(campaignId)
  })

  ipcMain.handle(CMD.ANNOTATION_SAVE, async (_e, compendiumId: string, annotation: CompendiumAnnotation) => {
    const campaignId = store.getActiveCampaignId()
    if (!campaignId) throw new Error('No active campaign')
    const all = await store.saveAnnotation(campaignId, compendiumId, annotation)
    broadcastToDm(SYNC.ANNOTATIONS, all)
    return all
  })

  // Items
  ipcMain.handle(CMD.COMPENDIUM_ITEM_INDEX, async (_e, systemId: string) => {
    if (systemId !== 'dnd-4e') return []
    return getItemIndex()
  })

  ipcMain.handle(CMD.COMPENDIUM_GLOSSARY, async (_e, systemId: string) => {
    if (systemId !== 'dnd-4e') return {}
    return getGlossary()
  })

  ipcMain.handle(CMD.COMPENDIUM_ITEM_GET, async (_e, systemId: string, itemId: string) => {
    if (systemId !== 'dnd-4e') throw new Error('Unsupported system: ' + systemId)
    loadItems(join(DATA_DIR, 'items.json'))
    const item = getAllParsedItems()[itemId]
    if (!item) throw new Error('Item not found: ' + itemId)
    return item
  })

  // Traps
  ipcMain.handle(CMD.COMPENDIUM_TRAP_INDEX, async (_e, systemId: string) => {
    if (systemId !== 'dnd-4e') return []
    if (!trapIndexCache) trapIndexCache = JSON.parse(readFileSync(join(DATA_DIR, 'traps-index.json'), 'utf-8'))
    return trapIndexCache!
  })

  ipcMain.handle(CMD.COMPENDIUM_TRAP_GET, async (_e, systemId: string, trapId: string) => {
    if (systemId !== 'dnd-4e') throw new Error('Unsupported system: ' + systemId)
    if (!trapDataCache) trapDataCache = JSON.parse(readFileSync(join(DATA_DIR, 'traps.json'), 'utf-8'))
    const trap = trapDataCache![trapId]
    if (!trap) throw new Error('Trap not found: ' + trapId)
    return trap
  })

  // Diseases
  ipcMain.handle(CMD.COMPENDIUM_DISEASE_INDEX, async (_e, systemId: string) => {
    if (systemId !== 'dnd-4e') return []
    if (!diseaseIndexCache) diseaseIndexCache = JSON.parse(readFileSync(join(DATA_DIR, 'diseases-index.json'), 'utf-8'))
    return diseaseIndexCache!
  })

  ipcMain.handle(CMD.COMPENDIUM_DISEASE_GET, async (_e, systemId: string, diseaseId: string) => {
    if (systemId !== 'dnd-4e') throw new Error('Unsupported system: ' + systemId)
    if (!diseaseDataCache) diseaseDataCache = JSON.parse(readFileSync(join(DATA_DIR, 'diseases.json'), 'utf-8'))
    const disease = diseaseDataCache![diseaseId]
    if (!disease) throw new Error('Disease not found: ' + diseaseId)
    return disease
  })
}
