import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { ContentKind, Draft, Destination, DraftVersion } from '@common/authoring/types'
import { validate, benchmarks } from '@common/authoring/core'
import { useAuthoringStore } from '../../stores/authoring-store'
import { useUiStore } from '../../stores/ui-store'
import { useCampaignStore } from '../../stores/campaign-store'
import { ContentPreview } from './ContentPreview'
import { FieldEditor } from './FieldEditor'
import { NativeCreatureDraftEditor } from './NativeCreatureDraftEditor'
import { isKitNative, ItemDraftEditor, KitDraftEditor } from './KitDraftEditor'
import { DraftMetadataFields } from './DraftMetadataFields'
import { DraftAnnotations, openThread } from './DraftAnnotations'
import { Icon } from '../shared/Icon'
import { DraftNotes } from './DraftNotes'
import type { EditStatus } from './live-edits'
import { ProposalView, RecipeEditor, type NumberProposal } from './RecipeEditor'
import { StatusRail, commentOnDraft } from './StatusRail'
import { allAnchorPaths, targetLabel, within } from '@common/authoring/anchors'
import { contentWith, isUnsaved, unsavedDraft } from '@common/authoring/unsaved'
import type { Monster } from '@kit'
import './authoring.css'

const KINDS: { kind: ContentKind; label: string; plural: string; icon: string }[] = [
  { kind: 'monster', label: 'Creature', plural: 'Creatures', icon: '👹' }, { kind: 'item', label: 'Item', plural: 'Items', icon: '🎒' },
  { kind: 'trap', label: 'Trap', plural: 'Traps', icon: '🪤' }, { kind: 'disease', label: 'Disease', plural: 'Diseases', icon: '🦠' },
  { kind: 'template', label: 'Template', plural: 'Templates', icon: '🧬' }, { kind: 'theme', label: 'Theme', plural: 'Themes', icon: '🎭' },
]
const kindInfo = (k: ContentKind) => KINDS.find(x => x.kind === k)!

/** "3 min ago", "yesterday", or a date: enough to find the draft you were just working on. */
function ago(iso?: string) {
  if (!iso) return ''
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 172800) return 'yesterday'
  return new Date(iso).toLocaleDateString()
}

/** "Dungeon Magazine 157, MM3 +1": distinct books only, without the catalog's build stamp. */
function shortSource(source: string) {
  const books = [...new Set(source.split(';').map(s => s.trim()).filter(s => s && !/^Legacy (parsed )?compendium/.test(s)))]
  return books.length > 2 ? `${books.slice(0, 2).join(', ')} +${books.length - 2}` : books.join(', ')
}

interface DraftRow { id: string; kind: ContentKind; name: string; level?: number; revision: number; updatedAt?: string; saved: boolean; everSaved?: boolean; openQuestions?: number }

