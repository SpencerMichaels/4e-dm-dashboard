import { app, ipcMain } from 'electron'
import { join } from 'path'
import { AuthoringService } from '../authoring/service'
import { startBridge } from '../authoring/bridge'
import { getDmWindow, broadcastToDm } from '../windows'
import { getActiveCampaignId } from '../data/campaign-store'
import { broadcastEntityUpdate } from './campaign-handlers'
import { invalidateCreatureIndex } from './compendium-handlers'
import { CMD, SYNC } from '../../common/ipc-channels'
import { entityTypeForKind } from '../../common/campaign-records'

export async function registerAuthoringHandlers() {
  const connectionFile = join(app.getPath('userData'), 'authoring', 'connection.json')
  const service = new AuthoringService(app.getPath('userData'), join(app.getAppPath(), 'content'),
    d => broadcastToDm(SYNC.AUTHORING, { draft: d }),
    (campaignId, kind) => {
      invalidateCreatureIndex()
      if (campaignId === getActiveCampaignId()) void broadcastEntityUpdate(entityTypeForKind(kind))
    })
  const open = (id?: string) => {
    getDmWindow()?.show(); getDmWindow()?.focus()
    broadcastToDm(SYNC.AUTHORING, { open: id ?? '' })
    return { opened: true }
  }
  const bridge = await startBridge(connectionFile, async (method, args: any) => method === 'open_review' ? open(args?.id) : service.call(method, args, 'agent'))
  app.once('before-quit', () => { void bridge.close() })
  ipcMain.handle(CMD.AUTHORING_CALL, async (event, method: string, args: any) => {
    if (event.sender !== getDmWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('DM window required')
    if (method === 'connection') return { connectionFile }
    if (method === 'approve') {
      if (!Number.isSafeInteger(args.event)) throw new Error('Approval requires the reviewed event')
      return service.drafts.approve(args.id, args.revision, args.acceptedAdvisories === true, args.event)
    }
    if (method === 'abandon_save') return service.drafts.abandonSave(args.id)
    if (method === 'restore_draft') return service.drafts.restore(args.id, args.revision, args.event)
    return service.call(method, args, 'dm')
  })
}
