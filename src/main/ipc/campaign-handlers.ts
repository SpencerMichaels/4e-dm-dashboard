import { ipcMain, dialog, BrowserWindow } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { EntityType, PlayerCharacter } from '@common/types'
import { applySnapshots, type ImportedFile, type ImportResult } from '@common/character/character-import'
import { generateId } from '@common/utils/id'
import { dirname } from 'path'
import { isLibrary, isRecordType, LIBRARY, RECORD_STORAGE, RECORD_TYPES, type Home, type RecordType } from '@common/campaign-records'
import { authoringCampaignDeleted, authoringCampaignOpened, authoringEntryChanged, authoringEntryDeleted, authoringEntryMoved } from './authoring-handlers'
import { moveEntry } from '../data/move-entry'
import * as store from '../data/campaign-store'
import * as library from '../data/library-store'
import { broadcastToDm } from '../windows'
import { invalidateCreatureIndex } from './compendium-handlers'

export function registerCampaignHandlers(): void {
  ipcMain.handle(CMD.CAMPAIGN_CREATE, async (_e, name: string) => {
    const campaign = await store.createCampaign(name)
    broadcastCampaignState()
    return campaign
  })

  ipcMain.handle(CMD.CAMPAIGN_OPEN, async (_e, campaignId: string) => {
    const campaign = await store.openCampaign(campaignId)
    authoringCampaignOpened(campaignId)
    broadcastCampaignState()
    return campaign
  })

  ipcMain.handle(CMD.CAMPAIGN_DELETE, async (_e, campaignId: string) => {
    await store.deleteCampaign(campaignId)
    await authoringCampaignDeleted(campaignId)
    broadcastCampaignState()
  })

  ipcMain.handle(CMD.CAMPAIGN_LIST, async () => {
    return store.listCampaigns()
  })

  ipcMain.handle(CMD.CAMPAIGN_UPDATE, async (_e, patch: Record<string, unknown>) => {
    const updated = await store.updateCampaign(patch)
    broadcastCampaignState()
    return updated
  })

  // `home`: LIBRARY for a Library entry; otherwise the open campaign.
  ipcMain.handle(CMD.ENTITY_SAVE, async (_e, entityType: EntityType, entity: { id: string }, home?: Home) => {
    if (isLibrary(home)) {
      if (!isRecordType(entityType)) throw new Error(`The Library holds no ${entityType}`)
      await library.saveLibraryRecord(entityType, entity)
      if (entityType === 'creature') invalidateCreatureIndex()
      authoringEntryChanged(LIBRARY, entity.id)
      await broadcastLibraryUpdate(entityType)
      return entity
    }
    await store.saveEntity(entityType, entity)
    const campaignId = store.getActiveCampaignId()
    if (campaignId && isRecordType(entityType)) authoringEntryChanged(campaignId, entity.id)
    if (entityType === 'creature') invalidateCreatureIndex()
    broadcastEntityUpdate(entityType)
    return entity
  })

  ipcMain.handle(CMD.ENTITY_DELETE, async (_e, entityType: EntityType, entityId: string, home?: Home) => {
    if (isLibrary(home)) {
      if (!isRecordType(entityType)) throw new Error(`The Library holds no ${entityType}`)
      await library.deleteLibraryRecord(entityType, entityId)
      if (entityType === 'creature') invalidateCreatureIndex()
      authoringEntryDeleted(LIBRARY, entityId)
      await broadcastLibraryUpdate(entityType)
      return
    }
    await store.deleteEntity(entityType, entityId)
    const campaign = store.getActiveCampaignId()
    if (campaign && isRecordType(entityType)) authoringEntryDeleted(campaign, entityId)
    if (entityType === 'creature') invalidateCreatureIndex()
    broadcastEntityUpdate(entityType)
  })

  ipcMain.handle(CMD.LIBRARY_STATE, async () => {
    await library.ensureLibrary()
    return library.libraryState()
  })

  ipcMain.handle(CMD.LIBRARY_USAGE, async (_e, entityType: EntityType, id: string) => isRecordType(entityType) ? library.libraryUsage(entityType, id) : [])

  ipcMain.handle(CMD.ENTRY_SHARE, async (_e, entityType: EntityType, id: string, shared: boolean) => {
    if (!isRecordType(entityType)) throw new Error(`No ${entityType} can be shared`)
    const changed = await moveEntry(entityType, id, shared, authoringEntryMoved)
    if (entityType === 'creature') invalidateCreatureIndex()
    await broadcastLibraryUpdate(entityType)
    for (const t of [entityType, ...changed]) await broadcastEntityUpdate(t)
  })

  ipcMain.handle(CMD.PC_IMPORT, async (_e, files: ImportedFile[], targetId?: string): Promise<ImportResult> => {
    const pcs = await store.listEntities('player-character') as PlayerCharacter[]
    const { save, result } = applySnapshots(pcs, files, { targetId, newId: generateId })
    for (const pc of save) await store.saveEntity('player-character', pc)
    if (save.length) broadcastEntityUpdate('player-character')
    return result
  })

  ipcMain.handle(CMD.ENTITY_GET, async (_e, entityType: EntityType, entityId: string) => {
    return store.getEntity(entityType, entityId)
  })

  ipcMain.handle(CMD.ENTITY_LIST, async (_e, entityType: EntityType) => {
    return store.listEntities(entityType)
  })

  // Images
  // Images go into the open campaign, or into the Library for a Library entry's art (`home`).
  const imageHome = (home?: Home) => {
    if (isLibrary(home)) return LIBRARY
    const campaignId = store.getActiveCampaignId()
    if (!campaignId) throw new Error('No active campaign')
    return campaignId
  }
  ipcMain.handle(CMD.IMAGE_IMPORT, async (_e, sourcePath: string, home?: Home) => {
    return store.importImage(imageHome(home), sourcePath)
  })

  ipcMain.handle(CMD.IMAGE_IMPORT_DIALOG, async (e, home?: Home) => {
    const target = imageHome(home)
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const result = await dialog.showOpenDialog({
      ...(win ? { parentWindow: win } : {}),
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
      properties: ['openFile'],
    } as any)
    if (result.canceled || result.filePaths.length === 0) return null
    return store.importImage(target, result.filePaths[0])
  })

  ipcMain.handle(CMD.IMAGE_SAVE_DATA, async (_e, base64Data: string, ext: string, home?: Home) => {
    const target = imageHome(home)
    const { writeFileSync, mkdirSync } = await import('fs')
    const imageId = (await import('@common/utils/id')).generateId() + '.' + ext
    const path = await store.getImagePath(target, imageId)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, Buffer.from(base64Data, 'base64'))
    return imageId
  })

  // An image id names a file in the open campaign's assets or the Library's (ids are random, so they never
  // clash): a Library entry's art shows in every campaign, in combat, and in the Player window.
  ipcMain.handle(CMD.IMAGE_GET, async (_e, imageId: string) => {
    const { readFileSync, existsSync } = await import('fs')
    const campaignId = store.getActiveCampaignId()
    const inCampaign = campaignId ? await store.getImagePath(campaignId, imageId) : null
    const path = inCampaign && existsSync(inCampaign) ? inCampaign : await store.getImagePath(LIBRARY, imageId)
    try {
      const data = readFileSync(path)
      const ext = imageId.split('.').pop()?.toLowerCase() ?? 'png'
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png'
      return `data:${mime};base64,${data.toString('base64')}`
    } catch { return null }
  })
}

