import type { Clause, Line, Power } from '@kit'

/** Synthetic, original test data; no private compendium text. */
export const testPower = (): Power => ({ name: 'Draining touch', action: 'standard', usage: 'at-will', keywords: ['necrotic'], attacks: [{ label: 'primary', range: { kind: 'melee', reach: 1 }, target: 'one creature', bonus: { kind: 'fixed', value: 10 }, vs: 'fortitude', hit: { text: '5 necrotic damage and the target loses one healing surge.', clauses: [] } }] })

/** A line whose clauses are given by quote (invented text), each `at` resolved to the quote's first occurrence. */
export function quotedLine(text: string, clauses: (Record<string, unknown> & { quote: string })[]): Line {
  return { text, clauses: clauses.map(({ quote, ...c }) => {
    const i = text.indexOf(quote)
    if (i < 0) throw new Error(`quote not found: ${quote}`)
    return { at: [i, i + quote.length], ...c } as unknown as Clause
  }) }
}
