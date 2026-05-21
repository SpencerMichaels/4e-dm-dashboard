import { ipcMain, dialog, BrowserWindow } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { EntityType } from '@common/types'
import * as store from '../data/campaign-store'
import { broadcastToDm } from '../windows'
import { setActiveSystemId } from './combat-handlers'
import { invalidateCreatureIndex } from './compendium-handlers'

export function registerCampaignHandlers(): void {
  ipcMain.handle(CMD.CAMPAIGN_CREATE, async (_e, name: string, systemId: string) => {
    const campaign = await store.createCampaign(name, systemId)
    setActiveSystemId(systemId)
    broadcastCampaignState()
    return campaign
  })

  ipcMain.handle(CMD.CAMPAIGN_OPEN, async (_e, campaignId: string) => {
    const campaign = await store.openCampaign(campaignId)
    if (campaign) {
      setActiveSystemId(campaign.systemId)
    }
    broadcastCampaignState()
    return campaign
  })

  ipcMain.handle(CMD.CAMPAIGN_DELETE, async (_e, campaignId: string) => {
    await store.deleteCampaign(campaignId)
  })

  ipcMain.handle(CMD.CAMPAIGN_LIST, async () => {
    return store.listCampaigns()
  })

  ipcMain.handle(CMD.CAMPAIGN_GET_META, async () => {
    return store.getActiveCampaign()
  })

  ipcMain.handle(CMD.CAMPAIGN_UPDATE, async (_e, patch: Record<string, unknown>) => {
    const updated = await store.updateCampaign(patch)
    broadcastCampaignState()
    return updated
  })

  ipcMain.handle(CMD.ENTITY_SAVE, async (_e, entityType: EntityType, entity: { id: string }) => {
    await store.saveEntity(entityType, entity)
    if (entityType === 'creature') invalidateCreatureIndex()
    broadcastCampaignState()
    return entity
  })

  ipcMain.handle(CMD.ENTITY_DELETE, async (_e, entityType: EntityType, entityId: string) => {
    await store.deleteEntity(entityType, entityId)
    if (entityType === 'creature') invalidateCreatureIndex()
    broadcastCampaignState()
  })

  ipcMain.handle(CMD.ENTITY_GET, async (_e, entityType: EntityType, entityId: string) => {
    return store.getEntity(entityType, entityId)
  })

  ipcMain.handle(CMD.ENTITY_LIST, async (_e, entityType: EntityType) => {
    return store.listEntities(entityType)
  })

  // Notes
  ipcMain.handle(CMD.NOTE_SAVE, async (_e, note: { id: string }) => {
    await store.saveEntity('note', note)
    broadcastCampaignState()
    return note
  })

  ipcMain.handle(CMD.NOTE_DELETE, async (_e, noteId: string) => {
    await store.deleteEntity('note', noteId)
    broadcastCampaignState()
  })

  ipcMain.handle(CMD.NOTE_GET, async (_e, noteId: string) => {
    return store.getEntity('note', noteId)
  })

  ipcMain.handle(CMD.NOTE_TREE_GET, async () => {
    return store.getNoteTree()
  })

  ipcMain.handle(CMD.NOTE_TREE_SAVE, async (_e, tree: unknown) => {
    await store.saveNoteTree(tree as any)
  })

  // Links
  ipcMain.handle(CMD.LINKS_GET, async () => {
    return store.getLinks()
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

async function broadcastCampaignState(): Promise<void> {
  const campaignId = store.getActiveCampaignId()
  if (!campaignId) return

  // Broadcast a summary of current state to DM renderer
  const [campaign, creatures, encounters, locations, maps, items, pcs, notes, noteTree, links, annotations] = await Promise.all([
    store.getActiveCampaign(),
    store.listEntities('creature'),
    store.listEntities('encounter'),
    store.listEntities('location'),
    store.listEntities('map'),
    store.listEntities('item'),
    store.listEntities('player-character'),
    store.listEntities('note'),
    store.getNoteTree(),
    store.getLinks(),
    store.loadAnnotations(campaignId),
  ])

  broadcastToDm(SYNC.CAMPAIGN_STATE, {
    campaignId,
    campaign,
    creatures,
    encounters,
    locations,
    maps,
    items,
    playerCharacters: pcs,
    notes,
    noteTree,
    links,
    annotations,
  })
}
