import { create } from 'zustand'
import type { EntityType } from '@common/types'

export type ViewMode =
  | { type: 'home' }
  | { type: 'note'; noteId: string }
  | { type: 'creature'; creatureId?: string }
  | { type: 'encounter'; encounterId?: string }
  | { type: 'location'; locationId?: string }
  | { type: 'item'; itemId?: string }
  | { type: 'player-character'; pcId?: string }
  | { type: 'map'; mapId?: string }
  | { type: 'combat' }
  | { type: 'entity-list'; entityType: EntityType }
  | { type: 'trap-compendium' }
  | { type: 'disease-compendium' }
  | { type: 'template-compendium' }
  | { type: 'theme-compendium' }

export interface UiState {
  view: ViewMode
  theme: 'dark' | 'light'
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  systemPlugin: any | null  // Serialized plugin data from main

  setView: (view: ViewMode) => void
  toggleTheme: () => void
  toggleSidebar: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setSystemPlugin: (plugin: any) => void
  skipAutoOpen: boolean
  setSkipAutoOpen: (skip: boolean) => void
}

export const useUiStore = create<UiState>()((set) => ({
  view: { type: 'home' },
  theme: 'dark',
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  systemPlugin: null,
  skipAutoOpen: false,
  setView: (view) => set({ view }),
  toggleTheme: () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    return { theme: next }
  }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSystemPlugin: (plugin) => set({ systemPlugin: plugin }),
  setSkipAutoOpen: (skip) => set({ skipAutoOpen: skip }),
}))
