import { useIpcSync } from '../../hooks/use-ipc'
import { useHotkeys } from '../../hooks/use-hotkeys'
import { useUiStore } from '../../stores/ui-store'
import { useCombatStore } from '../../stores/combat-store'
import { Sidebar } from './Sidebar'
import { ContentArea } from './ContentArea'
import { CommandPalette } from './CommandPalette'
import styles from './AppShell.module.css'

export function AppShell() {
  useIpcSync()

  const { view, sidebarCollapsed, toggleSidebar, toggleTheme, setCommandPaletteOpen, commandPaletteOpen, setView } = useUiStore()
  const combat = useCombatStore((s) => s.combat)

  useHotkeys([
    // Universal (work even in inputs)
    { key: 'Escape', handler: () => setCommandPaletteOpen(false) },
    // Ctrl chords for use inside text fields
    { key: 'k', ctrl: true, handler: () => setCommandPaletteOpen(!commandPaletteOpen) },
    { key: 'b', ctrl: true, handler: () => toggleSidebar() },

    // Vim-style modal keys (only when NOT in an input — useHotkeys filters these)
    // Universal search
    { key: ' ', shift: true, handler: () => setCommandPaletteOpen(true) },
    // Search within current view
    { key: '/', handler: () => setCommandPaletteOpen(true) },

    // Navigation
    { key: 'g', handler: () => setView({ type: 'home' }) },             // go home
    { key: 'c', handler: () => { if (combat) setView({ type: 'combat' }) } },

    // Combat turn control
    { key: 'j', handler: () => { if (combat?.phase === 'active') window.api.combat.nextTurn() } },
    { key: 'k', handler: () => { if (combat?.phase === 'active') window.api.combat.prevTurn() } },
  ])

  return (
    <div className={styles.shell}>
      <div className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}>
        <Sidebar />
      </div>
      <div className={styles.content}>
        <div className={styles.header}>
          <button className={styles.headerBtn} onClick={toggleSidebar} title="Toggle sidebar (Ctrl+B)">
            ☰
          </button>
          <span className={styles.headerTitle}>Tabletop Dashboard</span>
          <button className={styles.headerBtn} onClick={() => setCommandPaletteOpen(true)} title="Command palette (Ctrl+K)">
            /
          </button>
          <button className={styles.headerBtn} onClick={toggleTheme} title="Toggle theme">
            ◐
          </button>
        </div>
        <div className={styles.main}>
          <ContentArea />
        </div>
      </div>
      {commandPaletteOpen && <CommandPalette />}
    </div>
  )
}
