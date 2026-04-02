import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import type { ItemIndexEntry } from '@common/types'
import { Dnd4eItemViewer } from './Dnd4eItemViewer'

const ROW_HEIGHT = 28
const OVERSCAN = 10

export function Dnd4eItemBrowser() {
  const [index, setIndex] = useState<ItemIndexEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [rarityFilter, setRarityFilter] = useState('')
  const [slotFilter, setSlotFilter] = useState('')
  const [levelMin, setLevelMin] = useState(0)
  const [levelMax, setLevelMax] = useState(30)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<any>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Load index
  useEffect(() => {
    window.api.compendium.itemIndex('dnd-4e')
      .then((entries: ItemIndexEntry[]) => setIndex(entries))
      .finally(() => setLoading(false))
  }, [])

  // / hotkey
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = useMemo(() => {
    if (!index) return []
    const q = search.toLowerCase()
    return index.filter(e => {
      if (q && !e.name.toLowerCase().includes(q)) return false
      if (categoryFilter && e.category !== categoryFilter) return false
      if (rarityFilter && e.rarity !== rarityFilter) return false
      if (slotFilter && e.slot !== slotFilter) return false
      if (e.level > 0 && (e.level < levelMin || e.level > levelMax)) return false
      return true
    })
  }, [index, search, categoryFilter, rarityFilter, slotFilter, levelMin, levelMax])

  const filterOptions = useMemo(() => {
    if (!index) return { categories: [], rarities: [], slots: [] }
    const cats = new Set<string>()
    const rarities = new Set<string>()
    const slots = new Set<string>()
    for (const e of index) {
      if (e.category) cats.add(e.category)
      if (e.rarity) rarities.add(e.rarity)
      if (e.slot) slots.add(e.slot)
    }
    // Only show common slots, not dozens of obscure ones
    const commonSlots = ['Arms Slot', 'Feet Slot', 'Hands Slot', 'Head Slot', 'Neck Slot',
      'Ring Slot', 'Waist Slot', 'Armor', 'Weapon', 'Implement', 'Wondrous Item', 'Consumable']
    return {
      categories: [...cats].sort(),
      rarities: ['Common', 'Uncommon', 'Rare'].filter(r => rarities.has(r)),
      slots: commonSlots.filter(s => slots.has(s)),
    }
  }, [index])

  const handleSelect = useCallback(async (itemId: string) => {
    if (itemId === selectedId) return
    setSelectedId(itemId)
    const item = await window.api.compendium.itemGet('dnd-4e', itemId)
    setPreviewItem(item)
    previewRef.current?.scrollTo(0, 0)
  }, [selectedId])

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading items...</p>

  return (
    <div className="stat-block-4e" style={{ display: 'flex', flex: 1, minHeight: 0, gap: 'var(--space-3)', alignItems: 'flex-start' }}>
      {/* Left: search + list */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 280px', minWidth: 220, minHeight: 0 }}>
        <div style={{ marginBottom: 'var(--space-2)', flexShrink: 0 }}>
          <input className="ghost" ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="/ Search items..."
            style={{ width: '100%', padding: '4px 0', borderBottom: '1px solid var(--color-border)' }} />
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 'var(--space-2)', alignItems: 'center', flexShrink: 0 }}>
          <select className="ghost" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">category</option>
            {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="ghost" value={slotFilter} onChange={e => setSlotFilter(e.target.value)}>
            <option value="">slot</option>
            {filterOptions.slots.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="ghost" value={rarityFilter} onChange={e => setRarityFilter(e.target.value)}>
            <option value="">rarity</option>
            {filterOptions.rarities.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--color-text-secondary)' }}>
            Lvl
            <input className="ghost" type="number" value={levelMin} min={0} max={30}
              onChange={e => setLevelMin(Number(e.target.value))}
              style={{ width: 30, textAlign: 'center' }} />
            –
            <input className="ghost" type="number" value={levelMax} min={0} max={30}
              onChange={e => setLevelMax(Number(e.target.value))}
              style={{ width: 30, textAlign: 'center' }} />
          </label>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 30px',
          gap: 'var(--space-2)', padding: '4px var(--space-2)',
          color: 'var(--color-text-muted)', fontWeight: 600, borderBottom: '1px solid var(--sb-separator, var(--color-border))',
          flexShrink: 0,
        }}>
          <span>Name</span><span>Lvl</span>
        </div>

        <ItemList items={filtered} rowHeight={ROW_HEIGHT} selectedId={selectedId} onSelect={handleSelect} />

        <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-2) 0', flexShrink: 0 }}>
          {filtered.length.toLocaleString()} of {index?.length.toLocaleString() ?? 0}
        </div>
      </div>

      {/* Right: preview */}
      <div ref={previewRef} style={{ flex: '1 1 400px', minWidth: 300, overflow: 'auto', position: 'sticky', top: 0, maxHeight: '100vh' }}>
        {previewItem ? (
          <Dnd4eItemViewer item={previewItem} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            Click an item to preview
          </div>
        )}
      </div>
    </div>
  )
}

function ItemList({ items, rowHeight, selectedId, onSelect }: {
  items: ItemIndexEntry[]; rowHeight: number; selectedId: string | null
  onSelect: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height)
    })
    ro.observe(el)
    setContainerHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const totalHeight = items.length * rowHeight
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  const endIdx = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / rowHeight) + OVERSCAN)
  const xs = { fontSize: 'var(--font-size-xs)' }

  return (
    <div ref={containerRef} onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {items.slice(startIdx, endIdx).map((item, i) => {
          const idx = startIdx + i
          const isSelected = item.id === selectedId
          return (
            <div key={item.id} onClick={() => onSelect(item.id)} style={{
              position: 'absolute', top: idx * rowHeight, left: 0, right: 0, height: rowHeight,
              display: 'grid', gridTemplateColumns: '1fr 30px',
              gap: 'var(--space-2)', alignItems: 'center', padding: '0 var(--space-2)',
              borderBottom: '1px solid var(--color-border-subtle, rgba(128,128,128,0.1))',
              background: isSelected ? 'var(--color-bg-active, rgba(92,124,250,0.15))' : 'transparent',
              cursor: 'pointer', ...xs,
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
                {item.name}
                <span style={{ color: 'var(--color-text-muted)', marginLeft: 4, fontSize: '10px' }}>{item.category}</span>
              </span>
              <span>{item.level > 0 ? item.level : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
