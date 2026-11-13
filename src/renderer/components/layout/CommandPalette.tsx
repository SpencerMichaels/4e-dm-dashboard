import { useState, useRef, useEffect, useMemo } from 'react'
import { THEME_PREFERENCES, THEME_PREFERENCE_LABELS } from '@kit/theme'
import { useUiStore } from '../../stores/ui-store'
import { useCampaignStore } from '../../stores/campaign-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import styles from './CommandPalette.module.css'

interface Command {
  id: string
  icon: string
  label: string
  hint?: string
  action: () => void
}

export function CommandPalette() {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { setView, setCommandPaletteOpen, toggleTheme, setThemePreference, toggleSidebar } = useUiStore()
  const { notes, creatures, encounters, locations, items, playerCharacters } = useCampaignStore()
  const { createNote, createCreature, createEncounter, createLocation, createItem } = useCampaignActions()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      // Navigation
      { id: 'home', icon: '🏠', label: 'Go to Home', action: () => nav({ type: 'home' }) },
      { id: 'combat', icon: '⚔️', label: 'Go to Combat', action: () => nav({ type: 'combat' }) },

      // Create
      { id: 'new-note', icon: '📝', label: 'New Note', hint: 'Create', action: async () => { const n = await createNote('Untitled'); nav({ type: 'note', noteId: n.id }) } },
      { id: 'new-creature', icon: '👹', label: 'New Creature', hint: 'Create', action: async () => { const c = await createCreature('New Creature'); nav({ type: 'creature', creatureId: c.id }) } },
      { id: 'new-encounter', icon: '⚔️', label: 'New Encounter', hint: 'Create', action: async () => { const e = await createEncounter('New Encounter'); nav({ type: 'encounter', encounterId: e.id }) } },
      { id: 'new-location', icon: '📍', label: 'New Location', hint: 'Create', action: async () => { const l = await createLocation('New Location'); nav({ type: 'location', locationId: l.id }) } },
      { id: 'new-item', icon: '🎒', label: 'New Item', hint: 'Create', action: async () => { const i = await createItem('New Item'); nav({ type: 'item', itemId: i.id }) } },

      // Settings
      { id: 'toggle-theme', icon: '◐', label: 'Cycle Theme (system / light / dark)', hint: 'Setting', action: toggleTheme },
      ...THEME_PREFERENCES.map(p => ({ id: `theme-${p}`, icon: '◐', label: `Theme: ${THEME_PREFERENCE_LABELS[p]}`, hint: 'Setting', action: () => setThemePreference(p) })),
      { id: 'toggle-sidebar', icon: '☰', label: 'Toggle Sidebar', hint: 'Ctrl+B', action: toggleSidebar },

      // Entity jump-to
      ...notes.map(n => ({ id: `note-${n.id}`, icon: '📝', label: n.title || 'Untitled', hint: 'Note', action: () => nav({ type: 'note', noteId: n.id }) })),
      ...creatures.map(c => ({ id: `creature-${c.id}`, icon: '👹', label: c.name, hint: 'Creature', action: () => nav({ type: 'creature', creatureId: c.id }) })),
      ...encounters.map(e => ({ id: `encounter-${e.id}`, icon: '⚔️', label: e.name, hint: 'Encounter', action: () => nav({ type: 'encounter', encounterId: e.id }) })),
      ...locations.map(l => ({ id: `location-${l.id}`, icon: '📍', label: l.name, hint: 'Location', action: () => nav({ type: 'location', locationId: l.id }) })),
      ...items.map(i => ({ id: `item-${i.id}`, icon: '🎒', label: i.name, hint: 'Item', action: () => nav({ type: 'item', itemId: i.id }) })),
      ...playerCharacters.map(p => ({ id: `pc-${p.id}`, icon: '🧑', label: p.name || 'Unnamed Character', hint: 'PC', action: () => nav({ type: 'entity-list', entityType: 'player-character' }) })),
    ]
    return cmds
  }, [notes, creatures, encounters, locations, items, playerCharacters])

  const filtered = useMemo(() => {
    if (!query) return commands.slice(0, 20)
    const q = query.toLowerCase()
    return commands.filter(c => c.label.toLowerCase().includes(q)).slice(0, 20)
  }, [query, commands])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  function nav(view: any) {
    setView(view)
    setCommandPaletteOpen(false)
  }

  function execute(cmd: Command) {
    cmd.action()
    setCommandPaletteOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      execute(filtered[selectedIndex])
    } else if (e.key === 'Escape') {
      setCommandPaletteOpen(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={() => setCommandPaletteOpen(false)}>
      <div className={styles.palette} onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Type a command or search..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.results}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>No results</div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                className={`${styles.resultItem} ${i === selectedIndex ? styles.selected : ''}`}
                onClick={() => execute(cmd)}
              >
                <span className={styles.resultIcon}>{cmd.icon}</span>
                <span className={styles.resultLabel}>{cmd.label}</span>
                {cmd.hint && <span className={styles.resultHint}>{cmd.hint}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
