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
 * unparsed clause may be just `{ text }`: no kind means 'unparsed', and with
 * neither `quote` nor `at` it is located by its text. A clause with only `at`
 * is kept as it is.
 */
export function resolveQuotes(entry: unknown): QuoteError[] {
  const errors: QuoteError[] = []
  forEachLine(entry, (line, path) => {
    line.clauses = resolveList(line.text, line.clauses as unknown[], `${path}.clauses`, 0, line.text.length, errors) as Line['clauses']
  })
  return errors
}

/**
 * Resolve a list of clauses whose quotes lie in text[lo, hi): the whole line,
 * or a choice clause's span for its options (searched inside that span only).
 */
function resolveList(text: string, clauses: unknown[], path: string, lo: number, hi: number, errors: QuoteError[]): unknown[] {
  const scope = text.substring(lo, hi)
  const whole = lo === 0 && hi === text.length
  let from = 0
  const options = (cl: Record<string, unknown>, p: string, a: number, b: number) => {
    if (cl.kind === 'choice' && Array.isArray(cl.options)) {
      cl.options = cl.options.map((opt, j) => Array.isArray(opt) ? resolveList(text, opt, `${p}.options[${j}]`, a, b, errors) : opt)
    }
  }
  return clauses.map((raw, i) => {
    const cl = raw as Record<string, unknown>
    if (typeof cl !== 'object' || cl === null) return raw
    const p = `${path}[${i}]`
    // The minimal unparsed shape: { "text": "<exact words>" }.
    if (cl.kind === undefined && typeof cl.text === 'string') cl.kind = 'unparsed'
    let quote = cl.quote
    if (quote === undefined && cl.at === undefined && cl.kind === 'unparsed' && typeof cl.text === 'string') quote = cl.text
    if (quote === undefined) {
      if (Array.isArray(cl.at) && typeof cl.at[0] === 'number' && typeof cl.at[1] === 'number') {
        from = cl.at[1] - lo
        options(cl, p, cl.at[0], cl.at[1])
      }
      return raw
    }
    if (typeof quote !== 'string' || !quote.trim()) {
      errors.push({ path: p, message: 'quote must be a non-empty string' })
      return raw
    }
    const q = quote.trim()
    const found = findQuote(scope, q, from)
    if (found < 0) {
      errors.push({ path: p, message: whole
        ? `quote "${q}" is not in the line text "${text}"`
        : `option quote "${q}" is not inside its choice's quote "${scope}"` })
      return raw
    }
    from = found + q.length
    const [start, end] = [lo + found, lo + from]
    const { quote: _q, at: _a, kind, ...others } = cl
    const rest: Record<string, unknown> = { kind, ...others }
    // Unparsed text is its span, in the printed wording.
    if (rest.kind === 'unparsed') rest.text = text.substring(start, end)
    // A choice's options are quoted inside the choice's own span.
    options(rest, p, start, end)
    return { at: [start, end], ...rest }
  })
}

/** The inverse, for briefs: every clause's `at` becomes `quote`; unparsed clauses become just `{ text }`. */
export function atToQuote<T>(entry: T): T {
  const copy = JSON.parse(JSON.stringify(entry)) as T
  const toQuote = (text: string, clauses: unknown[]): unknown[] => clauses.map(raw => {
    const { at, ...rest } = raw as Record<string, unknown>
    if (!Array.isArray(at)) return raw
    if (rest.kind === 'unparsed') return { text: rest.text }
    if (rest.kind === 'choice' && Array.isArray(rest.options)) {
      rest.options = rest.options.map(opt => Array.isArray(opt) ? toQuote(text, opt) : opt)
    }
    return { quote: text.substring(at[0] as number, at[1] as number), ...rest }
  })
  forEachLine(copy, line => { line.clauses = toQuote(line.text, line.clauses as unknown[]) as Line['clauses'] })
  return copy
}
