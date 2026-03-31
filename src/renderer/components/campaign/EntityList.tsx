import { useState } from 'react'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import { useHotkeys } from '../../hooks/use-hotkeys'
import type { EntityType } from '@common/types'

interface Props {
  entityType: EntityType
}

const labels: Record<string, string> = {
  note: 'Notes',
  creature: 'Creatures',
  encounter: 'Encounters',
  location: 'Locations',
  item: 'Items',
  'player-character': 'Player Characters',
  map: 'Maps',
}

export function EntityList({ entityType }: Props) {
  const { setView } = useUiStore()
  const { creatures, encounters, locations, items, playerCharacters, notes } = useCampaignStore()
  const { createNote, createCreature, createEncounter, createLocation, createItem, createPC } = useCampaignActions()
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importWarnings, setImportWarnings] = useState<string[]>([])

  const entitiesMap: Record<string, { id: string; name?: string; title?: string }[]> = {
    note: notes,
    creature: creatures,
    encounter: encounters,
    location: locations,
    item: items,
    'player-character': playerCharacters,
  }

  const entities = entitiesMap[entityType] ?? []

  useHotkeys([
    { key: 'n', handler: () => handleCreate() },
  ])

  const handleCreate = async () => {
    switch (entityType) {
      case 'note': { const n = await createNote('Untitled'); setView({ type: 'note', noteId: n.id }); break }
      case 'creature': { const c = await createCreature('New Creature'); setView({ type: 'creature', creatureId: c.id }); break }
      case 'encounter': { const e = await createEncounter('New Encounter'); setView({ type: 'encounter', encounterId: e.id }); break }
      case 'location': { const l = await createLocation('New Location'); setView({ type: 'location', locationId: l.id }); break }
      case 'item': { const i = await createItem('New Item'); setView({ type: 'item', itemId: i.id }); break }
      case 'player-character': { const p = await createPC('New PC', ''); setView({ type: 'player-character', pcId: p.id }); break }
    }
  }

  const handleImport = async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    setImportError('')
    setImportWarnings([])
    try {
      const result = await window.api.importer.creature(importUrl.trim())
      setImportUrl('')
      // Store warnings on the creature so the editor can display them
      if (result.warnings?.length > 0) {
        const updated = { ...result.creature, statBlock: { ...result.creature.statBlock, _importWarnings: result.warnings } }
        await window.api.entity.save('creature', updated)
      }
      setView({ type: 'creature', creatureId: result.creature.id })
    } catch (e: any) {
      setImportError(e.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const navigateTo = (id: string) => {
    switch (entityType) {
      case 'note': setView({ type: 'note', noteId: id }); break
      case 'creature': setView({ type: 'creature', creatureId: id }); break
      case 'encounter': setView({ type: 'encounter', encounterId: id }); break
      case 'location': setView({ type: 'location', locationId: id }); break
      case 'item': setView({ type: 'item', itemId: id }); break
      case 'player-character': setView({ type: 'player-character', pcId: id }); break
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)' }}>{labels[entityType] ?? entityType}</h1>
        <button
          onClick={handleCreate}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          + New
        </button>
      </div>

      {/* Import from URL (creatures only for now) */}
      {entityType === 'creature' && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              value={importUrl}
              onChange={(e) => { setImportUrl(e.target.value); setImportError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleImport()}
              placeholder="Import from URL (aonprd.com)..."
              style={{ flex: 1, fontSize: 'var(--font-size-sm)' }}
              disabled={importing}
            />
            <button
              onClick={handleImport}
              disabled={importing || !importUrl.trim()}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                background: importing ? 'var(--color-bg-surface)' : 'var(--color-bg-hover)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          </div>
          {importError && (
            <div style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-1)' }}>
              {importError}
            </div>
          )}
        </div>
      )}

      {entities.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No {labels[entityType]?.toLowerCase()} yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {entities.map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <button
                onClick={() => navigateTo(e.id)}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {e.name || e.title || 'Untitled'}
              </button>
              <button
                onClick={(ev) => {
                  ev.stopPropagation()
                  window.api.entity.delete(entityType, e.id)
                }}
                title="Delete"
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
