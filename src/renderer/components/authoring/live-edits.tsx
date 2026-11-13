// Live editing of a draft through an editor model (the creature editor, a kit statblock, the
// item editor). Each edit goes into the draft after a short pause, as field-level patches
// against the version the editor last saw. If the agent changed the draft meanwhile, edits to
// other fields merge on top of its changes; only a field both changed asks the DM to choose.

import { useEffect, useRef, useState } from 'react'
import type { Change, Draft } from '@common/authoring/types'
import { clashes, stillApplicable } from '@common/authoring/merge'
import { targetLabel } from '@common/authoring/anchors'

/** clean: nothing pending. saving: an edit is on its way into the draft. stuck: it needs the DM (a collision or an error). */
export type EditStatus = 'clean' | 'saving' | 'stuck'

const DELAY = 500

interface Options<V> {
  draft: Draft
  project: (d: Draft) => V
  diff: (base: Draft, value: V) => Change[]
  /** Applies field-level changes at a revision and returns the updated draft. */
  apply: (changes: Change[], revision: number) => Promise<Draft>
  status: (s: EditStatus) => void
}
interface Collision { labels: string[]; changes: Change[]; clashing: Change[]; revision: number }

export function useLiveEdits<V>(options: Options<V>) {
  // Timers outlive renders, so everything they touch is read through refs.
  const opts = useRef(options)
  opts.current = options
  const [value, setValue] = useState<V>(() => options.project(options.draft))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [collision, setCollisionState] = useState<Collision | null>(null)
  const s = useRef({
    base: options.draft,       // the version the editor model was last in sync with
    latest: value,             // the editor model, including edits not yet sent
    changed: false,
    running: false,
    retries: 0,
    collision: null as Collision | null,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  }).current

  const setCollision = (c: Collision | null) => { s.collision = c; setCollisionState(c) }
  const status = (x: EditStatus) => opts.current.status(x)
  const sync = (d: Draft) => { s.base = d; const v = opts.current.project(d); s.latest = v; setValue(v) }
  const schedule = (ms = DELAY) => { clearTimeout(s.timer); s.timer = setTimeout(() => void flush(), ms) }

  const send = async (changes: Change[], revision: number, sent: V) => {
    s.running = true; setBusy(true); setError('')
    let retry = false
    try {
      const result = await opts.current.apply(changes, revision)
      s.base = result; s.retries = 0
      if (s.latest === sent) { s.changed = false; status('clean'); sync(result) }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // Lost a race with an agent patch: the newer version is on its way; merge onto it.
      retry = /Revision conflict/.test(message) && s.retries++ < 3
      if (!retry) { setError(message); status('stuck') }
    } finally { s.running = false; setBusy(false) }
    if (retry) schedule(300)
    else if (s.changed && s.latest !== sent) schedule()
  }
  const flush = async (): Promise<void> => {
    clearTimeout(s.timer)
    if (s.running) { schedule(); return }
    if (!s.changed || s.collision) return
    const sent = s.latest, from = s.base, to = opts.current.draft
    const changes = opts.current.diff(from, sent)
    if (!changes.length) { s.changed = false; status('clean'); return }
    if (to.revision !== from.revision && from.revision > 0) {
      const clashing = clashes(from, to, changes)
      if (clashing.length) {
        setCollision({ labels: [...new Set(clashing.map(c => targetLabel(to, c.path.replace(/^\/(unset|order|remove)\//, '/content/'))))], changes, clashing, revision: to.revision })
        status('stuck'); return
      }
      return send(changes.filter(c => stillApplicable(to, c)), to.revision, sent)
    }
    return send(changes, from.revision, sent)
  }

  // Without edits of its own, the editor follows the draft (agent changes show up as they land).
  useEffect(() => { if (!s.changed && !s.running) sync(options.draft) }, [options.draft])
  // Leaving the editor sends what is left rather than dropping it.
  useEffect(() => () => { clearTimeout(s.timer); if (s.changed && !s.running && !s.collision) void flush() }, [])

  const edit = (next: V) => {
    s.latest = next; setValue(next); s.changed = true; setError(''); status('saving')
    if (!s.collision) schedule()
  }
  /** Same-field collision: keep the DM's values, or take the agent's for the fields both changed. */
  const resolve = (keepMine: boolean) => {
    const c = s.collision
    if (!c) return
    setCollision(null)
    const to = opts.current.draft
    const kept = (keepMine ? c.changes : c.changes.filter(x => !c.clashing.includes(x))).filter(x => stillApplicable(to, x))
    // Taking the agent's version drops the DM's value for those fields; the editor re-syncs after the rest applies.
    if (!keepMine) s.latest = opts.current.project(to)
    if (!kept.length) { s.changed = false; status('clean'); sync(to); return }
    void send(kept, c.revision, s.latest)
  }
  const discard = () => { s.changed = false; setCollision(null); setError(''); status('clean'); sync(opts.current.draft) }

  const notice = collision
    ? <p role="alert" className="authoring-collision">The agent also changed <b>{collision.labels.join(', ')}</b> while you were editing.{' '}
        <button onClick={() => resolve(true)}>Keep mine</button> <button onClick={() => resolve(false)}>Use the agent’s</button></p>
    : error ? <p role="alert" className="authoring-error">Your last edit was not saved: {error} <button onClick={() => void flush()}>Try again</button> <button onClick={discard}>Undo it</button></p>
      : null
  return { value, edit, busy, notice, flush }
}
