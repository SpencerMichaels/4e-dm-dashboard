import { create } from 'zustand'
import type { EntityType } from '@common/types'
import { DEFAULT_THEME_PREFERENCE, nextThemePreference, type ResolvedTheme, type ThemePreference } from '@kit/theme'

export type ViewMode =
  | { type: 'home' }
  | { type: 'note'; noteId: string }
  | { type: 'creature'; creatureId?: string }
  | { type: 'encounter'; encounterId?: string }
  | { type: 'location'; locationId?: string }
  | { type: 'item'; itemId?: string }
  | { type: 'map'; mapId?: string }
  | { type: 'combat' }
  | { type: 'entity-list'; entityType: EntityType }
  | { type: 'trap-compendium' }
  | { type: 'disease-compendium' }
  | { type: 'template-compendium' }
  | { type: 'theme-compendium' }

export interface UiState {
  view: ViewMode
  /** Stored theme preference (mirrored from main via initThemeSync) */
  themePreference: ThemePreference
  /** Theme currently shown (<html data-theme>) */
  resolvedTheme: ResolvedTheme
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  systemPlugin: any | null  // Serialized plugin data from main

  setView: (view: ViewMode) => void
  /** Ask main to store a theme preference; it broadcasts the result to both windows. */
  setThemePreference: (preference: ThemePreference) => void
  /** Cycle system → light → dark */
  toggleTheme: () => void
  toggleSidebar: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setSystemPlugin: (plugin: any) => void
  skipAutoOpen: boolean
  setSkipAutoOpen: (skip: boolean) => void
  reorderMode: boolean
  setReorderMode: (on: boolean) => void
}

export const useUiStore = create<UiState>()((set, get) => ({
  view: { type: 'home' },
  themePreference: DEFAULT_THEME_PREFERENCE,
  resolvedTheme: 'light',
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  systemPlugin: null,
  skipAutoOpen: false,
  setView: (view) => set({ view }),
  setThemePreference: (preference) => {
    window.api.settings.setTheme(preference)
  },
  toggleTheme: () => {
    window.api.settings.setTheme(nextThemePreference(get().themePreference))
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSystemPlugin: (plugin) => set({ systemPlugin: plugin }),
  setSkipAutoOpen: (skip) => set({ skipAutoOpen: skip }),
  reorderMode: false,
  setReorderMode: (on) => set({ reorderMode: on }),
}))
