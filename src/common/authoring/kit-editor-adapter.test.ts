import { describe, it, expect } from 'vitest'
import type { Disease, Trap } from '@kit'
import { normalizeContent, scaffold, validate } from './core'
import { applyPatch } from './patch'
import { decorate, kitEditorChanges, strip } from './kit-editor-adapter'
import { testPower } from './fixtures'
import type { Content, ContentKind, Draft } from './types'

let seq = 0
const newId = () => `new-${++seq}`

function draft(kind: ContentKind, content: Content): Draft {
  const c: any = normalizeContent(content)
  const nodes: Record<string, string[]> = {}
  for (const g of ['powers', 'traits', 'auras', 'stages', 'properties', 'countermeasures']) if (Array.isArray(c[g])) nodes[g] = c[g].map((_: unknown, i: number) => `${g[0]}${i}`)
  return { version: 1, schemaVersion: 5, id: 'd', kind, revision: 1, event: 0, createdAt: '', updatedAt: '', content: c, intent: '', decisions: '', policy: '', nodes, overrides: [], stale: [], destinations: [], comments: [] }
}

function trap(): Draft {
  const t = scaffold('trap', 'Needle trap', 3) as Trap
  t.trigger = { text: 'A creature opens the lid.', clauses: [] }
  t.countermeasures = [{ text: 'Thievery DC 20 disables it.', clauses: [] }, { text: 'Wedging the lid works.', clauses: [] }]
  t.powers = [testPower(), { ...testPower(), name: 'Second jab' }]
  t.detect = [{ skill: 'Perception', dc: 20, text: 'The character notices the needle.' }]
  return draft('trap', t)
}

/** Simulates an editor edit, applies the resulting patch as the DM, and checks it reproduces the edit exactly. */
function roundTrip(d: Draft, edit: (c: any) => void) {
  const c: any = decorate(d)
  edit(c)
  const changes = kitEditorChanges(d, c)
  for (const ch of changes) expect(ch.value).not.toBeUndefined()
  expect(JSON.parse(JSON.stringify(changes))).toEqual(changes)
  const next = applyPatch(d, { id: d.id, revision: d.revision, changes }, 'dm', newId)
  expect(next.content).toEqual(normalizeContent(strip(c)))
  return { changes, next }
}

describe('kit-native editor adapter', () => {
  it('produces nothing for an untouched copy', () => {
    const d = trap()
    expect(kitEditorChanges(d, decorate(d))).toEqual([])
  })

  it('patches edited leaves only and protects just those', () => {
    const { changes, next } = roundTrip(trap(), c => { c.name = 'Venom needle'; c.trigger.text = 'A creature lifts the lid.'; c.detect[0].dc = 22 })
    expect(changes.map(x => x.path)).toEqual(['/content/name', '/content/detect', '/content/trigger/text'])
    expect(next.overrides).toEqual(['/content/name', '/content/detect', '/content/trigger/text'])
  })

  it('unsets a cleared optional field instead of sending undefined', () => {
    const { changes, next } = roundTrip(trap(), c => { delete c.trigger; delete c.powers[0].attacks[0].hit })
    expect(changes.map(x => x.path)).toEqual(['/unset/content/trigger', '/unset/content/powers/@p0/attacks/0/hit'])
    expect((next.content as Trap).trigger).toBeUndefined()
    expect(validate('trap', next.content).errors).toEqual([])
  })

  it('keeps stable IDs through add, remove, reorder, and duplicate', () => {
    const { changes, next } = roundTrip(trap(), c => {
      const [a, b] = c.countermeasures
      c.countermeasures = [{ text: 'Smash it.', clauses: [] }, b, a, { ...a, text: 'Thievery DC 15 with tools.' }]
      c.powers = [c.powers[1]]
    })
    expect(changes.filter(x => !x.path.startsWith('/content/'))).toEqual([
      { path: '/remove/powers/@p0', value: null },
      { path: '/order/countermeasures', value: ['c1', 'c0'] },
      expect.objectContaining({ path: '/append/countermeasures/0' }),
      expect.objectContaining({ path: '/append/countermeasures/3' }),
    ])
    expect(next.nodes.countermeasures.slice(1, 3)).toEqual(['c1', 'c0'])
    expect(next.nodes.powers).toEqual(['p1'])
  })

  it('edits disease stages and the endurance DCs', () => {
    const disease = scaffold('disease', 'Mindrot', 6) as Disease
    disease.stages.push({ stage: 1, line: { text: 'The target takes -2 to Will.', clauses: [] } }, { stage: 2, final: true, line: { text: 'The target is dazed.', clauses: [] } })
    const { next } = roundTrip(draft('disease', disease), c => { c.stages[1].line.text = 'The target takes -2 to Will and Insight.'; c.endurance.improveDc = 22; delete c.stages[2].final })
    expect(validate('disease', next.content).errors).toEqual([])
  })

  it('refuses to unset outside content and ignores an unset of a missing field', () => {
    const d = trap()
    expect(() => applyPatch(d, { id: d.id, revision: 1, changes: [{ path: '/unset/intent', value: null }] }, 'dm', newId)).toThrow('Only content fields')
    const same = applyPatch(d, { id: d.id, revision: 1, changes: [{ path: '/unset/content/hpText', value: null }] }, 'dm', newId)
    expect(same.content).toEqual(d.content)
  })
})
