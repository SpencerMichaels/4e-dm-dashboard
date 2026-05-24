import { ipcMain } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { CompendiumEntry, CompendiumAnnotation } from '@common/types'
import { getPlugin } from '../plugins/plugin-loader'
import * as store from '../data/campaign-store'
import { broadcastToDm } from '../windows'

// Merged creature index cache (official compendium + custom campaign creatures)
// Keyed by systemId so multiple systems can coexist.
const mergedMonsterIndexCache = new Map<string, CompendiumEntry[]>()

async function getMergedMonsterIndex(systemId: string): Promise<CompendiumEntry[]> {
  const cached = mergedMonsterIndexCache.get(systemId)
  if (cached) return cached
  await rebuildMergedMonsterIndex(systemId)
  return mergedMonsterIndexCache.get(systemId) ?? []
}

async function rebuildMergedMonsterIndex(systemId: string): Promise<void> {
  const plugin = getPlugin(systemId)
  const official = plugin?.compendium?.getCreatureIndex() ?? []
  const campaignId = store.getActiveCampaignId()
  const custom = campaignId ? await store.buildCreatureIndex(campaignId) : []
  mergedMonsterIndexCache.set(systemId, [...official, ...custom])
}

/** Call after creature save/delete to refresh the merged index */
export function invalidateCreatureIndex(): void {
  mergedMonsterIndexCache.clear()
}

export function registerCompendiumHandlers(): void {
  // Creature index — merged (official + custom)
  ipcMain.handle(CMD.COMPENDIUM_INDEX, async (_e, systemId: string) => {
    return getMergedMonsterIndex(systemId)
  })

  // Get full creature — creates a new campaign copy with fresh ID (for cloning)
  ipcMain.handle(CMD.COMPENDIUM_GET, async (_e, systemId: string, monsterId: string) => {
    const compendium = getPlugin(systemId)?.compendium
    if (!compendium) throw new Error('No compendium for system: ' + systemId)
    return compendium.getCreature(monsterId)
  })

  // Resolve compendium creature — returns raw data without creating a campaign copy (for combat/preview)
  ipcMain.handle(CMD.COMPENDIUM_RESOLVE, async (_e, systemId: string, monsterId: string) => {
    const compendium = getPlugin(systemId)?.compendium
    if (!compendium) throw new Error('No compendium for system: ' + systemId)
    const result = compendium.resolveCreature(monsterId)
    if (!result) throw new Error('Monster not found: ' + monsterId)
    return result
  })

  // Annotations (campaign-specific, already system-agnostic)
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
    return getPlugin(systemId)?.compendium?.getItemIndex?.() ?? []
  })

  ipcMain.handle(CMD.COMPENDIUM_GLOSSARY, async (_e, systemId: string) => {
    return getPlugin(systemId)?.compendium?.getGlossary?.() ?? {}
  })

  ipcMain.handle(CMD.COMPENDIUM_ITEM_GET, async (_e, systemId: string, itemId: string) => {
    const compendium = getPlugin(systemId)?.compendium
    if (!compendium?.getItem) throw new Error('No item compendium for system: ' + systemId)
    const item = compendium.getItem(itemId)
    if (!item) throw new Error('Item not found: ' + itemId)
    return item
  })

  // Traps
  ipcMain.handle(CMD.COMPENDIUM_TRAP_INDEX, async (_e, systemId: string) => {
    return getPlugin(systemId)?.compendium?.getTrapIndex?.() ?? []
  })

  ipcMain.handle(CMD.COMPENDIUM_TRAP_GET, async (_e, systemId: string, trapId: string) => {
    const compendium = getPlugin(systemId)?.compendium
    if (!compendium?.getTrap) throw new Error('No trap compendium for system: ' + systemId)
    const trap = compendium.getTrap(trapId)
    if (!trap) throw new Error('Trap not found: ' + trapId)
    return trap
  })

  // Diseases
  ipcMain.handle(CMD.COMPENDIUM_DISEASE_INDEX, async (_e, systemId: string) => {
    return getPlugin(systemId)?.compendium?.getDiseaseIndex?.() ?? []
  })

  ipcMain.handle(CMD.COMPENDIUM_DISEASE_GET, async (_e, systemId: string, diseaseId: string) => {
    const compendium = getPlugin(systemId)?.compendium
    if (!compendium?.getDisease) throw new Error('No disease compendium for system: ' + systemId)
    const disease = compendium.getDisease(diseaseId)
    if (!disease) throw new Error('Disease not found: ' + diseaseId)
    return disease
  })
}
