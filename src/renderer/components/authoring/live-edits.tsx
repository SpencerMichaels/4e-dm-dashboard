// Live editing of a draft through an editor model (the creature editor, a kit statblock, the
// item editor). Each edit goes into the draft after a short pause, as field-level patches
// against the version the editor last saw. If the agent changed the draft meanwhile, the DM's edits
// apply on top of its changes: a field both changed keeps the DM's value (the agent's is in the
// history, and the agent is told what the DM changed when its own next edit is out of date).

import { useEffect, useRef, useState } from 'react'
import type { Change, Draft } from '@common/authoring/types'
import { stillApplicable } from '@common/authoring/merge'

/** clean: nothing pending. saving: an edit is on its way into the draft. stuck: it failed and needs the DM. */
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

export function useLiveEdits<V>(options: Options<V>) {
  // Timers outlive renders, so everything they touch is read through refs.
  const opts = useRef(options)
  opts.current = options
  const [value, setValue] = useState<V>(() => options.project(options.draft))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const s = useRef({
    base: options.draft,       // the version the editor model was last in sync with
    latest: value,             // the editor model, including edits not yet sent
    changed: false,
    running: false,
    retries: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  }).current

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
    if (!s.changed) return
    const sent = s.latest, from = s.base, to = opts.current.draft
    const changes = opts.current.diff(from, sent)
    if (!changes.length) { s.changed = false; status('clean'); return }
    // The agent changed the draft since: apply the DM's edits on top (still-applicable ones; the DM wins a shared field).
    if (to.revision !== from.revision && from.revision > 0) return send(changes.filter(c => stillApplicable(to, c)), to.revision, sent)
    return send(changes, from.revision, sent)
  }

  // Without edits of its own, the editor follows the draft (agent changes show up as they land).
  useEffect(() => { if (!s.changed && !s.running) sync(options.draft) }, [options.draft])
  // Leaving the editor sends what is left rather than dropping it.
  useEffect(() => () => { clearTimeout(s.timer); if (s.changed && !s.running) void flush() }, [])

  const edit = (next: V) => {
    s.latest = next; setValue(next); s.changed = true; setError(''); status('saving')
    schedule()
  }
  const discard = () => { s.changed = false; setError(''); status('clean'); sync(opts.current.draft) }

  const notice = error ? <p role="alert" className="authoring-error">Your last edit was not saved: {error} <button onClick={() => void flush()}>Try again</button> <button onClick={discard}>Undo it</button></p>
    : null
  return { value, edit, busy, notice, flush }
}
