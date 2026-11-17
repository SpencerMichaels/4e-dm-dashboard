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

import { useEffect, useRef, useState, type ComponentType } from 'react'
import type { RecordArt } from '@common/types'
import { LIBRARY, type RecordType } from '@common/campaign-records'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { useHotkeys } from '@renderer/hooks/use-hotkeys'
import type { Draft } from '@common/authoring/types'
import '../authoring/authoring.css'
import { EntryMenu, EntryView, PoppedEntry, useEntryPane, type PaneState } from './EntryPane'
import { RecordListPanel, useRecordList } from './RecordList'
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

export function RecordCompendium<T extends { id: string; name: string }>({ kind, initialId, draftId }: {
  kind: RecordKind<T>
  /** A campaign entry to select on open (from the command palette). */
  initialId?: string
  /** A Workshop draft to open (an agent's open_review, the command palette). */
  draftId?: string
}) {
  const list = useRecordList(kind)
  const { custom } = list
  /** A row's right-click menu (custom entries). */
  const [menu, setMenu] = useState<{ row: RecordRow; x: number; y: number } | null>(null)
  // The page's preview pane, and the entries popped out into windows of their own.
  const pane = useEntryPane(kind)
  const [poppedOut, setPoppedOut] = useState<{ key: string; initial: PaneState<T> }[]>([])
  const popCount = useRef(0)

  const campaignId = useCampaignStore(s => s.campaignId)
  const campaignName = useCampaignStore(s => s.campaign?.name) ?? 'Campaign'
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

  return <div className="stat-block-4e compendium-split record-compendium">
    <RecordListPanel list={list}
      isActive={r => r.id === current?.id && !!r.library === !!current?.library}
      onSelect={r => void pane.select(r)} onActivate={r => void pane.startEdit(r)}
      onContextMenu={(r, e) => { if (r.custom) { e.preventDefault(); setMenu({ row: r, x: e.clientX, y: e.clientY }) } }}
      headerExtra={/* New goes into the open campaign (or the Library without one); sharing it later moves it. */
        <button className="btn btn-sm" onClick={() => pane.startNew(newHome)} style={{ color: 'inherit', font: 'inherit' }}
          title={campaignId ? `Create a new ${kind.singular} in ${campaignName}` : `Create a new ${kind.singular}, shared across every campaign`}>New</button>} />

    <EntryView pane={pane} onPopout={popOut} emptyText={`Click a ${kind.singular} to preview`} />

    {poppedOut.map(p => <PoppedEntry key={p.key} popKey={p.key} kind={kind} initial={p.initial}
      onClose={() => setPoppedOut(prev => prev.filter(x => x.key !== p.key))} />)}

    {menu && <EntryMenu type={kind.type} row={menu.row} x={menu.x} y={menu.y} campaignId={campaignId} campaignName={campaignName}
      onShare={shared => void pane.share(menu.row, shared)} onDuplicate={() => void pane.duplicate(menu.row)} onDelete={() => void pane.remove(menu.row)} onClose={() => setMenu(null)} />}
  </div>
}
