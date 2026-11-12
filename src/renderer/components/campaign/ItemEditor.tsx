import { useState, useEffect } from 'react'
import type { Item } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { Dnd4eItemEditor } from './Dnd4eItemEditor'
import { generateId } from '@common/utils/id'

interface Props {
  itemId?: string
}

export function ItemEditor({ itemId }: Props) {
  const [item, setItem] = useState<Item | null>(null)

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

  // Attach campaign items for set item selection
  const itemWithCampaign = { ...item, _campaignItems: campaignItems } as Item
  return <Dnd4eItemEditor item={itemWithCampaign} onSave={save} />
}
