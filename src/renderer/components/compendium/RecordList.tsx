// A kind's filterable list: published, Library, and open-campaign entries sorted together, with search, a
// level filter, the kind's own filters, and a source filter (Published then a book, or Custom then Shared
// or the campaign). The compendium pages show it beside their entry pane; the encounter builder uses it as
// its Traps and Items selectors (click previews, double click adds).

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { CampaignRecord } from '@common/types'
import { RECORD_STORAGE } from '@common/campaign-records'
import { useCampaignStore } from '../../stores/campaign-store'
import { useLibraryStore } from '../../stores/library-store'
import { useContentStore } from '../../stores/content-store'
import { NoContentNotice, useNoContent } from '../content/ContentPack'
import { VirtualizedList } from '../shared/VirtualizedList'
import { Icon } from '../shared/Icon'
import { parseLevelFilter } from './use-compendium'
import type { RecordKind, RecordRow } from './RecordCompendium'

const filterValue = (r: RecordRow, f: RecordKind<any>['filters'][number]) => 'facet' in f ? r.facets?.[f.facet] ?? '' : r.cells[f.column] ?? ''
/**
 * A row's book for the filter: its first source without the stray trailing period some index entries have, and
 * a magazine's issues and annual count as the magazine ("Dragon Magazine 378, Dungeon Magazine 170" → "Dragon Magazine").
 */
const bookOf = (r: RecordRow) => (r.book ?? '').split(/[,;] /)[0].trim().replace(/\.$/, '').replace(/^((?:Dragon|Dungeon) Magazine)(?: \d+| Annual)$/, '$1')
/**
 * The source filter: Published or Custom, each narrowed by a second dropdown. Published: a book (bookOf).
 * Custom: shared entries (`library`) or the campaign (`campaign`).
 */
function inSource(r: RecordRow, source: string, within: string) {
  if (source === 'published') return !r.custom && (!within || bookOf(r) === within)
  if (source === 'custom') return !!r.custom && (!within || (within === 'library') === !!r.library)
  return true
}

/** The list's entries, filters and sort. */
export function useRecordList<T extends { id: string; name: string }>(kind: RecordKind<T>) {
  const storeKey = RECORD_STORAGE[kind.type].storeKey
  const records = useCampaignStore(s => (s as unknown as Record<string, CampaignRecord<T>[]>)[storeKey]) ?? []
  const libraryRecords = useLibraryStore(s => (s as unknown as Record<string, CampaignRecord<T>[]>)[storeKey]) ?? []
  const [published, setPublished] = useState<RecordRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [levelStr, setLevelStr] = useState('')
  const [source, setSource] = useState('')
  /** The second source dropdown: a book (Published), or a home (Custom). */
  const [within, setWithin] = useState('')
  const [selects, setSelects] = useState<string[]>(kind.filters.map(() => ''))
  const [sort, setSort] = useState<{ key: number; asc: boolean }>({ key: kind.levelless ? -2 : -1, asc: true })

  const contentVersion = useContentStore(s => s.version)
  useEffect(() => { void kind.index().then(setPublished) }, [kind, contentVersion])

  const custom = useMemo((): RecordRow[] => [
    ...records.map(r => ({ ...kind.row(r.content), id: r.id, custom: true })),
    ...libraryRecords.map(r => ({ ...kind.row(r.content), id: r.id, custom: true, library: true })),
  ], [records, libraryRecords, kind])
  const filters = useDeferredValue({ search, levelStr, source, within, selects })
  const rows = useMemo(() => {
    const q = filters.search.toLowerCase()
    const level = parseLevelFilter(filters.levelStr)
    const all = [...custom, ...(published ?? [])].filter(r =>
      (!q || r.name.toLowerCase().includes(q)) && (!filters.levelStr || r.level <= 0 || level(r.level))
      && inSource(r, filters.source, filters.within)
      && kind.filters.every((f, i) => !filters.selects[i] || filterValue(r, f) === filters.selects[i]))
    const dir = sort.asc ? 1 : -1
    const keyed = sort.key >= 0 && all.some(r => r.sortKeys?.[sort.key] !== undefined)
    const value = (r: RecordRow) => sort.key === -1 ? r.level : sort.key === -2 ? r.name.toLowerCase() : keyed ? r.sortKeys?.[sort.key] ?? null : r.cells[sort.key] ?? ''
    const compare = (a: RecordRow, b: RecordRow) => {
      const x = value(a), y = value(b)
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
      return x < y ? -dir : x > y ? dir : 0
    }
    return all.sort((a, b) => compare(a, b) || a.name.localeCompare(b.name))
  }, [custom, published, filters, sort, kind])
  const options = useMemo(() => kind.filters.map(f => [...new Set([...custom, ...(published ?? [])].map(r => filterValue(r, f)).filter(Boolean))].sort()), [custom, published, kind])
  const books = useMemo(() => [...new Set((published ?? []).map(bookOf).filter(Boolean))].sort(), [published])

  return { kind, custom, published, rows, options, books, search, setSearch, levelStr, setLevelStr, source, setSource, within, setWithin, selects, setSelects, sort, setSort }
}

