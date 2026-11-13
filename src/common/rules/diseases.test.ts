import { describe, expect, it } from 'vitest'
import type { Disease } from '@kit'
import { enduranceOutcome, findDiseaseMentions, locateDiseaseMentions, nextStage, stageText } from './diseases'

const names = ['Filth Fever', 'Dire Rat Filth Fever', 'Mummy Rot', 'Rot'].map(name => ({ ref: name, name }))

describe('disease mentions', () => {
  it('finds the longest disease name in exposure text', () => {
    expect(findDiseaseMentions('The target is exposed to dire rat filth fever.', names).map(d => d.name)).toEqual(['Dire Rat Filth Fever'])
    expect(findDiseaseMentions('Hit: 1d6 damage, and the target contracts mummy rot (stage 1).', names).map(d => d.name)).toEqual(['Mummy Rot'])
  })
  it('ignores text without exposure and partial words', () => {
    expect(findDiseaseMentions('The mummy rot aura deals 5 necrotic damage.', names)).toEqual([])
    expect(findDiseaseMentions('Exposed to rotten fumes.', names)).toEqual([])
  })
})

const fever: Disease = {
  id: 'd', name: 'Filth Fever', level: 3, endurance: { improveDc: 16, maintainDc: 11 }, flavor: '', sources: [], provenance: { origin: 'human', at: '' },
  stages: [
    { stage: 0, line: { text: 'The target recovers from the disease.', clauses: [] } },
    { stage: 1, line: { text: 'The target loses a healing surge.', clauses: [] } },
    { stage: 2, line: { text: 'The target is weakened.', clauses: [] } },
    { stage: 3, final: true, line: { text: 'The target dies.', clauses: [] } },
  ],
}

describe('disease progress', () => {
  it('reads Endurance checks against the DCs', () => {
    expect([18, 16, 12, 11, 10].map(r => enduranceOutcome(fever, r))).toEqual(['improve', 'improve', 'maintain', 'maintain', 'worsen'])
    expect(enduranceOutcome({ ...fever, endurance: { improveDc: { text: 'Easy DC' }, maintainDc: 11 } }, 20)).toBeUndefined()
  })
  it('moves between stages, curing at 0 and stopping at the final stage', () => {
    expect(nextStage(fever, 1, 'improve')).toBe(0)
    expect(nextStage(fever, 2, 'maintain')).toBe(2)
    expect(nextStage(fever, 3, 'worsen')).toBe(3)
    expect(stageText(fever, 2)).toBe('The target is weakened.')
  })
})

describe('disease mention positions', () => {
  it('locates the matched name in the text', () => {
    const text = 'On a failure, the target contracts dire rat filth fever (stage 1).'
    const [m] = locateDiseaseMentions(text, names)
    expect(text.slice(m.start, m.end)).toBe('dire rat filth fever')
  })
})
