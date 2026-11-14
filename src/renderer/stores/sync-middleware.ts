import { useCampaignStore } from './campaign-store'
import { useCombatStore } from './combat-store'
import { useUiStore } from './ui-store'
import { initThemeSync } from '../theme'

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

  // Theme: main owns the preference; mirror it into the UI store
  unsubscribers.push(
    initThemeSync(
      { get: window.api.settings.get, subscribe: window.api.on.appSettings },
      (themePreference, resolvedTheme) => useUiStore.setState({ themePreference, resolvedTheme }),
    )
  )

  // The AI agent connection setting (Settings): agent comments and markers show only while it is on
  const applyAgent = (s: { agentConnection: boolean }) => useUiStore.setState({ agentConnection: s.agentConnection })
  void window.api.settings.get().then(applyAgent)
  unsubscribers.push(window.api.on.appSettings(applyAgent))

  // Load annotations on init
  window.api.annotation.getAll().then(annotations => {
    useCampaignStore.getState().setCampaignState({ annotations })
  })

  return () => unsubscribers.forEach(unsub => unsub())
}