export type RecordListState = ReturnType<typeof useRecordList<any>>

/** The list: search and level (and `headerExtra`, the compendium page's New), filters, column headings, rows, count. */
export function RecordListPanel({ list, isActive, onSelect, onActivate, onContextMenu, headerExtra, className = 'compendium-list', style }: {
  list: RecordListState
  isActive: (r: RecordRow) => boolean
  onSelect: (r: RecordRow) => void
  onActivate: (r: RecordRow) => void
  onContextMenu?: (r: RecordRow, e: React.MouseEvent) => void
  headerExtra?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const { kind, rows, published, custom, options, books, search, setSearch, levelStr, setLevelStr, source, setSource, within, setWithin, selects, setSelects, sort, setSort } = list
  const noContent = useNoContent()
  const campaignId = useCampaignStore(s => s.campaignId)
  const campaignName = useCampaignStore(s => s.campaign?.name) ?? 'Campaign'
  const cols = `1fr ${kind.columns.map(c => c.width).join(' ')}${kind.levelless ? '' : ' 34px'}`
  const header = (label: string, key: number) => <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
    onClick={() => setSort(s => ({ key, asc: s.key === key ? !s.asc : true }))}>{label}{sort.key === key && <>{' '}<Icon name={sort.asc ? 'chevron-up' : 'chevron-down'} label={sort.asc ? 'ascending' : 'descending'} style={{ verticalAlign: '-0.125em' }} /></>}</span>

  return (
    <div className={className} style={style}>
      <div className="sb-header" style={{ flexShrink: 0 }}>
        <input className="ghost sb-name" value={search} placeholder="Search..." aria-label={`Search ${kind.plural}`} onChange={e => setSearch(e.target.value)} style={{ color: 'inherit', flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
          {!kind.levelless && <>Level <input className="ghost" value={levelStr} placeholder="1–30" aria-label="Level filter" onChange={e => setLevelStr(e.target.value.replace(/-/g, '–'))} style={{ width: 40, color: 'inherit', textAlign: 'center' }} /></>}
          {headerExtra}
        </span>
      </div>
      <div className="sb-subheader" style={{ flexShrink: 0, gap: 8, justifyContent: 'flex-start' }}>
        {kind.filters.map((f, i) => <select key={f.label} className="ghost" value={selects[i]} aria-label={f.label} style={{ color: 'inherit' }}
          onChange={e => setSelects(s => s.map((v, j) => j === i ? e.target.value : v))}>
          <option value="">{f.label}</option>{options[i].map(o => <option key={o} value={o}>{o}</option>)}
        </select>)}
        {/* Where entries come from (rows carry no home label; the stat block's title bar does), then, beside it,
            which book (Published) or which home (Custom, with a campaign open). */}
        <select className="ghost" value={source} aria-label="Source" onChange={e => { setSource(e.target.value); setWithin('') }} style={{ color: 'inherit' }}>
          <option value="">source</option><option value="published">Published</option><option value="custom">Custom</option>
        </select>
        {source === 'published' && <select className="ghost" value={within} aria-label="Book" onChange={e => setWithin(e.target.value)} style={{ color: 'inherit' }}>
          <option value="">book</option>{books.map(b => <option key={b} value={b}>{b}</option>)}
        </select>}
        {source === 'custom' && campaignId && <select className="ghost" value={within} aria-label="Custom source" onChange={e => setWithin(e.target.value)} style={{ color: 'inherit' }}>
          <option value="">all custom</option><option value="library">Shared</option><option value="campaign">{campaignName}</option>
        </select>}
      </div>
      <div className="record-columns" style={{ gridTemplateColumns: cols }}>
        {header('Name', -2)}{kind.columns.map((c, i) => <span key={c.label}>{header(c.label, i)}</span>)}{!kind.levelless && header('Level', -1)}
      </div>
      {published === null ? <div className="record-empty">Loading {kind.plural}…</div>
        : noContent && rows.length === 0 ? <NoContentNotice />
        : <VirtualizedList items={rows} renderRow={(r: RecordRow) => (
          <div className={`record-row${isActive(r) ? ' active' : ''}`} style={{ gridTemplateColumns: cols }}
            onClick={() => onSelect(r)} onDoubleClick={() => onActivate(r)}
            onContextMenu={onContextMenu ? e => onContextMenu(r, e) : undefined}>
            <span className="record-name">{r.name}</span>
            {r.cells.map((c, i) => <span key={i} className="record-cell">{c}</span>)}
            {!kind.levelless && <span>{r.level > 0 ? r.level : ''}</span>}
          </div>
        )} />}
      <div className="record-count">{published === null ? ' ' : `${rows.length.toLocaleString()} of ${(published.length + custom.length).toLocaleString()}`}</div>
    </div>
  )
}
