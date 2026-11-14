import { app, ipcMain } from 'electron'
import { join } from 'path'
import { AuthoringService } from '../authoring/service'
import { startBridge } from '../authoring/bridge'
import { getDmWindow, broadcastToDm } from '../windows'
import { getActiveCampaignId } from '../data/campaign-store'
import { getAppSettings } from '../data/app-settings-store'
import { broadcastEntityUpdate } from './campaign-handlers'
import { invalidateCreatureIndex } from './compendium-handlers'
import { CMD, SYNC } from '../../common/ipc-channels'
import { entityTypeForKind } from '../../common/campaign-records'

/** Campaign entries changed or deleted outside the authoring service: their working copies follow (set once the service starts). */
export let authoringEntryChanged: (campaignId: string, entityId: string) => void = () => {}
export let authoringEntryDeleted: (campaignId: string, entityId: string) => void = () => {}
/** A campaign was opened: working copies bound to it but never written (old Workshop drafts) become its entries. */
export let authoringCampaignOpened: (campaignId: string) => void = () => {}
/** Opens or closes the local agent connection (set once the service starts). */
export let setAgentConnection: (on: boolean) => Promise<void> = async () => {}

export async function registerAuthoringHandlers() {
  const connectionFile = join(app.getPath('userData'), 'authoring', 'connection.json')
  const service = new AuthoringService(app.getPath('userData'), join(app.getAppPath(), 'content'),
    d => broadcastToDm(SYNC.AUTHORING, { draft: d }),
    (campaignId, kind) => {
      invalidateCreatureIndex()
      if (campaignId === getActiveCampaignId()) void broadcastEntityUpdate(entityTypeForKind(kind))
    })
  authoringEntryChanged = (campaignId, entityId) => void service.drafts.entryChanged(campaignId, entityId).catch(() => {})
  authoringEntryDeleted = (campaignId, entityId) => void service.drafts.entryDeleted(campaignId, entityId).catch(() => {})
  authoringCampaignOpened = campaignId => void service.drafts.writeUnwritten(campaignId).catch(() => {})
  const open = (id?: string) => {
    getDmWindow()?.show(); getDmWindow()?.focus()
    broadcastToDm(SYNC.AUTHORING, { open: id ?? '' })
    return { opened: true }
  }
  // New content without a destination goes into the open campaign (edits are written into it as they land).
  const withCampaign = (method: string, args: any) => {
    const campaignId = getActiveCampaignId()
    return method === 'create_draft' && campaignId && args && !args.destinations?.length ? { ...args, destinations: [{ type: 'campaign', id: campaignId }] } : args
  }
  // The local agent connection: a socket and connection.json, only while the setting is on (off by default).
  let bridge: Awaited<ReturnType<typeof startBridge>> | null = null
  setAgentConnection = async on => {
    if (on && !bridge) bridge = await startBridge(connectionFile, async (method, args: any) => method === 'open_review' ? open(args?.id) : service.call(method, withCampaign(method, args), 'agent'))
    else if (!on && bridge) { const b = bridge; bridge = null; await b.close() }
  }
  await setAgentConnection(getAppSettings().agentConnection)
  app.once('before-quit', () => { void bridge?.close() })
  ipcMain.handle(CMD.AUTHORING_CALL, async (event, method: string, args: any) => {
    if (event.sender !== getDmWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('DM window required')
    if (method === 'connection') return { connectionFile }
    // What the DM has open, for the agent's current_entry (only the dashboard sets it).
    if (method === 'focus') { service.focus = args.kind ? args : null; return null }
    // Replacing an out-of-date AI session (Edit with AI after the entry changed elsewhere) is the DM's alone.
    if (method === 'archive') return service.drafts.archive(args.id)
    return service.call(method, args, 'dm')
  })
}
