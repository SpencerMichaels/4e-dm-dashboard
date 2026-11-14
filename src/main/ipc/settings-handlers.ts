import { BrowserWindow, ipcMain } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import { isThemePreference } from '@kit/theme'
import { getAppSettings, updateAppSettings } from '../data/app-settings-store'
import { broadcastToAll, windowBackground } from '../windows'
import { setAgentConnection } from './authoring-handlers'

export function registerSettingsHandlers(): void {
  // Both windows may read the settings (the Player window needs the theme)
  ipcMain.handle(CMD.SETTINGS_GET, async () => getAppSettings())

  ipcMain.handle(CMD.SETTINGS_SET_THEME, async (_e, theme: unknown) => {
    if (!isThemePreference(theme)) throw new Error(`Unknown theme preference: ${String(theme)}`)
    const settings = await updateAppSettings({ theme })
    for (const w of BrowserWindow.getAllWindows()) w.setBackgroundColor(windowBackground())
    broadcastToAll(SYNC.APP_SETTINGS, settings)
    return settings
  })

  // The local AI agent connection (authoring bridge): opened or closed at once.
  ipcMain.handle(CMD.SETTINGS_SET_AGENT_CONNECTION, async (_e, on: unknown) => {
    const settings = await updateAppSettings({ agentConnection: on === true })
    await setAgentConnection(settings.agentConnection)
    broadcastToAll(SYNC.APP_SETTINGS, settings)
    return settings
  })

}
