// One compendium page for every kind (creatures, items, traps, diseases, templates, themes): published
// entries, the open campaign's entries, and the Library's (custom entries shared by every campaign), sorted
// together, with a source filter. Published entries are read-only and copy into a new entry on edit; custom
// entries edit through their working copy (a draft the AI also sees; main writes each change straight into
// the entry), so the DM's and the agent's edits merge as they land; new entries are added by their first
// edit, in the open campaign (or the Library without one). A campaign entry is shared with every campaign by
// moving it into the Library, and taken back the same way (its references follow; main's move-entry). The
// shown entry is a pane (EntryPane): its controls (where it lives, pop out, Edit, its menu) sit in the stat
// block's title bar after the name (shared/record-header), and popping it out moves it, preview or editor, into
// an OS window of its own with the same controls. Kinds can opt into artwork (a record's `art`; compendium
// annotations for published entries). Without an open campaign the page browses published entries and works on
// the Library.

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import type { CampaignRecord, RecordArt } from '@common/types'
import { LIBRARY, RECORD_STORAGE, type RecordType } from '@common/campaign-records'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { useLibraryStore } from '@renderer/stores/library-store'
import { useContentStore } from '@renderer/stores/content-store'
import { NoContentNotice, useNoContent } from '../content/ContentPack'
import { useHotkeys } from '@renderer/hooks/use-hotkeys'
import type { Draft } from '@common/authoring/types'
import '../authoring/authoring.css'
import { VirtualizedList } from '../shared/VirtualizedList'
import { Icon } from '../shared/Icon'
import { parseLevelFilter } from './use-compendium'
import { EntryMenu, EntryView, PoppedEntry, useEntryPane, type PaneState } from './EntryPane'
import '../creature/statblock.css'

/** A list row; `cells` line up with the kind's columns. */
export interface RecordRow {
  id: string; name: string; level: number; cells: string[]
  /** A custom entry: the open campaign's, or the Library's (`library`). */
  custom?: boolean
  library?: boolean
  /** Sort values for columns whose text doesn't sort (a price); null sorts last either way. */
  sortKeys?: (number | null | undefined)[]
  /** Filterable values that aren't shown as columns (a creature's rank, size, origin). */
  facets?: string[]
  /** A published entry's sourcebook ("Monster Manual", "Dragon Magazine 384"), for the book filter. */
  book?: string
}

/** What a kind's stat block gets: the content, and the comment and artwork hooks the kind opts into (editing is EntryEditor's). */
export interface StatblockProps<T> {
  value: T
  /** The entry's working copy, when its comment markers show: its node ids anchor them to the stat block's lines. */
  draft?: Draft
  art?: RecordArt
  onArtChange?: (art: RecordArt) => void
}

export interface RecordKind<T extends { id: string; name: string }> {
  type: RecordType
  singular: string
  plural: string
  columns: { label: string; width: string }[]
  /** Select filters over a column's values, or a facet's. */
  filters: ({ label: string; column: number } | { label: string; facet: number })[]
  index: () => Promise<RecordRow[]>
  row: (content: T) => Omit<RecordRow, 'id' | 'custom'>
  get: (id: string) => Promise<T>
  blank: () => T
  Statblock: ComponentType<StatblockProps<T>>
  /** Templates and themes have no level: no Level column or filter. */
  levelless?: true
  /** Artwork: kept on Custom records (`art`), and for published entries in compendium annotations. */
  art?: true
}

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

