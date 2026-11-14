import { describe, expect, it } from 'vitest'
import type { Monster } from '@kit'
import { scaffold } from './core'
import { applyPatch } from './patch'
import { stillApplicable } from './merge'
import { describeChanges } from './diff'
import { testPower } from './fixtures'
import type { Draft } from './types'

let n = 0
const newId = () => `node-${++n}`
function draft(): Draft {
  const content = scaffold('monster', 'Gloom', 5, 'lurker') as Monster
  content.powers.push(testPower(), { ...testPower(), name: 'Second power' })
  return { version: 1, schemaVersion: 5, id: 'd', kind: 'monster', revision: 1, event: 1, createdAt: '', updatedAt: '', content, intent: '', decisions: '', policy: '', nodes: { powers: ['p1', 'p2'], traits: [], auras: [] }, overrides: [], stale: [], destinations: [], comments: [] }
}

describe('applying DM edits onto agent changes', () => {
  const from = draft()
  it('drops only edits to an entry the agent removed', () => {
    const removed = applyPatch(from, { id: 'd', revision: 1, changes: [{ path: '/remove/powers/@p2', value: null }] }, 'agent', newId)
    expect(stillApplicable(removed, { path: '/remove/powers/@p2', value: null })).toBe(false)
    expect(stillApplicable(removed, { path: '/content/powers/@p2/name', value: 'Mine' })).toBe(false)
    expect(stillApplicable(removed, { path: '/content/powers/@p1/name', value: 'Mine' })).toBe(true)
    expect(stillApplicable(removed, { path: '/content/hp', value: 66 })).toBe(true)
  })
})

describe('readable version differences', () => {
  it('names fields and entries, and reports added, removed and reordered entries', () => {
    const before = draft()
    const after = applyPatch(before, { id: 'd', revision: 1, changes: [
      { path: '/content/hp', value: 61 },
      { path: '/content/powers/@p1/attacks/0/hit/text', value: 'Changed hit.' },
      { path: '/remove/powers/@p2', value: null },
      { path: '/append/powers', value: { ...testPower(), name: 'New power' } },
    ] }, 'agent', newId)
    const changes = describeChanges(before, after)
    expect(changes).toContainEqual({ label: 'HP', change: 'changed', before: String((before.content as Monster).hp), after: '61' })
    expect(changes).toContainEqual(expect.objectContaining({ label: `${testPower().name} › primary attack › hit`, after: 'Changed hit.' }))
    expect(changes).toContainEqual({ label: 'Power New power', change: 'added' })
    expect(changes).toContainEqual({ label: 'Power Second power', change: 'removed' })
    expect(describeChanges(before, applyPatch(before, { id: 'd', revision: 1, changes: [{ path: '/order/powers', value: ['p2', 'p1'] }] }, 'dm', newId))).toEqual([{ label: 'Order of powers', change: 'changed' }])
  })
})
