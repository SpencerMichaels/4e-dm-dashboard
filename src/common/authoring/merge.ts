// Applying the DM's editor changes onto a draft the agent changed meanwhile: patches are field-level,
// so they go on top of the agent's changes, and the DM's value wins a field both changed. Only changes
// that no longer have anywhere to go are dropped.

import type { Change, Draft } from './types'

/** False for a change to an entry that is gone (the agent removed it): removing it again, or editing inside it. */
export function stillApplicable(to: Draft, c: Change) {
  const m = c.path.match(/^\/(?:remove|content|unset\/content)\/(\w+)\/@([^/]+)/)
  return !m || !!to.nodes[m[1]]?.includes(m[2])
}
