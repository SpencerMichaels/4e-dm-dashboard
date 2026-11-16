import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { createDmWindow, createPlayerWindow } from './windows'
import { registerCampaignHandlers } from './ipc/campaign-handlers'
import { registerCombatHandlers } from './ipc/combat-handlers'
import { registerSystemHandlers } from './ipc/system-handlers'
import { registerCompendiumHandlers } from './ipc/compendium-handlers'
import { registerSettingsHandlers } from './ipc/settings-handlers'
import { migrateLegacyUserData } from './data/migrate-user-data'
import { loadAppSettings } from './data/app-settings-store'
import { registerAuthoringHandlers } from './ipc/authoring-handlers'
import { conditionDescriptions, onContentChanged, recoverInterruptedImport } from './content/store'
import { setConditionText } from '@common/rules/condition-text'

// A packaged build started with --mcp is the authoring MCP server (`claude mcp add ... -- <app> --mcp`,
// mcpSetupCommand): it reruns itself as Node on the bundled CLI, with no window. The CLI's path is
// inside the app, which an AppImage or portable exe only mounts while this process runs.
const cliArgs = app.isPackaged ? process.argv.indexOf('--mcp') : -1
if (cliArgs >= 0) {
  app.dock?.hide()
  const cli = spawn(process.execPath, [join(app.getAppPath(), 'out', 'main', 'authoring-cli.js'), ...process.argv.slice(cliArgs)],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' })
  cli.on('exit', code => app.exit(code ?? 1))
} else {
  start()
}

function start(): void {
  // electron-builder names packaged builds "4e DM Dashboard"; keep their data where dev and Nix builds
  // put it (~/.config/4e-dm-dashboard, ~/Library/Application Support/4e-dm-dashboard,
  // %APPDATA%\4e-dm-dashboard). Unpackaged runs keep theirs: the UI suites set a temporary userData.
  if (app.isPackaged && !app.commandLine.hasSwitch('user-data-dir')) {
    app.setPath('userData', join(app.getPath('appData'), '4e-dm-dashboard'))
  }
  app.setAppUserModelId('io.github.spencermichaels.4e-dm-dashboard')
  migrateLegacyUserData()

  app.whenReady().then(async () => {
    // Load the theme before any window exists so the first paint uses it
    await loadAppSettings()

    // The content pack: finish an import a crash interrupted, and serve its condition text
    await recoverInterruptedImport()
    setConditionText(conditionDescriptions())
    onContentChanged(() => setConditionText(conditionDescriptions()))

    // Register IPC handlers
    registerCampaignHandlers()
    registerCombatHandlers()
    registerSystemHandlers()
    registerCompendiumHandlers()
    registerSettingsHandlers()
    await registerAuthoringHandlers()

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
}
