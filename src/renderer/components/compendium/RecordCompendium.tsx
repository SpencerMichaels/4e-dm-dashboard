// One compendium page for every kind (creatures, items, traps, diseases, templates, themes):
// published entries are read-only and copy into a new campaign entry on edit; campaign ("Custom")
// entries edit through their working copy (a draft the AI also sees; main writes each change straight into
// the entry), so the DM's and the agent's edits merge as they land; new entries are added by their first
// edit. Edit with AI is the same editor plus a floating panel for status, notes, discussion, and history.
// Kinds can opt into artwork (a record's `art`; compendium annotations for published entries) and
// pop-out stat blocks. Without an open campaign the page still browses published entries.

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { CampaignRecord, RecordArt } from '@common/types'
import { contentKindFor, RECORD_STORAGE, type RecordType } from '@common/campaign-records'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { useHotkeys } from '@renderer/hooks/use-hotkeys'
import { useUiStore } from '@renderer/stores/ui-store'
import { useAuthoringStore, type DraftRow } from '@renderer/stores/authoring-store'
import type { Draft } from '@common/authoring/types'
import { EntryEditor, EntryPreview } from '../authoring/EntryEditor'
import { unsavedDraft } from '@common/authoring/unsaved'
import type { Content } from '@common/authoring/types'
import '../authoring/authoring.css'
import { VirtualizedList } from '../shared/VirtualizedList'
import { Icon } from '../shared/Icon'
import { FloatingPanel } from '../shared/FloatingPanel'
import { parseLevelFilter } from './use-compendium'
import '../creature/statblock.css'

/** A list row; `cells` line up with the kind's columns. */
export interface RecordRow {
  id: string; name: string; level: number; cells: string[]; custom?: boolean
  /** A working copy whose entry could not be created yet (an agent's invalid new entry; row id "ai:<draft id>"). */
  ai?: DraftRow
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
/** What the editor has open: the selected entry's working copy, or a new entry's unsaved one. */
type Edit = { copy: true } | { fresh: Draft; key: string; entry?: Record<string, unknown> }

export function RecordCompendium<T extends { id: string; name: string }>({ kind, initialId, draftId }: {
  kind: RecordKind<T>
  /** A campaign entry to select on open (from the command palette). */
  initialId?: string
  /** A Workshop draft to open (an agent's open_review, the command palette). */
  draftId?: string
}) {
  const records = useCampaignStore(s => (s as unknown as Record<string, CampaignRecord<T>[]>)[RECORD_STORAGE[kind.type].storeKey]) ?? []
  const [published, setPublished] = useState<RecordRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [levelStr, setLevelStr] = useState('')
  const [source, setSource] = useState('')
  const [selects, setSelects] = useState<string[]>(kind.filters.map(() => ''))
  const [sort, setSort] = useState<{ key: number; asc: boolean }>({ key: kind.levelless ? -2 : -1, asc: true })
  const [selected, setSelected] = useState<RecordRow | null>(null)
  const [preview, setPreview] = useState<T | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [poppedOut, setPoppedOut] = useState<{ id: string; content: T; art?: RecordArt }[]>([])
  const annotations = useCampaignStore(s => s.annotations)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => { void kind.index().then(setPublished) }, [kind])

  // ── Rows: Custom entries first, then published, filtered and sorted ──
  // AI sessions write straight into their entries; one whose entry could not be created yet (an agent's
  // invalid new entry) is a row of its own, marked AI.
  const campaignId = useCampaignStore(s => s.campaignId)
  const contentKind = contentKindFor(kind.type)
  const draftList = useAuthoringStore(s => s.list)
  const sessions = useMemo(() => draftList.filter(d => d.kind === contentKind && d.destinations?.some(x => x.id === campaignId)), [draftList, contentKind, campaignId])
  const custom = useMemo((): RecordRow[] => [
    ...sessions.filter(s => !s.destinations?.some(x => x.entityId))
      .map(s => ({ id: `ai:${s.id}`, name: s.name, level: s.level ?? 0, cells: kind.columns.map(() => ''), custom: true, ai: s })),
    ...records.map(r => ({ ...kind.row(r.content), id: r.id, custom: true })),
  ], [records, sessions, kind])
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

