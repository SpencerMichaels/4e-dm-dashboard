import { useState, useEffect } from 'react'
import type { Item } from '@common/types'
import { useUiStore } from '../../stores/ui-store'
import { useCampaignStore } from '../../stores/campaign-store'
import { getPluginUI } from '../../plugins/registry'
import type { PluginUIComponents } from '../../plugins/plugin-types'
import { generateId } from '@common/utils/id'

interface Props {
  itemId?: string
}

export function ItemEditor({ itemId }: Props) {
  const [item, setItem] = useState<Item | null>(null)
  const [pluginUI, setPluginUI] = useState<PluginUIComponents | null>(null)
  const systemPlugin = useUiStore((s) => s.systemPlugin)

  useEffect(() => {
    if (systemPlugin?.id) getPluginUI(systemPlugin.id).then(setPluginUI)
  }, [systemPlugin?.id])

  const campaignItems = useCampaignStore((s) => s.items)

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

  // Delegate to plugin editor if available
  if (pluginUI?.ItemEditor) {
    const PluginItemEditor = pluginUI.ItemEditor
    // Attach campaign items for set item selection
    const itemWithCampaign = { ...item, _campaignItems: campaignItems } as Item
    return <PluginItemEditor item={itemWithCampaign} onSave={save} />
  }

  // Fallback generic editor
  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <input
        value={item.name}
        onChange={(e) => save({ ...item, name: e.target.value })}
        placeholder="Item name"
        style={{
          width: '100%', fontSize: 'var(--font-size-2xl)', fontWeight: 600,
          border: 'none', background: 'transparent', marginBottom: 'var(--space-4)', padding: 0,
        }}
      />
      <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
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
    </div>
  )
}