export function AuthoringView({ draftId }: { draftId?: string }) {
  const draft = useAuthoringStore(s => draftId ? s.drafts[draftId] : undefined)
  const receive = useAuthoringStore(s => s.receive)
  const setView = useUiStore(s => s.setView)
  const [list, setList] = useState<DraftRow[]>([])
  const [destinations, setDestinations] = useState<any[]>([])
  const [error, setError] = useState('')
  const [tab, setTab] = useState<ContentKind>('monster')
  // New drafts save to the open campaign unless the DM picks another.
  const campaignId = useCampaignStore(s => s.campaignId)
  const defaultDestinations = useMemo<Destination[]>(() => campaignId ? [{ type: 'campaign', id: campaignId }] : [], [campaignId])
  const call = window.api.authoring.call
  const refresh = async () => { setList(await call('list_drafts')); setDestinations(await call('destinations')) }
  useEffect(() => {
    void refresh().catch(e => setError(String(e)))
    return window.api.authoring.onChange(e => { if (e.draft) { receive(e.draft); void refresh() } })
  }, [])
  useEffect(() => { if (draftId) void call('get_draft', { id: draftId }).then(receive).catch(e => setError(String(e))) }, [draftId])
  useEffect(() => { if (draft) setTab(draft.kind) }, [draft?.kind])
  // A new draft lives only here until its first edit. Keeping its React key once it is created
  // keeps the editor mounted, so the DM can keep typing.
  const [fresh, setFresh] = useState<{ kind: ContentKind; key: string } | null>(null)
  const freshDraft = useMemo(() => fresh && unsavedDraft(fresh.kind), [fresh])
  const keys = useRef<Record<string, string>>({})
  const created = (d: Draft) => {
    if (fresh) keys.current[d.id] = fresh.key
    receive(d); setView({ type: 'authoring', draftId: d.id }, { keepEdits: true }); setFresh(null); void refresh()
  }
  const startNew = (kind: ContentKind) => { setFresh({ kind, key: `new-${Date.now()}` }); setView({ type: 'authoring' }) }
  const home = () => { setFresh(null); setView({ type: 'authoring' }) }
  const open = draft ?? (!draftId ? freshDraft : null)
  return <main className="authoring">
    {error && <p className="authoring-error" role="alert">{error}</p>}
    {open ? <>
      <button className="rail-link authoring-back" onClick={home}><Icon name="arrow-left" style={{ verticalAlign: '-0.125em' }} /> {kindInfo(open.kind).plural}</button>
      {draft ? <DraftEditor key={keys.current[draft.id] ?? draft.id} draft={draft} destinations={destinations} defaultDestinations={defaultDestinations} />
        : <DraftEditor key={fresh!.key} draft={freshDraft!} destinations={destinations} defaultDestinations={defaultDestinations} onCreated={created} />}
    </> : <WorkshopHome tab={tab} setTab={setTab} drafts={list} destinations={destinations} defaultDestinations={defaultDestinations} refresh={refresh} onError={setError} onNew={startNew} onCreated={created}
      onOpen={id => setView({ type: 'authoring', draftId: id })} />}
  </main>
}

