import { describe, expect, it } from 'vitest'
import type { Disease } from '@kit'
import type { PlayerCharacter } from '../types'
import { carriedConditions, lastingConditionDefs, migratePcDiseases, pcConditionKey } from './pc-conditions'

const rot = { name: 'Mummy Rot', stages: [{ stage: 1, line: { text: 'The target loses a healing surge.' } }] } as unknown as Disease
const pc = (conditions: PlayerCharacter['conditions']): PlayerCharacter => ({ id: 'p', name: 'Hero', playerName: '', createdAt: '', updatedAt: '', conditions })

describe('PC lasting conditions', () => {
  it('carry into combat as indefinite conditions marked carried', () => {
    const carried = carriedConditions(pc([
      { kind: 'condition', conditionId: 'weakened', note: 'an extended rest', since: '' },
      { kind: 'effect', id: 'e1', name: 'Cursed', description: '-2 to saves', since: '' },
      { kind: 'disease', compendiumId: 'd1', stage: 1, since: '' },
      { kind: 'disease', diseaseId: 'gone', stage: 'exposed', since: '' },
    ]), ref => ref.compendiumId === 'd1' ? rot : null)
    expect(carried).toEqual([
      { conditionId: 'weakened', duration: { type: 'indefinite', note: 'an extended rest' }, carried: true },
      { conditionId: 'pc-effect-e1', customName: 'Cursed', customDescription: '-2 to saves', customIcon: 'sparkles', duration: { type: 'indefinite' }, carried: true },
      { conditionId: 'pc-disease-published:d1', customName: 'Mummy Rot (stage 1)', customDescription: 'The target loses a healing surge.', customIcon: 'biohazard', duration: { type: 'indefinite' }, carried: true },
    ])
  })

  it('offers only conditions that can outlast an encounter', () => {
    const ids = lastingConditionDefs().map(d => d.id)
    expect(ids).toContain('weakened')
    for (const id of ['dying', 'bloodied', 'reacted', 'surprised', 'ongoing-damage', 'mark-warlock-curse']) expect(ids).not.toContain(id)
  })

  it('keys each kind apart', () => {
    expect(pcConditionKey({ kind: 'disease', libraryId: 'x', stage: 1, since: '' })).toBe('library:x')
    expect(pcConditionKey({ kind: 'condition', conditionId: 'x', since: '' })).toBe('condition:x')
    expect(pcConditionKey({ kind: 'effect', id: 'x', name: 'X', since: '' })).toBe('effect:x')
  })

  it('migrates old disease lists', () => {
    const old: Record<string, any> = { diseases: [{ compendiumId: 'd1', stage: 2, since: 't' }] }
    expect(migratePcDiseases(old)).toBe(true)
    expect(old).toEqual({ conditions: [{ kind: 'disease', compendiumId: 'd1', stage: 2, since: 't' }] })
    expect(migratePcDiseases(old)).toBe(false)
  })
})
