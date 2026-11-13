import { describe, expect, it } from 'vitest'
import type { Monster } from '@kit'
import { scaffold } from './core'
import { applyPatch } from './patch'
import { clashes, stillApplicable } from './merge'
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

describe('merging DM edits onto agent changes', () => {
  const from = draft()
  const to = applyPatch(from, { id: 'd', revision: 1, changes: [{ path: '/content/hp', value: 70 }, { path: '/content/powers/@p1/name', value: 'Agent name' }] }, 'agent', newId)

  it('lets edits to other fields through and flags the same field', () => {
    const mine = [{ path: '/content/speed/walk', value: 7 }, { path: '/content/hp', value: 66 }, { path: '/content/powers/@p2/name', value: 'Mine' }]
    expect(clashes(from, to, mine)).toEqual([{ path: '/content/hp', value: 66 }])
  })
  it('does not flag a field both set to the same value, or entries added and removed', () => {
    expect(clashes(from, to, [{ path: '/content/hp', value: 70 }, { path: '/append/powers', value: testPower() }, { path: '/remove/powers/@p2', value: null }])).toEqual([])
  })
  it('flags an edit inside an entry the agent changed or removed, and a reorder of a reordered list', () => {
    const removed = applyPatch(from, { id: 'd', revision: 1, changes: [{ path: '/remove/powers/@p2', value: null }, { path: '/order/powers', value: ['p1'] }] }, 'agent', newId)
    expect(clashes(from, removed, [{ path: '/content/powers/@p2/name', value: 'Mine' }])).toHaveLength(1)
    expect(clashes(from, to, [{ path: '/content/powers/@p1', value: { ...testPower(), name: 'Whole power' } }])).toHaveLength(1)
    const reordered = applyPatch(from, { id: 'd', revision: 1, changes: [{ path: '/order/powers', value: ['p2', 'p1'] }] }, 'agent', newId)
    expect(clashes(from, reordered, [{ path: '/order/powers', value: ['p2', 'p1'] }])).toHaveLength(1)
    expect(stillApplicable(removed, { path: '/remove/powers/@p2', value: null })).toBe(false)
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
