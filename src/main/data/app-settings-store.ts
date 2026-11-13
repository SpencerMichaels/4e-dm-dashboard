import { nativeTheme } from 'electron'
import { normalizeAppSettings, type AppSettings } from '@common/app-settings'
import { atomicWriteJson, readJson } from './file-io'
import { getAppSettingsPath } from './paths'

let settings: AppSettings = normalizeAppSettings(null)

/** Read app-settings.json (defaults if missing or invalid) and apply it. Call before creating windows. */
export async function loadAppSettings(): Promise<AppSettings> {
  settings = normalizeAppSettings(await readJson<unknown>(getAppSettingsPath()))
  applyNativeTheme()
  return settings
}

export function getAppSettings(): AppSettings {
  return settings
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  settings = normalizeAppSettings({ ...settings, ...patch })
  applyNativeTheme()
  await atomicWriteJson(getAppSettingsPath(), settings)
  return settings
}

/** Whether the windows currently show the dark theme. */
export function isDarkTheme(): boolean {
  return nativeTheme.shouldUseDarkColors
}

// Chromium's prefers-color-scheme (and native controls, scrollbars) follow
// themeSource, so the renderers' CSS shows the chosen theme even before they
// receive the setting over IPC.
function applyNativeTheme(): void {
  nativeTheme.themeSource = settings.theme
}
