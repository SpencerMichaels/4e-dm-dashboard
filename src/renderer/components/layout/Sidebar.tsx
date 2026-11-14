import { useLayoutEffect, useRef } from 'react'
import { THEME_PREFERENCE_LABELS } from '@kit/theme'
import { useUiStore, type ViewMode } from '../../stores/ui-store'
import { useCampaignStore } from '../../stores/campaign-store'
import { useCombatStore } from '../../stores/combat-store'
import styles from './Sidebar.module.css'

interface NavItem {
  icon: string
  label: string
  view: ViewMode
}

// With no campaign open, the Campaign section holds only browseItem.
const navSections: { title: string; campaign?: true; items: NavItem[] }[] = [
  {
    title: 'Campaign',
    campaign: true,
    items: [
      { icon: '🏠', label: 'Home', view: { type: 'home' } },
      { icon: '⚔️', label: 'Encounters', view: { type: 'entity-list', entityType: 'encounter' } },
      { icon: '🗺️', label: 'Maps', view: { type: 'entity-list', entityType: 'map' } },
      { icon: '🧑', label: 'PCs', view: { type: 'entity-list', entityType: 'player-character' } },
    ],
  },
  {
    title: 'Compendium',
    items: [
      { icon: '👹', label: 'Creatures', view: { type: 'compendium', kind: 'creature' } },
      { icon: '🎒', label: 'Items', view: { type: 'compendium', kind: 'item' } },
      { icon: '🪤', label: 'Traps', view: { type: 'compendium', kind: 'trap' } },
      { icon: '🦠', label: 'Diseases', view: { type: 'compendium', kind: 'disease' } },
      { icon: '🧬', label: 'Templates', view: { type: 'compendium', kind: 'template' } },
      { icon: '🎭', label: 'Themes', view: { type: 'compendium', kind: 'theme' } },
    ],
  },
]

const browseItem: NavItem = { icon: '📂', label: 'Browse...', view: { type: 'home' } }

// Smallest header font, as a fraction of its CSS size, before a long name is ellipsized.
const MIN_HEADER_SCALE = 0.7

/** Shrinks a one-line element's font until its text fits its width, down to minScale of the CSS size. */
function useFitText<T extends HTMLElement>(text: string, minScale: number) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      const full = el.scrollWidth
      if (full <= el.clientWidth) return
      // Text width scales with font size, so one measurement gives the size that fits
      // (less 2%, since scrollWidth is rounded to whole pixels).
      const scale = Math.max(minScale, (el.clientWidth / full) * 0.98)
      el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * scale}px`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    void document.fonts.ready.then(fit) // the display font may load after the first measurement
    return () => observer.disconnect()
  }, [text, minScale])
  return ref
}

interface SidebarProps {
  onShowHotkeys: () => void
  onShowSettings: () => void
}

export function Sidebar({ onShowHotkeys, onShowSettings }: SidebarProps) {
  const { view, setView, toggleTheme, themePreference, setCommandPaletteOpen } = useUiStore()
  const combat = useCombatStore((s) => s.combat)

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

  const campaignId = useCampaignStore((s) => s.campaignId)
  const campaignName = useCampaignStore((s) => s.campaign?.name)
  const resetCampaign = useCampaignStore((s) => s.reset)
  const setSkipAutoOpen = useUiStore((s) => s.setSkipAutoOpen)
  const headerText = campaignId ? campaignName ?? '' : 'DM Dashboard'
  const headerRef = useFitText<HTMLSpanElement>(headerText, MIN_HEADER_SCALE)

  const closeCampaign = () => {
    resetCampaign()
    setSkipAutoOpen(true)
    setView({ type: 'home' })
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header} title={campaignId ? `Open campaign: ${campaignName}` : undefined}>
        <span ref={headerRef} className={styles.headerText}>{headerText}</span>
      </div>

      {navSections.map((section) => (
        <nav key={section.title} className={styles.section} aria-label={section.title}>
          <div className={styles.sectionTitle}>{section.title}</div>
          {(section.campaign && !campaignId ? [browseItem] : section.items).map((item) => (
            <button
              key={item.label}
              className={`${styles.item} ${isActive(item.view) ? styles.active : ''}`}
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

      <nav className={styles.footer} aria-label="Campaign actions">
        {campaignId && (
          <button className={styles.item} onClick={closeCampaign}>
            <span className={styles.itemIcon}>📕</span>
            Close Campaign
          </button>
        )}
      </nav>

      <div className={styles.actionRow}>
        <button className={styles.iconBtn} onClick={() => window.api.playerWindow.show()} title="Show player window">👁</button>
        <button className={styles.iconBtn} onClick={() => setCommandPaletteOpen(true)} title="Command palette (Ctrl+K)">/</button>
        <button className={styles.iconBtn} onClick={toggleTheme} title={`Theme: ${THEME_PREFERENCE_LABELS[themePreference]} (click to cycle)`}>◐</button>
        <button className={styles.iconBtn} onClick={onShowSettings} title="Settings">⚙</button>
        <button className={styles.iconBtn} onClick={onShowHotkeys} title="Keyboard shortcuts (?)">?</button>
      </div>
    </div>
  )
}
