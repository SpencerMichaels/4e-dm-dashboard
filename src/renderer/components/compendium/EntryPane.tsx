// One entry shown on a compendium page: its stat block, or its editor, with its controls in the title bar
// after the name (shared/record-header). The page's preview is one pane; each entry popped out into its own
// OS window is another, with the same controls, so an entry can be viewed and edited in a window of its own.
// A pane follows its entry: shared into the Library or taken back, it shows the new home; deleted, it empties
// (a popped-out window closes).

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { CampaignRecord, RecordArt } from '@common/types'
import { contentKindFor, LIBRARY, RECORD_STORAGE, type RecordType } from '@common/campaign-records'
import type { Content, Draft } from '@common/authoring/types'
import { unsavedDraft } from '@common/authoring/unsaved'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { useLibraryStore } from '@renderer/stores/library-store'
import { useUiStore } from '@renderer/stores/ui-store'
import { useAuthoringStore } from '@renderer/stores/authoring-store'
import { EntryEditor } from '../authoring/EntryEditor'
import { DraftAnnotations } from '../authoring/DraftAnnotations'
import { Icon } from '../shared/Icon'
import { RecordHomeContext } from '../shared/record-home'
import { RecordHeaderContext } from '../shared/record-header'
import { usePopoutWindow } from '../shared/popout-window'
import type { RecordKind, RecordRow } from './RecordCompendium'

/**
 * What a pane's editor has open: the entry's working copy, or a new entry's unsaved one, which its first
 * edit creates in `home` (a campaign id or LIBRARY), as a copy of `from` when given.
 */
export type Edit = { copy: true } | { fresh: Draft; key: string; home: string; from?: string }
/** A pane's state, handed to a popped-out window so it opens as the entry was shown. */
export interface PaneState<T> { selected: RecordRow | null; preview: T | null; copyId: string | null; edit: Edit | null }