// Maps EntityType to the key used in the renderer campaign store
const entityTypeToStoreKey: Record<EntityType, string> = {
  encounter: 'encounters',
  location: 'locations',
  'player-character': 'playerCharacters',
  map: 'maps',
  ...Object.fromEntries(Object.entries(RECORD_STORAGE).map(([type, s]) => [type, s.storeKey])) as Record<RecordType, string>,
}

export async function broadcastEntityUpdate(entityType: EntityType): Promise<void> {
  const campaignId = store.getActiveCampaignId()
  if (!campaignId) return

  const data = await store.listEntities(entityType)
  const key = entityTypeToStoreKey[entityType]

  broadcastToDm(SYNC.CAMPAIGN_ENTITY_UPDATE, {
    entityType,
    key,
    data,
  })
}

async function broadcastCampaignState(): Promise<void> {
  const campaignId = store.getActiveCampaignId()
  if (!campaignId) return

  // Broadcast a summary of current state to DM renderer
  const [campaign, creatures, encounters, locations, maps, pcs, annotations, ...records] = await Promise.all([
    store.getActiveCampaign(),
    store.listEntities('creature'),
    store.listEntities('encounter'),
    store.listEntities('location'),
    store.listEntities('map'),
    store.listEntities('player-character'),
    store.loadAnnotations(campaignId),
    ...RECORD_TYPES.map(type => store.listEntities(type)),
  ])

  broadcastToDm(SYNC.CAMPAIGN_STATE, {
    campaignId,
    campaign,
    creatures,
    encounters,
    locations,
    maps,
    playerCharacters: pcs,
    annotations,
    ...Object.fromEntries(RECORD_TYPES.map((type, i) => [RECORD_STORAGE[type].storeKey, records[i]])),
  })
}

/** A Library record type changed: the DM window's Library store gets that type's entries. */
export async function broadcastLibraryUpdate(entityType: RecordType): Promise<void> {
  broadcastToDm(SYNC.LIBRARY_UPDATE, { entityType, key: RECORD_STORAGE[entityType].storeKey, data: await library.listLibrary(entityType) })
}
