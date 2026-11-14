import { useEffect, useRef, useState, useCallback } from 'react'
import type { Draft, Destination, SyncState } from '@common/authoring/types'
import type { RecordArt } from '@common/types'
import { contentWith, isUnsaved } from '@common/authoring/unsaved'
import { useAuthoringStore } from '../../stores/authoring-store'
import { useUiStore } from '../../stores/ui-store'
import { NativeCreatureDraftEditor } from './NativeCreatureDraftEditor'
import { isKitNative, ItemDraftEditor, KitDraftEditor, KitStatblock } from './KitDraftEditor'
import { withDraftNodes } from '@common/authoring/creature-editor-adapter'
import { decorate } from '@common/authoring/kit-editor-adapter'
import { Dnd4eCreatureViewer } from '../creature/Dnd4eCreatureViewer'
import { kitViewCreature } from '../creature/kit-view'
import { ItemStatblock } from '../item/ItemStatblock'
import { useGlossary } from '../compendium/use-glossary'
import type { Item, Monster } from '@kit'
import { DraftAnnotations, Thread } from './DraftAnnotations'
import type { EditStatus } from './live-edits'
import { allAnchorPaths, within } from '@common/authoring/anchors'
import { Icon } from '../shared/Icon'
import './authoring.css'

/** Copies the authoring connection file's path (it holds a credential: share the path, never the contents). */
export function CopyConnectionPath() {
  const [copied, setCopied] = useState(false)
  return <button className="btn" title="For a custom setup, pass this file to the authoring CLI with --connection. It holds a credential: share the path, never the contents."
    onClick={() => void window.api.authoring.call('connection').then((c: { connectionFile: string }) => navigator.clipboard.writeText(c.connectionFile)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) })}>{copied ? 'Copied' : 'Copy connection path'}</button>
}

/** How working with an AI agent goes, for Settings. */
export function WorkshopIntro() {
  return <aside className="authoring-intro" aria-label="About working with an AI agent">
    <div>
      <h2>Working with an AI agent</h2>
      <p>A coding agent such as Claude Code, running in a terminal on this computer, can design and revise creatures, items, traps, diseases, templates, and themes with you. It connects here on its own and works on whatever you have open.</p>
      <ol>
        <li><b>Open an entry</b> on its compendium page and ask your agent for what you want, for example “make this lurker steal healing surges”, or ask for something new (“use the 4e-author-content skill to make a level 7 lurker”); a new one appears in the open campaign.</li>
        <li><b>Its changes appear as it makes them</b>, in the stat block and in the editor, alongside your own edits. Comment on a line with the marker at its edge; the agent reads comments and replies there.</li>
        <li>Changes go straight into the entry. To undo one, ask the agent: it keeps every earlier version and can restore any of them.</li>
      </ol>
      <p className="authoring-notice">Setup is in <code>docs/AUTHORING.md</code>.</p>
    </div>
  </aside>
}

/** Comments on the whole entry (or on a field the stat block has no marker for), under the stat block. */
export function EntryDiscussion({ draft: d }: { draft: Draft }) {
  const paths = allAnchorPaths(d)
  const general = d.comments.filter(c => !within(c.target, paths))
  const [open, setOpen] = useState(false)
  const unresolved = general.filter(c => !c.resolved).length
  return <div className="entry-discussion">
    <button className="rail-link" aria-expanded={open || unresolved > 0} onClick={() => setOpen(!open)}>
      <Icon name={open || unresolved ? 'chevron-down' : 'chevron-right'} style={{ verticalAlign: '-0.125em' }} /> Comments on the whole {d.kind === 'monster' ? 'creature' : d.kind}{general.length ? ` (${unresolved ? `${unresolved} open` : general.length})` : ''}
    </button>
    {(open || unresolved > 0) && <Thread draft={d} anchor={{ target: '/', label: 'Whole entry', paths: [] }} comments={general} findings={[]} />}
  </div>
}

/**
 * The editor for a campaign entry: the kind's usual editor on the entry's working copy (a draft the AI agent
 * also edits; main writes each version straight into the entry), so the DM's and the agent's edits merge as
 * they land. With the AI agent connection on (Settings), comment markers sit on the stat block's lines and
 * whole-entry comments are below it. A new entry's working copy is unsaved until its first edit creates it (`create`, `onCreated`).
 */