/** One entry's state and actions (the page's preview, or a popped-out window). */
export function useEntryPane<T extends { id: string; name: string }>(kind: RecordKind<T>, initial?: PaneState<T>) {
  const storeKey = RECORD_STORAGE[kind.type].storeKey
  const records = useCampaignStore(s => (s as unknown as Record<string, CampaignRecord<T>[]>)[storeKey]) ?? []
  const libraryRecords = useLibraryStore(s => (s as unknown as Record<string, CampaignRecord<T>[]>)[storeKey]) ?? []
  const annotations = useCampaignStore(s => s.annotations)
  const campaignId = useCampaignStore(s => s.campaignId)
  const campaignName = useCampaignStore(s => s.campaign?.name) ?? 'Campaign'
  const agent = useUiStore(s => s.agentConnection)
  const contentKind = contentKindFor(kind.type)
  const [selected, setSelected] = useState<RecordRow | null>(initial?.selected ?? null)
  const [preview, setPreview] = useState<T | null>(initial?.preview ?? null)
  const [copyId, setCopyId] = useState<string | null>(initial?.copyId ?? null)
  const [edit, setEdit] = useState<Edit | null>(initial?.edit ?? null)
  const openDrafts = useAuthoringStore(s => s.drafts)
  const copy = copyId ? openDrafts[copyId] : undefined
  const scrollRef = useRef<HTMLDivElement>(null)
  // A new entry's editor keeps its React key once created, so the DM keeps typing.
  const editorKeys = useRef<Record<string, string>>(initial?.edit && 'fresh' in initial.edit && initial.copyId ? { [initial.copyId]: initial.edit.key } : {})

  // ── The entry where it lives now: a custom entry follows its record into or out of the Library ──
  const inCampaign = !!selected?.custom && records.some(r => r.id === selected.id)
  const inLibrary = !!selected?.custom && libraryRecords.some(r => r.id === selected.id)
  const current: RecordRow | null = selected && (inCampaign || inLibrary) && !!selected.library !== inLibrary ? { ...selected, library: inLibrary } : selected
  // Deleted (it was there once, and no longer is): the pane empties.
  const seen = useRef<string | null>(null)
  if (inCampaign || inLibrary) seen.current = selected!.id
  const gone = !!selected?.custom && seen.current === selected.id && !inCampaign && !inLibrary

  const homeOf = (row: RecordRow) => row.library ? LIBRARY : campaignId
  const recordOf = (row: RecordRow) => records.find(r => r.id === row.id) ?? libraryRecords.find(r => r.id === row.id)
  /** A copy's source key: a published entry's search key, or a custom entry's (main reads it from there). */
  const keyOf = (row: RecordRow) => !row.custom ? `published/${contentKind}/${row.id}` : row.library ? `library/${contentKind}/${row.id}` : `campaign/${campaignId}/${contentKind}/${row.id}`
  const destination = (home: string) => home === LIBRARY ? { type: 'library', id: LIBRARY } : { type: 'campaign', id: home }

  // ── Artwork: a custom record's own, or a published entry's compendium annotation ──
  const artFor = (row: RecordRow) => row.custom ? recordOf(row)?.art : annotations[row.id]
  const setArt = async (row: RecordRow, art: RecordArt) => {
    if (!row.custom) return void await window.api.annotation.save(row.id, { ...(annotations[row.id] ?? {}), ...art })
    const record = recordOf(row)
    if (record) await window.api.entity.save(kind.type, { ...record, art: { ...record.art, ...art }, updatedAt: new Date().toISOString() } as unknown as Record<string, unknown>, row.library ? LIBRARY : undefined)
  }

  // ── The working copy: the draft both the DM and an AI agent edit. Main writes each version straight into
  // the entry, so the preview and the editor show the agent's changes as they land, and comment markers anchor
  // to the working copy's lines. New entries (New, Edit on a published entry) are working copies their first
  // edit creates; Duplicate creates its entry at once. ──
  /** Unapplied edits would be lost by leaving the editor: ask first. */
  const leaveEdit = () => !edit || !useAuthoringStore.getState().pendingFields.length || window.confirm('Discard unapplied edits?')
  const receive = (d: Draft) => {
    useAuthoringStore.getState().receive(d)
    if (!useAuthoringStore.getState().list.some(x => x.id === d.id)) void useAuthoringStore.getState().refreshList()
  }
  const loadCopy = async (row: RecordRow): Promise<string | null> => {
    const home = homeOf(row)
    if (!home) return null
    const d: Draft = await window.api.authoring.call('working_copy', { campaignId: home, kind: contentKind, entityId: row.id })
    receive(d)
    return d.id
  }
  const entryRow = (d: Draft): RecordRow => {
    const home = d.destinations[0]
    return { id: home?.entityId ?? d.id, name: d.content.name, level: (d.content as { level?: number }).level ?? 0, cells: [], custom: true, library: home?.type === 'library' }
  }
  const select = async (row: RecordRow) => {
    if (!leaveEdit()) return
    setEdit(null); setSelected(row); setCopyId(null)
    setPreview(row.custom ? recordOf(row)?.content ?? null : await kind.get(row.id))
    scrollRef.current?.scrollTo(0, 0)
    // With the agent connection on, the preview shows the working copy (comment markers, the agent's edits live).
    if (row.custom && agent) setCopyId(await loadCopy(row))
  }
  /** A working copy to show (an agent's open_review, the command palette). */
  const showDraft = async (draftId: string) => {
    const d: Draft = openDrafts[draftId] ?? await window.api.authoring.call('get_draft', { id: draftId })
    receive(d)
    setEdit(null); setSelected(entryRow(d)); setPreview(null); setCopyId(d.id)
  }
  /** Edit: a custom entry edits its working copy; a published one becomes a new entry on the first edit (in the open campaign, or the Library). */
  const startEdit = async (row: RecordRow | null = current) => {
    if (!row || !leaveEdit()) return
    if (row.custom) {
      const id = copyId && row.id === current?.id ? copyId : await loadCopy(row)
      if (id) { setSelected(row); setCopyId(id); setEdit({ copy: true }) }
      return
    }
    const content = await kind.get(row.id)
    if (!content) return
    setSelected(row); setCopyId(null)
    setEdit({ fresh: unsavedDraft(contentKind, content as unknown as Content), key: `new-${Date.now()}`, home: campaignId ?? LIBRARY, from: keyOf(row) })
  }
  const startNew = (home: string) => {
    if (!leaveEdit()) return
    setSelected(null); setPreview(null); setCopyId(null)
    setEdit({ fresh: unsavedDraft(contentKind), key: `new-${Date.now()}`, home })
  }
  const created = (d: Draft) => {
    if (edit && 'fresh' in edit) editorKeys.current[d.id] = edit.key
    receive(d)
    setSelected(entryRow(d)); setCopyId(d.id); setEdit({ copy: true })
  }
  const exit = () => { if (leaveEdit()) setEdit(null) }
  const toggleEdit = () => { if (edit) exit(); else void startEdit() }
  /** Empties the pane (its entry moved to a window of its own). */
  const clear = () => { setEdit(null); setSelected(null); setPreview(null); setCopyId(null) }

  // ── The entry menu's actions ──
  /** Duplicate: a copy of a custom entry beside it, named "(copy)", added at once (main gives it the source and art), shown here. */
  const duplicate = async (row: RecordRow) => {
    const record = recordOf(row)
    if (!record || !leaveEdit()) return
    const d: Draft = await window.api.authoring.call('create_draft', {
      kind: contentKind, content: { ...record.content, name: `${record.content.name} (copy)` }, from: keyOf(row), destinations: [destination(homeOf(row)!)],
    })
    receive(d)
    // The record arrives by broadcast; until then the preview shows the copy's content.
    setEdit(null); setSelected(entryRow(d)); setPreview(d.content as unknown as T); setCopyId(d.id)
    scrollRef.current?.scrollTo(0, 0)
  }
  /** Shared with every campaign: the entry moves into the Library (or back into the open campaign); this pane follows it. */
  const share = (row: RecordRow, shared: boolean) => window.api.library.share(kind.type, row.id, shared)
  const remove = async (row: RecordRow) => {
    // A Library entry may be used by any campaign: those uses show it as missing afterwards.
    if (row.library) {
      const usage = await window.api.library.usage(kind.type, row.id)
      const where = usage.length ? `It is used in ${usage.map(u => `${u.name} (${u.uses})`).join(', ')}; there it will show as missing.` : 'No campaign uses it.'
      if (!window.confirm(`Delete the shared “${row.name}”? ${where}`)) return
    }
    if (current?.id === row.id) clear()
    await window.api.entity.delete(kind.type, row.id, row.library ? LIBRARY : undefined)
  }

  // What the pane shows: a custom entry live from its record (agent edits included), a published one as loaded.
  const shown = (current?.custom && recordOf(current)?.content) || preview
  const state: PaneState<T> = { selected: current, preview: shown, copyId, edit }
  return {
    kind, current, shown, copy, edit, state, gone, scrollRef, editorKeys, agent, campaignId, campaignName,
    homeOf, artFor, setArt, select, showDraft, startEdit, startNew, created, exit, toggleEdit, clear, duplicate, share, remove,
  }
}
export type EntryPane<T extends { id: string; name: string }> = ReturnType<typeof useEntryPane<T>>

