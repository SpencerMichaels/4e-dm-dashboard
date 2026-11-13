import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Comment, Draft, Finding } from '@common/authoring/types'
import { entryAnchorTarget, statAnchorTarget, targetLabel, within, type AnchorTarget } from '@common/authoring/anchors'
import { AnnotationContext, type Anchor } from '../creature/annotations'
import { useAuthoringStore } from '../../stores/authoring-store'

/** How much a review finding worries the reviewer. All findings are advisory; the DM decides. */
export const SEVERITY: Record<Finding['severity'], { label: string; plural: string; help: string }> = {
  info: { label: 'Note', plural: 'notes', help: 'An observation or check result. Nothing needs to change.' },
  concern: { label: 'Risk', plural: 'risks', help: 'A balance or rules risk worth weighing. You can accept it as designed.' },
  high: { label: 'Problem', plural: 'problems', help: 'Probably too strong, too weak, or unclear at the table. Change it or accept it deliberately.' },
}
export function SeverityChip({ severity }: { severity: Finding['severity'] }) {
  return <span className={`severity-chip severity-${severity}`} title={SEVERITY[severity].help}><span aria-hidden>{MARKS[severity].icon} </span>{SEVERITY[severity].label}</span>
}

/** Provides comment markers to the stat block viewer/editor; one thread is open at a time. Disabled (an unsaved draft), it renders none but keeps the tree stable. */
export function DraftAnnotations({ draft, enabled = true, children }: { draft: Draft; enabled?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null)
  const annotate = useCallback((anchor: Anchor) => {
    const t = anchor.kind === 'stat' ? statAnchorTarget(anchor.key) : entryAnchorTarget(draft, anchor.entry as any)
    return t ? <AnchorMarker draft={draft} anchor={t} open={open === t.target} setOpen={v => setOpen(v ? t.target : null)} /> : null
  }, [draft, open])
  // Other parts of the workshop (the status rail) open threads by target.
  useEffect(() => {
    const listener = (e: Event) => setOpen((e as CustomEvent<string>).detail)
    window.addEventListener('authoring-open-thread', listener)
    return () => window.removeEventListener('authoring-open-thread', listener)
  }, [])
  return <AnnotationContext.Provider value={enabled ? annotate : null}>{children}</AnnotationContext.Provider>
}

