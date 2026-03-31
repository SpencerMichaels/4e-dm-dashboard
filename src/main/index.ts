import { app, BrowserWindow } from 'electron'
import { createDmWindow, createPlayerWindow } from './windows'
import { registerCampaignHandlers } from './ipc/campaign-handlers'
import { registerCombatHandlers } from './ipc/combat-handlers'
import { registerSystemHandlers } from './ipc/system-handlers'
import { registerImportHandlers } from './import/import-handler'
import { loadBuiltinPlugins, loadUserPlugins } from './plugins/plugin-loader'

app.whenReady().then(async () => {
  // Load plugins
  await loadBuiltinPlugins()
  await loadUserPlugins()

  // Register IPC handlers
  registerCampaignHandlers()
  registerCombatHandlers()
  registerSystemHandlers()
  registerImportHandlers()

  // Create windows
  createDmWindow()
  createPlayerWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDmWindow()
      createPlayerWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
