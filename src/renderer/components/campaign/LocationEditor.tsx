import { LocationTraps } from './LocationTraps'
import { TreasureSection } from '../treasure/TreasureSection'
import { useState, useEffect } from 'react'
import type { Location } from '@common/types'
import { Icon } from '../shared/Icon'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'
import { useImage } from '../../hooks/use-image'
import { generateId } from '@common/utils/id'

interface Props {
  locationId?: string
}

export function LocationEditor({ locationId }: Props) {
  const [location, setLocation] = useState<Location | null>(null)
  const encounters = useCampaignStore((s) => s.encounters)
  const { setView } = useUiStore()
  const [addingEncounter, setAddingEncounter] = useState(false)

  useEffect(() => {
    if (locationId) {
      window.api.entity.get('location', locationId).then((l: any) => setLocation(l))
    } else {
      const now = new Date().toISOString()
      setLocation({
        id: generateId(),
        name: 'New Location',
        description: '',
        tags: [],
        createdAt: now,
        updatedAt: now,
      })
    }
  }, [locationId])

  // Hooks run before the loading return, so every render calls the same hooks.
  const sceneImageUrl = useImage(location?.sceneImageId)

  if (!location) return <div style={{ color: 'var(--muted)' }}>Loading...</div>

  const save = (updated: Location) => {
    const withTime = { ...updated, updatedAt: new Date().toISOString() }
    setLocation(withTime)
    window.api.entity.save('location', withTime)
  }


  const linkedEncounters = (location.encounterIds ?? [])
    .map(id => encounters.find(e => e.id === id))
    .filter(Boolean) as { id: string; name: string }[]

  const unlinkedEncounters = encounters.filter(e => !(location.encounterIds ?? []).includes(e.id))

  const addEncounter = async (encounterId: string) => {
    save({ ...location, encounterIds: [...(location.encounterIds ?? []), encounterId] })
    // Also set the encounter's locationId so it can inherit the location's background
    const enc = encounters.find(e => e.id === encounterId)
    if (enc) await window.api.entity.save('encounter', { ...enc, locationId: location.id })
    setAddingEncounter(false)
  }

  const removeEncounter = async (encounterId: string) => {
    save({ ...location, encounterIds: (location.encounterIds ?? []).filter(id => id !== encounterId) })
    // Clear the encounter's locationId
    const enc = encounters.find(e => e.id === encounterId)
    if (enc) await window.api.entity.save('encounter', { ...enc, locationId: undefined })
  }

  const handleImageUpload = async () => {
    const imageId = await window.api.image.importDialog()
    if (imageId) save({ ...location, sceneImageId: imageId })
  }

  const sectionLabel = (text: string) => (
    <span style={{
      display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)',
      marginBottom: 'var(--space-1)',
    }}>
      {text}
    </span>
  )

  const showToPlayers = () => {
    window.api.scene.set({
      mode: 'story',
      locationId: location.id,
      backgroundImageId: location.sceneImageId,
      title: location.name,
    })
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 'var(--space-4) 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <input
          value={location.name}
          onChange={(e) => save({ ...location, name: e.target.value })}
          placeholder="Location name"
          style={{
            flex: 1,
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 600,
            border: 'none',
            background: 'transparent',
            padding: 0,
            color: 'var(--text)',
          }}
        />
        <button
          onClick={showToPlayers}
          title="Show to players"
          className="btn"
          style={{
            padding: 'var(--space-2) var(--space-3)',
            fontSize: 'var(--font-size-sm)',
            whiteSpace: 'nowrap',
          }}
        >
          <Icon name="eye" /> Show
        </button>
      </div>

      {/* Background image */}
      <div style={{ marginBottom: 'var(--space-3)' }}>
        {sectionLabel('Background Image')}
        {sceneImageUrl ? (
          <div style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <img src={sceneImageUrl} style={{ width: '100%', display: 'block', borderRadius: 'var(--radius-sm)' }} alt="" />
            <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 4 }}>
              <button onClick={handleImageUpload}
                style={{ fontSize: 'var(--font-size-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--overlay)', color: 'var(--on-dark)', border: 'none', cursor: 'pointer' }}>
                Replace
              </button>
              <button onClick={() => save({ ...location, sceneImageId: undefined })}
                style={{ fontSize: 'var(--font-size-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--overlay)', color: 'var(--on-dark)', border: 'none', cursor: 'pointer' }}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button onClick={handleImageUpload}
            style={{
              width: '100%', padding: 'var(--space-4)',
              background: 'var(--hover)', border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              color: 'var(--muted)', fontSize: 'var(--font-size-sm)',
            }}>
            + Add background image
          </button>
        )}
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 'var(--space-3)' }}>
        {sectionLabel('Notes')}
        <textarea
          value={location.description}
          onChange={(e) => save({ ...location, description: e.target.value })}
          placeholder="Notes about this location..."
          rows={8}
          style={{
            width: '100%', resize: 'vertical',
            fontSize: 'var(--font-size-sm)',
            background: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-2)',
            color: 'var(--text)',
          }}
        />
      </div>

      <LocationTraps traps={location.traps ?? []} onChange={traps => save({ ...location, traps: traps.length ? traps : undefined })} label={sectionLabel('Traps')} />

      <TreasureSection place={{ locationId: location.id }} label={sectionLabel('Treasure')} />

      {/* Encounters */}
      <div style={{ marginBottom: 'var(--space-3)' }}>
        {sectionLabel('Encounters')}
        {linkedEncounters.length > 0 && (
          <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
            {linkedEncounters.map(enc => (
              <div key={enc.id} role="listitem" style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <span style={{ fontSize: 14 }}>⚔️</span>
                <button
                  onClick={() => setView({ type: 'encounter', encounterId: enc.id })}
                  style={{
                    flex: 1, textAlign: 'left', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text)',
                    fontSize: 'var(--font-size-sm)', fontWeight: 500, padding: 0,
                  }}>
                  {enc.name}
                </button>
                <button onClick={() => removeEncounter(enc.id)} title="Unlink encounter" aria-label="Unlink encounter"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 'var(--font-size-xs)', padding: 2, display: 'inline-flex' }}>
                  <Icon name="x" />
                </button>
              </div>
            ))}
          </div>
        )}
        {addingEncounter ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {unlinkedEncounters.length === 0 ? (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>No encounters available to link.</div>
            ) : (
              unlinkedEncounters.map(enc => (
                <button key={enc.id} onClick={() => addEncounter(enc.id)}
                  style={{
                    textAlign: 'left', padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--hover)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    fontSize: 'var(--font-size-sm)', color: 'var(--text)',
                  }}>
                  ⚔️ {enc.name}
                </button>
              ))
            )}
            <button onClick={() => setAddingEncounter(false)}
              style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 'var(--space-1)' }}>
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setAddingEncounter(true)}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--hover)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontSize: 'var(--font-size-sm)', color: 'var(--muted)',
            }}>
            + Link encounter
          </button>
        )}
      </div>

      {/* Tags */}
      <div>
        {sectionLabel('Tags')}
        <input
          value={location.tags.join(', ')}
          onChange={(e) => save({ ...location, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
          placeholder="Add tags (comma-separated)"
          style={{
            width: '100%',
            background: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-2)',
            color: 'var(--text)',
          }}
        />
      </div>
    </div>
  )
}
