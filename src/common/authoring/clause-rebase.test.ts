import { describe, expect, it } from 'vitest'
import type { Clause, Line } from '@kit'
import { changedRange, rebaseClauses } from './clause-rebase'
import { quotedLine } from './fixtures'
import { applyPatch } from './patch'

const saveEnds = { kind: 'save-ends' }
// Invented text: damage, then a "save ends both" pair, then a separate prone.
const base = () => quotedLine('2d8 + 3 fire damage, and the target is slowed and weakened (save ends both). The target falls prone.', [
  { quote: '2d8 + 3 fire damage', kind: 'damage', dice: '2d8', plus: 3, types: ['fire'], who: 'target' },
  { quote: 'slowed', kind: 'condition', condition: 'slowed', who: 'target', duration: saveEnds, saveGroup: 'a' },
  { quote: 'weakened (save ends both)', kind: 'condition', condition: 'weakened', who: 'target', duration: saveEnds, saveGroup: 'a' },
  { quote: 'falls prone', kind: 'condition', condition: 'prone', who: 'target', duration: { kind: 'indefinite' } },
])
const edit = (line: Line, from: string, to: string) => {
  const next: Line = { ...structuredClone(line), text: line.text.replace(from, to) }
  rebaseClauses(line.text, next)
  return next
}
const kinds = (line: Line) => line.clauses.map(c => c.kind === 'condition' ? c.condition : c.kind)
const quotes = (line: Line) => line.clauses.map(c => line.text.slice(...c.at))

describe('rebasing clauses after the DM edits a line', () => {
  it('finds the one changed range', () => {
    expect(changedRange('abcdef', 'abXYef')).toEqual({ start: 2, end: 4, delta: 0 })
    expect(changedRange('abc', 'abXc')).toEqual({ start: 2, end: 2, delta: 1 })
    expect(changedRange('same', 'same')).toBeUndefined()
  })

  it('drops an edited clause with its save group and shifts the rest', () => {
    const next = edit(base(), 'weakened', 'dazed')
    expect(kinds(next)).toEqual(['damage', 'prone'])
    expect(quotes(next)).toEqual(['2d8 + 3 fire damage', 'falls prone'])
  })

  it('drops the clause after an edited gap (who it hits)', () => {
    const next = edit(base(), 'The target falls', 'Each ally falls')
    expect(kinds(next)).toEqual(['damage', 'slowed', 'weakened'])
  })

  it('keeps a clause when the edit is before the punctuation that opens its gap', () => {
    const line = quotedLine('2d8 + 3 fire damage, and the target is dazed (save ends).', [
      { quote: 'dazed (save ends)', kind: 'condition', condition: 'dazed', who: 'target', duration: saveEnds },
    ])
    expect(kinds(edit(line, '2d8 + 3', '3d8 + 1'))).toEqual(['dazed'])
    expect(kinds(edit(line, 'and the target', 'and each enemy'))).toEqual([])
    // With nothing printed between, the gap runs to the line's start.
    const bare = quotedLine('The target is dazed (save ends).', [{ quote: 'dazed (save ends)', kind: 'condition', condition: 'dazed', who: 'target', duration: saveEnds }])
    expect(kinds(edit(bare, 'The target', 'Each enemy'))).toEqual([])
  })

  it('keeps every clause when the edit touches none of them, and shifts later spans', () => {
    const line = base()
    const next = edit(line, '2d8 + 3 fire damage', '2d8 + 3 fire damage')
    expect(next.clauses).toEqual(line.clauses)
    const longer = edit(line, 'prone.', 'prone, as if tripped.')
    expect(kinds(longer)).toEqual(['damage', 'slowed', 'weakened', 'prone'])
    expect(quotes(longer)).toEqual(['2d8 + 3 fire damage', 'slowed', 'weakened (save ends both)', 'falls prone'])
  })

  it('drops a clause whose printed condition was edited', () => {
    const line = quotedLine('The target is dazed until the end of its next turn. If the target is bloodied, it falls prone.', [
      { quote: 'dazed until the end of its next turn', kind: 'condition', condition: 'dazed', who: 'target', duration: { kind: 'turn-end', whose: 'target', next: true } },
      { quote: 'falls prone', kind: 'condition', condition: 'prone', who: 'target', duration: { kind: 'indefinite' }, if: 'If the target is bloodied' },
    ])
    expect(kinds(edit(line, 'is bloodied', 'is unbloodied'))).toEqual(['dazed'])
  })

  it('drops a whole choice when one option is edited, and shifts options with a kept choice', () => {
    const text = 'The target slides 1 square. On a 1-3 it is blinded; on 4-6 it is dazed (save ends).'
    const line = quotedLine(text, [
      { quote: 'slides 1 square', kind: 'unparsed', text: 'slides 1 square' },
      { quote: 'On a 1-3 it is blinded; on 4-6 it is dazed (save ends)', kind: 'choice', chooser: 'roll', options: [] },
    ])
    const choice = line.clauses[1] as Extract<Clause, { kind: 'choice' }>
    const opts = quotedLine(text, [
      { quote: 'blinded', kind: 'condition', condition: 'blinded', who: 'target', duration: saveEnds },
      { quote: 'dazed (save ends)', kind: 'condition', condition: 'dazed', who: 'target', duration: saveEnds },
    ]).clauses as Extract<Clause, { kind: 'condition' }>[]
    choice.options = [[opts[0]!], [opts[1]!]]
    expect(kinds(edit(line, 'blinded', 'deafened'))).toEqual(['unparsed'])
    const shifted = edit(line, 'The target', 'The poor target')
    expect(kinds(shifted)).toEqual(['choice'])
    const kept = shifted.clauses[0] as Extract<Clause, { kind: 'choice' }>
    expect(kept.options.map(o => shifted.text.slice(...o[0]!.at))).toEqual(['blinded', 'dazed (save ends)'])
  })

  it('applies to the DM\'s patches; an agent\'s still re-anchor', () => {
    const power = { name: 'Searing grasp', action: 'standard', usage: 'at-will', keywords: [], attacks: [{ label: 'primary', range: { kind: 'melee', reach: 1 }, target: 'one creature', bonus: { kind: 'fixed', value: 8 }, vs: 'reflex', hit: base() }] }
    const draft = { id: 'd', kind: 'monster', revision: 1, content: { powers: [power] }, overrides: [], stale: [], nodes: {} } as any
    const path = '/content/powers/0/attacks/0/hit/text'
    const text = base().text.replace('weakened', 'dazed')
    const newId = () => 'n'
    const dm = applyPatch(draft, { id: 'd', revision: 1, changes: [{ path, value: text }] }, 'dm', newId)
    expect(kinds((dm.content as any).powers[0].attacks[0].hit)).toEqual(['damage', 'prone'])
    const agent = applyPatch(draft, { id: 'd', revision: 1, changes: [{ path, value: text }] }, 'agent', newId)
    expect(kinds((agent.content as any).powers[0].attacks[0].hit)).toEqual(['damage', 'slowed', 'weakened', 'prone'])
  })
})
