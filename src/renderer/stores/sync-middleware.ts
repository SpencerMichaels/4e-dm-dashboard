import { useCampaignStore } from './campaign-store'
import { useCombatStore } from './combat-store'
import { useUiStore } from './ui-store'

declare global {
  interface Window {
    api: import('../../preload/index').DmApi
  }
}

// Wire up IPC broadcasts to Zustand stores
export function initSyncListeners(): () => void {
  const unsubscribers: (() => void)[] = []

  unsubscribers.push(
    window.api.on.campaignState((state) => {
      useCampaignStore.getState().setCampaignState(state)
    })
  )

  unsubscribers.push(
    window.api.on.combatState((state) => {
      useCombatStore.getState().setCombatState(state)
    })
  )

  unsubscribers.push(
    window.api.on.sceneState((_state) => {
      // Scene state primarily for player window; DM can use it for preview
    })
  )

  unsubscribers.push(
    window.api.on.theme((_theme) => {
      // v2: apply plugin CSS variable overrides
    })
  )

  return () => unsubscribers.forEach(unsub => unsub())
}
