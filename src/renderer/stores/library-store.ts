import { create } from 'zustand'
import type { CreatureRecord, ItemRecord, TrapRecord, DiseaseRecord, TemplateRecord, ThemeRecord } from '@common/types'

/**
 * The Library: custom entries shared by every campaign, with or without one open. Keyed like the
 * campaign store's records, and populated only from main (`library.state()` and LIBRARY_UPDATE broadcasts).
 */
export interface LibraryState {
  creatures: CreatureRecord[]
  items: ItemRecord[]
  traps: TrapRecord[]
  diseases: DiseaseRecord[]
  templates: TemplateRecord[]
  themes: ThemeRecord[]
  set: (state: Partial<Omit<LibraryState, 'set'>>) => void
}

export const useLibraryStore = create<LibraryState>(set => ({
  creatures: [], items: [], traps: [], diseases: [], templates: [], themes: [],
  set: state => set(state),
}))