/** Kind tabs, the drafts of that kind, and ways to start one. */
function WorkshopHome({ tab, setTab, drafts, destinations, defaultDestinations, refresh, onError, onNew, onCreated, onOpen }: {
  tab: ContentKind; setTab: (k: ContentKind) => void; drafts: DraftRow[]; destinations: any[]; defaultDestinations: Destination[]; refresh: () => Promise<void>
  onError: (e: string) => void; onNew: (kind: ContentKind) => void; onCreated: (d: Draft) => void; onOpen: (id: string) => void
}) {
  const call = window.api.authoring.call
  const [busy, setBusy] = useState(false)
  const [tool, setTool] = useState<'copy' | 'import' | null>(null)
  const [importText, setImportText] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [sort, setSort] = useState<{ key: 'name' | 'level' | 'status' | 'updated'; dir: 1 | -1 }>({ key: 'updated', dir: -1 })
  const [copied, setCopied] = useState(false)
  const [intro, setIntro] = useState(false)
  useEffect(() => { void window.api.settings.get().then(s => setIntro(!s.dismissedTips.includes('workshop-intro'))) }, [])
  useEffect(() => { setResults(null); setQuery('') }, [tab])
  const perform = async (fn: () => Promise<unknown>) => {
    setBusy(true); onError('')
    try { await fn() } catch (e) { onError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const k = kindInfo(tab)
  const status = (d: DraftRow) => d.openQuestions ? `${d.openQuestions} open question${d.openQuestions === 1 ? '' : 's'}` : d.saved ? 'Saved' : d.everSaved ? 'Changed since last save' : 'Not saved yet'
  const sortValue = (d: DraftRow) => sort.key === 'name' ? d.name.toLowerCase() : sort.key === 'level' ? d.level ?? 0 : sort.key === 'status' ? status(d) : d.updatedAt ?? ''
  const rows = drafts.filter(d => d.kind === tab).sort((a, b) => { const x = sortValue(a), y = sortValue(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir })
  const header = (key: typeof sort.key, label: string) => <th aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
    <button onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'updated' ? -1 : 1 }))}>{label}{sort.key === key && <>{' '}<Icon name={sort.dir === 1 ? 'chevron-up' : 'chevron-down'} style={{ verticalAlign: '-0.125em' }} /></>}</button></th>
  // One row per entry; matching powers are listed on it.
  const grouped = (results ?? []).reduce<{ key: string; entry: any; powers: string[] }[]>((acc, r) => {
    const row = acc.find(x => x.key === r.key) ?? (acc.push({ key: r.key, entry: r, powers: [] }), acc.at(-1)!)
    if (r.target !== 'entry') row.powers.push(r.name.split(' — ').slice(1).join(' — '))
    return acc
  }, [])

  return <div className="authoring-home">
    <div className="authoring-kind-tabs" role="tablist" aria-label="Kind">
      {KINDS.map(x => <button key={x.kind} role="tab" aria-selected={tab === x.kind} onClick={() => setTab(x.kind)}><span aria-hidden>{x.icon}</span> {x.plural}</button>)}
    </div>

    {intro && <WorkshopIntro dismiss={() => { setIntro(false); void window.api.settings.dismissTip('workshop-intro') }} />}

    <div className="authoring-toolbar">
      <button className="authoring-primary" onClick={() => onNew(tab)} title={`Opens a blank ${k.label.toLowerCase()}; your first edit saves it`}>+ New {k.label.toLowerCase()}</button>
      <button aria-expanded={tool === 'copy'} onClick={() => setTool(tool === 'copy' ? null : 'copy')} title={`Copy a published ${k.label.toLowerCase()} into a new draft`}>Copy existing</button>
      <button aria-expanded={tool === 'import'} onClick={() => setTool(tool === 'import' ? null : 'import')} title="Paste kit-schema JSON">Import JSON</button>
    </div>
    {tool === 'copy' && <div className="authoring-tool">
      <form className="authoring-search" onSubmit={e => { e.preventDefault(); void perform(async () => setResults(await call('search', { text: query, kind: tab, limit: 40 }))) }}>
        <input aria-label={`Search ${k.plural.toLowerCase()}`} autoFocus placeholder={`Search ${k.plural.toLowerCase()} and their powers by name or rules text`} value={query} onChange={e => setQuery(e.target.value)} />
        <button disabled={busy || !query.trim()}>Search</button>
      </form>
      {results && !grouped.length && <p className="authoring-notice">Nothing matched.</p>}
      {grouped.length > 0 && <ul className="authoring-results">{grouped.map(({ key, entry, powers }) => <li key={key}>
        <span><b>{entry.name.split(' — ')[0]}</b> <span className="authoring-notice">{entry.level ? `level ${entry.level}` : ''}{shortSource(entry.source) && ` · ${shortSource(entry.source)}`}</span>
          {powers.length > 0 && <span className="authoring-notice"> · {powers.join(', ')}</span>}</span>
        <button disabled={busy} title="Copy this entry into a new draft" onClick={() => void perform(async () => { const e = await call('fetch', { key }); onCreated(await call('create_draft', { kind: e.kind, content: e.content, intent: `Based on ${e.key}; ${e.source}`, destinations: defaultDestinations })) })}>Copy</button>
      </li>)}</ul>}
    </div>}
    {tool === 'import' && <form className="authoring-tool" onSubmit={e => { e.preventDefault(); void perform(async () => onCreated(await call('create_draft', { kind: tab, content: JSON.parse(importText), destinations: defaultDestinations }))) }}>
      <textarea aria-label="Content JSON" rows={8} autoFocus placeholder={`Paste a ${k.label.toLowerCase()} in the kit schema`} value={importText} onChange={e => setImportText(e.target.value)} />
      <button disabled={busy || !importText.trim()}>Import</button>
    </form>}

    {rows.length ? <table className="authoring-table data-table">
      <thead><tr>{header('name', 'Name')}{header('level', 'Level')}{header('status', 'Status')}{header('updated', 'Updated')}</tr></thead>
      <tbody>{rows.map(d => <tr key={d.id} onClick={() => onOpen(d.id)}>
        <td><button className="rail-link" onClick={e => { e.stopPropagation(); onOpen(d.id) }}>{d.name}</button></td>
        <td>{d.level ?? ''}</td>
        <td className={d.openQuestions ? 'authoring-attention' : undefined}>{status(d)}</td>
        <td title={d.updatedAt ? new Date(d.updatedAt).toLocaleString() : undefined}>{ago(d.updatedAt)}</td>
      </tr>)}</tbody>
    </table> : <p className="authoring-empty">No {k.label.toLowerCase()} drafts yet.</p>}

    <footer className="authoring-footer authoring-notice">
      <span>{!intro && <><button className="rail-link" onClick={() => setIntro(true)}>How the Workshop works</button>{' · '}</>}
        <button className="rail-link" title="For a custom setup, pass this file to the authoring CLI with --connection. It holds a credential: share the path, never the contents."
          onClick={() => void call('connection').then((c: { connectionFile: string }) => navigator.clipboard.writeText(c.connectionFile)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) })}>{copied ? 'Copied' : 'Copy connection path'}</button></span>
    </footer>
  </div>
}

