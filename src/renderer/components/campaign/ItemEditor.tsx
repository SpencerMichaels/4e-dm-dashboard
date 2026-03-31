import { useState, useEffect } from 'react'
import type { Item } from '@common/types'
import { useUiStore } from '../../stores/ui-store'
import { SchemaForm } from './SchemaForm'
import { generateId } from '@common/utils/id'

interface Props {
  itemId?: string
}

export function ItemEditor({ itemId }: Props) {
  const [item, setItem] = useState<Item | null>(null)
  const systemPlugin = useUiStore((s) => s.systemPlugin)

  useEffect(() => {
    if (itemId) {
      window.api.entity.get('item', itemId).then((i: any) => setItem(i))
    } else {
      const now = new Date().toISOString()
      setItem({
        id: generateId(),
        name: 'New Item',
        description: '',
        tags: [],
        extra: {},
        createdAt: now,
        updatedAt: now,
      })
    }
  }, [itemId])

  if (!item) return <div style={{ color: 'var(--color-text-muted)' }}>Loading...</div>

  const save = (updated: Item) => {
    const withTime = { ...updated, updatedAt: new Date().toISOString() }
    setItem(withTime)
    window.api.entity.save('item', withTime)
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <input
        value={item.name}
        onChange={(e) => save({ ...item, name: e.target.value })}
        placeholder="Item name"
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

      <label style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
        <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
          Description
        </span>
        <textarea
          value={item.description || ''}
          onChange={(e) => save({ ...item, description: e.target.value })}
          placeholder="Describe this item..."
          rows={4}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </label>

      {systemPlugin?.itemSchema && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>Properties</h3>
          <SchemaForm
            schema={systemPlugin.itemSchema}
            values={item.extra}
            onChange={(key, value) => save({ ...item, extra: { ...item.extra, [key]: value } })}
          />
        </div>
      )}

      <label>
        <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
          Tags (comma-separated)
        </span>
        <input
          value={item.tags.join(', ')}
          onChange={(e) => save({ ...item, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
          style={{ width: '100%' }}
        />
      </label>
    </div>
  )
}
