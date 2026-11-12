import { app, BrowserWindow } from 'electron'
import { createDmWindow, createPlayerWindow } from './windows'
import { registerCampaignHandlers } from './ipc/campaign-handlers'
import { registerCombatHandlers } from './ipc/combat-handlers'
import { registerSystemHandlers } from './ipc/system-handlers'
import { registerCompendiumHandlers } from './ipc/compendium-handlers'
import { migrateLegacyUserData } from './data/migrate-user-data'

migrateLegacyUserData()

app.whenReady().then(() => {
  // Register IPC handlers
  registerCampaignHandlers()
  registerCombatHandlers()
  registerSystemHandlers()
  registerCompendiumHandlers()

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
