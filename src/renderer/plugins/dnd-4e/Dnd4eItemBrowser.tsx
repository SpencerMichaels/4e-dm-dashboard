import { useState, useMemo, useCallback, useDeferredValue, useRef, useEffect } from 'react'
import { VirtualizedList } from './VirtualizedList'
import type { ItemIndexEntry } from '@common/types'
import { Dnd4eItemViewer } from './Dnd4eItemViewer'
import { useGlossary } from './use-glossary'
import { parseLevelFilter } from './use-compendium'

/** Parse a gp value from a price string like "520 gp", "3,400 gp", "2 healing surges" */
function parseGpValue(price: string): number {
  const m = price.match(/([\d,]+)\s*gp/i)
  return m ? parseInt(m[1].replace(/,/g, '')) : 0
}

/** Parse a gp filter string. Same format as level: "100", "50-500", ">1000", "<200" */
function parseGpFilter(str: string): (gp: number) => boolean {
  const s = str.trim()
  if (!s) return () => true
  const rangeMatch = s.match(/^([\d,]+)\s*[-–]\s*([\d,]+)$/)
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1].replace(/,/g, '')), max = parseInt(rangeMatch[2].replace(/,/g, ''))
    return (gp) => gp >= min && gp <= max
  }
  const gtMatch = s.match(/^>\s*([\d,]+)$/)
  if (gtMatch) { const n = parseInt(gtMatch[1].replace(/,/g, '')); return (gp) => gp > n }
  const ltMatch = s.match(/^<\s*([\d,]+)$/)
  if (ltMatch) { const n = parseInt(ltMatch[1].replace(/,/g, '')); return (gp) => gp < n }
  const exact = parseInt(s.replace(/,/g, ''))
  if (!isNaN(exact)) return (gp) => gp === exact
  return () => true
}


interface BrowserProps {
  items?: any[]
  onNavigate?: (id: string) => void
  onCreate?: () => void
}

