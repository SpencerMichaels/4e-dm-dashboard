// Readable differences between two versions of a draft's content: "Shadow Touch › hit:
// 1d6 + 4 → 1d8 + 4", "Added power Grasping Dark". Entries in node groups (powers, traits,
// ...) are matched by their stable node IDs, so a reorder or rename is not a remove and add.

import type { Draft, FieldChange } from './types'
import { NODE_GROUPS } from './patch'

type Version = Pick<Draft, 'content' | 'nodes'>

const LABELS: Record<string, string> = {
  hp: 'HP', xp: 'XP', ac: 'AC', savingThrowBonus: 'saving throws', actionPoints: 'action points', skillNotes: 'skill notes',
  description: 'notes', immune: 'immunities', resist: 'resistances', vulnerable: 'vulnerabilities', hpPerLevel: 'HP per level',
  rankChange: 'rank change', extraLines: 'extra lines', failedSaves: 'failed saving throws', usesPerEncounter: 'uses per encounter',
}
const SINGULAR: Record<string, string> = { powers: 'power', traits: 'trait', auras: 'aura', stages: 'stage', properties: 'property', countermeasures: 'countermeasure' }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isLine = (v: any) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.text === 'string' && Array.isArray(v.clauses)
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** "savingThrowBonus" -> "saving throws", "fortitude" -> "fortitude", "hitText" -> "hit text". */
export function fieldLabel(key: string): string {
  return LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

/** A short readable value: text for lines, names for entries, compact JSON otherwise. */
export function showValue(v: unknown, max = 160): string {
  let s: string
  if (v === undefined || v === null || v === '') s = '—'
  else if (typeof v === 'string') s = v
  else if (typeof v === 'number' || typeof v === 'boolean') s = String(v)
  else if (isLine(v)) s = (v as { text: string }).text || '—'
  else if (isObject(v) && typeof v.name === 'string') s = v.name
  else if (Array.isArray(v) && v.every(x => typeof x === 'string' || typeof x === 'number')) s = v.length ? v.join(', ') : '—'
  else s = JSON.stringify(v)
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/** Name of an entry within its parent: a power's attack is "primary attack", array items count from 1. */
function partLabel(key: string, value: unknown, parentKey?: string): string {
  if (/^\d+$/.test(key)) {
    if (isObject(value) && typeof value.label === 'string') return `${value.label} ${parentKey === 'attacks' ? 'attack' : ''}`.trim()
    return `${parentKey ? fieldLabel(parentKey).replace(/s$/, '') : 'entry'} ${Number(key) + 1}`
  }
  return fieldLabel(key)
}

function walk(a: unknown, b: unknown, label: string[], out: FieldChange[], parentKey?: string) {
  if (same(a, b)) return
  const at = label.join(' › ') || 'content'
  if (isLine(a) && isLine(b)) {
    if ((a as any).text !== (b as any).text) out.push({ label: at, change: 'changed', before: showValue(a), after: showValue(b) })
    else out.push({ label: `${at} (rules metadata)`, change: 'changed' })
    return
  }
  if (isObject(a) && isObject(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const next = [...label, partLabel(key, b[key] ?? a[key], parentKey)]
      if (!(key in a)) out.push({ label: next.join(' › '), change: 'added', after: showValue(b[key]) })
      else if (!(key in b)) out.push({ label: next.join(' › '), change: 'removed', before: showValue(a[key]) })
      else walk(a[key], b[key], next, out, key)
    }
    return
  }
  // Same-length arrays of objects (attacks, stages of a line) compare item by item; anything else is one change.
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.some(x => x && typeof x === 'object')) {
    // The item label names the list ("primary attack", "failed saving throw 2"), so it replaces the list's own.
    a.forEach((x, i) => walk(x, b[i], [...label.slice(0, -1), partLabel(String(i), b[i], parentKey)], out))
    return
  }
  out.push({ label: at, change: 'changed', before: showValue(a), after: showValue(b) })
}

/** What changed from `before` to `after`, in content order, at most `limit` entries. */
export function describeChanges(before: Version, after: Version, limit = 60): FieldChange[] {
  const out: FieldChange[] = []
  const a = before.content as unknown as Record<string, unknown>, b = after.content as unknown as Record<string, unknown>
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key === 'id' || key === 'provenance') continue
    const ids = { before: before.nodes[key], after: after.nodes[key] }
    if (NODE_GROUPS.includes(key) && ids.before && ids.after) {
      const one = SINGULAR[key] ?? key
      const entries = { before: (a[key] ?? []) as any[], after: (b[key] ?? []) as any[] }
      const name = (e: any, i: number) => e?.name ?? e?.label ?? (key === 'stages' ? `stage ${e?.stage ?? i + 1}` : `${one} ${i + 1}`)
      ids.after.forEach((id, i) => {
        const j = ids.before.indexOf(id)
        if (j < 0) out.push({ label: `${one} ${name(entries.after[i], i)}`, change: 'added' })
        else walk(entries.before[j], entries.after[i], [name(entries.after[i], i)], out)
      })
      ids.before.forEach((id, j) => { if (!ids.after.includes(id)) out.push({ label: `${one} ${name(entries.before[j], j)}`, change: 'removed' }) })
      const kept = ids.after.filter(id => ids.before.includes(id))
      if (!same(kept, ids.before.filter(id => ids.after.includes(id)))) out.push({ label: `order of ${fieldLabel(key)}`, change: 'changed' })
      continue
    }
    if (!(key in a)) out.push({ label: fieldLabel(key), change: 'added', after: showValue(b[key]) })
    else if (!(key in b)) out.push({ label: fieldLabel(key), change: 'removed', before: showValue(a[key]) })
    else walk(a[key], b[key], [fieldLabel(key)], out, key)
  }
  return out.slice(0, limit).map(c => ({ ...c, label: c.label[0].toUpperCase() + c.label.slice(1) }))
}

const DRAFT_FIELDS = { intent: 'Design intent', decisions: 'Decisions', recipe: 'Numeric recipe' } as const

/** Content changes plus the draft's own fields (intent, decisions, recipe, campaigns). */
export function describeDraftChanges(before: Draft, after: Draft, limit = 60): FieldChange[] {
  const out = describeChanges(before, after, limit)
  for (const [key, label] of Object.entries(DRAFT_FIELDS) as [keyof typeof DRAFT_FIELDS, string][]) {
    if (!same(before[key], after[key])) out.push({ label, change: 'changed', before: showValue(before[key]), after: showValue(after[key]) })
  }
  const campaigns = (d: Draft) => d.destinations.map(x => x.id).sort()
  if (!same(campaigns(before), campaigns(after))) out.push({ label: 'Campaigns to save to', change: 'changed' })
  return out.slice(0, limit)
}
