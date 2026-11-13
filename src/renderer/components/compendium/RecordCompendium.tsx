// One compendium page for every kind (creatures, items, traps, diseases, templates, themes):
// published entries are read-only and clone into a campaign copy on edit; campaign ("Custom")
// entries edit in place and autosave; new entries are saved by their first edit. Kinds can opt into
// artwork (a record's `art`; compendium annotations for published entries) and pop-out stat blocks.

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { CampaignRecord, RecordArt } from '@common/types'
import { contentKindFor, newRecord, RECORD_STORAGE, type RecordType } from '@common/campaign-records'
import { reanchorReplaced } from '@common/authoring/patch'
import { generateId } from '@common/utils/id'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { useHotkeys } from '@renderer/hooks/use-hotkeys'
import { useUiStore } from '@renderer/stores/ui-store'
import { useAuthoringStore } from '@renderer/stores/authoring-store'
import { VirtualizedList } from '../shared/VirtualizedList'
import { FloatingPanel } from '../shared/FloatingPanel'
import { parseLevelFilter } from './use-compendium'
import '../creature/statblock.css'

/** A list row; `cells` line up with the kind's columns. */
export interface RecordRow {
  id: string; name: string; level: number; cells: string[]; custom?: boolean
  /** Filterable values that aren't shown as columns (a creature's rank, size, origin). */
  facets?: string[]
}

/** What a kind's stat block gets: the content, and the editing, artwork, and pop-out hooks the kind opts into. */
export interface StatblockProps<T> {
  value: T
  onChange?: (next: T) => void
  art?: RecordArt
  onArtChange?: (art: RecordArt) => void
  onPopout?: () => void
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
  /** Stat blocks can pop out into floating panels. */
  popout?: true
}

const filterValue = (r: RecordRow, f: RecordKind<any>['filters'][number]) => 'facet' in f ? r.facets?.[f.facet] ?? '' : r.cells[f.column] ?? ''
const SAVE_DEBOUNCE_MS = 500
type Editing<T> = { record: CampaignRecord<T>; draft: boolean }

