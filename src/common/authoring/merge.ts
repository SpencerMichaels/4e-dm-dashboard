// Merging the DM's editor changes onto a draft the agent changed meanwhile: patches are
// field-level, so only a field (or entry) both changed needs the DM to choose.

import type { Change, Draft } from './types'
import { readPath } from './patch'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** The DM's changes (made against `from`) to fields the agent also changed by `to`, to a different value. */
export function clashes(from: Draft, to: Draft, changes: Change[]): Change[] {
  return changes.filter(c => {
    const path = c.path.replace(/^\/unset/, '')
    if (path.startsWith('/append/') || path.startsWith('/remove/')) return false
    if (path.startsWith('/order/')) return !same(from.nodes[path.split('/')[2]], to.nodes[path.split('/')[2]])
    let was: unknown, theirs: unknown
    try { was = readPath(from, path) } catch { return false }
    try { theirs = readPath(to, path) } catch { return true } // the agent removed the entry
    return !same(was, theirs) && !same(theirs, c.path.startsWith('/unset/') ? undefined : c.value)
  })
}

/** Removing an entry the agent already removed is a no-op, not an error. */
export function stillApplicable(to: Draft, c: Change) {
  const m = c.path.match(/^\/remove\/(\w+)\/@(.+)$/)
  return !m || !!to.nodes[m[1]]?.includes(m[2])
}
