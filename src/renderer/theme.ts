// Applies the app theme to a window. Shared by the DM and Player renderers.
//
// The main process owns the preference (app-settings.json) and broadcasts it;
// each window resolves it against the OS color scheme and writes the result
// to <html data-theme>, which selects the token set in tokens.css.

import { DEFAULT_THEME_PREFERENCE, resolveTheme, type ResolvedTheme, type ThemePreference } from '@kit/theme'
import type { AppSettings } from '@common/app-settings'

const DARK_QUERY = '(prefers-color-scheme: dark)'

interface ThemeSource {
  get: () => Promise<AppSettings>
  subscribe: (callback: (settings: AppSettings) => void) => () => void
}

/**
 * Keep this window's theme in sync with the stored preference. Calls
 * `onApply` with the preference and the theme shown, initially and on every
 * change (including OS changes while the preference is 'system').
 * Returns a cleanup function.
 */
export function initThemeSync(
  source: ThemeSource,
  onApply?: (preference: ThemePreference, resolved: ResolvedTheme) => void,
): () => void {
  const media = window.matchMedia(DARK_QUERY)
  let preference: ThemePreference = DEFAULT_THEME_PREFERENCE

  const apply = () => {
    const resolved = resolveTheme(preference, media.matches)
    document.documentElement.dataset.theme = resolved
    onApply?.(preference, resolved)
  }
  const setPreference = (settings: AppSettings) => {
    preference = settings.theme
    apply()
  }

  // Until the stored preference arrives, follow the OS (main has already set
  // Electron's themeSource, so the media query reflects the user's choice).
  apply()
  source.get().then(setPreference).catch(() => {})
  const unsubscribe = source.subscribe(setPreference)
  // With themeSource 'system' this fires on OS changes; with an explicit
  // theme it doesn't change, and resolveTheme ignores it anyway.
  media.addEventListener('change', apply)

  return () => {
    unsubscribe()
    media.removeEventListener('change', apply)
  }
}
