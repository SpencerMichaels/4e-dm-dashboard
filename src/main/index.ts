import { app, BrowserWindow } from 'electron'
import { createDmWindow, createPlayerWindow } from './windows'
import { registerCampaignHandlers } from './ipc/campaign-handlers'
import { registerCombatHandlers } from './ipc/combat-handlers'
import { registerSystemHandlers } from './ipc/system-handlers'
import { registerCompendiumHandlers } from './ipc/compendium-handlers'
import { registerSettingsHandlers } from './ipc/settings-handlers'
import { migrateLegacyUserData } from './data/migrate-user-data'
import { loadAppSettings } from './data/app-settings-store'

migrateLegacyUserData()

app.whenReady().then(async () => {
  // Load the theme before any window exists so the first paint uses it
  await loadAppSettings()

  // Register IPC handlers
  registerCampaignHandlers()
  registerCombatHandlers()
  registerSystemHandlers()
  registerCompendiumHandlers()
  registerSettingsHandlers()

  // Create windows
  createDmWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDmWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
