import { THEME_PREFERENCE_LABELS } from '@kit/theme'
import { useUiStore, type ViewMode } from '../../stores/ui-store'
import { useCampaignStore } from '../../stores/campaign-store'
import { useCombatStore } from '../../stores/combat-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import styles from './Sidebar.module.css'

interface NavItem {
  icon: string
  label: string
  view: ViewMode
  /** Works without an open campaign; everything else shows Home until one is open. */
  global?: true
}

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Campaign',
    items: [
      { icon: '🏠', label: 'Home', view: { type: 'home' }, global: true },
      { icon: '📝', label: 'Notes', view: { type: 'entity-list', entityType: 'note' } },
      { icon: '⚔️', label: 'Encounters', view: { type: 'entity-list', entityType: 'encounter' } },
      { icon: '🗺️', label: 'Maps', view: { type: 'entity-list', entityType: 'map' } },
      { icon: '🧑', label: 'PCs', view: { type: 'entity-list', entityType: 'player-character' } },
    ],
  },
  {
    title: 'Compendium',
    items: [
      { icon: '👹', label: 'Creatures', view: { type: 'compendium', kind: 'creature' }, global: true },
      { icon: '🎒', label: 'Items', view: { type: 'compendium', kind: 'item' }, global: true },
      { icon: '🪤', label: 'Traps', view: { type: 'compendium', kind: 'trap' }, global: true },
      { icon: '🦠', label: 'Diseases', view: { type: 'compendium', kind: 'disease' }, global: true },
      { icon: '🧬', label: 'Templates', view: { type: 'compendium', kind: 'template' }, global: true },
      { icon: '🎭', label: 'Themes', view: { type: 'compendium', kind: 'theme' }, global: true },
    ],
  },
]

interface SidebarProps {
  onShowHotkeys: () => void
  onShowSettings: () => void
}

export function Sidebar({ onShowHotkeys, onShowSettings }: SidebarProps) {
  const { view, setView, toggleTheme, themePreference, setCommandPaletteOpen } = useUiStore()
  const combat = useCombatStore((s) => s.combat)
  const noteTree = useCampaignStore((s) => s.noteTree)
  const notes = useCampaignStore((s) => s.notes)
  const { createNote } = useCampaignActions()

  const isActive = (navView: ViewMode) => {
    if (navView.type === view.type) {
      if (navView.type === 'entity-list' && view.type === 'entity-list') {
        return navView.entityType === view.entityType
      }
      if (navView.type === 'compendium' && view.type === 'compendium') return navView.kind === view.kind
      return true
    }
    return false
  }

  const handleNewNote = async () => {
    const note = await createNote('Untitled')
    // Add to tree
    const tree = [...noteTree, { id: note.id, title: note.title, children: [] }]
    await window.api.note.treeSave(tree)
    setView({ type: 'note', noteId: note.id })
  }

  const campaignId = useCampaignStore((s) => s.campaignId)
  const campaignName = useCampaignStore((s) => s.campaign?.name)
  const resetCampaign = useCampaignStore((s) => s.reset)
  const setSkipAutoOpen = useUiStore((s) => s.setSkipAutoOpen)

  const closeCampaign = () => {
    resetCampaign()
    setSkipAutoOpen(true)
    setView({ type: 'home' })
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.logo}>4e DM</div>
      {campaignId
        ? <div className={styles.campaignName} title="Open campaign">{campaignName}</div>
        : <button className={styles.noCampaign} onClick={() => setView({ type: 'home' })} title="Open or create a campaign on Home">
            No campaign open
          </button>}

      {navSections.map((section) => (
        <nav key={section.title} className={styles.section} aria-label={section.title}>
          <div className={styles.sectionTitle}>{section.title}</div>
          {section.items.map((item) => (
            <button
              key={item.label}
              className={`${styles.item} ${isActive(item.view) ? styles.active : ''}`}
              disabled={!campaignId && !item.global}
              title={!campaignId && !item.global ? 'Open a campaign first' : undefined}
              onClick={() => setView(item.view)}
            >
              <span className={styles.itemIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      ))}

      {combat && (
        <nav className={styles.section} aria-label="Active combat">
          <div className={styles.sectionTitle}>Active Combat</div>
          <button
            className={`${styles.item} ${view.type === 'combat' ? styles.active : ''}`}
            onClick={() => setView({ type: 'combat' })}
          >
            <span className={styles.itemIcon}>⚔️</span>
            Round {combat.round} — Turn {combat.turnIndex + 1}
          </button>
        </nav>
      )}

      {campaignId && <div className={styles.section}>
        <div className={styles.sectionTitle}>Notes</div>
        <nav className={styles.noteTree} aria-label="Notes">
          {noteTree.map((node) => (
            <button
              key={node.id}
              className={`${styles.treeNode} ${view.type === 'note' && view.noteId === node.id ? styles.active : ''}`}
              onClick={() => setView({ type: 'note', noteId: node.id })}
            >
              {node.title || 'Untitled'}
            </button>
          ))}
        </nav>
        <button className={styles.addBtn} onClick={handleNewNote}>
          + New Note
        </button>
      </div>}

      <div className={styles.actionRow} style={{ marginTop: 'auto' }}>
        <button className={styles.iconBtn} onClick={() => window.api.playerWindow.show()} title="Show player window">👁</button>
        <button className={styles.iconBtn} onClick={() => setCommandPaletteOpen(true)} title="Command palette (Ctrl+K)">/</button>
        <button className={styles.iconBtn} onClick={toggleTheme} title={`Theme: ${THEME_PREFERENCE_LABELS[themePreference]} (click to cycle)`}>◐</button>
        <button className={styles.iconBtn} onClick={onShowSettings} title="Settings">⚙</button>
        <button className={styles.iconBtn} onClick={onShowHotkeys} title="Keyboard shortcuts (?)">?</button>
      </div>

      {campaignId && (
        <div className={styles.section}>
          <button className={styles.closeCampaign} onClick={closeCampaign}>
            Close Campaign
          </button>
        </div>
      )}
    </div>
  )
}
