import { useState, useMemo } from 'react'
import { VirtualizedList } from '../shared/VirtualizedList'

/**
 * Shared creature compendium list with sorting and column headers.
 * Used by both the Creatures compendium browser and the encounter editor.
 */

export type CreatureRow = {
  id: string; name: string; level: number; role: string
  modifier: string; size: string; type: string; xp: number
  source: string
}

type SortKey = 'name' | 'type' | 'role' | 'level'

const GRID_COLS = '1fr 50px 55px 28px 28px'
const GRID_COLS_NO_ADD = '1fr 50px 55px 28px'

interface Props {
  items: CreatureRow[]
  onAdd?: (id: string) => void
  addingId?: string | null
  onSelect?: (id: string) => void
  onActivate?: (id: string) => void
  onContextMenu?: (id: string, e: React.MouseEvent) => void
  selectedId?: string | null
  addTitle?: string
}

export function CreatureCompendiumList({ items, onAdd, addingId, onSelect, onActivate, onContextMenu, selectedId, addTitle = 'Add' }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('level')
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    const copy = [...items]
    const dir = sortAsc ? 1 : -1
    copy.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'type': cmp = a.type.localeCompare(b.type) || a.name.localeCompare(b.name); break
        case 'role': cmp = a.role.localeCompare(b.role) || a.name.localeCompare(b.name); break
        case 'level': cmp = a.level - b.level || a.name.localeCompare(b.name); break
      }
      return cmp * dir
    })
    return copy
  }, [items, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const cols = onAdd ? GRID_COLS : GRID_COLS_NO_ADD
  const xs = { fontSize: 'var(--font-size-xs)' }
  const modLabel = (m: string) => m === 'elite' ? 'E' : m === 'solo' ? 'S' : ''
  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''

  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: cols,
        gap: 'var(--space-2)', padding: '2px var(--space-2)',
        borderBottom: '1px solid var(--sb-separator, var(--color-border))',
        flexShrink: 0, color: 'var(--color-text-muted)', fontWeight: 600, ...xs, userSelect: 'none',
      }}>
        <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('name')}>Name{arrow('name')}</span>
        <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('type')}>Type{arrow('type')}</span>
        <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('role')}>Role{arrow('role')}</span>
        <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('level')}>Level{arrow('level')}</span>
        {onAdd && <span></span>}
      </div>
      <VirtualizedList items={sorted} renderRow={(item) => {
        const mod = modLabel(item.modifier)
        const isSelected = item.id === selectedId
        const isCustom = item.source === 'Custom'
        return (
          <div onClick={onSelect ? () => onSelect(item.id) : undefined}
            onDoubleClick={onActivate ? () => onActivate(item.id) : undefined}
            onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(item.id, e) } : undefined}
            title={onActivate ? 'Double-click to add' : undefined}
            style={{
              display: 'grid', gridTemplateColumns: cols, height: '100%',
              gap: 'var(--space-2)', alignItems: 'center', padding: '0 var(--space-2)',
              borderBottom: '1px solid var(--color-border-subtle, rgba(128,128,128,0.1))',
              background: isSelected ? 'var(--color-bg-active, rgba(92,124,250,0.15))' : 'transparent',
              cursor: onSelect || onActivate ? 'pointer' : undefined,
              userSelect: onActivate ? 'none' : undefined,
              ...xs,
            }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
              {isCustom && <span title="Custom creature" style={{ color: 'var(--color-accent)', marginRight: 3, fontSize: '0.8em' }}>★</span>}
              {item.name}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{item.type}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{item.role}</span>
            <span>{item.level}{mod && <sup style={{ color: 'var(--color-text-muted)', marginLeft: 1 }}>{mod}</sup>}</span>
            {onAdd && (
              <button onClick={(ev) => { ev.stopPropagation(); onAdd(item.id) }} disabled={addingId === item.id}
                title={addTitle}
                style={{
                  padding: '2px 6px', background: 'transparent', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-muted)',
                  ...xs, lineHeight: 1,
                }}>+</button>
            )}
          </div>
        )
      }} />
    </>
  )
}