export function RecordCompendium<T extends { id: string; name: string }>({ kind, initialId }: { kind: RecordKind<T>; /** A campaign entry to select on open (from the command palette). */ initialId?: string }) {
  const records = useCampaignStore(s => (s as unknown as Record<string, CampaignRecord<T>[]>)[RECORD_STORAGE[kind.type].storeKey]) ?? []
  const [published, setPublished] = useState<RecordRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [levelStr, setLevelStr] = useState('')
  const [source, setSource] = useState('')
  const [selects, setSelects] = useState<string[]>(kind.filters.map(() => ''))
  const [sort, setSort] = useState<{ key: number; asc: boolean }>({ key: kind.levelless ? -2 : -1, asc: true })
  const [selected, setSelected] = useState<RecordRow | null>(null)
  const [preview, setPreview] = useState<T | null>(null)
  const [editing, setEditing] = useState<Editing<T> | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [poppedOut, setPoppedOut] = useState<{ id: string; content: T; art?: RecordArt }[]>([])
  const annotations = useCampaignStore(s => s.annotations)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => { void kind.index().then(setPublished) }, [kind])

  // ── Rows: Custom entries first, then published, filtered and sorted ──
  const custom = useMemo(() => records.map(r => ({ ...kind.row(r.content), id: r.id, custom: true })), [records, kind])
  const filters = useDeferredValue({ search, levelStr, source, selects })
  const rows = useMemo(() => {
    const q = filters.search.toLowerCase()
    const level = parseLevelFilter(filters.levelStr)
    const all = [...custom, ...(published ?? [])].filter(r =>
      (!q || r.name.toLowerCase().includes(q)) && (!filters.levelStr || r.level <= 0 || level(r.level))
      && (!filters.source || (filters.source === 'custom') === !!r.custom)
      && kind.filters.every((f, i) => !filters.selects[i] || filterValue(r, f) === filters.selects[i]))
    const dir = sort.asc ? 1 : -1
    const value = (r: RecordRow) => sort.key === -1 ? r.level : sort.key === -2 ? r.name.toLowerCase() : r.cells[sort.key] ?? ''
    return all.sort((a, b) => (Number(!!b.custom) - Number(!!a.custom)) || (value(a) < value(b) ? -dir : value(a) > value(b) ? dir : 0) || a.name.localeCompare(b.name))
  }, [custom, published, filters, sort, kind])
  const options = useMemo(() => kind.filters.map(f => [...new Set([...custom, ...(published ?? [])].map(r => filterValue(r, f)).filter(Boolean))].sort()), [custom, published, kind])

  // ── Saving: debounced, flushed before leaving the editor ──
  const pending = useRef<CampaignRecord<T> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const save = useCallback(async (record: CampaignRecord<T>) => {
    await window.api.entity.save(kind.type, record as unknown as Record<string, unknown>)
    setSavedAt(new Date())
  }, [kind.type])
  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    const record = pending.current
    pending.current = null
    if (record) await save(record)
  }, [save])
  useEffect(() => () => { void flush() }, [flush])

  // The latest editor state, so rapid edits never build on a stale copy.
  const editingRef = useRef(editing)
  editingRef.current = editing
  const update = (current: Editing<T>, record: CampaignRecord<T>) => {
    pending.current = record
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    if (current.draft) setSelected({ ...kind.row(record.content), id: record.id, custom: true })
    editingRef.current = { record, draft: false }
    setEditing(editingRef.current)
  }
  const change = (content: T) => {
    const current = editingRef.current
    if (!current) return
    // Prose edits keep their rules metadata: clause spans follow the quoted words.
    const next = structuredClone(content)
    reanchorReplaced(current.record.content, next)
    update(current, { ...current.record, content: { ...next, id: current.record.id }, updatedAt: new Date().toISOString() })
  }
  const changeArt = (art: RecordArt) => {
    const current = editingRef.current
    if (current) update(current, { ...current.record, art: { ...current.record.art, ...art }, updatedAt: new Date().toISOString() })
  }

  // ── Artwork: a Custom record's own, or a published entry's compendium annotation ──
  const artFor = (row: RecordRow) => row.custom ? records.find(r => r.id === row.id)?.art : annotations[row.id]
  const setArt = async (row: RecordRow, art: RecordArt) => {
    if (!row.custom) return void await window.api.annotation.save(row.id, { ...(annotations[row.id] ?? {}), ...art })
    const record = records.find(r => r.id === row.id)
    if (record) await save({ ...record, art: { ...record.art, ...art }, updatedAt: new Date().toISOString() })
  }
  const popOut = (id: string, content: T, art?: RecordArt) => setPoppedOut(p => p.some(x => x.id === id) ? p : [...p, { id, content, art }])

  // ── Selecting, editing, cloning, creating, deleting ──
  const select = async (row: RecordRow) => {
    await flush()
    setEditing(null); setSelected(row)
    setPreview(row.custom ? records.find(r => r.id === row.id)?.content ?? null : await kind.get(row.id))
    previewRef.current?.scrollTo(0, 0)
  }
  // Open on the requested campaign entry once it has loaded.
  const opened = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!initialId || opened.current === initialId) return
    const row = custom.find(r => r.id === initialId)
    if (row) { opened.current = initialId; void select(row) }
  }, [initialId, custom])
  const startEdit = async (row: RecordRow | null = selected) => {
    if (!row) return
    await flush()
    const now = new Date().toISOString()
    if (row.custom) {
      const record = records.find(r => r.id === row.id)
      if (record) setEditing({ record, draft: false })
    } else {
      // A published entry is copied (with its artwork); the copy is saved by its first edit.
      const content = await kind.get(row.id)
      const record = newRecord(generateId(), content, now, `published/${kind.type}/${row.id}`) as CampaignRecord<T>
      const art = kind.art ? annotations[row.id] : undefined
      if (art && Object.keys(art).length) record.art = { ...art }
      setEditing({ record, draft: true })
    }
  }
  const startNew = async () => {
    await flush()
    setSelected(null); setPreview(null)
    setEditing({ record: newRecord(generateId(), kind.blank(), new Date().toISOString()) as CampaignRecord<T>, draft: true })
  }
  const exit = async () => {
    await flush()
    if (editing && !editing.draft) setPreview(editing.record.content)
    setEditing(null)
  }
  // An update draft bound to this record; the Workshop's save checks it is unchanged since.
  const campaignId = useCampaignStore(s => s.campaignId)
  const openInWorkshop = async (id: string) => {
    const record = records.find(r => r.id === id)
    if (!record || !campaignId) return
    const destination = { type: 'campaign', id: campaignId, entityId: id }
    const { hash } = await window.api.authoring.call('destination_entity', { destination, kind: contentKindFor(kind.type), entityId: id })
    const draft = await window.api.authoring.call('create_draft', { kind: contentKindFor(kind.type), content: record.content, destinations: [{ ...destination, expectedHash: hash }], intent: `Revise ${record.content.name}, preserving its existing mechanics unless changed explicitly.` })
    useAuthoringStore.getState().receive(draft)
    useUiStore.getState().setView({ type: 'authoring', draftId: draft.id })
  }
  const remove = async (id: string) => {
    setMenu(null)
    if (editing?.record.id === id) { clearTimeout(timer.current); pending.current = null; setEditing(null) }
    if (selected?.id === id) { setSelected(null); setPreview(null) }
    await window.api.entity.delete(kind.type, id)
  }
  useHotkeys([{ key: 'e', handler: () => { if (!editing) void startEdit() } }])
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const cols = `1fr ${kind.columns.map(c => c.width).join(' ')}${kind.levelless ? '' : ' 34px'}`
  const header = (label: string, key: number) => <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
    onClick={() => setSort(s => ({ key, asc: s.key === key ? !s.asc : true }))}>{label}{sort.key === key ? (sort.asc ? ' ▲' : ' ▼') : ''}</span>
  const Statblock = kind.Statblock
  const action = (label: string, onClick: () => void, title?: string): ReactNode => <button className="ghost record-action" title={title} onClick={onClick}>{label}</button>

  return <div className="stat-block-4e compendium-split record-compendium">
    <div className="compendium-list">
      <div className="sb-header" style={{ flexShrink: 0 }}>
        <input className="ghost sb-name" value={search} placeholder="Search..." aria-label={`Search ${kind.plural}`} onChange={e => setSearch(e.target.value)} style={{ color: 'inherit', flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
          {!kind.levelless && <>Level <input className="ghost" value={levelStr} placeholder="1–30" aria-label="Level filter" onChange={e => setLevelStr(e.target.value.replace(/-/g, '–'))} style={{ width: 40, color: 'inherit', textAlign: 'center' }} /></>}
          <button className="ghost" onClick={() => void startNew()} title={`Create a new ${kind.singular}`} style={{ color: 'inherit', font: 'inherit' }}>+ new</button>
        </span>
      </div>
      <div className="sb-subheader" style={{ flexShrink: 0, gap: 8, justifyContent: 'flex-start' }}>
        <select className="ghost" value={source} aria-label="Source" onChange={e => setSource(e.target.value)} style={{ color: 'inherit' }}>
          <option value="">all</option><option value="custom">Custom</option><option value="published">Published</option>
        </select>
        {kind.filters.map((f, i) => <select key={f.label} className="ghost" value={selects[i]} aria-label={f.label} style={{ color: 'inherit' }}
          onChange={e => setSelects(s => s.map((v, j) => j === i ? e.target.value : v))}>
          <option value="">{f.label}</option>{options[i].map(o => <option key={o} value={o}>{o}</option>)}
        </select>)}
      </div>
      <div className="record-columns" style={{ gridTemplateColumns: cols }}>
        {header('Name', -2)}{kind.columns.map((c, i) => <span key={c.label}>{header(c.label, i)}</span>)}{!kind.levelless && header('Level', -1)}
      </div>
      {published === null ? <div className="record-empty">Loading {kind.plural}…</div>
        : <VirtualizedList items={rows} renderRow={(r: RecordRow) => {
          const active = r.id === (editing?.record.id ?? selected?.id)
          return <div className={`record-row${active ? ' active' : ''}`} style={{ gridTemplateColumns: cols }}
            onClick={() => void select(r)} onDoubleClick={() => void startEdit(r)}
            onContextMenu={e => { if (r.custom) { e.preventDefault(); setMenu({ id: r.id, x: e.clientX, y: e.clientY }) } }}>
            <span className="record-name">{r.name}{r.custom && <span className="record-custom">Custom</span>}</span>
            {r.cells.map((c, i) => <span key={i} className="record-cell">{c}</span>)}
            {!kind.levelless && <span>{r.level > 0 ? r.level : ''}</span>}
          </div>
        }} />}
      <div className="record-count">{published === null ? ' ' : `${rows.length.toLocaleString()} of ${(published.length + custom.length).toLocaleString()}`}</div>
      {editing && <div className="record-editbar">
        <button onClick={() => void exit()} title="Back to preview">← Back</button>
        <span>{editing.draft ? 'Draft (saves on first edit)' : savedAt ? `Saved at ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Editing'}</span>
      </div>}
    </div>

    <div ref={previewRef} className="compendium-preview">
      {editing ? <Statblock key={editing.record.id} value={editing.record.content} onChange={change}
          art={kind.art ? editing.record.art : undefined} onArtChange={kind.art ? changeArt : undefined}
          onPopout={kind.popout ? () => popOut(editing.record.id, editing.record.content, editing.record.art) : undefined} />
        : preview ? <>
          <div className="record-actions">
            {selected?.custom ? <>{action('Edit', () => void startEdit(), 'Edit this campaign copy (e)')}{action('Edit in Workshop', () => void openInWorkshop(selected.id), 'Revise it with your agent in the Workshop; saving there updates this entry')}{action('Delete', () => void remove(selected.id))}</>
              : action('Copy to campaign', () => void startEdit(), `Make an editable campaign copy (e); it is saved by your first edit`)}
          </div>
          <Statblock value={preview} art={kind.art && selected ? artFor(selected) : undefined}
            onArtChange={kind.art && selected ? art => void setArt(selected, art) : undefined}
            onPopout={kind.popout && selected ? () => popOut(selected.id, preview, kind.art ? artFor(selected) : undefined) : undefined} />
        </>
        : <div className="record-empty">Click a {kind.singular} to preview</div>}
    </div>

    {poppedOut.map((p, i) => <FloatingPanel key={p.id} title={`📑 ${p.content.name}`} initialX={100 + i * 30} initialY={100 + i * 30} width={420} maxHeight="80vh"
      onClose={() => setPoppedOut(prev => prev.filter(x => x.id !== p.id))}>
      <Statblock value={p.content} art={p.art} />
    </FloatingPanel>)}

    {menu && <div className="record-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={e => e.stopPropagation()}>
      <button onClick={() => void remove(menu.id)}>Delete</button>
    </div>}
  </div>
}
