import { useUiStore, type ViewMode } from '../../stores/ui-store'
import { useCampaignStore } from '../../stores/campaign-store'
import { useCombatStore } from '../../stores/combat-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import styles from './Sidebar.module.css'

interface NavItem {
  icon: string
  label: string
  view: ViewMode
}

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Campaign',
    items: [
      { icon: '🏠', label: 'Home', view: { type: 'home' } },
      { icon: '📝', label: 'Notes', view: { type: 'entity-list', entityType: 'note' } },
      { icon: '⚔️', label: 'Encounters', view: { type: 'entity-list', entityType: 'encounter' } },
      { icon: '📍', label: 'Locations', view: { type: 'entity-list', entityType: 'location' } },
      { icon: '🧑', label: 'PCs', view: { type: 'entity-list', entityType: 'player-character' } },
    ],
  },
  {
    title: 'Compendium',
    items: [
      { icon: '👹', label: 'Creatures', view: { type: 'entity-list', entityType: 'creature' } },
      { icon: '🎒', label: 'Items', view: { type: 'entity-list', entityType: 'item' } },
      { icon: '🪤', label: 'Traps', view: { type: 'trap-compendium' } },
      { icon: '🦠', label: 'Diseases', view: { type: 'disease-compendium' } },
      { icon: '🧬', label: 'Templates', view: { type: 'template-compendium' } },
      { icon: '🎭', label: 'Themes', view: { type: 'theme-compendium' } },
    ],
  },
]

interface SidebarProps {
  onShowHotkeys: () => void
}

export function Sidebar({ onShowHotkeys }: SidebarProps) {
  const { view, setView, toggleTheme, setCommandPaletteOpen } = useUiStore()
  const combat = useCombatStore((s) => s.combat)
  const noteTree = useCampaignStore((s) => s.noteTree)
  const notes = useCampaignStore((s) => s.notes)
  const { createNote } = useCampaignActions()

  const isActive = (navView: ViewMode) => {
    if (navView.type === view.type) {
      if (navView.type === 'entity-list' && view.type === 'entity-list') {
        return navView.entityType === view.entityType
      }
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
  const resetCampaign = useCampaignStore((s) => s.reset)
  const setSkipAutoOpen = useUiStore((s) => s.setSkipAutoOpen)

  const closeCampaign = () => {
    resetCampaign()
    setSkipAutoOpen(true)
    setView({ type: 'home' })
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.logo}>TD</div>

      {navSections.map((section) => (
        <div key={section.title} className={styles.section}>
          <div className={styles.sectionTitle}>{section.title}</div>
          {section.items.map((item) => (
            <button
              key={item.label}
              className={`${styles.item} ${isActive(item.view) ? styles.active : ''}`}
              onClick={() => setView(item.view)}
            >
              <span className={styles.itemIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      ))}

      {combat && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Active Combat</div>
          <button
            className={`${styles.item} ${view.type === 'combat' ? styles.active : ''}`}
            onClick={() => setView({ type: 'combat' })}
          >
            <span className={styles.itemIcon}>⚔️</span>
            Round {combat.round} — Turn {combat.turnIndex + 1}
          </button>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Notes</div>
        <div className={styles.noteTree}>
          {noteTree.map((node) => (
            <button
              key={node.id}
              className={`${styles.treeNode} ${view.type === 'note' && view.noteId === node.id ? styles.active : ''}`}
              onClick={() => setView({ type: 'note', noteId: node.id })}
            >
              {node.title || 'Untitled'}
            </button>
          ))}
        </div>
        <button className={styles.addBtn} onClick={handleNewNote}>
          + New Note
        </button>
      </div>

      <div className={styles.actionRow} style={{ marginTop: 'auto' }}>
        <button className={styles.iconBtn} onClick={() => setCommandPaletteOpen(true)} title="Command palette (Ctrl+K)">/</button>
        <button className={styles.iconBtn} onClick={toggleTheme} title="Toggle theme">◐</button>
        <button className={styles.iconBtn} onClick={onShowHotkeys} title="Keyboard shortcuts (?)">?</button>
      </div>

      {campaignId && (
        <div className={styles.section}>
          <button className={styles.item} onClick={closeCampaign} style={{ color: 'var(--color-text-muted)' }}>
            Close Campaign
          </button>
        </div>
      )}
    </div>
  )
}
