import type { Draft, Patch, Actor } from './types'
import { normalizeContent, validate } from './core'
import { reanchorClauses } from './quotes'
import { rebaseClauses } from './clause-rebase'
import type { Line } from '@kit'

export const NODE_GROUPS = ['powers', 'traits', 'auras', 'stages', 'properties', 'countermeasures']
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const overlaps = (a: string, b: string) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/')

export function segments(path: string): string[] {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 1000) throw new Error('Expected an absolute field path')
  const keys = path.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'))
  if (keys.some(k => forbidden.has(k) || !k)) throw new Error('Invalid field path')
  return keys
}

export function readPath(draft: Draft, path: string): unknown {
  let value: any = draft
  for (const key of resolvePath(draft, path)) value = value?.[key]
  return value
}

function resolvePath(draft: Draft, path: string): string[] {
  const keys = segments(path)
  if (keys[0] === 'content' && draft.nodes[keys[1]] && keys.length > 2) {
    if (!keys[2].startsWith('@')) throw new Error('Use a stable @node ID, not an array index')
    const index = draft.nodes[keys[1]].indexOf(keys[2].slice(1))
    if (index < 0) throw new Error('Node no longer exists')
    keys[2] = String(index)
  }
  return keys
}

export function applyPatch(current: Draft, patch: Patch, actor: Actor, newId: () => string): Draft {
  if (patch.revision !== current.revision) throw new Error(`Revision conflict: expected ${current.revision}; fetch draft and rebase`)
  if (!Array.isArray(patch.changes) || patch.changes.length > 200) throw new Error('Expected at most 200 changes')
  const d: Draft = JSON.parse(JSON.stringify(current))
  if (actor !== 'dm' && patch.release?.length) throw new Error('Only the DM can release overrides')
  for (const path of patch.release ?? []) d.overrides = d.overrides.filter(p => p !== path)
  for (const change of patch.changes) {
    // "/unset/content/…" deletes an optional field (a cleared trigger or hit line, an unused speed).
    const unset = typeof change.path === 'string' && change.path.startsWith('/unset/')
    const path = unset ? change.path.slice('/unset'.length) : change.path
    const keys = segments(path)
    if (unset && keys[0] !== 'content') throw new Error('Only content fields can be unset')
    const group = keys[1]
    if (['append', 'remove', 'order'].includes(keys[0])) {
      if (!NODE_GROUPS.includes(group) || !d.nodes[group]) throw new Error('Unknown node group')
      const array = (d.content as any)[group] as unknown[]
      const root = `/content/${group}`
      if (keys[0] === 'append') {
        const position = keys[2] === undefined ? array.length : Number(keys[2])
        if (!Number.isInteger(position) || position < 0 || position > array.length) throw new Error('Invalid insertion position')
        const id = newId()
        array.splice(position, 0, normalizeContent(change.value)); d.nodes[group].splice(position, 0, id)
        if (actor === 'dm') {
          d.overrides.push(`${root}/@${id}`)
          d.stale.push(`${root}/@${id}`)
        }
      } else if (keys[0] === 'remove') {
        const index = d.nodes[group].indexOf(keys[2]?.replace(/^@/, ''))
        if (index < 0) throw new Error('Node no longer exists')
        const target = `${root}/@${d.nodes[group][index]}`
        if (actor === 'agent') d.overrides = d.overrides.filter(p => !overlaps(p, target))
        d.stale = d.stale.filter(p => !overlaps(p, target))
        array.splice(index, 1); d.nodes[group].splice(index, 1)
      } else {
        const ids = change.value as string[]
        if (!Array.isArray(ids) || ids.length !== array.length || new Set(ids).size !== ids.length || ids.some(id => !d.nodes[group].includes(id))) throw new Error('Order must contain every node ID exactly once')
        const reordered = !same(ids, d.nodes[group])
        ;(d.content as any)[group] = ids.map(id => array[d.nodes[group].indexOf(id)])
        d.nodes[group] = [...ids]
        if (actor === 'dm') d.overrides.push(`/order/${group}`)
        else if (reordered) d.overrides = d.overrides.filter(p => p !== `/order/${group}`)
      }
      continue
    }
    if (!['content', 'intent', 'decisions', 'recipe'].includes(keys[0])) throw new Error(keys[0] === 'destinations' ? 'A working copy stays in its campaign or the Library; copy the entry to put it elsewhere' : 'Field is not editable')
    if (keys[0] === 'content' && (keys.length < 2 || ['id', 'provenance'].includes(group) || (d.nodes[group] && keys.length === 2))) throw new Error('Edit individual content fields/nodes')
    if (keys[0] !== 'content' && keys.length !== 1) throw new Error('Replace this field as a whole')
    if (['intent', 'decisions'].includes(keys[0]) && typeof change.value !== 'string') throw new Error('Expected text')
    const resolved = resolvePath(d, path)
    let parent: any = d
    for (const k of resolved.slice(0, -1)) {
      if (parent[k] === undefined || parent[k] === null || typeof parent[k] !== 'object') throw new Error('Parent field does not exist')
      parent = parent[k]
    }
    const last = resolved.at(-1)!
    if (Array.isArray(parent) && (!/^\d+$/.test(last) || Number(last) >= parent.length)) throw new Error('Array element does not exist; replace the array or append a node')
    if (unset) {
      if (Array.isArray(parent)) throw new Error('Remove array elements by replacing the array or removing the node')
      if (!(last in parent)) continue
      delete parent[last]
    } else {
      if (same(parent[last], change.value)) continue
      const previous = parent[last]
      parent[last] = normalizeContent(change.value)
      if (keys[0] === 'content') {
        // An agent's prose edit keeps its clauses: spans move with the quoted words (the node is still
        // marked stale). The DM's keeps only the clauses the edit left alone (clause-rebase.ts).
        const linePath = path.replace(/\/text$/, '')
        const rebase = actor === 'dm' ? rebaseClauses : reanchorClauses
        if (last === 'text' && Array.isArray(parent.clauses) && typeof previous === 'string' && !patch.changes.some(c => overlaps(c.path, `${linePath}/clauses`))) rebase(previous, parent)
        else reanchorReplaced(previous, parent[last], rebase)
      }
    }
    // Overrides record what the DM authored; an agent revision of that field (or anything under it) supersedes the record.
    if (actor === 'dm' && !patch.release?.includes(path)) d.overrides.push(path)
    else if (actor === 'agent') d.overrides = d.overrides.filter(p => p !== path && !p.startsWith(path + '/'))
    if (keys[0] === 'content') {
      const target = d.nodes[group] ? keys.slice(0, 3).map(k => '/' + k).join('') : path
      if (d.nodes[group]) d.stale.push(target)
    }
  }
  // A clauses-only patch needs its owning Line.text to resolve quoted spans.
  d.content = normalizeContent(d.content)
  d.overrides = [...new Set(d.overrides)]
  d.stale = [...new Set(d.stale)]
  // Reconciliation is an explicit assertion bound to this patch. Shape/span checks still gate approval.
  for (const target of patch.reconciled ?? []) {
    if (validate(d.kind, d.content).errors.length) throw new Error('Fix validation errors before reconciling metadata')
    d.stale = d.stale.filter(p => p !== target)
  }
  d.revision++
  // The receipt stays: it records the last save, and `receipt.revision !== revision` means "changed since".
  return d
}

const isLine = (v: any) => v && typeof v === 'object' && typeof v.text === 'string' && Array.isArray(v.clauses)
/** In a replaced object, re-anchor each Line whose text changed but whose clauses were carried over unchanged. */
export function reanchorReplaced(before: any, after: any, rebase: (oldText: string, line: Line) => void = reanchorClauses) {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return
  if (isLine(before) && isLine(after)) { if (same(before.clauses, after.clauses)) rebase(before.text, after); return }
  for (const key of Object.keys(after)) reanchorReplaced(before[key], after[key], rebase)
}
