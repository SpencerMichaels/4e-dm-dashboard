import { useState, useEffect } from 'react'
import type { Location } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { Autocomplete } from '../shared/Autocomplete'
import { generateId } from '@common/utils/id'

interface Props {
  locationId?: string
}

export function LocationEditor({ locationId }: Props) {
  const [location, setLocation] = useState<Location | null>(null)
  const locations = useCampaignStore((s) => s.locations)

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

  if (!location) return <div style={{ color: 'var(--color-text-muted)' }}>Loading...</div>

  const save = (updated: Location) => {
    const withTime = { ...updated, updatedAt: new Date().toISOString() }
    setLocation(withTime)
    window.api.entity.save('location', withTime)
  }

  const parentOptions = locations.filter((l) => l.id !== location.id)

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <input
        value={location.name}
        onChange={(e) => save({ ...location, name: e.target.value })}
        placeholder="Location name"
        style={{
          width: '100%',
          fontSize: 'var(--font-size-2xl)',
          fontWeight: 600,
          border: 'none',
          background: 'transparent',
          marginBottom: 'var(--space-4)',
          padding: 0,
        }}
      />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
          Parent Location
        </span>
        <Autocomplete
          options={parentOptions.map((l) => ({ value: l.id, label: l.name }))}
          value={location.parentId || ''}
          onChange={(val) => save({ ...location, parentId: val || undefined })}
          placeholder="Search locations..."
        />
      </div>

      <label style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
        <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
          Description
        </span>
        <textarea
          value={location.description}
          onChange={(e) => save({ ...location, description: e.target.value })}
          placeholder="Describe this location..."
          rows={6}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </label>

      <label>
        <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
          Tags (comma-separated)
        </span>
        <input
          value={location.tags.join(', ')}
          onChange={(e) => save({ ...location, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
          style={{ width: '100%' }}
        />
      </label>
    </div>
  )
}
