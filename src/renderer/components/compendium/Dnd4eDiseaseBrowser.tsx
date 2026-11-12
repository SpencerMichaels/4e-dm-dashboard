import { useState, useRef, useEffect, useMemo, useCallback, useDeferredValue } from 'react'
import { VirtualizedList } from '../shared/VirtualizedList'
import type { DiseaseIndexEntry } from '@common/types'
import { Dnd4eDiseaseViewer } from './Dnd4eDiseaseViewer'
import { parseLevelFilter } from './use-compendium'


export function Dnd4eDiseaseBrowser() {
  const [index, setIndex] = useState<DiseaseIndexEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [levelStr, setLevelStr] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewDisease, setPreviewDisease] = useState<any>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.compendium.diseaseIndex()
      .then((entries: DiseaseIndexEntry[]) => setIndex(entries))
      .finally(() => setLoading(false))
  }, [])

  const filters = useMemo(() => ({ search, levelStr }), [search, levelStr])
  const deferredFilters = useDeferredValue(filters)
  const filtering = deferredFilters !== filters

  const filtered = useMemo(() => {
    if (!index) return []
    const { search: s, levelStr: lvl } = deferredFilters
    const q = s.toLowerCase()
    const levelTest = parseLevelFilter(lvl)
    return index.filter(e => {
      if (q && !e.name.toLowerCase().includes(q)) return false
      if (lvl && e.level > 0 && !levelTest(e.level)) return false
      return true
    })
  }, [index, deferredFilters])

  const handleSelect = useCallback(async (diseaseId: string) => {
    if (diseaseId === selectedId) return
    setSelectedId(diseaseId)
    const disease = await window.api.compendium.diseaseGet(diseaseId)
    setPreviewDisease(disease)
    previewRef.current?.scrollTo(0, 0)
  }, [selectedId])

  type SortKey = 'name' | 'level'
  const [sortKey, setSortKey] = useState<SortKey>('level')
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    const copy = [...filtered]
    const dir = sortAsc ? 1 : -1
    copy.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'level': cmp = a.level - b.level || a.name.localeCompare(b.name); break
      }
      return cmp * dir
    })
    return copy
  }, [filtered, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }
  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''

  const xs = { fontSize: 'var(--font-size-xs)' }
  const GRID_COLS = '1fr 30px'

  return (
    <div className="stat-block-4e compendium-split">
      <div className="compendium-list">
        {/* Header */}
        <div className="sb-header" style={{ flexShrink: 0, marginBottom: 'var(--space-2)' }}>
          <input className="ghost sb-name" ref={searchRef} value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            style={{ color: 'inherit', flex: 1 }} />
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
            Level <input className="ghost" value={levelStr}
              onChange={e => setLevelStr(e.target.value.replace(/-/g, '–'))}
              placeholder="1–30" style={{ width: 40, color: 'inherit', textAlign: 'center' }} />
          </span>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: GRID_COLS,
          gap: 'var(--space-2)', padding: '2px var(--space-2)',
          borderBottom: '1px solid var(--sb-separator, var(--color-border))',
          flexShrink: 0, color: 'var(--color-text-muted)', fontWeight: 600, ...xs, userSelect: 'none',
        }}>
          <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('name')}>Name{arrow('name')}</span>
          <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('level')}>Level{arrow('level')}</span>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
            Loading diseases...
          </div>
        ) : (
          <VirtualizedList items={sorted} renderRow={(item) => {
            const isSelected = item.id === selectedId
            return (
              <div onClick={() => handleSelect(item.id)} style={{
                display: 'grid', gridTemplateColumns: GRID_COLS, height: '100%',
                gap: 'var(--space-2)', alignItems: 'center', padding: '0 var(--space-2)',
                borderBottom: '1px solid var(--color-border-subtle, rgba(128,128,128,0.1))',
                background: isSelected ? 'var(--color-bg-active, rgba(92,124,250,0.15))' : 'transparent',
                cursor: 'pointer', ...xs,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
                  {item.name}
                </span>
                <span>{item.level > 0 ? item.level : ''}</span>
              </div>
            )
          }} />
        )}

        <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-2) 0', flexShrink: 0, opacity: filtering ? 0.5 : 1 }}>
          {loading ? '\u00A0' : `${filtered.length} of ${index?.length ?? 0}`}
        </div>
      </div>

      {/* Right: preview */}
      <div ref={previewRef} className="compendium-preview">
        {previewDisease ? (
          <Dnd4eDiseaseViewer disease={previewDisease} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            Click a disease to preview
          </div>
        )}
      </div>
    </div>
  )
}