/** The ⋯ menu of a custom entry (in its title bar, or on its row's right-click): Shared with every campaign, Duplicate, Delete. */
export function EntryMenu({ type, row, x, y, campaignId, campaignName, onShare, onDuplicate, onDelete, onClose }: {
  type: RecordType; row: RecordRow; x: number; y: number; campaignId: string | null; campaignName: string
  onShare: (shared: boolean) => void; onDuplicate: () => void; onDelete: () => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // A Library entry goes back into this campaign only while no other campaign uses it.
  const [elsewhere, setElsewhere] = useState<string[] | undefined>(row.library ? undefined : [])
  useEffect(() => {
    if (!row.library || !campaignId) return
    void window.api.library.usage(type, row.id).then(usage => setElsewhere(usage.filter(u => u.campaignId !== campaignId).map(u => u.name)))
  }, [type, row.id, row.library, campaignId])
  // Closes on a click anywhere else in its own window (the page, or a popped-out one).
  useEffect(() => {
    const win = ref.current?.ownerDocument.defaultView ?? window
    const close = () => onClose()
    win.addEventListener('mousedown', close)
    return () => win.removeEventListener('mousedown', close)
  }, [onClose])
  const act = (fn: () => void) => () => { onClose(); fn() }
  return <div ref={ref} className="record-menu" role="menu" style={{ left: x, top: y }} onMouseDown={e => e.stopPropagation()}>
    {/* Shared: in the Library, for every campaign. Only with a campaign open (to share from, or take it back into). */}
    {campaignId && <button role="menuitemcheckbox" aria-checked={!!row.library} className="neutral"
      disabled={!!row.library && (!elsewhere || elsewhere.length > 0)}
      title={!row.library ? `Share it with every campaign; ${campaignName} keeps using it`
        : elsewhere?.length ? `Also used in ${elsewhere.join(', ')}: duplicate it to change it for ${campaignName} only` : `Move it back into ${campaignName} only`}
      onClick={act(() => onShare(!row.library))}><Icon name={row.library ? 'square-check' : 'square'} /> Shared with every campaign</button>}
    <button role="menuitem" className="neutral" title={row.library ? 'A shared copy beside it' : `A copy beside it, in ${campaignName}`} onClick={act(onDuplicate)}>Duplicate</button>
    <button role="menuitem" onClick={act(onDelete)}>Delete</button>
  </div>
}

/** A title-bar control: every one is an icon of the same size, like the pop-out one. */
function HeaderIcon({ icon, label, title, pressed, menu, onClick }: {
  icon: string; label: string; title: string; pressed?: boolean; menu?: boolean; onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  return <button className="sb-icon-btn" aria-label={label} title={title} aria-pressed={pressed} aria-haspopup={menu ? 'menu' : undefined}
    onMouseDown={menu ? e => e.stopPropagation() : undefined} onClick={onClick}><Icon name={icon} /></button>
}

/**
 * A pane's stat block or editor. Its title bar carries, after the name: where the entry lives (Campaign,
 * Shared, or New until the first change adds it), then the icons: pop out (on the page), Edit (pressed while
 * editing; press again for done), and a custom entry's ⋯ menu.
 */
export function EntryView<T extends { id: string; name: string }>({ pane, popped, onPopout, emptyText }: {
  pane: EntryPane<T>
  /** In a window of its own: the body scrolls the window, and there is no pop-out. */
  popped?: boolean
  onPopout?: () => void
  emptyText: string
}) {
  const { kind, current, shown, copy, edit, agent, campaignId, campaignName } = pane
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const fresh = !!edit && 'fresh' in edit
  const editDraft = edit ? ('fresh' in edit ? edit.fresh : copy) : undefined
  // Where a first change adds a new entry: the campaign, or shared (no campaign open).
  const addsTo = (home: string) => home === LIBRARY ? 'as a shared entry, for every campaign' : `to ${campaignName}`
  const freshHome = edit && 'fresh' in edit ? addsTo(edit.home) : ''
  const newHomeName = addsTo(campaignId ?? LIBRARY)
  // Where the shown entry lives (its art is stored there too): a new entry's home, or the entry's own.
  const shownHome = edit && 'fresh' in edit ? edit.home : current?.library ? LIBRARY : undefined
  const savedAt = copy?.updatedAt && new Date(copy.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const homeChip = fresh ? <span className="sb-header-home" title={`Your first change adds it ${freshHome}`}>New</span>
    : current?.custom && <span className="sb-header-home" title={current.library ? 'Shared by every campaign: changes show wherever it is used' : `In ${campaignName} only`}>{current.library ? 'Shared' : 'Campaign'}</span>
  const actions: ReactNode = (edit || current) && <>
    {homeChip}
    {onPopout && <HeaderIcon icon="square-arrow-up-right-exit" label="Pop out" title="Open in its own window" onClick={onPopout} />}
    <HeaderIcon icon="pencil" label={edit ? 'Done' : 'Edit'} pressed={!!edit} onClick={() => pane.toggleEdit()}
      title={edit ? (fresh ? 'Done: back without adding it (e)' : `Done editing (e)${savedAt ? `; saved at ${savedAt}` : ''}`)
        : current?.custom ? (current.library ? 'Edit (e); it changes in every campaign that uses it' : 'Edit (e)') : `Edit a copy (e); your first change adds it ${newHomeName}`} />
    {!fresh && current?.custom && <HeaderIcon icon="ellipsis" label="More actions" title="Share, duplicate, delete" menu
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu(m => m ? null : { x: r.left, y: r.bottom }) }} />}
  </>

  const Statblock = kind.Statblock
  const previewBlock = current && shown && <Statblock value={shown} draft={agent ? copy : undefined} art={kind.art ? pane.artFor(current) : undefined}
    onArtChange={kind.art ? art => void pane.setArt(current, art) : undefined} />
  const artEditable = kind.art && !fresh && current?.custom
  return <RecordHomeContext.Provider value={shownHome}>
    <RecordHeaderContext.Provider value={actions}>
      <div ref={pane.scrollRef} className={popped ? 'record-popout-body' : 'compendium-preview'}>
        {edit ? <div className="record-entry-editor">
          {editDraft ? <EntryEditor key={'fresh' in edit ? edit.key : pane.editorKeys.current[editDraft.id] ?? editDraft.id} draft={editDraft}
            create={'fresh' in edit ? { destinations: [edit.home === LIBRARY ? { type: 'library', id: LIBRARY } : { type: 'campaign', id: edit.home }], from: edit.from } : undefined} onCreated={pane.created}
            art={artEditable ? pane.artFor(current!) : undefined} onArtChange={artEditable ? art => void pane.setArt(current!, art) : undefined} />
            : <div className="record-empty">Loading…</div>}
        </div>
          // One stat block for every entry; with the agent connection on, the working copy adds comment markers.
          : current && shown ? (agent && copy ? <DraftAnnotations draft={copy} enabled>{previewBlock}</DraftAnnotations> : previewBlock)
          : <div className="record-empty">{emptyText}</div>}
      </div>
      {menu && current && <EntryMenu type={kind.type} row={current} x={menu.x} y={menu.y} campaignId={campaignId} campaignName={campaignName}
        onShare={shared => void pane.share(current, shared)} onDuplicate={() => void pane.duplicate(current)} onDelete={() => void pane.remove(current)} onClose={() => setMenu(null)} />}
    </RecordHeaderContext.Provider>
  </RecordHomeContext.Provider>
}

/**
 * An entry popped out into an OS window of its own, opening as it was shown (preview or editor), with the same
 * controls. It closes with its window, or when its entry is deleted.
 */
export function PoppedEntry<T extends { id: string; name: string }>({ kind, initial, popKey, onClose }: {
  kind: RecordKind<T>; initial: PaneState<T>; popKey: string; onClose: () => void
}) {
  const pane = useEntryPane(kind, initial)
  const title = pane.shown?.name || `New ${kind.singular}`
  const container = usePopoutWindow(popKey, true, { title, width: 560, height: 760, boundsKey: 'compendium-entry', onClosed: onClose })
  const empty = pane.gone || (!pane.current && !pane.edit)
  useEffect(() => { if (empty) onClose() }, [empty])
  // e toggles Edit in this window (forwarded, it would act on the page's preview instead).
  const toggle = useRef(pane.toggleEdit)
  toggle.current = pane.toggleEdit
  useEffect(() => {
    const win = container?.ownerDocument.defaultView
    if (!win) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== 'e' || e.ctrlKey || e.metaKey || e.altKey || (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable))) return
      e.preventDefault()
      toggle.current()
    }
    win.addEventListener('keydown', onKey, true)
    return () => win.removeEventListener('keydown', onKey, true)
  }, [container])
  if (!container) return null
  return createPortal(<div className="record-compendium record-popout"><EntryView pane={pane} popped emptyText="" /></div>, container)
}