  // ── Artwork: a Custom record's own, or a published entry's compendium annotation ──
  const artFor = (row: RecordRow) => row.custom ? records.find(r => r.id === row.id)?.art : annotations[row.id]
  const setArt = async (row: RecordRow, art: RecordArt) => {
    if (!row.custom) return void await window.api.annotation.save(row.id, { ...(annotations[row.id] ?? {}), ...art })
    const record = records.find(r => r.id === row.id)
    if (record) await window.api.entity.save(kind.type, { ...record, art: { ...record.art, ...art }, updatedAt: new Date().toISOString() } as unknown as Record<string, unknown>)
  }
  const popOut = (id: string, content: T, art?: RecordArt) => setPoppedOut(p => p.some(x => x.id === id) ? p : [...p, { id, content, art }])

  // ── A campaign entry's working copy: the draft both the DM and an AI agent edit. Main writes each version
  // straight into the entry, so the preview and the editor show the agent's changes as they land, and comment
  // markers anchor to the working copy's lines. New entries (+ new, Copy to campaign) are working copies their
  // first edit creates. ──
  const agent = useUiStore(s => s.agentConnection)
  const [copyId, setCopyId] = useState<string | null>(null)
  const [edit, setEdit] = useState<Edit | null>(null)
  const openDrafts = useAuthoringStore(s => s.drafts)
  const copy = copyId ? openDrafts[copyId] : undefined
  const editDraft = edit ? ('fresh' in edit ? edit.fresh : copy) : undefined
  // A new entry's editor keeps its React key once created, so the DM keeps typing.
  const editorKeys = useRef<Record<string, string>>({})
  /** Unapplied edits would be lost by leaving the editor: ask first. */
  const leaveEdit = () => !edit || !useAuthoringStore.getState().pendingFields.length || window.confirm('Discard unapplied edits?')
  const loadCopy = async (row: RecordRow): Promise<string | null> => {
    if (!campaignId) return null
    const d: Draft = row.ai ? openDrafts[row.ai.id] ?? await window.api.authoring.call('get_draft', { id: row.ai.id })
      : await window.api.authoring.call('working_copy', { campaignId, kind: contentKind, entityId: row.id })
    useAuthoringStore.getState().receive(d)
    if (!row.ai && !draftList.some(x => x.id === d.id)) void useAuthoringStore.getState().refreshList()
    return d.id
  }
  const entryRow = (d: Draft): RecordRow => {
    const entityId = d.destinations.find(x => x.id === campaignId)?.entityId
    return custom.find(r => r.id === entityId) ?? { id: entityId ?? `ai:${d.id}`, name: d.content.name, level: (d.content as { level?: number }).level ?? 0, cells: [], custom: true }
  }
  /** Edit: a campaign entry edits its working copy; a published one becomes a new entry on the first edit. */
  const startEdit = async (row: RecordRow | null = selected) => {
    if (!row || !campaignId || !leaveEdit()) return
    if (row.custom) {
      const id = copyId && row.id === selected?.id ? copyId : await loadCopy(row)
      if (id) { setCopyId(id); setEdit({ copy: true }) }
      return
    }
    const art = kind.art ? annotations[row.id] : undefined
    setEdit({ fresh: unsavedDraft(contentKind, await kind.get(row.id) as unknown as Content), key: `new-${Date.now()}`,
      entry: { basedOn: `published/${kind.type}/${row.id}`, ...(art && Object.keys(art).length ? { art: { ...art } } : {}) } })
  }
  const startNew = async () => {
    if (!campaignId || !leaveEdit()) return
    setSelected(null); setPreview(null); setCopyId(null)
    setEdit({ fresh: unsavedDraft(contentKind), key: `new-${Date.now()}` })
  }
  const created = (d: Draft) => {
    if (edit && 'fresh' in edit) editorKeys.current[d.id] = edit.key
    useAuthoringStore.getState().receive(d)
    void useAuthoringStore.getState().refreshList()
    setSelected(entryRow(d)); setCopyId(d.id); setEdit({ copy: true })
  }
  const exit = () => { if (leaveEdit()) setEdit(null) }

