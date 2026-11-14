import { ipcMain, dialog, BrowserWindow } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { EntityType, PlayerCharacter } from '@common/types'
import { applySnapshots, type ImportedFile, type ImportResult } from '@common/character/character-import'
import { generateId } from '@common/utils/id'
import { isRecordType, RECORD_STORAGE, RECORD_TYPES, type RecordType } from '@common/campaign-records'
import { authoringCampaignOpened, authoringEntryChanged, authoringEntryDeleted } from './authoring-handlers'
import * as store from '../data/campaign-store'
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

  ipcMain.handle(CMD.ENTITY_SAVE, async (_e, entityType: EntityType, entity: { id: string }) => {
    await store.saveEntity(entityType, entity)
    const campaignId = store.getActiveCampaignId()
    if (campaignId && isRecordType(entityType)) authoringEntryChanged(campaignId, entity.id)
    if (entityType === 'creature') invalidateCreatureIndex()
    broadcastEntityUpdate(entityType)
    return entity
  })

  ipcMain.handle(CMD.ENTITY_DELETE, async (_e, entityType: EntityType, entityId: string) => {
    await store.deleteEntity(entityType, entityId)
    const campaign = store.getActiveCampaignId()
    if (campaign && isRecordType(entityType)) authoringEntryDeleted(campaign, entityId)
    if (entityType === 'creature') invalidateCreatureIndex()
    broadcastEntityUpdate(entityType)
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
  ipcMain.handle(CMD.IMAGE_IMPORT, async (_e, sourcePath: string) => {
    const campaignId = store.getActiveCampaignId()
    if (!campaignId) throw new Error('No active campaign')
    return store.importImage(campaignId, sourcePath)
  })

  ipcMain.handle(CMD.IMAGE_IMPORT_DIALOG, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const result = await dialog.showOpenDialog({
      ...(win ? { parentWindow: win } : {}),
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
      properties: ['openFile'],
    } as any)
    if (result.canceled || result.filePaths.length === 0) return null
    const campaignId = store.getActiveCampaignId()
    if (!campaignId) throw new Error('No active campaign')
    return store.importImage(campaignId, result.filePaths[0])
  })

  ipcMain.handle(CMD.IMAGE_SAVE_DATA, async (_e, base64Data: string, ext: string) => {
    const campaignId = store.getActiveCampaignId()
    if (!campaignId) throw new Error('No active campaign')
    const { writeFileSync } = await import('fs')
    const imageId = (await import('@common/utils/id')).generateId() + '.' + ext
    const path = await store.getImagePath(campaignId, imageId)
    writeFileSync(path, Buffer.from(base64Data, 'base64'))
    return imageId
  })

  ipcMain.handle(CMD.IMAGE_GET, async (_e, imageId: string) => {
    const campaignId = store.getActiveCampaignId()
    if (!campaignId) return null
    const path = await store.getImagePath(campaignId, imageId)
    if (!path) return null
    try {
      const { readFileSync } = await import('fs')
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
