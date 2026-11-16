import { useState } from 'react'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import { useHotkeys } from '../../hooks/use-hotkeys'
import { RecordCompendium } from '../compendium/RecordCompendium'
import { RECORD_KINDS } from '../compendium/record-kinds'
import type { Encounter, EntityType } from '@common/types'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { Icon } from '../shared/Icon'
import { PCListView } from './PCListView'

interface Props {
  entityType: EntityType
}

const labels: Record<string, string> = {
  creature: 'Creatures',
  encounter: 'Encounters',
  location: 'Locations',
  item: 'Items',
  'player-character': 'Player Characters',
  map: 'Maps',
}

export function EntityList({ entityType }: Props) {
  const { setView } = useUiStore()
  const { creatures, encounters, locations, maps, items, playerCharacters } = useCampaignStore()
  const { createEncounter, createLocation, createPC, createMap } = useCampaignActions()
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const entitiesMap: Record<string, { id: string; name?: string }[]> = {
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
      case 'player-character': { await createPC('New PC', ''); break }
    }
  }

  const navigateTo = (id: string) => {
    switch (entityType) {
      case 'creature': case 'item': setView({ type: 'compendium', kind: entityType, id }); break
      case 'encounter': setView({ type: 'encounter', encounterId: id }); break
      case 'location': setView({ type: 'location', locationId: id }); break
      case 'map': setView({ type: 'map', mapId: id }); break
    }
  }

  // Player characters get their own dedicated inline-edit list view
  if (entityType === 'player-character') {
    return <PCListView />
  }

  // Creatures and items get the shared compendium page
  if (entityType === 'creature' || entityType === 'item') {
    return <RecordCompendium kind={RECORD_KINDS[entityType]} />
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)' }}>{labels[entityType] ?? entityType}</h1>
        <button
          onClick={handleCreate}
          className="btn btn-primary"
        >
          + New
        </button>
      </div>

      {entities.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No {labels[entityType]?.toLowerCase()} yet.</p>
      ) : (
        <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {entities.map((e) => (
            <div
              key={e.id}
              role="listitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
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
                {e.name || 'Untitled'}
                {entityType === 'encounter' && (e as Encounter).level != null && <span className="encounter-list-level" style={{ color: 'var(--muted)', marginLeft: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>Level {(e as Encounter).level}</span>}
              </button>
              <button
                onClick={(ev) => {
                  ev.stopPropagation()
                  setPendingDelete({ id: e.id, name: e.name || 'Untitled' })
                }}
                title="Delete"
                aria-label="Delete"
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <Icon name="x" />
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