export function RecordCompendium<T extends { id: string; name: string }>({ kind, initialId, draftId }: {
  kind: RecordKind<T>
  /** A campaign entry to select on open (from the command palette). */
  initialId?: string
  /** A Workshop draft to open (an agent's open_review, the command palette). */
  draftId?: string
}) {
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
  /** A row's right-click menu (custom entries). */
  const [menu, setMenu] = useState<{ row: RecordRow; x: number; y: number } | null>(null)
  // The page's preview pane, and the entries popped out into windows of their own.
  const pane = useEntryPane(kind)
  const [poppedOut, setPoppedOut] = useState<{ key: string; initial: PaneState<T> }[]>([])
  const popCount = useRef(0)

  const contentVersion = useContentStore(s => s.version)
  const noContent = useNoContent()
  useEffect(() => { void kind.index().then(setPublished) }, [kind, contentVersion])

  // ── Rows: published, Library, and campaign entries together; filtered (a source filter for custom content) and sorted ──
  const campaignId = useCampaignStore(s => s.campaignId)
  const campaignName = useCampaignStore(s => s.campaign?.name) ?? 'Campaign'
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
  const newHome = campaignId ?? LIBRARY

  /** Pop out: the shown entry moves, as shown (preview or editor), into a window of its own; the preview empties. */
  const popOut = () => {
    if (!pane.current && !pane.edit) return
    setPoppedOut(p => [...p, { key: `compendium-entry-${++popCount.current}`, initial: pane.state }])
    pane.clear()
  }

  // A working copy to show (an agent's open_review, the command palette).
  useEffect(() => { if (draftId) void pane.showDraft(draftId) }, [draftId])
  // Open on the requested campaign entry once it has loaded.
  const opened = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!initialId || opened.current === initialId) return
    const row = custom.find(r => r.id === initialId)
    if (row) { opened.current = initialId; void pane.select(row) }
  }, [initialId, custom])
  // The agent's current_entry: what the DM has open in the preview (only while the agent connection is on).
  const { current, edit, agent } = pane
  useEffect(() => {
    if (!agent) return
    void window.api.authoring.call('focus', current || edit ? {
      kind: kind.type === 'creature' ? 'monster' : kind.type, editing: !!edit,
      ...(current?.custom ? { campaignId: pane.homeOf(current), entityId: current.id } : current ? { publishedId: current.id } : {}),
    } : {})
  }, [current?.id, current?.library, !!edit, campaignId, kind, agent])
  // e: Edit, and done again (outside a text field). A popped-out window handles its own.
  useHotkeys([{ key: 'e', handler: () => pane.toggleEdit() }])

  const cols = `1fr ${kind.columns.map(c => c.width).join(' ')}${kind.levelless ? '' : ' 34px'}`
  const header = (label: string, key: number) => <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
    onClick={() => setSort(s => ({ key, asc: s.key === key ? !s.asc : true }))}>{label}{sort.key === key && <>{' '}<Icon name={sort.asc ? 'chevron-up' : 'chevron-down'} label={sort.asc ? 'ascending' : 'descending'} style={{ verticalAlign: '-0.125em' }} /></>}</span>

  return <div className="stat-block-4e compendium-split record-compendium">
    <div className="compendium-list">
      <div className="sb-header" style={{ flexShrink: 0 }}>
        <input className="ghost sb-name" value={search} placeholder="Search..." aria-label={`Search ${kind.plural}`} onChange={e => setSearch(e.target.value)} style={{ color: 'inherit', flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
          {!kind.levelless && <>Level <input className="ghost" value={levelStr} placeholder="1–30" aria-label="Level filter" onChange={e => setLevelStr(e.target.value.replace(/-/g, '–'))} style={{ width: 40, color: 'inherit', textAlign: 'center' }} /></>}
          {/* New goes into the open campaign (or the Library without one); sharing it later moves it. */}
          <button className="btn btn-sm" onClick={() => pane.startNew(newHome)} style={{ color: 'inherit', font: 'inherit' }}
            title={campaignId ? `Create a new ${kind.singular} in ${campaignName}` : `Create a new ${kind.singular}, shared across every campaign`}>New</button>
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
        : <VirtualizedList items={rows} renderRow={(r: RecordRow) => {
          const active = r.id === current?.id && !!r.library === !!current?.library
          return <div className={`record-row${active ? ' active' : ''}`} style={{ gridTemplateColumns: cols }}
            onClick={() => void pane.select(r)} onDoubleClick={() => void pane.startEdit(r)}
            onContextMenu={e => { if (r.custom) { e.preventDefault(); setMenu({ row: r, x: e.clientX, y: e.clientY }) } }}>
            <span className="record-name">{r.name}</span>
            {r.cells.map((c, i) => <span key={i} className="record-cell">{c}</span>)}
            {!kind.levelless && <span>{r.level > 0 ? r.level : ''}</span>}
          </div>
        }} />}
      <div className="record-count">{published === null ? ' ' : `${rows.length.toLocaleString()} of ${(published.length + custom.length).toLocaleString()}`}</div>
    </div>

    <EntryView pane={pane} onPopout={popOut} emptyText={`Click a ${kind.singular} to preview`} />

    {poppedOut.map(p => <PoppedEntry key={p.key} popKey={p.key} kind={kind} initial={p.initial}
      onClose={() => setPoppedOut(prev => prev.filter(x => x.key !== p.key))} />)}

    {menu && <EntryMenu type={kind.type} row={menu.row} x={menu.x} y={menu.y} campaignId={campaignId} campaignName={campaignName}
      onShare={shared => void pane.share(menu.row, shared)} onDuplicate={() => void pane.duplicate(menu.row)} onDelete={() => void pane.remove(menu.row)} onClose={() => setMenu(null)} />}
  </div>
}
