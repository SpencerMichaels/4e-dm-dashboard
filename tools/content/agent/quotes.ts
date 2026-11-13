// Clause spans as quotes. Agents never count characters: a clause in a reply
// gives `quote: "<exact words from Line.text>"` and the apply step turns it
// into `at: [start, end)`. Briefs show existing clauses the same way.

import type { Line } from '@kit'

export interface QuoteError {
  /** JSON path of the clause ("$.powers[1].attacks[0].hit.clauses[2]"). */
  path: string
  message: string
}

/** Length-preserving normalization for matching: case, curly quotes, dashes. */
function fold(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[−–—]/g, '-')
}

/** Start of `quote` in `text`, searching from `from` first, then anywhere; -1 when absent. */
export function findQuote(text: string, quote: string, from: number): number {
  for (const [t, q] of [[text, quote], [fold(text), fold(quote)]]) {
    const after = t.indexOf(q, from)
    if (after >= 0) return after
    const anywhere = t.indexOf(q)
    if (anywhere >= 0) return anywhere
  }
  return -1
}

function isLine(o: Record<string, unknown>): o is Record<string, unknown> & Line {
  return typeof o.text === 'string' && Array.isArray(o.clauses)
}

/** Visit every Line (an object with string `text` and array `clauses`) with its JSON path. */
export function forEachLine(entry: unknown, visit: (line: Line, path: string) => void): void {
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return }
    if (typeof v !== 'object' || v === null) return
    const o = v as Record<string, unknown>
    if (isLine(o)) { visit(o, path); return }
    for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`)
  }
  walk(entry, '$')
}

/**
 * Replace each clause's `quote` with `at` (in place). The search starts after
 * the previous clause's span and falls back to anywhere in the line. An
 * `unparsed` clause with neither `quote` nor `at` is located by its `text`.
 * A clause with only `at` is kept as it is.
 */
export function resolveQuotes(entry: unknown): QuoteError[] {
  const errors: QuoteError[] = []
  forEachLine(entry, (line, path) => {
    let from = 0
    line.clauses = line.clauses.map((raw, i) => {
      const cl = raw as unknown as Record<string, unknown>
      if (typeof cl !== 'object' || cl === null) return raw
      const p = `${path}.clauses[${i}]`
      let quote = cl.quote
      if (quote === undefined && cl.at === undefined && cl.kind === 'unparsed' && typeof cl.text === 'string') quote = cl.text
      if (quote === undefined) {
        if (Array.isArray(cl.at) && typeof cl.at[1] === 'number') from = cl.at[1]
        return raw
      }
      if (typeof quote !== 'string' || !quote.trim()) {
        errors.push({ path: p, message: 'quote must be a non-empty string' })
        return raw
      }
      const q = quote.trim()
      const start = findQuote(line.text, q, from)
      if (start < 0) {
        errors.push({ path: p, message: `quote "${q}" is not in the line text "${line.text}"` })
        return raw
      }
      from = start + q.length
      const { quote: _q, at: _a, ...rest } = cl
      // Unparsed text is its span, in the printed wording.
      if (rest.kind === 'unparsed') rest.text = line.text.substring(start, from)
      return { at: [start, from], ...rest } as unknown as typeof raw
    })
  })
  return errors
}

/** The inverse, for briefs: every clause's `at` becomes `quote` (unparsed clauses keep only `text`). */
export function atToQuote<T>(entry: T): T {
  const copy = JSON.parse(JSON.stringify(entry)) as T
  forEachLine(copy, line => {
    line.clauses = line.clauses.map(raw => {
      const { at, ...rest } = raw as unknown as Record<string, unknown>
      if (!Array.isArray(at)) return raw
      if (rest.kind === 'unparsed') return rest as unknown as typeof raw
      return { quote: line.text.substring(at[0] as number, at[1] as number), ...rest } as unknown as typeof raw
    })
  })
  return copy
}
