import { describe, expect, it } from 'vitest'
import type { Trap } from '@kit'
import { checkLabel, countermeasureLines, partLabel, recordCheck } from './countermeasures'

const trap = {
  countermeasures: [
    { text: 'Thievery DC 28: An adjacent character can disable the trigger.', clauses: [{ at: [0, 60], kind: 'countermeasure', effect: 'disable', checks: [{ skill: 'thievery', dc: 28 }], action: 'standard' }] },
    { text: 'A character can attack a door (AC 4, Reflex 4, Fortitude 10; hp 60). Destroying it ends the threat.', clauses: [
      { at: [0, 67], kind: 'countermeasure', effect: 'destroy', defenses: { ac: 4, reflex: 4, fortitude: 10 }, hp: 60 },
      { at: [69, 100], kind: 'unparsed', text: 'Destroying it ends the threat.' },
    ] },
    { text: 'Wait for 10 rounds.', clauses: [] },
  ],
} as unknown as Trap

describe('trap countermeasures', () => {
  it('lists each printed line with its countermeasure clauses', () => {
    const lines = countermeasureLines(trap)
    expect(lines.map(l => l.measures.map(m => [m.key, m.effect]))).toEqual([[['0/0', 'disable']], [['1/0', 'destroy']], []])
    expect(lines[0]!.measures[0]).toMatchObject({ checks: [{ skill: 'thievery', dc: 28 }], action: 'standard' })
    expect(partLabel(lines[1]!.measures[0]!)).toBe('AC 4, Ref 4, Fort 10; HP 60')
  })

  it('labels skill and ability checks as printed', () => {
    expect(checkLabel({ skill: 'thievery', dc: 22 })).toBe('Thievery DC 22')
    expect(checkLabel({ skill: 'ability:str', dc: 28 })).toBe('Strength DC 28')
    expect(checkLabel({ skill: 'dungeoneering', dc: 30, trained: true })).toBe('Dungeoneering DC 30 (trained)')
  })

  it('counts a skill challenge to its successes or failures once', () => {
    const m = { key: '0/0', effect: 'disable' as const, checks: [], complexity: { successes: 2, failures: 1 } }
    let r = recordCheck(undefined, m, 'success')
    expect(r).toEqual({ progress: { '0/0': { successes: 1, failures: 0 } } })
    r = recordCheck(r.progress, m, 'success')
    expect(r.done).toBe('success')
    expect(recordCheck(r.progress, m, 'success').done).toBeUndefined()
    expect(recordCheck(r.progress, m, 'failure').done).toBe('failure')
    expect(recordCheck(r.progress, m, 'success', -1).progress['0/0']).toEqual({ successes: 1, failures: 0 })
    expect(recordCheck(undefined, m, 'failure', -1).progress['0/0']).toEqual({ successes: 0, failures: 0 })
  })
})
