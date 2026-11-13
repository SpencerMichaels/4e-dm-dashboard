// One compendium page for kit-native kinds (traps, diseases, templates, themes), with the Creatures
// page's edit semantics: published entries are read-only and clone into a campaign copy on edit;
// campaign ("Custom") entries edit in place and autosave; new entries are saved by their first edit.

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { CampaignRecord } from '@common/types'
import { newRecord, RECORD_STORAGE, type RecordType } from '@common/campaign-records'
import { reanchorReplaced } from '@common/authoring/patch'
import { generateId } from '@common/utils/id'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { useHotkeys } from '@renderer/hooks/use-hotkeys'
import { useUiStore } from '@renderer/stores/ui-store'
import { useAuthoringStore } from '@renderer/stores/authoring-store'
import { VirtualizedList } from '../shared/VirtualizedList'
import { parseLevelFilter } from './use-compendium'
import '../creature/statblock.css'

/** A list row; `cells` line up with the kind's columns. */
export interface RecordRow { id: string; name: string; level: number; cells: string[]; custom?: boolean }

export interface RecordKind<T extends { id: string; name: string }> {
  type: RecordType
  singular: string
  plural: string
  columns: { label: string; width: string }[]
  /** Select filters over a column's values. */
  filters: { label: string; column: number }[]
  index: () => Promise<RecordRow[]>
  row: (content: T) => Omit<RecordRow, 'id' | 'custom'>
  get: (id: string) => Promise<T>
  blank: () => T
  Statblock: ComponentType<{ value: T; onChange?: (next: T) => void }>
  /** Templates and themes have no level: no Level column or filter. */
  levelless?: true
}

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
      && kind.filters.every((f, i) => !filters.selects[i] || r.cells[f.column] === filters.selects[i]))
    const dir = sort.asc ? 1 : -1
    const value = (r: RecordRow) => sort.key === -1 ? r.level : sort.key === -2 ? r.name.toLowerCase() : r.cells[sort.key] ?? ''
    return all.sort((a, b) => (Number(!!b.custom) - Number(!!a.custom)) || (value(a) < value(b) ? -dir : value(a) > value(b) ? dir : 0) || a.name.localeCompare(b.name))
  }, [custom, published, filters, sort, kind])
  const options = useMemo(() => kind.filters.map(f => [...new Set([...custom, ...(published ?? [])].map(r => r.cells[f.column]).filter(Boolean))].sort()), [custom, published, kind])

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
  const change = (content: T) => {
    const current = editingRef.current
    if (!current) return
    // Prose edits keep their rules metadata: clause spans follow the quoted words.
    const next = structuredClone(content)
    reanchorReplaced(current.record.content, next)
    const record = { ...current.record, content: { ...next, id: current.record.id }, updatedAt: new Date().toISOString() }
    pending.current = record
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    if (current.draft) setSelected({ ...kind.row(record.content), id: record.id, custom: true })
    editingRef.current = { record, draft: false }
    setEditing(editingRef.current)
  }

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
      // A published entry is copied; the copy is saved by its first edit.
      const content = await kind.get(row.id)
      setEditing({ record: newRecord(generateId(), content, now, `published/${kind.type}/${row.id}`) as CampaignRecord<T>, draft: true })
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
    const { hash } = await window.api.authoring.call('destination_entity', { destination, kind: kind.type, entityId: id })
    const draft = await window.api.authoring.call('create_draft', { kind: kind.type, content: record.content, destinations: [{ ...destination, expectedHash: hash }], intent: `Revise ${record.content.name}, preserving its existing mechanics unless changed explicitly.` })
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
      {editing ? <Statblock key={editing.record.id} value={editing.record.content} onChange={change} />
        : preview ? <>
          <div className="record-actions">
            {selected?.custom ? <>{action('Edit', () => void startEdit(), 'Edit this campaign copy (e)')}{action('Edit in Workshop', () => void openInWorkshop(selected.id), 'Revise it with your agent in the Workshop; saving there updates this entry')}{action('Delete', () => void remove(selected.id))}</>
              : action('Copy to campaign', () => void startEdit(), `Make an editable campaign copy (e); it is saved by your first edit`)}
          </div>
          <Statblock value={preview} />
        </>
        : <div className="record-empty">Click a {kind.singular} to preview</div>}
    </div>

    {menu && <div className="record-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={e => e.stopPropagation()}>
      <button onClick={() => void remove(menu.id)}>Delete</button>
    </div>}
  </div>
}
