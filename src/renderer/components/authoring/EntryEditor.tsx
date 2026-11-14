import { useEffect, useRef, useState, useCallback } from 'react'
import type { Draft, Destination, SyncState } from '@common/authoring/types'
import type { RecordArt } from '@common/types'
import { contentWith, isUnsaved } from '@common/authoring/unsaved'
import { useAuthoringStore } from '../../stores/authoring-store'
import { useUiStore } from '../../stores/ui-store'
import { NativeCreatureDraftEditor } from './NativeCreatureDraftEditor'
import { isKitNative, ItemDraftEditor, KitDraftEditor } from './KitDraftEditor'
import { DraftAnnotations } from './DraftAnnotations'
import type { EditStatus } from './live-edits'
import './authoring.css'

type Connection = { connectionFile: string; mcpSetup: string }
function CopyConnectionInfo({ label, title, pick }: { label: string; title: string; pick: (c: Connection) => string }) {
  const [copied, setCopied] = useState(false)
  return <button className="btn" title={title}
    onClick={() => void window.api.authoring.call('connection').then((c: Connection) => navigator.clipboard.writeText(pick(c))).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) })}>{copied ? 'Copied' : label}</button>
}

/** Copies the `claude mcp add` line that registers the dashboard's MCP server (main picks the installed or source command). */
export function CopyMcpSetup() {
  return <CopyConnectionInfo label="Copy setup for Claude Code" pick={c => c.mcpSetup}
    title="A command to run once in a terminal; then restart Claude Code. Other MCP clients take the same command (after the --) in their server settings." />
}

/** Copies the authoring connection file's path (it holds a credential: share the path, never the contents). */
export function CopyConnectionPath() {
  return <CopyConnectionInfo label="Copy connection path" pick={c => c.connectionFile}
    title="For a custom setup, pass this file to the authoring CLI with --connection. It holds a credential: share the path, never the contents." />
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
      <p className="authoring-notice">To connect Claude Code, copy its setup below, run it once in a terminal, and restart Claude Code. Other agents: see <code>docs/AUTHORING.md</code>.</p>
    </div>
  </aside>
}

/**
 * The editor for a campaign entry: the kind's usual editor on the entry's working copy (a draft the AI agent
 * also edits; main writes each version straight into the entry), so the DM's and the agent's edits merge as
 * they land. With the AI agent connection on (Settings), comment markers sit on the stat block's lines
 * (talk about the entry as a whole in chat with the agent). A new entry's working copy is unsaved until its first edit creates it (`create`, `onCreated`).
 */
export function EntryEditor({ draft: d, create, onCreated, art, onArtChange }: {
  draft: Draft
  /** For a new entry: where its first edit creates it, and the published entry it copies (main adds its source and art). */
  create?: { destinations: Destination[]; from?: string }
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
  </>
}

