// The DM's edits to a line's printed text keep only the clauses the edit left alone. The edit is the
// one range where the old and new text differ (after trimming what they share at both ends); a clause
// is dropped when that range touches its words, its `if`/`unless` words, or the gap just before it
// (where the words naming who it hits usually sit: "..., and each enemy in the burst is slowed"). The
// gap runs back to the previous clause or the last , ; : or . before it, whichever is nearer, so
// changing the damage dice in "2d6 + 3 damage, and the target is slowed" keeps the slowed clause.
// A dropped clause takes its save group (one "save ends both") and its choice with it. Kept clauses
// shift by the change in length. Text left without clauses falls to the combat card's regex fallback
// until an agent fills them in. Agent patches re-anchor instead (quotes.ts `reanchorClauses`).

import type { Clause, Line } from '@kit'

/** The edit as one range of the old text, [start, end), and how much longer the new text is. */
export function changedRange(before: string, after: string): { start: number; end: number; delta: number } | undefined {
  if (before === after) return undefined
  const max = Math.min(before.length, after.length)
  let p = 0
  while (p < max && before[p] === after[p]) p++
  let s = 0
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++
  return { start: p, end: before.length - s, delta: after.length - before.length }
}

/** Whether the edit [start, end) touches the span [a, b): overlaps it, or (an insertion) lands inside it. */
const touches = (start: number, end: number, a: number, b: number) =>
  start === end ? a < start && start < b : start < b && end > a
/** Where the gap before a clause starts: the last , ; : or . in [from, to), or `from`. */
function gapStart(text: string, from: number, to: number): number {
  for (let i = to - 1; i >= from; i--) if (",;:.".includes(text[i]!)) return i
  return from
}

/** A gap [a, b] is touched by an edit anywhere in it, its ends included. */
const touchesGap = (start: number, end: number, a: number, b: number) => start <= b && end >= a

/** Where a printed fragment (`if`/`unless`) sits in the text, every occurrence. */
function fragmentRanges(text: string, fragment: string): [number, number][] {
  const out: [number, number][] = []
  if (!fragment.trim()) return out
  for (let i = text.indexOf(fragment); i >= 0; i = text.indexOf(fragment, i + 1)) out.push([i, i + fragment.length])
  return out
}

const list = (v: string | string[] | undefined) => v === undefined ? [] : Array.isArray(v) ? v : [v]
const saveGroup = (c: Clause) => (c as { saveGroup?: string }).saveGroup
const optionClauses = (c: Clause): Clause[] => c.kind === 'choice' ? c.options.flat() as Clause[] : []

/** Rebase `line.clauses` (in place) after the DM replaced `oldText` with `line.text`. */
export function rebaseClauses(oldText: string, line: Line): void {
  const edit = changedRange(oldText, line.text)
  if (!edit) return
  const { start, end, delta } = edit
  const clauses = line.clauses
  const order = clauses.map((c, i) => ({ c, i })).filter(x => x.c.at).sort((x, y) => x.c.at[0] - y.c.at[0])
  const touched = new Set<number>()
  let prevEnd = 0
  for (const { c, i } of order) {
    const [a, b] = c.at
    const spans: [number, number][] = [[a, b], ...optionClauses(c).filter(o => o.at).map(o => o.at)]
    const fragments = [...list(c.if), ...list(c.unless), ...optionClauses(c).flatMap(o => [...list(o.if), ...list(o.unless)])]
      .flatMap(f => fragmentRanges(oldText, f))
    if (spans.some(([x, y]) => touches(start, end, x, y)) || fragments.some(([x, y]) => touches(start, end, x, y))
      || touchesGap(start, end, gapStart(oldText, Math.min(prevEnd, a), a), a)) touched.add(i)
    prevEnd = Math.max(prevEnd, b)
  }
  // A touched clause takes its save group along.
  const groups = new Set(clauses.filter((c, i) => touched.has(i) && saveGroup(c)).map(saveGroup))
  clauses.forEach((c, i) => { if (saveGroup(c) && groups.has(saveGroup(c))) touched.add(i) })
  const shift = (at: [number, number]): [number, number] => at[0] >= end ? [at[0] + delta, at[1] + delta] : at
  line.clauses = clauses.filter((_, i) => !touched.has(i)).map(c => {
    if (!c.at) return c
    const moved = { ...c, at: shift(c.at) } as Clause
    if (moved.kind === 'choice') moved.options = moved.options.map(opt => opt.map(o => ({ ...o, at: shift(o.at) })))
    return moved
  })
}
