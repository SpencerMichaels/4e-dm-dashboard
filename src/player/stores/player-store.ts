import { create } from 'zustand'
import type { PlayerCombatState, SceneState } from '@common/types'

export interface PlayerStoreState {
  combat: PlayerCombatState | null
  scene: SceneState
  setCombat: (state: PlayerCombatState | null) => void
  setScene: (state: SceneState) => void
}

export const usePlayerStore = create<PlayerStoreState>()((set) => ({
  combat: null,
  scene: { mode: 'story' },
  setCombat: (combat) => set({ combat }),
  setScene: (scene) => set({ scene }),
}))
