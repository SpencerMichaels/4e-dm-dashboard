// App-wide preferences stored by the main process in
// <userData>/app-settings.json (not per campaign, not localStorage).

import { DEFAULT_THEME_PREFERENCE, isThemePreference, type ThemePreference } from '@kit/theme'

export interface AppSettings {
  /** Color theme for both windows; the Player window follows the DM's choice. */
  theme: ThemePreference
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: DEFAULT_THEME_PREFERENCE,
}

/** Settings from a parsed app-settings.json, with defaults for missing or invalid fields. */
export function normalizeAppSettings(raw: unknown): AppSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    theme: isThemePreference(obj.theme) ? obj.theme : DEFAULT_APP_SETTINGS.theme,
  }
}
