import { useState } from 'react'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import { useHotkeys } from '../../hooks/use-hotkeys'
import { Dnd4eCreatureList } from '../../plugins/dnd-4e/Dnd4eCreatureList'
import { Dnd4eItemBrowser } from '../../plugins/dnd-4e/Dnd4eItemBrowser'
import type { EntityType } from '@common/types'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { PCListView } from './PCListView'

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
  const { creatures, encounters, locations, maps, items, playerCharacters, notes } = useCampaignStore()
  const { createNote, createCreature, createEncounter, createLocation, createItem, createPC, createMap } = useCampaignActions()
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const entitiesMap: Record<string, { id: string; name?: string; title?: string }[]> = {
    note: notes,
    creature: creatures,
    encounter: encounters,
    location: locations,
    map: maps,
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
      case 'map': {
        // Prompt user to pick an image first — maps require a background image
        const imageId = await window.api.image.importDialog()
        if (!imageId) break
        const m = await createMap('New Map', imageId)
        setView({ type: 'map', mapId: m.id })
        break
      }
      case 'item': { const i = await createItem('New Item'); setView({ type: 'item', itemId: i.id }); break }
      case 'player-character': { await createPC('New PC', ''); break }
    }
  }

  const navigateTo = (id: string) => {
    switch (entityType) {
      case 'note': setView({ type: 'note', noteId: id }); break
      case 'creature': setView({ type: 'creature', creatureId: id }); break
      case 'encounter': setView({ type: 'encounter', encounterId: id }); break
      case 'location': setView({ type: 'location', locationId: id }); break
      case 'map': setView({ type: 'map', mapId: id }); break
      case 'item': setView({ type: 'item', itemId: id }); break
    }
  }

  // Player characters get their own dedicated inline-edit list view
  if (entityType === 'player-character') {
    return <PCListView />
  }

  // Creatures and items get the 4e list/browser views
  if (entityType === 'creature') {
    return <Dnd4eCreatureList creatures={creatures} onNavigate={(id) => navigateTo(id)} onCreate={handleCreate} />
  }
  if (entityType === 'item') {
    return <Dnd4eItemBrowser items={items} onNavigate={(id) => navigateTo(id)} onCreate={handleCreate} />
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
                  setPendingDelete({ id: e.id, name: e.name || e.title || 'Untitled' })
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

      {pendingDelete && (
        <ConfirmDialog
          message={`Delete ${labels[entityType]} "${pendingDelete.name}"? This cannot be undone.`}
          onConfirm={() => {
            window.api.entity.delete(entityType, pendingDelete.id)
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
