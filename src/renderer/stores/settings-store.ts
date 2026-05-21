import { create } from 'zustand'

/**
 * App-wide and per-system user settings, persisted to localStorage.
 *
 * Schema:
 *   {
 *     app: { ... global app prefs ... },
 *     systems: { [systemId]: { [key]: value } }
 *   }
 *
 * System-specific defaults are sourced from each plugin's `settings` array
 * via the `useSystemSetting` selector hook.
 */

const STORAGE_KEY = 'tabletop-dashboard:settings'

interface PersistedSettings {
  app: Record<string, unknown>
  systems: Record<string, Record<string, unknown>>
}

const defaultPersisted: PersistedSettings = { app: {}, systems: {} }

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultPersisted
    const parsed = JSON.parse(raw)
    return {
      app: parsed.app ?? {},
      systems: parsed.systems ?? {},
    }
  } catch {
    return defaultPersisted
  }
}

function save(state: PersistedSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

interface SettingsState extends PersistedSettings {
  setAppSetting: (key: string, value: unknown) => void
  setSystemSetting: (systemId: string, key: string, value: unknown) => void
  resetSystemSettings: (systemId: string) => void
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  ...load(),
  setAppSetting: (key, value) => set((state) => {
    const next = { ...state, app: { ...state.app, [key]: value } }
    save(next)
    return next
  }),
  setSystemSetting: (systemId, key, value) => set((state) => {
    const next = {
      ...state,
      systems: {
        ...state.systems,
        [systemId]: { ...(state.systems[systemId] ?? {}), [key]: value },
      },
    }
    save(next)
    return next
  }),
  resetSystemSettings: (systemId) => set((state) => {
    const { [systemId]: _, ...rest } = state.systems
    const next = { ...state, systems: rest }
    save(next)
    return next
  }),
}))

/** Read a system-specific setting. Falls back to the default value provided. */
export function useSystemSetting<T = unknown>(systemId: string | undefined, key: string, defaultValue: T): T {
  return useSettingsStore((s) => {
    if (!systemId) return defaultValue
    const v = s.systems[systemId]?.[key]
    return (v ?? defaultValue) as T
  })
}

/** Read an app-wide setting. */
export function useAppSetting<T = unknown>(key: string, defaultValue: T): T {
  return useSettingsStore((s) => (s.app[key] ?? defaultValue) as T)
}
