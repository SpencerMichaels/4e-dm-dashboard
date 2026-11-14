import { ipcMain } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { CompendiumEntry, CompendiumAnnotation } from '@common/types'
import { dnd4eCompendium as compendium } from '../compendium/compendium'
import * as store from '../data/campaign-store'
import { listLibrary } from '../data/library-store'
import type { Monster } from '@kit'
import { broadcastToDm } from '../windows'
import { getKitEntry, getKitIndex, type KitKind } from '../compendium/kit'

// Merged creature index cache (official compendium + the open campaign's creatures + the Library's)
let mergedMonsterIndexCache: CompendiumEntry[] | null = null

async function getMergedMonsterIndex(): Promise<CompendiumEntry[]> {
  if (mergedMonsterIndexCache) return mergedMonsterIndexCache
  const official = compendium.getCreatureIndex()
  const campaignId = store.getActiveCampaignId()
  const custom = campaignId ? await store.buildCreatureIndex(campaignId) : []
  // The Library's creatures, shared by every campaign (source "Library").
  const library = store.creatureIndexEntries(await listLibrary<Monster>('creature'), 'Library')
  mergedMonsterIndexCache = [...official, ...custom, ...library]
  return mergedMonsterIndexCache
}

/** Call after creature save/delete to refresh the merged index */
export function invalidateCreatureIndex(): void {
  mergedMonsterIndexCache = null
}

export function registerCompendiumHandlers(): void {
  // Creature index — merged (official + custom)
  ipcMain.handle(CMD.COMPENDIUM_INDEX, async () => {
    return getMergedMonsterIndex()
  })

  // Published monsters reach the renderer as kit content (COMPENDIUM_KIT_GET 'monster').

  ipcMain.handle(CMD.COMPENDIUM_KIT_GET, async (_e, kind: KitKind, id: string) => getKitEntry(kind, id))
  ipcMain.handle(CMD.COMPENDIUM_KIT_INDEX, async (_e, kind: 'template' | 'theme') => getKitIndex(kind))

  // Annotations (campaign-specific)
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
  ipcMain.handle(CMD.COMPENDIUM_ITEM_INDEX, async () => {
    return compendium.getItemIndex?.() ?? []
  })

  ipcMain.handle(CMD.COMPENDIUM_GLOSSARY, async () => {
    return compendium.getGlossary?.() ?? {}
  })

  ipcMain.handle(CMD.COMPENDIUM_ITEM_GET, async (_e, itemId: string) => {
    const item = compendium.getItem?.(itemId)
    if (!item) throw new Error('Item not found: ' + itemId)
    return item
  })

  // Traps
  ipcMain.handle(CMD.COMPENDIUM_TRAP_INDEX, async () => {
    return compendium.getTrapIndex?.() ?? []
  })

  ipcMain.handle(CMD.COMPENDIUM_TRAP_GET, async (_e, trapId: string) => {
    const trap = compendium.getTrap?.(trapId)
    if (!trap) throw new Error('Trap not found: ' + trapId)
    return trap
  })

  // Diseases
  ipcMain.handle(CMD.COMPENDIUM_DISEASE_INDEX, async () => {
    return compendium.getDiseaseIndex?.() ?? []
  })

  ipcMain.handle(CMD.COMPENDIUM_DISEASE_GET, async (_e, diseaseId: string) => {
    const disease = compendium.getDisease?.(diseaseId)
    if (!disease) throw new Error('Disease not found: ' + diseaseId)
    return disease
  })
}