export function Dnd4eItemBrowser({ items: campaignItems, onNavigate, onCreate }: BrowserProps = {}) {
  const [index, setIndex] = useState<ItemIndexEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [rarityFilter, setRarityFilter] = useState('')
  const [slotFilter, setSlotFilter] = useState('')
  const [levelStr, setLevelStr] = useState('')
  const [gpStr, setGpStr] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<any>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { tooltip } = useGlossary()

  // Load index
  useEffect(() => {
    window.api.compendium.itemIndex()
      .then((entries: ItemIndexEntry[]) => setIndex(entries))
      .finally(() => setLoading(false))
  }, [])

  const filters = useMemo(() => ({ search, categoryFilter, rarityFilter, slotFilter, levelStr, gpStr }),
    [search, categoryFilter, rarityFilter, slotFilter, levelStr, gpStr])
  const deferredFilters = useDeferredValue(filters)
  const filtering = deferredFilters !== filters

  const filtered = useMemo(() => {
    if (!index) return []
    const { search: s, categoryFilter: cat, rarityFilter: rar, slotFilter: slot, levelStr: lvl, gpStr: gp } = deferredFilters
    const q = s.toLowerCase()
    const levelTest = parseLevelFilter(lvl)
    const gpTest = parseGpFilter(gp)
    return index.filter(e => {
      if (q && !e.name.toLowerCase().includes(q)) return false
      if (cat && e.category !== cat) return false
      if (rar && e.rarity !== rar) return false
      if (slot && e.slot !== slot) return false
      if (lvl && e.level > 0) {
        // For multi-level items, match if base or max level passes the filter
        const passes = levelTest(e.level) || (e.maxLevel != null && levelTest(e.maxLevel))
        if (!passes) return false
      }
      if (gp) { const gpVal = parseGpValue(e.price); if (gpVal <= 0 || !gpTest(gpVal)) return false }
      return true
    })
  }, [index, deferredFilters])

  const SLOT_GROUPS: { label: string; values: string[] }[] = [
    { label: 'Body Slot', values: ['Arms', 'Body', 'Familiar', 'Feet', 'Hands', 'Head', 'Head and Neck', 'Item', 'Neck', 'Ring', 'Waist'] },
    { label: 'Equipment', values: ['Weapon', 'Armor', 'Implement', 'Ammunition', 'Wondrous Item', 'Consumable', 'Alchemical Item', 'Mount', 'Companion', 'Artifact', 'Item Set'] },
    { label: 'Boon / Gift', values: ['Divine Boon', 'Legendary Boon', 'Grandmaster Training', 'Fey Magic Gift', 'Glory Boon', 'Primal Blessing', "Sorcerer-King's Boon", 'Psionic Talent', 'Elemental Gift', 'Elemental gift', 'Lost Rune', 'Secret of the Way', "Wanderer's Secret", 'Echo of Power', 'Battle Scars', 'Veiled Alliance Mystery', 'Templar Brand'] },
    { label: 'Ritual', values: ['Exploration', 'Warding', 'Divination', 'Creation', 'Martial Practice', 'Travel', 'Deception', 'Binding', 'Restoration', 'Scrying', 'Other', 'Teleportation'] },
    { label: 'Alchemical', values: ['Volatile', 'Oil', 'Poison', 'Curative', 'Component'] },
    { label: 'Mundane', values: ['Gear', 'Building', 'Musical Instrument', 'Transportation', 'Lodging', 'Food', 'Drink', 'Service'] },
  ]

  const filterOptions = useMemo(() => {
    if (!index) return { categories: [], rarities: [], slotGroups: [] as { label: string; values: string[] }[] }
    const cats = new Set<string>()
    const rarities = new Set<string>()
    for (const e of index) {
      if (e.category) cats.add(e.category)
      if (e.rarity) rarities.add(e.rarity)
    }
    // Slot groups filtered to slots that exist in the selected category
    const slotsInCategory = new Set<string>()
    for (const e of index) {
      if (categoryFilter && e.category !== categoryFilter) continue
      if (e.slot) slotsInCategory.add(e.slot)
    }
    const slotGroups = SLOT_GROUPS
      .map(g => ({ label: g.label, values: g.values.filter(v => slotsInCategory.has(v)) }))
      .filter(g => g.values.length > 0)
    return {
      categories: [...cats].sort(),
      rarities: ['Common', 'Uncommon', 'Rare'].filter(r => rarities.has(r)),
      slotGroups,
    }
  }, [index, categoryFilter])

  const handleSelect = useCallback(async (itemId: string) => {
    if (itemId === selectedId) return
    setSelectedId(itemId)
    const item = await window.api.compendium.itemGet(itemId)
    setPreviewItem(item)
    previewRef.current?.scrollTo(0, 0)
  }, [selectedId])


  return (
    <div style={{ height: 'calc(100vh - var(--header-height) - 2 * var(--space-6))', display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar */}
      {(onCreate || onNavigate) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexShrink: 0 }}>
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
            Compendium ({index?.length.toLocaleString() ?? '...'})
          </span>
          <div style={{ flex: 1 }} />
          {onCreate && (
            <button onClick={onCreate} style={{
              padding: 'var(--space-2) var(--space-4)', background: 'var(--color-accent)',
              color: 'var(--color-accent-text)', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
            }}>+ Custom</button>
          )}
        </div>
      )}

    <div className="stat-block-4e compendium-split" style={{ flex: 1 }}>
      {/* Left: search + list */}
      <div className="compendium-list">
        {/* Header — mimics item stat block header */}
        <div className="sb-header" style={{ flexShrink: 0, marginBottom: 0 }}>
          <input className="ghost sb-name" ref={searchRef} value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            style={{ color: 'inherit', flex: 1 }} />
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
            Level <input className="ghost" value={levelStr}
              onChange={e => setLevelStr(e.target.value.replace(/-/g, '–'))}
              placeholder="1–30" style={{ width: 40, color: 'inherit', textAlign: 'center' }} />
            <select className="ghost" value={rarityFilter} onChange={e => setRarityFilter(e.target.value)}
              style={{ color: 'inherit' }}>
              <option value="">rarity</option>
              {filterOptions.rarities.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </span>
        </div>
        {/* Subheader — category, slot, gp */}
        <div className="sb-subheader" style={{ flexShrink: 0, marginBottom: 'var(--space-2)' }}>
          <span style={{ display: 'flex', gap: 4 }}>
            <select className="ghost" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setSlotFilter('') }}
              style={{ color: 'inherit' }}>
              <option value="">category</option>
              {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {categoryFilter && filterOptions.slotGroups.length > 0 && (
              <select className="ghost" value={slotFilter} onChange={e => setSlotFilter(e.target.value)}
                style={{ color: 'inherit' }}>
                <option value="">subtype</option>
                {filterOptions.slotGroups.map(g => (
                  <optgroup key={g.label} label={g.label}>
                    {g.values.map(v => <option key={v} value={v}>{v}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
            <input className="ghost" value={gpStr}
              onChange={e => setGpStr(e.target.value.replace(/-/g, '–'))}
              placeholder="10–200" style={{ width: 50, color: 'inherit', textAlign: 'center' }} />
            gp
          </span>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
            Loading items...
          </div>
        ) : (
          <ItemList items={filtered} selectedId={selectedId} onSelect={handleSelect} />
        )}

        <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-2) 0', flexShrink: 0, opacity: filtering ? 0.5 : 1 }}>
          {loading ? '\u00A0' : `${filtered.length.toLocaleString()} of ${index?.length.toLocaleString() ?? 0}`}
        </div>
      </div>

      {/* Right: preview */}
      <div ref={previewRef} className="compendium-preview">
        {previewItem ? (
          <Dnd4eItemViewer item={previewItem} tooltip={tooltip} onSelectItem={handleSelect} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            Click an item to preview
          </div>
        )}
      </div>
    </div>
    </div>
  )
}

type ItemSortKey = 'name' | 'category' | 'slot' | 'level'

const GRID_COLS_ITEM = '1fr 60px 80px 30px'

function ItemList({ items, selectedId, onSelect }: {
  items: ItemIndexEntry[]; selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [sortKey, setSortKey] = useState<ItemSortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    const copy = [...items]
    const dir = sortAsc ? 1 : -1
    copy.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'category': cmp = a.category.localeCompare(b.category) || a.name.localeCompare(b.name); break
        case 'slot': cmp = a.slot.localeCompare(b.slot) || a.name.localeCompare(b.name); break
        case 'level': cmp = a.level - b.level || a.name.localeCompare(b.name); break
      }
      return cmp * dir
    })
    return copy
  }, [items, sortKey, sortAsc])

  const toggleSort = (key: ItemSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const xs = { fontSize: 'var(--font-size-xs)' }
  const arrow = (key: ItemSortKey) => sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''

  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: GRID_COLS_ITEM,
        gap: 'var(--space-2)', padding: '2px var(--space-2)',
        borderBottom: '1px solid var(--sb-separator, var(--color-border))',
        flexShrink: 0, color: 'var(--color-text-muted)', fontWeight: 600, ...xs, userSelect: 'none',
      }}>
        <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('name')}>Name{arrow('name')}</span>
        <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('category')}>Type{arrow('category')}</span>
        <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('slot')}>Subtype{arrow('slot')}</span>
        <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('level')}>Level{arrow('level')}</span>
      </div>
      <VirtualizedList items={sorted} renderRow={(item) => {
        const isSelected = item.id === selectedId
        return (
          <div onClick={() => onSelect(item.id)} style={{
            display: 'grid', gridTemplateColumns: GRID_COLS_ITEM, height: '100%',
            gap: 'var(--space-2)', alignItems: 'center', padding: '0 var(--space-2)',
            borderBottom: '1px solid var(--color-border-subtle, rgba(128,128,128,0.1))',
            background: isSelected ? 'var(--color-bg-active, rgba(92,124,250,0.15))' : 'transparent',
            cursor: 'pointer', ...xs,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
              {item.name}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{item.category}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{item.slot}</span>
            <span>{item.level > 0 ? `${item.level}${item.maxLevel ? '+' : ''}` : ''}</span>
          </div>
        )
      }} />
    </>
  )
}
