import { describe, expect, it } from 'vitest'
import type { Clause } from '@kit'
import { applyDuration, lineEffects, uncoveredRanges } from './clause-effects'
import { quotedLine } from '../authoring/fixtures'

const quoted = quotedLine

const saveEnds = { kind: 'save-ends' }

describe('clause effects', () => {
  it('turns a "save ends both" pair into one group, applied together', () => {
    const line = quoted('3d6 + 2 cold damage, and the target is dazed and takes ongoing 4 cold damage (save ends both).', [
      { quote: '3d6 + 2 cold damage', kind: 'damage', dice: '3d6', plus: 2, types: ['cold'], who: 'target' },
      { quote: 'dazed', kind: 'condition', condition: 'dazed', who: 'target', duration: saveEnds, saveGroup: 'a' },
      { quote: 'takes ongoing 4 cold damage (save ends both)', kind: 'ongoing-damage', amount: 4, types: ['cold'], who: 'target', duration: saveEnds, saveGroup: 'a' },
    ])
    const spans = lineEffects(line)
    expect(spans.map(s => line.text.slice(...s.at))).toEqual(['dazed', 'takes ongoing 4 cold damage (save ends both)'])
    expect(spans[0]!.group.map(e => e.label)).toEqual(['Dazed', 'Ongoing 4 cold'])
    expect(spans[1]!.group).toEqual(spans[0]!.group)
    expect(spans[1]!.effect).toMatchObject({ kind: 'condition', apply: { conditionId: 'ongoing-damage', value: 4, customDescription: 'cold', duration: { type: 'save-ends' } } })
  })

  it('keeps clauses without a group on their own', () => {
    const line = quoted('The target is slowed until the end of the frost wight\'s next turn and is knocked prone.', [
      { quote: 'slowed until the end of the frost wight\'s next turn', kind: 'condition', condition: 'slowed', who: 'target', duration: { kind: 'turn-end', whose: 'source', next: true } },
      { quote: 'knocked prone', kind: 'condition', condition: 'prone', who: 'target', duration: { kind: 'indefinite' } },
    ])
    const spans = lineEffects(line)
    expect(spans.map(s => s.group.length)).toEqual([1, 1])
    expect(spans[0]!.effect).toMatchObject({ apply: { conditionId: 'slowed', duration: { type: 'eont', whose: 'source', next: true } } })
    expect(spans[1]!.effect).toMatchObject({ apply: { conditionId: 'prone', duration: { type: 'indefinite' } } })
  })

  it('applies grants-CA, regeneration, diseases, and named effects; skips what lasts no time', () => {
    const line = quoted('The target grants combat advantage to the mirelurk (save ends), takes a -2 penalty to attack rolls (save ends), is exposed to gloomrot, and slides 2 squares. The mirelurk gains regeneration 5 until the end of the encounter.', [
      { quote: 'grants combat advantage to the mirelurk (save ends)', kind: 'grants-ca', to: 'source', who: 'target', duration: saveEnds },
      { quote: 'takes a -2 penalty to attack rolls (save ends)', kind: 'modifier', stat: 'attack', value: -2, who: 'target', duration: saveEnds },
      { quote: 'exposed to gloomrot', kind: 'disease', disease: 'Gloomrot', who: 'target' },
      { quote: 'slides 2 squares', kind: 'forced-movement', move: 'slide', squares: 2, who: 'target' },
      { quote: 'gains regeneration 5 until the end of the encounter', kind: 'regeneration', value: 5, who: 'self', duration: { kind: 'encounter' } },
    ])
    expect(lineEffects(line).map(s => s.effect)).toEqual([
      { kind: 'condition', label: 'Grants CA', apply: { conditionId: 'combat-advantage', grantsCATo: 'source', duration: { type: 'save-ends' } } },
      { kind: 'condition', label: '-2 attack', apply: { conditionId: 'custom', customName: '-2 attack', duration: { type: 'save-ends' } } },
      { kind: 'disease', label: 'Gloomrot', disease: 'Gloomrot' },
      { kind: 'condition', label: 'Regeneration 5', apply: { conditionId: 'regenerating', value: 5, duration: { type: 'encounter' } } },
    ])
  })

  it('keeps a choice\'s options apart: their groups stay inside the option', () => {
    const line = quoted('Roll a d6: on 1-3 the target is blinded and deafened (save ends both); on 4-6 it is weakened and slowed (save ends both).', [
      { quote: 'Roll a d6: on 1-3 the target is blinded and deafened (save ends both); on 4-6 it is weakened and slowed (save ends both)', kind: 'choice', chooser: 'roll', options: [] },
    ])
    const choice = line.clauses[0] as Extract<Clause, { kind: 'choice' }>
    const sub = quoted(line.text, [
      { quote: 'blinded', kind: 'condition', condition: 'blinded', who: 'target', duration: saveEnds, saveGroup: 'a' },
      { quote: 'deafened', kind: 'condition', condition: 'deafened', who: 'target', duration: saveEnds, saveGroup: 'a' },
      { quote: 'weakened', kind: 'condition', condition: 'weakened', who: 'target', duration: saveEnds, saveGroup: 'a' },
      { quote: 'slowed (save ends both)', kind: 'condition', condition: 'slowed', who: 'target', duration: saveEnds, saveGroup: 'a' },
    ]).clauses as Extract<Clause, { kind: 'condition' }>[]
    choice.options = [[sub[0]!, sub[1]!], [sub[2]!, sub[3]!]]
    const spans = lineEffects(line)
    expect(spans.map(s => s.group.map(e => e.label))).toEqual([['Blinded', 'Deafened'], ['Blinded', 'Deafened'], ['Weakened', 'Slowed'], ['Weakened', 'Slowed']])
    // A condition the app has no definition for is applied by name.
    expect(spans[1]!.effect).toMatchObject({ apply: { conditionId: 'deafened', customName: 'Deafened' } })
  })

  it('shows printed conditions without checking them', () => {
    const line = quoted('If the target is bloodied, it is stunned until the end of its next turn.', [
      { quote: 'stunned until the end of its next turn', kind: 'condition', condition: 'stunned', who: 'target', duration: { kind: 'turn-end', whose: 'target', next: true }, if: 'If the target is bloodied' },
    ])
    expect(lineEffects(line)[0]).toMatchObject({ if: ['If the target is bloodied'], who: ['target'] })
  })

  it('picks a level\'s value from byLevel steps', () => {
    const line = quoted('It gains regeneration 3 while bloodied. Level 11: Regeneration 6.', [
      { quote: 'gains regeneration 3 while bloodied', kind: 'regeneration', value: 3, who: 'self', duration: { kind: 'until', text: 'while bloodied' }, byLevel: [{ level: 11, value: 6 }] },
    ])
    expect(lineEffects(line, 5)[0]!.effect.label).toBe('Regeneration 3')
    expect(lineEffects(line, 14)[0]!.effect.label).toBe('Regeneration 6')
    expect(lineEffects(line)[0]!.saveGroup).toBeUndefined()
  })

  it('maps kit durations to the engine\'s', () => {
    expect(applyDuration({ kind: 'turn-start', whose: 'target', next: true })).toEqual({ type: 'sont', whose: 'target', next: true })
    expect(applyDuration({ kind: 'sustain', action: 'minor' })).toEqual({ type: 'custom', note: 'sustain minor' })
    expect(applyDuration({ kind: 'until', text: 'until the grab ends' })).toEqual({ type: 'custom', note: 'until the grab ends' })
    expect(applyDuration({ kind: 'instant' })).toBeUndefined()
  })

  it('finds the text no clause covers, unparsed clauses counting as covered', () => {
    const line = quoted('The target is dazed (save ends). Aftershock lingers here. It can hop 2.', [
      { quote: 'dazed (save ends)', kind: 'condition', condition: 'dazed', who: 'target', duration: saveEnds },
      { quote: 'Aftershock lingers here.', kind: 'unparsed', text: 'Aftershock lingers here.' },
    ])
    expect(uncoveredRanges(line).map(r => line.text.slice(...r))).toEqual(['The target is ', ' It can hop 2.'])
    expect(uncoveredRanges({ text: 'Plain words.', clauses: [] })).toEqual([[0, 12]])
  })
})
