import { create } from 'zustand'
import type { CombatState } from '@common/types'

export interface CombatStoreState {
  combat: CombatState | null
  setCombatState: (state: CombatState | null) => void
}

export const useCombatStore = create<CombatStoreState>()((set) => ({
  combat: null,
  setCombatState: (combat) => set({ combat }),
}))
