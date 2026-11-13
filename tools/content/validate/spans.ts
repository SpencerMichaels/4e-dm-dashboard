// Span validation: every clause's `at` lies inside its Line.text, and the
// spanned text plausibly states the clause (its keyword or number is there).

import type { Clause, Line } from '@kit'
import type { Issue } from './shape'

const CONDITION_WORDS: Record<string, RegExp> = {
  'removed-from-play': /removed from play/i,
  'dying': /dying|0 hit points/i,
  'surprised': /surprise/i,
}

function compactDice(s: string): string {
  return s.replace(/\s+/g, '').replace(/−/g, '-').toLowerCase()
}

/** Why the spanned text does not support the clause, or undefined when it does. */
export function spanProblem(clause: Clause, span: string): string | undefined {
  const s = span.toLowerCase()
  const has = (re: RegExp | string) => typeof re === 'string' ? s.includes(re) : re.test(span)
  const num = (n: number) => new RegExp(`(?<!\\d)${n}(?!\\d)`).test(span)
  switch (clause.kind) {
    case 'damage':
      if (!compactDice(span).includes(compactDice(clause.dice))) return `dice "${clause.dice}" not in span`
      if (!has('damage')) return 'no "damage" in span'
      for (const t of clause.types) if (!has(t)) return `type "${t}" not in span`
      return
    case 'damage-formula':
      return has('damage') || compactDice(span).includes(compactDice(clause.text)) ? undefined : 'formula not in span'
    case 'half-damage': return has('half') ? undefined : 'no "half" in span'
    case 'ongoing-damage':
      if (!has('ongoing')) return 'no "ongoing" in span'
      return num(clause.amount) ? undefined : `amount ${clause.amount} not in span`
    case 'condition': {
      const re = CONDITION_WORDS[clause.condition] ?? new RegExp(clause.condition.replace(/ed$/, ''), 'i')
      return re.test(span) ? undefined : `condition "${clause.condition}" not in span`
    }
    case 'grants-ca': return has('combat advantage') ? undefined : 'no "combat advantage" in span'
    case 'forced-move':
      if (!has(clause.move)) return `no "${clause.move}" in span`
      return num(clause.squares) || clause.squares === 1 ? undefined : `${clause.squares} squares not in span`
    case 'move': return has(clause.move) || (clause.move === 'swap' && has(/swap|switch|trade/i)) ? undefined : `no "${clause.move}" in span`
    case 'modifier': return num(Math.abs(clause.value)) ? undefined : `value ${clause.value} not in span`
    case 'resistance': return has('resist') ? undefined : 'no "resist" in span'
    case 'vulnerability': return has('vulnerab') ? undefined : 'no "vulnerable" in span'
    case 'heal': return has(/regain|heal|hit points|healing surge/i) ? undefined : 'no healing words in span'
    case 'temp-hp': return has('temporary') ? undefined : 'no "temporary" in span'
    case 'regeneration': return has('regenerat') || has('regain') ? undefined : 'no "regeneration" in span'
    case 'revive': return num(clause.hp) ? undefined : `hp ${clause.hp} not in span`
    case 'unparsed':
      return span.replace(/\s+/g, ' ').trim() === clause.text.replace(/\s+/g, ' ').trim() ? undefined : 'unparsed text differs from span'
  }
}

export function checkLineSpans(l: Line, path: string): Issue[] {
  const issues: Issue[] = []
  if (!l || typeof l.text !== 'string' || !Array.isArray(l.clauses)) return issues
  l.clauses.forEach((cl, i) => {
    const p = `${path}.clauses[${i}]`
    const [a, b] = Array.isArray(cl?.at) ? cl.at : [NaN, NaN]
    if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && a <= b && b <= l.text.length)) {
      issues.push({ path: p, message: `span [${a}, ${b}) outside text (length ${l.text.length})` })
      return
    }
    const problem = spanProblem(cl, l.text.substring(a, b))
    if (problem) issues.push({ path: p, message: `${cl.kind}: ${problem} ("${l.text.substring(a, b)}")` })
  })
  return issues
}

/** Walk any entry and check every Line (an object with string `text` and array `clauses`). */
export function checkSpans(entry: unknown): Issue[] {
  const issues: Issue[] = []
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return }
    if (typeof v !== 'object' || v === null) return
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string' && Array.isArray(o.clauses)) { issues.push(...checkLineSpans(o as unknown as Line, path)); return }
    for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`)
  }
  walk(entry, '$')
  return issues
}
