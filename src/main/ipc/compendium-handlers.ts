import { BrowserWindow, dialog, ipcMain } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { CompendiumEntry, CompendiumAnnotation } from '@common/types'
import * as store from '../data/campaign-store'
import { listLibrary } from '../data/library-store'
import type { Monster } from '@kit'
import { broadcastToAll, broadcastToDm } from '../windows'
import { getKitEntry, getKitIndex, publishedTemplateList, publishedThemeList, type KitKind } from '../compendium/kit'
import { contentVersion, importPack, onContentChanged, publishedGlossary, publishedIndexes } from '../content/store'
import { PackError } from '../content/pack'

// Merged creature index cache (the content pack + the open campaign's creatures + the Library's)
let mergedMonsterIndexCache: CompendiumEntry[] | null = null

async function getMergedMonsterIndex(): Promise<CompendiumEntry[]> {
  if (mergedMonsterIndexCache) return mergedMonsterIndexCache
  const official = publishedIndexes().monsters
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
  onContentChanged(invalidateCreatureIndex)

  // Content pack (docs/content-pack-plan.md)
  ipcMain.handle(CMD.CONTENT_STATE, async () => ({ version: contentVersion() }))

  /** Install a pack: from `path` (UI tests), else a file the DM picks. Errors come back as { error } for the app's dialog. */
  ipcMain.handle(CMD.CONTENT_IMPORT, async (e, path?: string) => {
    if (!path) {
      const win = BrowserWindow.fromWebContents(e.sender)
      const options = { title: 'Import content pack', filters: [{ name: 'Content packs', extensions: ['zip'] }], properties: ['openFile' as const] }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) return null
      path = result.filePaths[0]
    }
    try {
      const version = await importPack(path)
      broadcastToAll(SYNC.CONTENT_STATE, { version })
      return { version }
    } catch (err) {
      if (err instanceof PackError) return { error: err.message }
      return { error: `The content pack could not be installed: ${(err as Error).message}` }
    }
  })

  // Creature index — merged (official + custom)
  ipcMain.handle(CMD.COMPENDIUM_INDEX, async () => {
    return getMergedMonsterIndex()
  })

  // Published monsters reach the renderer as kit content (COMPENDIUM_KIT_GET 'monster').

  ipcMain.handle(CMD.COMPENDIUM_KIT_GET, async (_e, kind: KitKind, id: string) => getKitEntry(kind, id))
  ipcMain.handle(CMD.COMPENDIUM_KIT_INDEX, async (_e, kind: 'template' | 'theme' | 'challenge') => getKitIndex(kind))
  ipcMain.handle(CMD.COMPENDIUM_KIT_LIST, async (_e, kind: 'template' | 'theme') => kind === 'template' ? publishedTemplateList() : publishedThemeList())

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
    return publishedIndexes().items
  })

  ipcMain.handle(CMD.COMPENDIUM_GLOSSARY, async () => {
    return publishedGlossary()
  })

  // Traps
  ipcMain.handle(CMD.COMPENDIUM_TRAP_INDEX, async () => {
    return publishedIndexes().traps
  })

  // Diseases
  ipcMain.handle(CMD.COMPENDIUM_DISEASE_INDEX, async () => {
    return publishedIndexes().diseases
  })
}