/** Opens the anchored thread for a target and scrolls it into view. */
export function openThread(target: string) {
  window.dispatchEvent(new CustomEvent('authoring-open-thread', { detail: target }))
  requestAnimationFrame(() => document.querySelector('.annotation-thread')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}

/** What a marker shows, most urgent first; each kind has one icon, also used on thread tags. */
export const MARKS = {
  question: { icon: '?', one: 'open question', many: 'open questions' },
  high: { icon: '‼', one: 'problem', many: 'problems' },
  concern: { icon: '!', one: 'risk', many: 'risks' },
  comment: { icon: '💬', one: 'open comment', many: 'open comments' },
  info: { icon: 'i', one: 'note', many: 'notes' },
} as const

function AnchorMarker({ draft, anchor, open, setOpen }: { draft: Draft; anchor: AnchorTarget; open: boolean; setOpen: (open: boolean) => void }) {
  const comments = draft.comments.filter(c => within(c.target, anchor.paths))
  const findings = draft.review?.revision === draft.revision ? (draft.review.findings ?? []).filter(f => within(f.target, anchor.paths)) : []
  const unresolved = comments.filter(c => !c.resolved)
  const counts: Record<keyof typeof MARKS, number> = {
    question: unresolved.filter(c => c.question).length,
    high: findings.filter(f => f.severity === 'high').length,
    concern: findings.filter(f => f.severity === 'concern').length,
    comment: unresolved.filter(c => !c.question).length,
    info: findings.filter(f => f.severity === 'info').length,
  }
  const kinds = (Object.keys(MARKS) as (keyof typeof MARKS)[]).filter(k => counts[k])
  const title = kinds.map(k => `${counts[k]} ${counts[k] === 1 ? MARKS[k].one : MARKS[k].many}`).join(', ') || `Comment on ${anchor.label}`
  return <>
    <button type="button" className={`annotation-marker${kinds.length ? ' has-items' : ''}${open ? ' open' : ''}`}
      aria-expanded={open} aria-label={`${anchor.label}: ${title}`} title={title} onClick={e => { e.stopPropagation(); setOpen(!open) }}>
      {kinds.length ? kinds.map(k => <span key={k} className={`mark mark-${k}`} aria-hidden>{MARKS[k].icon}</span>) : '+'}
    </button>
    {open && <Thread draft={draft} anchor={anchor} comments={comments} findings={findings} close={() => setOpen(false)} />}
  </>
}

/** A comment thread: a popover beside its anchor, or inline (`close` omitted) for whole-draft discussion. */
export function Thread({ draft, anchor, comments, findings, close }: { draft: Draft; anchor: AnchorTarget; comments: Comment[]; findings: Finding[]; close?: () => void }) {
  const receive = useAuthoringStore(s => s.receive)
  const [text, setText] = useState('')
  const [question, setQuestion] = useState(false)
  const [replyTo, setReplyTo] = useState<Comment | undefined>()
  const [focused, setFocused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [expanded, setExpanded] = useState<string[]>([])
  const box = useRef<HTMLTextAreaElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  // An empty popover opens ready to type; one with discussion opens for reading.
  useEffect(() => { if (replyTo || (close && !comments.length && !findings.length)) box.current?.focus() }, [replyTo])
  useEffect(() => {
    if (!close) return
    const outside = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('.annotation-marker')) close() }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [close])
  const call = async (args: Record<string, unknown>) => {
    setBusy(true); setError('')
    try { receive(await window.api.authoring.call('comment', { id: draft.id, ...args })); return true }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return false }
    finally { setBusy(false) }
  }
  const submit = async () => {
    if (!text.trim()) return
    const ok = await call(replyTo ? { replyTo: replyTo.id, target: replyTo.target, text } : { target: anchor.target, text, question })
    if (ok) { setText(''); setQuestion(false); setReplyTo(undefined) }
  }
  const toggle = (key: string) => setExpanded(x => x.includes(key) ? x.filter(i => i !== key) : [...x, key])
  // Newest first, so recent discussion sits right under the comment box.
  const visible = comments.filter(c => showResolved || !c.resolved).sort((a, b) => b.revision - a.revision || b.at.localeCompare(a.at))
  const resolvedCount = comments.length - comments.filter(c => !c.resolved).length
  const composing = focused || !!text || !!replyTo
  return <div ref={ref} className={close ? 'annotation-thread' : 'annotation-thread inline'} role={close ? 'dialog' : undefined} aria-label={`Comments on ${anchor.label}`}
    onClick={e => e.stopPropagation()} onKeyDown={e => { if (close && e.key === 'Escape') { e.stopPropagation(); close() } }}>
    {close && <header><b>{anchor.label}</b><button type="button" aria-label="Close" onClick={close}>×</button></header>}
    <form className={composing ? 'composing' : ''} onSubmit={e => { e.preventDefault(); void submit() }}>
      {replyTo && <small>Replying to {replyTo.author} · <button type="button" className="annotation-link" onClick={() => setReplyTo(undefined)}>cancel</button></small>}
      <textarea ref={box} rows={composing ? 3 : 1} value={text} aria-label={replyTo ? 'Reply' : `Comment on ${anchor.label}`} placeholder={replyTo ? 'Reply…' : 'Comment…'} title="Ctrl+Enter to send"
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={e => setText(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit() } }} />
      {composing && <div className="annotation-actions">
        {!replyTo && <button type="button" className={`annotation-toggle${question ? ' on' : ''}`} aria-pressed={question} title="Blocks approval until you resolve it"
          onMouseDown={e => e.preventDefault()} onClick={() => setQuestion(!question)}>{question ? '✓ ' : ''}Needs an answer</button>}
        <button disabled={busy || !text.trim()} onMouseDown={e => e.preventDefault()}>{replyTo ? 'Reply' : 'Send'}</button>
      </div>}
      {error && <p className="authoring-error" role="alert">{error}</p>}
    </form>
    {findings.map((f, i) => <details key={`f${i}`} className={`annotation-finding severity-${f.severity}`}>
      <summary><SeverityChip severity={f.severity} /> {firstSentence(f.message)}</summary>
      {f.message !== firstSentence(f.message) && <p>{f.message}</p>}{f.suggestion && <p><b>Suggestion:</b> {f.suggestion}</p>}
    </details>)}
    {visible.map(c => {
      const open = expanded.includes(c.id)
      const short = firstSentence(c.text)
      const replies = c.replies.filter(r => r.text)
      const repliesOpen = expanded.includes(c.id + '/replies')
      const where = subPath(draft, anchor, c.target)
      return <article key={c.id} className={c.resolved ? 'resolved' : c.question ? 'question' : ''}>
        <p className="annotation-text" onClick={() => short !== c.text && toggle(c.id)} title={short !== c.text && !open ? 'Show all' : undefined}>
          <b className="annotation-author">{c.author === 'dm' ? 'You' : 'Agent'}</b>{where && <span className="annotation-where"> on {where}</span>}{' '}
          {open ? c.text : short}{!open && short !== c.text && <span className="annotation-more"> …</span>}
        </p>
        {replies.length > 1 && !repliesOpen && <button type="button" className="annotation-link annotation-reply" onClick={() => toggle(c.id + '/replies')}>{replies.length - 1} earlier {replies.length === 2 ? 'reply' : 'replies'}</button>}
        {(repliesOpen ? replies : replies.slice(-1)).map((r, i) => {
          const key = `${c.id}/r${i}`, rs = firstSentence(r.text), ro = expanded.includes(key)
          return <p key={i} className="annotation-text annotation-reply" onClick={() => rs !== r.text && toggle(key)}><b className="annotation-author">{r.author === 'dm' ? 'You' : 'Agent'}</b> {ro ? r.text : rs}{!ro && rs !== r.text && <span className="annotation-more"> …</span>}</p>
        })}
        {!c.resolved && <div className="annotation-actions annotation-inline-actions">
          {c.question && <span className="annotation-flag" title="Blocks approval until resolved"><span aria-hidden>? </span>needs an answer</span>}
          <button type="button" className="annotation-link" onClick={() => setReplyTo(c)}>Reply</button>
          <button type="button" className="annotation-link" disabled={busy} onClick={() => void call({ replyTo: c.id, target: c.target, text: '', resolve: true })}>Resolve</button>
        </div>}
      </article>
    })}
    {resolvedCount > 0 && <button type="button" className="annotation-link" onClick={() => setShowResolved(!showResolved)}>{showResolved ? 'Hide' : 'Show'} {resolvedCount} resolved</button>}
  </div>
}

export const firstSentence = (s: string) => { const m = s.match(/^.{20,}?[.!?](\s|$)/); return m ? m[0].trim() : s }
/** Where in the anchor a comment points: "attacks › 0 › hit", "ac", or nothing for the anchor itself. */
function subPath(draft: Draft, anchor: AnchorTarget, target: string) {
  if (target === anchor.target) return ''
  const base = anchor.paths.find(p => target === p || target.startsWith(p + '/'))
  if (!base) return targetLabel(draft, target)
  return (target === base ? base.split('/').pop()! : target.slice(base.length + 1)).replace(/\//g, ' › ')
}
