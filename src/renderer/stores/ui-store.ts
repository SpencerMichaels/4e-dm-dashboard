import { create } from 'zustand'
import { useAuthoringStore } from './authoring-store'
import type { EntityType } from '@common/types'
import type { RecordType } from '@common/campaign-records'
import { DEFAULT_THEME_PREFERENCE, nextThemePreference, type ResolvedTheme, type ThemePreference } from '@kit/theme'

export type ViewMode =
  | { type: 'home' }
  | { type: 'encounter'; encounterId?: string }
  | { type: 'location'; locationId?: string }
  | { type: 'map'; mapId?: string }
  | { type: 'combat' }
  /** Rewards (experience and treasure) by level frame; `level` selects a level. */
  | { type: 'rewards'; level?: number }
  | { type: 'entity-list'; entityType: EntityType }
  /** A kind's compendium page: published and campaign entries, and Workshop drafts. `id` selects a campaign entry, `draftId` a draft. */
  | { type: 'compendium'; kind: RecordType; id?: string; draftId?: string }

export interface UiState {
  view: ViewMode
  /** The AI agent connection setting (mirrored from main): comment markers and agent tools only while on. */
  agentConnection: boolean
  setAgentConnection: (on: boolean) => void
  /** Stored theme preference (mirrored from main via initThemeSync) */
  themePreference: ThemePreference
  /** Theme currently shown (<html data-theme>) */
  resolvedTheme: ResolvedTheme
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  systemPlugin: any | null  // Serialized plugin data from main

  /** keepEdits: the same editor stays mounted with its unapplied edits (a new draft becoming saved), so do not ask to discard them. */
  setView: (view: ViewMode, options?: { keepEdits?: boolean }) => void
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
  agentConnection: false,
  setAgentConnection: (on) => { void window.api.settings.setAgentConnection(on) },
  themePreference: DEFAULT_THEME_PREFERENCE,
  resolvedTheme: 'light',
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  systemPlugin: null,
  skipAutoOpen: false,
  setView: (view, options) => {
    if (!options?.keepEdits && JSON.stringify(view) !== JSON.stringify(get().view) && useAuthoringStore.getState().pendingFields.length && !window.confirm('Discard unapplied edits and leave this view?')) return
    set({ view })
  },
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
