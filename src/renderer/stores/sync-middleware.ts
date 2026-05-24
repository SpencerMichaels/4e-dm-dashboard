import { useCampaignStore } from './campaign-store'
import { useCombatStore } from './combat-store'

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
    window.api.on.campaignEntityUpdate((update) => {
      useCampaignStore.getState().setCampaignState({ [update.key]: update.data })
    })
  )

  unsubscribers.push(
    window.api.on.combatState((state) => {
      useCombatStore.getState().setCombatState(state)
    })
  )

  unsubscribers.push(
    window.api.on.annotations((annotations) => {
      useCampaignStore.getState().setCampaignState({ annotations })
    })
  )

  // Load annotations on init
  window.api.annotation.getAll().then(annotations => {
    useCampaignStore.getState().setCampaignState({ annotations })
  })

  return () => unsubscribers.forEach(unsub => unsub())
}