  // ── Selecting and deleting ──
  const select = async (row: RecordRow) => {
    if (!leaveEdit()) return
    setEdit(null); setSelected(row); setCopyId(null)
    setPreview(row.custom ? records.find(r => r.id === row.id)?.content ?? null : await kind.get(row.id))
    previewRef.current?.scrollTo(0, 0)
    // With the agent connection on, the preview shows the working copy (comment markers, the agent's edits live).
    if (row.custom && agent) setCopyId(await loadCopy(row))
  }
  // A working copy to show (an agent's open_review, the command palette).
  useEffect(() => {
    if (!draftId) return
    void (async () => {
      const d: Draft = openDrafts[draftId] ?? await window.api.authoring.call('get_draft', { id: draftId })
      useAuthoringStore.getState().receive(d)
      setEdit(null); setSelected(entryRow(d)); setPreview(null); setCopyId(d.id)
    })()
  }, [draftId])
  // Open on the requested campaign entry once it has loaded.
  const opened = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!initialId || opened.current === initialId) return
    const row = custom.find(r => r.id === initialId)
    if (row) { opened.current = initialId; void select(row) }
  }, [initialId, custom])
  const remove = async (id: string) => {
    setMenu(null)
    if (selected?.id === id) { setEdit(null); setSelected(null); setPreview(null); setCopyId(null) }
    // An agent's entry that never reached the campaign is only its working copy.
    if (id.startsWith('ai:')) {
      await window.api.authoring.call('archive', { id: id.slice(3) })
      await useAuthoringStore.getState().refreshList()
    } else await window.api.entity.delete(kind.type, id)
  }
  // The agent's current_entry: what the DM has open (only while the agent connection is on).
  useEffect(() => {
    if (!agent) return
    void window.api.authoring.call('focus', selected || edit ? {
      kind: contentKind, editing: !!edit,
      ...(selected?.custom ? { campaignId, entityId: selected.id.startsWith('ai:') ? undefined : selected.id } : selected ? { publishedId: selected.id } : {}),
    } : {})
  }, [selected?.id, !!edit, campaignId, contentKind, agent])
  useHotkeys([{ key: 'e', handler: () => { if (!edit) void startEdit() } }])
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const cols = `1fr ${kind.columns.map(c => c.width).join(' ')}${kind.levelless ? '' : ' 34px'}`
  const header = (label: string, key: number) => <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
    onClick={() => setSort(s => ({ key, asc: s.key === key ? !s.asc : true }))}>{label}{sort.key === key && <>{' '}<Icon name={sort.asc ? 'chevron-up' : 'chevron-down'} label={sort.asc ? 'ascending' : 'descending'} style={{ verticalAlign: '-0.125em' }} /></>}</span>
  const Statblock = kind.Statblock
  const action = (label: string, onClick: () => void, title?: string): ReactNode => <button className="btn btn-sm record-action" title={title} onClick={onClick}>{label}</button>

  return <div className="stat-block-4e compendium-split record-compendium">
    <div className="compendium-list">
      <div className="sb-header" style={{ flexShrink: 0 }}>
        <input className="ghost sb-name" value={search} placeholder="Search..." aria-label={`Search ${kind.plural}`} onChange={e => setSearch(e.target.value)} style={{ color: 'inherit', flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
          {!kind.levelless && <>Level <input className="ghost" value={levelStr} placeholder="1–30" aria-label="Level filter" onChange={e => setLevelStr(e.target.value.replace(/-/g, '–'))} style={{ width: 40, color: 'inherit', textAlign: 'center' }} /></>}
          <button className="btn btn-sm" disabled={!campaignId} onClick={() => void startNew()} title={campaignId ? `Create a new campaign ${kind.singular}` : 'Open a campaign to add campaign entries'} style={{ color: 'inherit', font: 'inherit' }}>+ new</button>
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
          const active = r.id === selected?.id
          return <div className={`record-row${active ? ' active' : ''}`} style={{ gridTemplateColumns: cols }}
            onClick={() => void select(r)} onDoubleClick={() => void startEdit(r)}
            onContextMenu={e => { if (r.custom) { e.preventDefault(); setMenu({ id: r.id, x: e.clientX, y: e.clientY }) } }}>
            <span className="record-name">{r.name}{r.custom && <span className="record-custom">Custom</span>}</span>
            {r.cells.map((c, i) => <span key={i} className="record-cell">{c}</span>)}
            {!kind.levelless && <span>{r.level > 0 ? r.level : ''}</span>}
          </div>
        }} />}
      <div className="record-count">{published === null ? ' ' : `${rows.length.toLocaleString()} of ${(published.length + custom.length).toLocaleString()}`}</div>
      {edit && <div className="record-editbar">
        <button onClick={exit} title="Back to the preview"><Icon name="arrow-left" style={{ verticalAlign: '-0.125em' }} /> Back</button>
        <span>{'fresh' in edit ? 'New entry: your first change adds it' : copy?.updatedAt ? `Saved at ${new Date(copy.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Editing'}</span>
      </div>}
    </div>

    <div ref={previewRef} className="compendium-preview">
      {edit ? <div className="record-entry-editor">
        {editDraft ? <EntryEditor key={'fresh' in edit ? edit.key : editorKeys.current[editDraft.id] ?? editDraft.id} draft={editDraft}
          create={'fresh' in edit && campaignId ? { destinations: [{ type: 'campaign', id: campaignId }], entry: edit.entry } : undefined} onCreated={created}
          art={kind.art && selected?.custom ? artFor(selected) : undefined} onArtChange={kind.art && selected?.custom ? art => void setArt(selected, art) : undefined} />
          : <div className="record-empty">Loading…</div>}
      </div>
        : selected && (copy || preview) ? <>
          <div className="record-actions">
            {campaignId && action(selected.custom ? 'Edit' : 'Copy to campaign', () => void startEdit(selected),
              selected.custom ? 'Edit this campaign entry (e)' : 'Make an editable campaign copy (e); your first edit adds it')}
            {selected.custom && action('Delete', () => void remove(selected.id))}
          </div>
          {copy ? <EntryPreview draft={copy} art={kind.art ? artFor(selected) : undefined} onArtChange={kind.art ? art => void setArt(selected, art) : undefined}
              onPopout={kind.popout ? () => popOut(selected.id, copy.content as unknown as T, kind.art ? artFor(selected) : undefined) : undefined} />
            : <Statblock value={preview!} art={kind.art ? artFor(selected) : undefined}
              onArtChange={kind.art ? art => void setArt(selected, art) : undefined}
              onPopout={kind.popout ? () => popOut(selected.id, preview!, kind.art ? artFor(selected) : undefined) : undefined} />}
        </>
        : <div className="record-empty">Click a {kind.singular} to preview</div>}
    </div>

    {poppedOut.map((p, i) => <FloatingPanel key={p.id} title={<><Icon name="file-text" style={{ verticalAlign: '-0.125em' }} /> {p.content.name}</>} popoutKey={`compendium-statblock:${p.id}`} popoutPlace="statblock" windowTitle={p.content.name} initialX={100 + i * 30} initialY={100 + i * 30} width={420} maxHeight="80vh"
      onClose={() => setPoppedOut(prev => prev.filter(x => x.id !== p.id))}>
      <Statblock value={p.content} art={p.art} />
    </FloatingPanel>)}

    {menu && <div className="record-menu" role="menu" style={{ left: menu.x, top: menu.y }} onMouseDown={e => e.stopPropagation()}>
      <button role="menuitem" onClick={() => void remove(menu.id)}>Delete</button>
    </div>}
  </div>
}
