import { Fragment, useEffect, useState, type ReactNode } from 'react'
import type { Draft } from '@common/authoring/types'
import { validate } from '@common/authoring/core'
import { allAnchorPaths, jsonPathTarget, targetLabel, within } from '@common/authoring/anchors'
import { firstSentence, openThread, SEVERITY, SeverityChip, Thread } from './DraftAnnotations'
import { Icon } from '../shared/Icon'
import { useAuthoringStore } from '../../stores/authoring-store'
import { useUiStore } from '../../stores/ui-store'
import type { EditStatus } from './live-edits'

interface Props {
  draft: Draft
  destinations: { type: string; id: string; name: string }[]
  busy: boolean
  /** Whether the editors' edits are in the draft yet. */
  editing: EditStatus
  perform: (fn: () => Promise<void>) => Promise<void>
  patch: (changes: { path: string; value: unknown }[], revision?: number, extra?: Record<string, unknown>) => Promise<void>
  saveStatus: { pending: boolean; targets: unknown[] }
  /** Monster drafts anchor comments in the stat block; other kinds discuss everything here. */
}

/** Points the whole-draft discussion at a field the stat block has no anchor for. */
export function commentOnDraft(target: string) {
  window.dispatchEvent(new CustomEvent('authoring-comment-on-draft', { detail: target }))
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/**
 * One Save button that says where it saves, one line naming what blocks it, and nothing
 * about checks that pass. Each blocker opens the one panel (or anchored thread) where it gets
 * fixed; pressing Save while blocked opens the first.
 */
export function StatusRail({ draft: d, destinations, busy, editing, perform, patch, saveStatus }: Props) {
  const receive = useAuthoringStore(s => s.receive)
  const setView = useUiStore(s => s.setView)
  const call = window.api.authoring.call
  const [panel, setPanel] = useState<string | null>(null)
  const [discussion, setDiscussion] = useState(false)
  const [generalTarget, setGeneralTarget] = useState('/')
  const [accepted, setAccepted] = useState(false)
  const [acceptedRevision, setAcceptedRevision] = useState(d.revision)
  const [copied, setCopied] = useState(false)
  // Save pressed while an edit was still going into the draft: save once it lands.
  const [queued, setQueued] = useState(false)
  if (acceptedRevision !== d.revision) { setAccepted(false); setAcceptedRevision(d.revision) }
  useEffect(() => {
    const listener = (e: Event) => {
      setGeneralTarget((e as CustomEvent<string>).detail); setDiscussion(true)
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('#rail-discussion textarea')?.focus())
    }
    window.addEventListener('authoring-comment-on-draft', listener)
    return () => window.removeEventListener('authoring-comment-on-draft', listener)
  }, [])

  const validation = validate(d.kind, d.content)
  const review = d.review
  const reviewCurrent = review?.revision === d.revision
  const findings = reviewCurrent ? review!.findings : []
  const weighty = findings.filter(f => f.severity !== 'info')
  const questions = d.comments.filter(c => c.question && !c.resolved)
  const paths = allAnchorPaths(d)
  const isAnchored = (target: string) => within(target, paths)
  const general = d.comments.filter(c => !isAnchored(c.target))
  const generalOpen = general.filter(c => !c.resolved).length
  const saved = d.receipt?.revision === d.revision
  // Mirrors the server gate: notes never need acknowledgement.
  const advisories = !reviewCurrent || weighty.length > 0 || validation.flags.length > 0
  const show = (target: string) => { if (isAnchored(target)) openThread(target); else { setDiscussion(true); setGeneralTarget('/') } }
  const toggle = (name: string) => setPanel(p => p === name ? null : name)
  const destinationName = (x: { type: string; id: string }) => destinations.find(y => y.type === x.type && y.id === x.id)?.name ?? 'a missing campaign'
  const where = d.destinations.map(destinationName).join(' and ')
  // Picking a campaign anew writes a new entry there; keeping one keeps updating the entry it saved.
  const toggleDestination = (dest: { type: string; id: string }, selected: boolean) => perform(() => patch([{ path: '/destinations', value: selected ? [...d.destinations, { type: dest.type, id: dest.id }] : d.destinations.filter(x => x.type !== dest.type || x.id !== dest.id) }]))
  const reviewSummary = (['high', 'concern', 'info'] as const).map(s => [s, findings.filter(f => f.severity === s).length] as const).filter(([, n]) => n).map(([s, n]) => `${n} ${n === 1 ? SEVERITY[s].label.toLowerCase() : SEVERITY[s].plural}`).join(', ')

  // Each blocker: a short label, and either an action or the panel where it gets fixed.
  const blockers: { name: string; label: string; open?: () => void; detail?: ReactNode }[] = []
  if (editing === 'stuck') blockers.push({ name: 'edits', label: 'an edit is not saved', open: () => document.querySelector('.authoring-main [role=alert]')?.scrollIntoView({ block: 'center' }) })
  if (validation.errors.length) blockers.push({ name: 'errors', label: plural(validation.errors.length, 'error'),
    detail: validation.errors.map((e, i) => { const t = jsonPathTarget(d, e.path); return <button key={i} className="rail-link" onClick={() => show(t)}><b>{targetLabel(d, t)}</b>: {e.message}</button> }) })
  if (d.stale.length) blockers.push({ name: 'stale', label: `check ${plural(d.stale.length, 'edited entry', 'edited entries')}`,
    detail: <><p className="authoring-notice">Your edit changed the text; confirm its rules metadata (what the combat tracker automates) still matches.</p>
      {d.stale.map(path => <div key={path} className="rail-item"><b>{targetLabel(d, path)}</b>
        <button disabled={busy || !!validation.errors.length || editing !== 'clean'} title="The rules metadata still matches the edited text" onClick={() => void perform(() => patch([], d.revision, { reconciled: [path] }))}>Looks right</button>
        <button disabled={busy} title="Leave the agent a question to update the metadata" onClick={() => void perform(async () => receive(await call('comment', { id: d.id, target: path, text: 'Please reconcile the edited prose and metadata, preserving my intent.', question: true })))}>Ask agent</button></div>)}</> })
  if (questions.length) blockers.push({ name: 'questions', label: plural(questions.length, 'open question'),
    ...(questions.length === 1 ? { open: () => show(questions[0].target) } : { detail: questions.map(c => <button key={c.id} className="rail-link" onClick={() => show(c.target)}><b>{targetLabel(d, c.target)}</b>: {firstSentence(c.text)}</button>) }) })
  if (!d.destinations.length) blockers.push({ name: 'destination', label: destinations.length ? 'choose a campaign' : 'no campaign to save to' })
  if (advisories && !accepted) blockers.push({ name: 'review', label: !review ? 'no balance review' : !reviewCurrent ? 'review is outdated' : weighty.length ? `accept ${plural(weighty.length, 'finding')}` : 'accept numeric flags' })

  const save = () => perform(async () => {
    // The newest version: an edit may have landed since this render.
    const latest = useAuthoringStore.getState().drafts[d.id] ?? d
    receive(await call('approve', { id: latest.id, revision: latest.revision, event: latest.event, acceptedAdvisories: accepted || saved }))
  })
  const press = () => {
    if (saved || busy) return
    if (editing === 'saving') { setQueued(true); return }
    const first = blockers[0]
    if (first) { if (first.open) first.open(); else setPanel(first.name); return }
    void save()
  }
  useEffect(() => { if (queued && editing !== 'saving') { setQueued(false); if (editing === 'clean') press() } }, [queued, editing, d.event])

  const destinationPicker = <div className="rail-panel">
    {destinations.length ? destinations.map(dest => <label key={`${dest.type}/${dest.id}`}><input type="checkbox" disabled={busy || editing === 'stuck'} checked={d.destinations.some(x => x.type === dest.type && x.id === dest.id)} onChange={e => void toggleDestination(dest, e.target.checked)} />{dest.name}</label>)
      : <p>No campaigns yet. <button className="rail-link" onClick={() => setView({ type: 'home' })}>Create one on Home</button>, then save here.</p>}
  </div>
  const reviewPanel = <div className="rail-panel">
    {findings.map((f, i) => <button key={i} className="rail-link" onClick={() => show(f.target)}><SeverityChip severity={f.severity} /> <b>{targetLabel(d, f.target)}</b>: {firstSentence(f.message)}</button>)}
    {!reviewCurrent && <p>{review ? 'The review is for an earlier version. Ask the agent for a fresh one, or accept without it.' : 'Ask the agent for a balance review, or accept without one.'}</p>}
    {validation.flags.map((f, i) => <p key={`flag${i}`}>{f.message}</p>)}
    {review?.assumptions && reviewCurrent && <details><summary>Assumptions</summary><p>{review.assumptions}</p></details>}
    {advisories && <label className="rail-accept"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> Accept as designed</label>}
  </div>
  const showReviewLine = !!review && (!reviewCurrent || findings.length > 0) && !blockers.some(b => b.name === 'review')
  const blockedTitle = blockers.length ? `Not ready to save: ${blockers.map(b => b.label).join(', ')}` : undefined

  return <aside className="authoring-rail">
    <div className="rail-approve">
      <button className="authoring-approve" aria-disabled={saved || !!blockers.length} disabled={busy} title={blockedTitle} onClick={press}>
        {saved ? 'Saved' : queued ? 'Saving…' : d.destinations.length ? `Save to ${where}` : 'Save'}
      </button>
      <details className="rail-menu"><summary aria-label="More actions" title="More actions"><Icon name="ellipsis" style={{ verticalAlign: '-0.125em' }} /></summary><div className="rail-menu-items">
        <button disabled={busy} title="Leaves a comment asking your connected agent to revise; it does not start a model" onClick={() => void perform(async () => receive(await call('comment', { id: d.id, target: '/', text: 'Please read the current draft and DM edits, address unresolved feedback, and submit a fresh balance review.', question: false })))}>Request agent revision</button>
        <button onClick={() => toggle('destination')}>Choose campaigns…</button>
        <button onClick={() => void navigator.clipboard.writeText(JSON.stringify(d, null, 2)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) })}>{copied ? 'Copied' : 'Copy draft JSON'}</button>
      </div></details>
    </div>
    <p className="rail-status">
      {saved ? <>Saved to <button className="rail-link" aria-expanded={panel === 'destination'} onClick={() => toggle('destination')}>{where}</button></>
        : <>{d.receipt ? 'Changed since last save' : 'Not saved yet'}{editing === 'saving' ? ' · saving your edit…' : ''}
          {blockers.length ? blockers.map(b => <Fragment key={b.name}>{' · '}
            <button className="rail-link" aria-expanded={panel === b.name} onClick={() => b.open ? b.open() : toggle(b.name)}>{b.label}</button></Fragment>)
            : <>{' · '}saves to <button className="rail-link" aria-expanded={panel === 'destination'} onClick={() => toggle('destination')}>{where}</button></>}</>}
    </p>
    {panel === 'destination' ? destinationPicker : panel === 'review' ? reviewPanel
      : panel && blockers.find(b => b.name === panel)?.detail && <div className="rail-panel">{blockers.find(b => b.name === panel)!.detail}</div>}
    {saveStatus.pending && <div role="alert" className="rail-panel"><p>The last save did not finish. Save again to finish it, or stop it to keep editing.</p><button disabled={busy} title="Entries already written are kept" onClick={() => void perform(async () => receive(await call('abandon_save', { id: d.id })))}>Stop saving</button></div>}

    {showReviewLine && <p className="rail-status"><button className="rail-link" aria-expanded={panel === 'review'} onClick={() => toggle('review')}>{reviewCurrent ? `Review: ${reviewSummary}` : 'Review is for an earlier version'}</button></p>}

    <div id="rail-discussion" className="rail-discussion">
      <button className="rail-link" aria-expanded={discussion} onClick={() => setDiscussion(!discussion)}>
        <Icon name={discussion ? 'chevron-down' : 'chevron-right'} style={{ verticalAlign: '-0.125em' }} /> Discussion{generalOpen ? ` (${generalOpen} open)` : general.length ? ` (${general.length})` : ''}
      </button>
      {discussion && <>
        {generalTarget !== '/' && <p className="authoring-notice">On <b>{targetLabel(d, generalTarget)}</b> · <button className="rail-link" onClick={() => setGeneralTarget('/')}>whole draft</button></p>}
        <Thread draft={d} anchor={{ target: generalTarget, label: 'Whole draft', paths: [] }} comments={general} findings={reviewCurrent ? findings.filter(f => !isAnchored(f.target)) : []} />
      </>}
    </div>
  </aside>
}
