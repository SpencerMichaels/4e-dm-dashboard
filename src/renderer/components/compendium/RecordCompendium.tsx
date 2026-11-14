// One compendium page for every kind (creatures, items, traps, diseases, templates, themes): published
// entries, the open campaign's entries, and the Library's (custom entries shared by every campaign). Every
// custom row says where it lives. Published entries are read-only and copy into a new entry on edit; custom
// entries edit through their working copy (a draft the AI also sees; main writes each change straight into
// the entry), so the DM's and the agent's edits merge as they land; new entries are added by their first
// edit. Entries copy between homes (Copy to campaign, Copy to library). Kinds can opt into artwork (a record's
// `art`; compendium annotations for published entries) and pop-out stat blocks. Without an open campaign the
// page browses published entries and works on the Library.

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { CampaignRecord, RecordArt } from '@common/types'
import { contentKindFor, LIBRARY, RECORD_STORAGE, type RecordType } from '@common/campaign-records'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { useLibraryStore } from '@renderer/stores/library-store'
import { useHotkeys } from '@renderer/hooks/use-hotkeys'
import { useUiStore } from '@renderer/stores/ui-store'
import { useAuthoringStore } from '@renderer/stores/authoring-store'
import type { Draft } from '@common/authoring/types'
import { EntryDiscussion, EntryEditor } from '../authoring/EntryEditor'
import { DraftAnnotations } from '../authoring/DraftAnnotations'
import { unsavedDraft } from '@common/authoring/unsaved'
import type { Content } from '@common/authoring/types'
import '../authoring/authoring.css'
import { VirtualizedList } from '../shared/VirtualizedList'
import { Icon } from '../shared/Icon'
import { FloatingPanel } from '../shared/FloatingPanel'
import { RecordHomeContext } from '../shared/record-home'
import { parseLevelFilter } from './use-compendium'
import '../creature/statblock.css'

/** A list row; `cells` line up with the kind's columns. */
export interface RecordRow {
  id: string; name: string; level: number; cells: string[]
  /** A custom entry: the open campaign's, or the Library's (`library`). */
  custom?: boolean
  library?: boolean
  /** Filterable values that aren't shown as columns (a creature's rank, size, origin). */
  facets?: string[]
}