export function EntryEditor({ draft: d, create, onCreated, art, onArtChange }: {
  draft: Draft
  /** For a new entry: where its first edit creates it, and the campaign-side fields it starts with. */
  create?: { destinations: Destination[]; intent?: string; entry?: Record<string, unknown> }
  onCreated?: (d: Draft) => void
  art?: RecordArt
  onArtChange?: (art: RecordArt) => void
}) {
  // Comment markers and comments are for working with an AI agent (Settings).
  const agent = useUiStore(s => s.agentConnection)
  const [error, setError] = useState('')
  const [sync, setSync] = useState<SyncState>()
  // Each editor reports whether its edits are in the draft yet; only "stuck" ones need the DM.
  const [edits, setEdits] = useState<Record<string, EditStatus>>({})
  const receive = useAuthoringStore(s => s.receive)
  const call = window.api.authoring.call
  const latest = useRef(d)
  latest.current = d
  const unsaved = isUnsaved(d)
  useEffect(() => { if (!unsaved) void call('sync_status', { id: d.id }).then(setSync).catch(() => {}) }, [d.id, d.event])
  const editStatus = useCallback((key: string, s: EditStatus) => {
    useAuthoringStore.getState().markPending(key, s === 'stuck')
    setEdits(e => {
      if ((e[key] ?? 'clean') === s) return e
      const next = { ...e }
      if (s === 'clean') delete next[key]; else next[key] = s
      return next
    })
  }, [])
  const patch = async (changes: { path: string; value: unknown }[], revision = latest.current.revision): Promise<Draft> => {
    // A new entry's first edit creates its working copy (and, through it, the entry).
    if (revision === 0) {
      const created: Draft = await call('create_draft', { kind: d.kind, content: contentWith(latest.current, changes), ...create })
      onCreated!(created)
      return created
    }
    const next: Draft = await call('patch_draft', { id: d.id, revision, changes })
    receive(next)
    return next
  }
  const editorStatus = useCallback((s: EditStatus) => editStatus('editor', s), [editStatus])
  return <>
    {error && <p className="authoring-error" role="alert">{error}</p>}
    {sync?.error && <p className="authoring-error" role="alert">{sync.error}</p>}
    <DraftAnnotations draft={d} enabled={!unsaved && agent}>
      {d.kind === 'monster' && <NativeCreatureDraftEditor draft={d} status={editorStatus} apply={patch} art={art} onArtChange={onArtChange} />}
      {isKitNative(d.kind) && <KitDraftEditor draft={d} status={editorStatus} apply={patch} />}
      {d.kind === 'item' && <ItemDraftEditor draft={d} status={editorStatus} apply={patch} />}
    </DraftAnnotations>
    {!unsaved && agent && <EntryDiscussion draft={d} />}
  </>
}

/**
 * A campaign entry's read-only stat block, drawn from its working copy so comment markers anchor to its
 * lines (and the agent's edits show as they land). Same viewers, art, and pop-out as the compendium's.
 */
export function EntryPreview({ draft: d, art, onArtChange, onPopout }: { draft: Draft; art?: RecordArt; onArtChange?: (art: RecordArt) => void; onPopout?: () => void }) {
  const { tooltip } = useGlossary()
  const agent = useUiStore(s => s.agentConnection)
  return <>
    <DraftAnnotations draft={d} enabled={agent}>
      {d.kind === 'monster' ? <Dnd4eCreatureViewer creature={withDraftNodes(kitViewCreature(d.content as Monster, undefined, { ...art }), d)} tooltip={tooltip}
          onImageChange={onArtChange && (imageId => onArtChange({ imageId }))}
          onTokenChange={onArtChange && ((tokenImageId, tokenCrop) => onArtChange({ tokenImageId, tokenCrop }))} onPopout={onPopout} />
        : d.kind === 'item' ? <ItemStatblock item={decorate<Item>(d)} />
          : <KitStatblock kind={d.kind} content={decorate(d)} />}
    </DraftAnnotations>
    {agent && <EntryDiscussion draft={d} />}
  </>
}
