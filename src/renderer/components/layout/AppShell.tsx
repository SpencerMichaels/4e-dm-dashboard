import { useEffect, useState } from 'react'
import { useIpcSync } from '../../hooks/use-ipc'
import { useHotkeys } from '../../hooks/use-hotkeys'
import { useUiStore } from '../../stores/ui-store'
import { useCombatStore } from '../../stores/combat-store'
import { Sidebar } from './Sidebar'
import { ContentArea } from './ContentArea'
import { CommandPalette } from './CommandPalette'
import { HotkeysModal, GLOBAL_HOTKEYS, COMBAT_HOTKEYS } from '../combat/HotkeysModal'
import { SettingsModal } from './SettingsModal'
import styles from './AppShell.module.css'
import { useAuthoringStore } from '../../stores/authoring-store'

export function AppShell() {
  useIpcSync()
  const [showHotkeys, setShowHotkeys] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const { view, sidebarCollapsed, toggleSidebar, setCommandPaletteOpen, commandPaletteOpen, setView } = useUiStore()
  const combat = useCombatStore((s) => s.combat)
  useEffect(() => window.api.authoring.onChange(event => {
    if (event.draft) useAuthoringStore.getState().receive(event.draft)
    if (event.open !== undefined) setView({ type: 'authoring', draftId: event.open || undefined })
  }), [])

  useHotkeys([
    // Universal (work even in inputs)
    { key: 'Escape', handler: () => setCommandPaletteOpen(false) },
    // Ctrl chords for use inside text fields
    { key: 'k', ctrl: true, handler: () => setCommandPaletteOpen(!commandPaletteOpen) },
    { key: 'b', ctrl: true, handler: () => toggleSidebar() },

    // Vim-style modal keys (only when NOT in an input — useHotkeys filters these)
    // Search within current view
    { key: '/', handler: () => setCommandPaletteOpen(true) },

    // Navigation
    { key: 'g', handler: () => setView({ type: 'home' }) },             // go home
    { key: 'c', handler: () => { if (combat) setView({ type: 'combat' }) } },

    // Combat turn control
    { key: 'j', handler: () => { if (combat?.phase === 'active' && combat?.turnPhase === 'active') window.api.combat.endTurn() } },

    // Help
    { key: '?', shift: true, handler: () => setShowHotkeys(v => !v) },
  ])

  return (
    <div className={styles.shell}>
      <div className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}>
        <Sidebar
          onShowHotkeys={() => setShowHotkeys(true)}
          onShowSettings={() => setShowSettings(true)} />
      </div>
      <div className={styles.content}>
        <div className={styles.main}>
          <ContentArea />
        </div>
      </div>
      {commandPaletteOpen && <CommandPalette />}
      {showHotkeys && (
        <HotkeysModal
          sections={[
            ...GLOBAL_HOTKEYS,
            ...(view.type === 'combat' ? COMBAT_HOTKEYS : []),
          ]}
          onClose={() => setShowHotkeys(false)}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
