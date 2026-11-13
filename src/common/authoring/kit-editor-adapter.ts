// Workshop editing for kit-native statblock editors (traps, diseases, templates, themes).
// The editor edits a copy of the draft content whose node-group entries carry a hidden
// `_draftNode` (their stable draft ID). Applying diffs that copy against the base draft and
// sends only what changed, as field-level patches, like the creature adapter does.

import type { Change, Content, Draft } from './types'
import { NODE_GROUPS } from './patch'

const NODE = '_draftNode'
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Draft content for the editor, with each node-group entry tagged with its stable ID. */
export function decorate<T extends Content>(d: Draft): T {
  const c: any = structuredClone(d.content)
  for (const group of Object.keys(d.nodes)) if (Array.isArray(c[group])) c[group] = c[group].map((v: any, i: number) => ({ ...v, [NODE]: d.nodes[group][i] }))
  return c
}

/** Removes editor tags (at any depth) so values match the kit schema. */
export function strip<T>(value: T): T {
  if (Array.isArray(value)) return value.map(strip) as T
  if (!isObject(value)) return value
  return Object.fromEntries(Object.entries(value).filter(([k]) => k !== NODE).map(([k, v]) => [k, strip(v)])) as T
}

/**
 * Field-level changes from the base draft to the edited content.
 * Node groups use stable IDs: kept entries are diffed in place, removed ones removed,
 * reordering becomes /order, and new or duplicated entries are appended at their position.
 * A cleared optional field becomes /unset; a field never becomes undefined.
 */
export function kitEditorChanges(d: Draft, after: Content): Change[] {
  const changes: Change[] = []
  const before: any = d.content
  const next: any = after
  const set = (path: string, value: unknown) => changes.push({ path, value })

  // Leaf patches protect only edited fields; untouched siblings stay agent-editable.
  const diff = (x: any, y: any, path: string) => {
    if (equal(x, y)) return
    if (y === undefined) { changes.push({ path: '/unset' + path, value: null }); return }
    if (isObject(x) && isObject(y)) {
      for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) diff(x[key], y[key], `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`)
    } else if (Array.isArray(x) && Array.isArray(y) && x.length === y.length && /\/attacks$/.test(path)) {
      x.forEach((v, i) => diff(v, y[i], `${path}/${i}`))
    } else set(path, y)
  }

  for (const key of new Set([...Object.keys(before), ...Object.keys(next)])) {
    if (key === 'id' || key === 'provenance') continue
    if (d.nodes[key] && NODE_GROUPS.includes(key)) continue
    diff(before[key], strip(next[key]), `/content/${key}`)
  }

  for (const group of Object.keys(d.nodes)) {
    const ids = d.nodes[group]
    const used = new Set<string>()
    const entries = ((next[group] ?? []) as any[]).map(e => {
      const id = e?.[NODE]
      const kept = typeof id === 'string' && ids.includes(id) && !used.has(id)
      if (kept) used.add(id)
      return { e, id: kept ? id as string : undefined }
    })
    const kept = entries.flatMap(n => n.id ? [n.id] : [])
    for (const id of ids) if (!kept.includes(id)) changes.push({ path: `/remove/${group}/@${id}`, value: null })
    if (!equal(ids.filter(id => kept.includes(id)), kept)) changes.push({ path: `/order/${group}`, value: kept })
    entries.forEach(({ e, id }, index) => {
      const value = strip(e)
      if (!id) changes.push({ path: `/append/${group}/${index}`, value })
      else diff(before[group][ids.indexOf(id)], value, `/content/${group}/@${id}`)
    })
  }
  return changes
}