/** What a kind's stat block gets: the content, and the comment, artwork, and pop-out hooks the kind opts into (editing is EntryEditor's). */
export interface StatblockProps<T> {
  value: T
  /** The entry's working copy, when its comment markers show: its node ids anchor them to the stat block's lines. */
  draft?: Draft
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
const sourceOf = (r: RecordRow) => r.library ? 'library' : r.custom ? 'campaign' : 'published'
/** Campaign entries first, then the Library's, then published ones. */
const sourceOrder = (r: RecordRow) => r.library ? 1 : r.custom ? 0 : 2
/**
 * What the editor has open: the selected entry's working copy, or a new entry's unsaved one, which its first
 * edit creates in `home` (a campaign id or LIBRARY), as a copy of `from` when given.
 */
type Edit = { copy: true } | { fresh: Draft; key: string; home: string; from?: string }

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
  const [selects, setSelects] = useState<string[]>(kind.filters.map(() => ''))
  const [sort, setSort] = useState<{ key: number; asc: boolean }>({ key: kind.levelless ? -2 : -1, asc: true })
  const [selected, setSelected] = useState<RecordRow | null>(null)
  const [preview, setPreview] = useState<T | null>(null)
  const [menu, setMenu] = useState<{ row?: RecordRow; x: number; y: number } | null>(null)
  const [poppedOut, setPoppedOut] = useState<{ id: string; content: T; art?: RecordArt }[]>([])
  const annotations = useCampaignStore(s => s.annotations)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => { void kind.index().then(setPublished) }, [kind])

  // ── Rows: campaign entries, then the Library's, then published ones; filtered and sorted ──
  const campaignId = useCampaignStore(s => s.campaignId)
  const campaignName = useCampaignStore(s => s.campaign?.name) ?? 'Campaign'
  const contentKind = contentKindFor(kind.type)
  const draftList = useAuthoringStore(s => s.list)
  const custom = useMemo((): RecordRow[] => [
    ...records.map(r => ({ ...kind.row(r.content), id: r.id, custom: true })),
    ...libraryRecords.map(r => ({ ...kind.row(r.content), id: r.id, custom: true, library: true })),
  ], [records, libraryRecords, kind])
  const filters = useDeferredValue({ search, levelStr, source, selects })
  const rows = useMemo(() => {
    const q = filters.search.toLowerCase()
    const level = parseLevelFilter(filters.levelStr)
    const all = [...custom, ...(published ?? [])].filter(r =>
      (!q || r.name.toLowerCase().includes(q)) && (!filters.levelStr || r.level <= 0 || level(r.level))
      && (!filters.source || sourceOf(r) === filters.source)
      && kind.filters.every((f, i) => !filters.selects[i] || filterValue(r, f) === filters.selects[i]))
    const dir = sort.asc ? 1 : -1
    const value = (r: RecordRow) => sort.key === -1 ? r.level : sort.key === -2 ? r.name.toLowerCase() : r.cells[sort.key] ?? ''
    return all.sort((a, b) => (sourceOrder(a) - sourceOrder(b)) || (value(a) < value(b) ? -dir : value(a) > value(b) ? dir : 0) || a.name.localeCompare(b.name))
  }, [custom, published, filters, sort, kind])
  const options = useMemo(() => kind.filters.map(f => [...new Set([...custom, ...(published ?? [])].map(r => filterValue(r, f)).filter(Boolean))].sort()), [custom, published, kind])

  // ── Where a custom row lives, and its record ──
  const homeOf = (row: RecordRow) => row.library ? LIBRARY : campaignId
  const recordOf = (row: RecordRow) => (row.library ? libraryRecords : records).find(r => r.id === row.id)
  /** A copy's source key: a published entry's search key, or a custom entry's (main reads it from there). */
  const keyOf = (row: RecordRow) => !row.custom ? `published/${contentKind}/${row.id}` : row.library ? `library/${contentKind}/${row.id}` : `campaign/${campaignId}/${contentKind}/${row.id}`

  // ── Artwork: a custom record's own, or a published entry's compendium annotation ──
  const artFor = (row: RecordRow) => row.custom ? recordOf(row)?.art : annotations[row.id]
  const setArt = async (row: RecordRow, art: RecordArt) => {
    if (!row.custom) return void await window.api.annotation.save(row.id, { ...(annotations[row.id] ?? {}), ...art })
    const record = recordOf(row)
    if (record) await window.api.entity.save(kind.type, { ...record, art: { ...record.art, ...art }, updatedAt: new Date().toISOString() } as unknown as Record<string, unknown>, row.library ? LIBRARY : undefined)
  }
  const popOut = (id: string, content: T, art?: RecordArt) => setPoppedOut(p => p.some(x => x.id === id) ? p : [...p, { id, content, art }])

  // ── A custom entry's working copy: the draft both the DM and an AI agent edit. Main writes each version
  // straight into the entry, so the preview and the editor show the agent's changes as they land, and comment
  // markers anchor to the working copy's lines. New entries (+ new, Copy to ...) are working copies their
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
    const home = homeOf(row)
    if (!home) return null
    const d: Draft = await window.api.authoring.call('working_copy', { campaignId: home, kind: contentKind, entityId: row.id })
    useAuthoringStore.getState().receive(d)
    if (!draftList.some(x => x.id === d.id)) void useAuthoringStore.getState().refreshList()
    return d.id
  }
  const entryRow = (d: Draft): RecordRow => {
    const home = d.destinations[0]
    const library = home?.type === 'library'
    return custom.find(r => r.id === home?.entityId && !!r.library === library)
      ?? { id: home?.entityId ?? d.id, name: d.content.name, level: (d.content as { level?: number }).level ?? 0, cells: [], custom: true, library }
  }
  /** Edit: a custom entry edits its working copy; a published one becomes a new entry on the first edit (in the open campaign, or the Library). */
  const startEdit = async (row: RecordRow | null = selected) => {
    if (!row || !leaveEdit()) return
    if (row.custom) {
      const id = copyId && row.id === selected?.id ? copyId : await loadCopy(row)
      if (id) { setCopyId(id); setEdit({ copy: true }) }
      return
    }
    await copyTo(row, campaignId ?? LIBRARY)
  }
  /** Copy to campaign / Copy to library: a new entry in `home`, made by the first edit; main gives it the source and art. */
  const copyTo = async (row: RecordRow, home: string) => {
    if (!leaveEdit()) return
    const content = row.custom ? recordOf(row)?.content : await kind.get(row.id)
    if (!content) return
    setCopyId(null)
    setEdit({ fresh: unsavedDraft(contentKind, content as unknown as Content), key: `new-${Date.now()}`, home, from: keyOf(row) })
  }
  const startNew = async (home: string) => {
    setMenu(null)
    if (!leaveEdit()) return
    setSelected(null); setPreview(null); setCopyId(null)
    setEdit({ fresh: unsavedDraft(contentKind), key: `new-${Date.now()}`, home })
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
    setPreview(row.custom ? recordOf(row)?.content ?? null : await kind.get(row.id))
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
  const remove = async (row: RecordRow) => {
    setMenu(null)
    // A Library entry may be used by any campaign: those uses show it as missing afterwards.
    if (row.library && !window.confirm(`Delete “${row.name}” from the Library? Campaigns that use it will show it as missing.`)) return
    if (selected?.id === row.id) { setEdit(null); setSelected(null); setPreview(null); setCopyId(null) }
    await window.api.entity.delete(kind.type, row.id, row.library ? LIBRARY : undefined)
  }
  // The agent's current_entry: what the DM has open (only while the agent connection is on).
  useEffect(() => {
    if (!agent) return
    void window.api.authoring.call('focus', selected || edit ? {
      kind: contentKind, editing: !!edit,
      ...(selected?.custom ? { campaignId: homeOf(selected), entityId: selected.id } : selected ? { publishedId: selected.id } : {}),
    } : {})
  }, [selected?.id, selected?.library, !!edit, campaignId, contentKind, agent])
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
  // What the preview shows: a custom entry live from its record (agent edits included), a published one as loaded.
  const shown = (selected?.custom && recordOf(selected)?.content) || preview
  const previewBlock = selected && shown && <Statblock value={shown} draft={agent ? copy : undefined} art={kind.art ? artFor(selected) : undefined}
    onArtChange={kind.art ? art => void setArt(selected, art) : undefined}
    onPopout={kind.popout ? () => popOut(selected.id, shown, kind.art ? artFor(selected) : undefined) : undefined} />
  const action = (label: string, onClick: () => void, title?: string): ReactNode => <button className="btn btn-sm record-action" title={title} onClick={onClick}>{label}</button>
  // Where the shown entry lives (its art is stored there too): a new entry's home, or the selected entry's.
  const shownHome = edit && 'fresh' in edit ? edit.home : selected?.library ? LIBRARY : undefined
  const freshHome = edit && 'fresh' in edit ? (edit.home === LIBRARY ? 'the Library' : campaignName) : ''
  const newHome = campaignId ?? LIBRARY

  return <div className="stat-block-4e compendium-split record-compendium">
    <div className="compendium-list">
      <div className="sb-header" style={{ flexShrink: 0 }}>
        <input className="ghost sb-name" value={search} placeholder="Search..." aria-label={`Search ${kind.plural}`} onChange={e => setSearch(e.target.value)} style={{ color: 'inherit', flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
          {!kind.levelless && <>Level <input className="ghost" value={levelStr} placeholder="1–30" aria-label="Level filter" onChange={e => setLevelStr(e.target.value.replace(/-/g, '–'))} style={{ width: 40, color: 'inherit', textAlign: 'center' }} /></>}
          <span className="record-new">
            <button className="btn btn-sm" onClick={() => void startNew(newHome)} style={{ color: 'inherit', font: 'inherit' }}
              title={campaignId ? `Create a new ${kind.singular} in ${campaignName}` : `Create a new ${kind.singular} in the Library, shared by every campaign`}>+ New in {campaignId ? campaignName : 'Library'}</button>
            {campaignId && <button className="btn btn-sm" aria-label="Create it elsewhere" title="Create it in the Library instead"
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom }) }} onMouseDown={e => e.stopPropagation()}><Icon name="chevron-down" /></button>}
          </span>
        </span>
      </div>
      <div className="sb-subheader" style={{ flexShrink: 0, gap: 8, justifyContent: 'flex-start' }}>
        <select className="ghost" value={source} aria-label="Source" onChange={e => setSource(e.target.value)} style={{ color: 'inherit' }}>
          <option value="">all</option>{campaignId && <option value="campaign">{campaignName}</option>}<option value="library">Library</option><option value="published">Published</option>
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
          const active = r.id === selected?.id && !!r.library === !!selected?.library
          return <div className={`record-row${active ? ' active' : ''}`} style={{ gridTemplateColumns: cols }}
            onClick={() => void select(r)} onDoubleClick={() => void startEdit(r)}
            onContextMenu={e => { if (r.custom) { e.preventDefault(); setMenu({ row: r, x: e.clientX, y: e.clientY }) } }}>
            <span className="record-name">{r.name}{r.custom && <span className={`record-custom${r.library ? ' library' : ''}`}
              title={r.library ? 'In the Library: shared by every campaign' : `In ${campaignName}`}>{r.library ? 'Library' : 'Campaign'}</span>}</span>
            {r.cells.map((c, i) => <span key={i} className="record-cell">{c}</span>)}
            {!kind.levelless && <span>{r.level > 0 ? r.level : ''}</span>}
          </div>
        }} />}
      <div className="record-count">{published === null ? ' ' : `${rows.length.toLocaleString()} of ${(published.length + custom.length).toLocaleString()}`}</div>
      {edit && <div className="record-editbar">
        <button onClick={exit} title="Back to the preview"><Icon name="arrow-left" style={{ verticalAlign: '-0.125em' }} /> Back</button>
        <span>{'fresh' in edit ? `New entry in ${freshHome}: your first change adds it` : copy?.updatedAt ? `Saved at ${new Date(copy.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Editing'}</span>
      </div>}
    </div>

    <RecordHomeContext.Provider value={shownHome}>
      <div ref={previewRef} className="compendium-preview">
        {edit ? <div className="record-entry-editor">
          {editDraft ? <EntryEditor key={'fresh' in edit ? edit.key : editorKeys.current[editDraft.id] ?? editDraft.id} draft={editDraft}
            create={'fresh' in edit ? { destinations: [edit.home === LIBRARY ? { type: 'library', id: LIBRARY } : { type: 'campaign', id: edit.home }], from: edit.from } : undefined} onCreated={created}
            art={kind.art && !('fresh' in edit) && selected?.custom ? artFor(selected) : undefined} onArtChange={kind.art && !('fresh' in edit) && selected?.custom ? art => void setArt(selected, art) : undefined} />
            : <div className="record-empty">Loading…</div>}
        </div>
          : selected && shown ? <>
            <div className="record-actions">
              {selected.library && <span className="record-home" title="Shared by every campaign: changes show wherever it is used">In the Library</span>}
              {selected.custom
                ? action('Edit', () => void startEdit(selected), selected.library ? 'Edit this Library entry (e); it changes in every campaign that uses it' : 'Edit this campaign entry (e)')
                : action(campaignId ? 'Copy to campaign' : 'Copy to library', () => void startEdit(selected), `Make an editable copy in ${campaignId ? campaignName : 'the Library'} (e); your first edit adds it`)}
              {selected.library && campaignId && action('Copy to campaign', () => void copyTo(selected, campaignId), `Make a ${campaignName} version of this Library entry; your first edit adds it`)}
              {(selected.custom ? !selected.library : !!campaignId) && action('Copy to library', () => void copyTo(selected, LIBRARY), 'Make an editable copy in the Library, shared by every campaign; your first edit adds it')}
              {selected.custom && action('Delete', () => void remove(selected))}
            </div>
            {/* One stat block for every entry; with the agent connection on, the working copy adds comment markers. */}
            {agent && copy ? <DraftAnnotations draft={copy} enabled>{previewBlock}</DraftAnnotations> : previewBlock}
            {agent && copy && <EntryDiscussion draft={copy} />}
          </>
          : <div className="record-empty">Click a {kind.singular} to preview</div>}
      </div>
    </RecordHomeContext.Provider>

    {poppedOut.map((p, i) => <FloatingPanel key={p.id} title={<><Icon name="file-text" style={{ verticalAlign: '-0.125em' }} /> {p.content.name}</>} popoutKey={`compendium-statblock:${p.id}`} popoutPlace="statblock" windowTitle={p.content.name} initialX={100 + i * 30} initialY={100 + i * 30} width={420} maxHeight="80vh"
      onClose={() => setPoppedOut(prev => prev.filter(x => x.id !== p.id))}>
      <Statblock value={p.content} art={p.art} />
    </FloatingPanel>)}

    {menu && <div className="record-menu" role="menu" style={{ left: menu.x, top: menu.y }} onMouseDown={e => e.stopPropagation()}>
      {menu.row
        ? <button role="menuitem" onClick={() => void remove(menu.row!)}>Delete</button>
        : <button role="menuitem" className="neutral" onClick={() => void startNew(LIBRARY)}>New {kind.singular} in the Library</button>}
    </div>}
  </div>
}
