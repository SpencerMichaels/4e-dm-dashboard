import { SCHEMA_VERSION } from '@kit'
import type { Change, ContentKind, Draft } from './types'
import { POLICY, scaffold } from './core'
import { applyPatch, NODE_GROUPS } from './patch'

const NAMES: Record<ContentKind, string> = { monster: 'New Creature', item: 'New Item', trap: 'New Trap', disease: 'New Disease', template: 'New Template', theme: 'New Theme' }

/** A draft that exists only in the Workshop until its first edit, like a new compendium creature. */
export function unsavedDraft(kind: ContentKind): Draft {
  const content = scaffold(kind, NAMES[kind], 1)
  const nodes = Object.fromEntries(NODE_GROUPS.filter(g => Array.isArray((content as any)[g])).map(g => [g, [] as string[]]))
  return { version: 1, schemaVersion: SCHEMA_VERSION, id: 'unsaved', kind, revision: 0, event: 0, createdAt: '', updatedAt: '', content, intent: '', decisions: '', policy: POLICY, nodes, overrides: [], stale: [], destinations: [], comments: [] }
}

export const isUnsaved = (d: Draft) => d.revision === 0

/** The content an unsaved draft is created with: the scaffold plus the edits that prompted creating it. */
export function contentWith(d: Draft, changes: Change[]) {
  let n = 0
  return applyPatch(d, { id: d.id, revision: d.revision, changes }, 'dm', () => `new-${++n}`).content
}