/** One-time orientation: what the Workshop is for, and that an agent is optional. */
function WorkshopIntro({ dismiss }: { dismiss: () => void }) {
  return <aside className="authoring-intro" aria-label="About the Workshop">
    <div>
      <h2>Design homebrew with an AI agent</h2>
      <p>The Workshop is where you and a coding agent such as Claude Code design creatures, items, traps, diseases, templates, and themes together. The agent runs in a terminal on this computer and connects here on its own.</p>
      <ol>
        <li><b>Ask your agent</b> for what you want, for example “use the 4e-author-content skill to make a level 7 lurker that steals healing surges.” It drafts the stat block here and checks the math against published monsters.</li>
        <li><b>Review it here.</b> Edit anything directly, or comment on a line with the marker at its edge. Your agent reads your edits and comments when you tell it to continue.</li>
        <li><b>Save</b> to a campaign: it goes into the campaign's compendium, and saving again updates it there.</li>
      </ol>
      <p className="authoring-notice">No agent? Use <b>+ New</b> and edit by hand; everything works without one. Setup is in <code>docs/AUTHORING.md</code>.</p>
    </div>
    <button onClick={dismiss}>Got it</button>
  </aside>
}

function DraftEditor({ draft: d, destinations, defaultDestinations, onCreated }: { draft: Draft; destinations: any[]; defaultDestinations: Destination[]; onCreated?: (d: Draft) => void }) {
  const unsaved = isUnsaved(d)
  const [tab, setTab] = useState<'preview' | 'edit' | 'history'>(unsaved ? 'edit' : 'preview')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Each editor reports whether its edits are in the draft yet; only "stuck" ones need the DM.
  const [edits, setEdits] = useState<Record<string, EditStatus>>({})
  const [saveStatus, setSaveStatus] = useState<{ pending: boolean; targets: any[] }>({ pending: false, targets: [] })
  const [numberProposal, setNumberProposal] = useState<NumberProposal | null>(null)
  const receive = useAuthoringStore(s => s.receive)
  const call = window.api.authoring.call
  const latest = useRef(d)
  latest.current = d
  useEffect(() => { if (!unsaved) void call('save_status', { id: d.id }).then(setSaveStatus).catch(e => setError(String(e))) }, [d.id, d.event, error])
  const editStatus = useCallback((key: string, s: EditStatus) => {
    useAuthoringStore.getState().markPending(key, s === 'stuck')
    setEdits(e => {
      if ((e[key] ?? 'clean') === s) return e
      const next = { ...e }
      if (s === 'clean') delete next[key]; else next[key] = s
      return next
    })
  }, [])
  const states = Object.values(edits)
  const editing: EditStatus = states.includes('stuck') ? 'stuck' : states.includes('saving') ? 'saving' : 'clean'
  const perform = async (fn: () => Promise<void>) => {
    setError(''); setBusy(true)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const patch = async (changes: { path: string; value: unknown }[], revision = latest.current.revision, extra: Record<string, unknown> = {}): Promise<Draft> => {
    // The first edit of a new draft creates it, with that edit applied, saving to the open campaign.
    if (revision === 0) {
      const created: Draft = await call('create_draft', { kind: d.kind, content: contentWith(latest.current, changes), destinations: defaultDestinations })
      onCreated!(created)
      return created
    }
    const next: Draft = await call('patch_draft', { id: d.id, revision, changes, ...extra })
    receive(next)
    return next
  }
  const editorStatus = useCallback((s: EditStatus) => editStatus('editor', s), [editStatus])
  const comment = (path: string) => within(path, allAnchorPaths(d)) ? openThread(path) : commentOnDraft(path)
  const validation = validate(d.kind, d.content)
  const fieldProps = { save: async (path: string, value: unknown) => { await patch([{ path, value }]) }, comment, status: editStatus }
  const idle = editing === 'clean' && !busy
  return <>
    <div className="authoring-draft-head">
      <h2>{d.content.name}</h2>
      {!unsaved && <div className="authoring-tabs" role="tablist" aria-label="Draft view">{(['preview', 'edit', 'history'] as const).map(t => <button role="tab" aria-selected={tab === t} key={t} disabled={editing === 'stuck' && tab !== t} onClick={() => setTab(t)}>{t === 'edit' ? 'Edit' : t === 'history' ? 'History' : 'Stat block'}</button>)}</div>}
    </div>
    {error && <p className="authoring-error" role="alert">{error}</p>}
    <div className="authoring-review-grid">
      <section className="authoring-main">
        <DraftAnnotations draft={d} enabled={!unsaved}>
          {tab === 'preview' && (validation.errors.length ? <p>Fix the errors listed on the right to see the stat block.</p> : <>
            <ContentPreview content={d.content} kind={d.kind} draft={d} />
            {d.kind === 'monster' && <DraftNotes monster={d.content as Monster} />}
          </>)}
          {tab === 'edit' && d.kind === 'monster' && <NativeCreatureDraftEditor draft={d} status={editorStatus} apply={patch} />}
          {tab === 'edit' && isKitNative(d.kind) && <KitDraftEditor draft={d} status={editorStatus} apply={patch} />}
          {tab === 'edit' && d.kind === 'item' && <ItemDraftEditor draft={d} status={editorStatus} apply={patch} />}
        </DraftAnnotations>
        {tab === 'edit' && !unsaved && <>
          <details><summary>Design intent and decisions</summary><FieldEditor {...fieldProps} path="/intent" value={d.intent} /><FieldEditor {...fieldProps} path="/decisions" value={d.decisions} /></details>
          {d.kind === 'monster' && <details><summary>Numeric recipe and recalculation</summary><p className="authoring-notice">Deliberate adjustments to the calculated monster numbers; these are authoring choices, not official exchange rates.</p>
            <RecipeEditor draft={d} status={editStatus} save={async recipe => { await patch([{ path: '/recipe', value: recipe }]) }} />
            <button disabled={!idle} onClick={() => void perform(async () => setNumberProposal(await call('suggest_numbers', { id: d.id })))}>Preview calculated changes</button>
            {numberProposal && <><ProposalView draft={d} proposal={numberProposal} /><button disabled={!idle} onClick={() => void perform(async () => { await patch(numberProposal.changes, numberProposal.revision, { release: numberProposal.changes.map((c: { path: string }) => c.path) }); setNumberProposal(null) })}>Apply these numbers</button></>}</details>}
          <details><summary>Your edits ({d.overrides.length})</summary><p className="authoring-notice">The agent reads these as your direction and can revise them when you ask; a field it revises leaves this list.</p>{d.overrides.map(p => <p key={p}>{targetLabel(d, p.replace(/^\/order\//, '/content/'))}{p.startsWith('/order/') ? ' (order)' : ''}{d.kind === 'monster' && ['/content/hp', '/content/initiative', '/content/xp', '/content/defenses/ac'].includes(p) && <button onClick={() => void perform(async () => { const m = d.content as Monster; const b = benchmarks(m.level, m.role!, m.rank, m.abilities); await patch([{ path: p, value: b[p.split('/').at(-1)! as keyof typeof b] }], d.revision, { release: [p] }); })}>Reset to calculated value</button>}</p>)}</details>
        </>}
        {tab === 'history' && <>
          <DraftHistory draft={d} destinations={destinations} disabled={!idle} perform={perform} />
          {/* Every field as raw data, for what no statblock shows (clauses, structured prerequisites). */}
          <details><summary>Raw fields (advanced)</summary><DraftMetadataFields {...fieldProps} draft={d} disabled={!idle} change={changes => void perform(async () => { await patch(changes) })} /></details>
        </>}
      </section>
      {!unsaved && <StatusRail draft={d} destinations={destinations} busy={busy} editing={editing} perform={perform} patch={async (...a) => { await patch(...a) }} saveStatus={saveStatus} />}
    </div>
  </>
}

const ACTIONS: Record<DraftVersion['action'], string> = {
  created: 'created the draft', edited: 'edited', restored: 'restored an earlier version', saved: 'saved',
  commented: 'commented', reviewed: 'reviewed', 'save-abandoned': 'stopped a save',
}

/** Dated versions with who changed what; any earlier one can be restored as the newest. */
function DraftHistory({ draft: d, destinations, disabled, perform }: { draft: Draft; destinations: { type: string; id: string; name: string }[]; disabled: boolean; perform: (fn: () => Promise<void>) => Promise<void> }) {
  const call = window.api.authoring.call
  const receive = useAuthoringStore(s => s.receive)
  const [versions, setVersions] = useState<DraftVersion[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { void call('versions', { id: d.id }).then(setVersions) }, [d.id, d.event])
  if (!versions) return <p className="authoring-notice">Loading history…</p>
  const who = (v: DraftVersion) => v.by === 'dm' ? 'You' : v.by === 'agent' ? 'The agent' : 'Someone'
  const campaign = (x: Destination) => destinations.find(y => y.id === x.id)?.name ?? 'a campaign that no longer exists'
  const what = (v: DraftVersion) => v.action === 'saved' && v.savedTo ? `saved to ${v.savedTo.map(campaign).join(' and ')}`
    : v.action === 'edited' && v.changes.length ? `changed ${v.changes.slice(0, 3).map(c => c.label).join(', ')}${v.changes.length > 3 ? ` and ${v.changes.length - 3} more` : ''}`
      : ACTIONS[v.action]
  return <ol className="authoring-versions" aria-label="Versions">
    {versions.map((v, i) => <li key={v.event}>
      <button className="rail-link" aria-expanded={open === v.event} onClick={() => setOpen(open === v.event ? null : v.event)}>{new Date(v.at).toLocaleString()}</button>
      {' · '}{who(v)} {what(v)}{i === 0 ? ' (current)' : ''}
      {open === v.event && <div className="authoring-version-detail">
        {v.changes.length ? <ul>{v.changes.map((c, j) => <li key={j}><b>{c.label}</b>{': '}
          {c.change === 'added' ? <>added{c.after && c.after !== '—' ? <> <ins>{c.after}</ins></> : ''}</>
            : c.change === 'removed' ? <>removed{c.before && c.before !== '—' ? <> <del>{c.before}</del></> : ''}</>
              : c.before !== undefined ? <><del>{c.before}</del> → <ins>{c.after}</ins></> : 'changed'}
        </li>)}</ul> : <p className="authoring-notice">No content changes in this step.</p>}
        {v.revision !== d.revision && <button disabled={disabled} onClick={() => void perform(async () => receive(await call('restore_draft', { id: d.id, revision: d.revision, event: v.event })))}>Restore this version</button>}
      </div>}
    </li>)}
  </ol>
}
