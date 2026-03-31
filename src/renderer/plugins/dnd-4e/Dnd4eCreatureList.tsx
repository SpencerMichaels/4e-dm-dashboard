import { useState, useRef, useCallback, useEffect } from 'react'
import type { Creature } from '@common/types'
import type { PluginCreatureListProps } from '../plugin-types'
import { useCompendium } from './use-compendium'

const ROW_HEIGHT = 32
const OVERSCAN = 10

export function Dnd4eCreatureList({ creatures, onNavigate, onCreate }: PluginCreatureListProps) {
  const [tab, setTab] = useState<'campaign' | 'compendium'>('compendium')
  const comp = useCompendium()

  // / hotkey focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        comp.focusSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [comp.focusSearch])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexShrink: 0 }}>
        <TabButton active={tab === 'campaign'} onClick={() => setTab('campaign')}>
          My Creatures ({creatures.length})
        </TabButton>
        <TabButton active={tab === 'compendium'} onClick={() => setTab('compendium')}>
          Compendium ({comp.totalCount.toLocaleString()})
        </TabButton>
        <div style={{ flex: 1 }} />
        <button onClick={onCreate} style={{
          padding: 'var(--space-2) var(--space-4)', background: 'var(--color-accent)',
          color: 'var(--color-accent-text)', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
        }}>+ Custom</button>
      </div>

      {tab === 'campaign' ? (
        <CampaignCreatures creatures={creatures} onNavigate={onNavigate} />
      ) : (
        <CompendiumBrowser comp={comp} onNavigate={onNavigate} />
      )}
    </div>
  )
}

// ─── Campaign creatures tab ───

function CampaignCreatures({ creatures, onNavigate }: { creatures: Creature[]; onNavigate: (id: string) => void }) {
  if (creatures.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No creatures in this campaign yet. Add from the Compendium or create a custom one.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', overflow: 'auto' }}>
      {creatures.map(c => (
        <div key={c.id} style={{
          display: 'flex', alignItems: 'center', background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
        }}>
          <button onClick={() => onNavigate(c.id)} style={{
            flex: 1, textAlign: 'left', padding: 'var(--space-3) var(--space-4)',
            background: 'transparent', border: 'none', cursor: 'pointer',
          }}>
            {c.name}
            <span style={{ marginLeft: 'var(--space-2)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
              L{(c.statBlock as any).level} {(c.statBlock as any).role}
            </span>
          </button>
          <button onClick={(ev) => { ev.stopPropagation(); window.api.entity.delete('creature', c.id) }}
            title="Delete" style={{
              padding: 'var(--space-2) var(--space-3)', background: 'transparent',
              border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)',
            }}>x</button>
        </div>
      ))}
    </div>
  )
}

// ─── Compendium browser tab ───

function CompendiumBrowser({ comp, onNavigate }: { comp: ReturnType<typeof useCompendium>; onNavigate: (id: string) => void }) {
  const { filters, filtered, filterOptions, updateFilter, searchRef, totalCount, loading } = comp
  const [adding, setAdding] = useState<string | null>(null)

  const handleAdd = useCallback(async (monsterId: string) => {
    setAdding(monsterId)
    try {
      const creature = await window.api.compendium.get('dnd-4e', monsterId)
      onNavigate(creature.id)
    } finally {
      setAdding(null)
    }
  }, [onNavigate])

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading compendium...</p>

  const xs = { fontSize: 'var(--font-size-xs)' }
  const selectStyle = { ...xs, padding: '2px 4px', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Search */}
      <div style={{ marginBottom: 'var(--space-2)', flexShrink: 0 }}>
        <input ref={searchRef} value={filters.search}
          onChange={e => updateFilter('search', e.target.value)}
          placeholder="/ Search by name..."
          style={{ width: '100%', padding: 'var(--space-2)', ...xs }} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)', alignItems: 'center', flexShrink: 0 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 2, ...xs, color: 'var(--color-text-muted)' }}>
          Level
          <input type="number" value={filters.levelMin} min={-1} max={40}
            onChange={e => updateFilter('levelMin', Number(e.target.value))}
            style={{ width: 40, ...xs, textAlign: 'center' }} />
          –
          <input type="number" value={filters.levelMax} min={-1} max={40}
            onChange={e => updateFilter('levelMax', Number(e.target.value))}
            style={{ width: 40, ...xs, textAlign: 'center' }} />
        </label>
        <select value={filters.role} onChange={e => updateFilter('role', e.target.value)} style={selectStyle}>
          <option value="">All roles</option>
          {filterOptions.roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filters.size} onChange={e => updateFilter('size', e.target.value)} style={selectStyle}>
          <option value="">All sizes</option>
          {filterOptions.sizes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.modifier} onChange={e => updateFilter('modifier', e.target.value)} style={selectStyle}>
          <option value="">All types</option>
          <option value="standard">Standard</option>
          <option value="elite">Elite</option>
          <option value="solo">Solo</option>
        </select>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 40px 90px 70px 50px 32px',
        gap: 'var(--space-2)', padding: '4px var(--space-2)',
        ...xs, color: 'var(--color-text-muted)', fontWeight: 600, borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <span>Name</span><span>Lvl</span><span>Role</span><span>Size</span><span>XP</span><span />
      </div>

      {/* Virtualized list */}
      <VirtualizedList items={filtered} rowHeight={ROW_HEIGHT} adding={adding} onAdd={handleAdd} />

      {/* Status */}
      <div style={{ ...xs, color: 'var(--color-text-muted)', padding: 'var(--space-2) 0', flexShrink: 0 }}>
        Showing {filtered.length.toLocaleString()} of {totalCount.toLocaleString()}
      </div>
    </div>
  )
}

// ─── Virtualized list ───

function VirtualizedList({ items, rowHeight, adding, onAdd }: {
  items: { id: string; name: string; level: number; role: string; modifier: string; size: string; xp: number }[]
  rowHeight: number; adding: string | null; onAdd: (id: string) => void
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
  const modLabel = (m: string) => m === 'elite' ? 'E' : m === 'solo' ? 'S' : ''

  return (
    <div ref={containerRef} onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {items.slice(startIdx, endIdx).map((item, i) => {
          const idx = startIdx + i
          const mod = modLabel(item.modifier)
          return (
            <div key={item.id} style={{
              position: 'absolute', top: idx * rowHeight, left: 0, right: 0, height: rowHeight,
              display: 'grid', gridTemplateColumns: '1fr 40px 90px 70px 50px 32px',
              gap: 'var(--space-2)', alignItems: 'center', padding: '0 var(--space-2)',
              borderBottom: '1px solid var(--color-border-subtle, rgba(128,128,128,0.1))',
              ...xs,
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              <span>{item.level}{mod && <sup style={{ color: 'var(--color-text-muted)', marginLeft: 1 }}>{mod}</sup>}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{item.role}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{item.size}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{item.xp}</span>
              <button onClick={() => onAdd(item.id)} disabled={adding === item.id}
                title="Add to campaign"
                style={{
                  padding: '2px 6px', background: 'transparent', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-muted)',
                  ...xs, lineHeight: 1,
                }}>+</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Shared ───

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: 'var(--space-2) var(--space-3)',
      background: active ? 'var(--color-bg-surface)' : 'transparent',
      border: active ? '1px solid var(--color-border)' : '1px solid transparent',
      borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
      borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
      cursor: 'pointer', fontSize: 'var(--font-size-sm)',
      color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
      fontWeight: active ? 600 : 400,
    }}>{children}</button>
  )
}
