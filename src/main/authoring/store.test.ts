import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { DraftStore, digest, type Publisher } from './store'
import { scaffold } from '../../common/authoring/core'
import { SCHEMA_VERSION, type Monster } from '@kit'
import { testPower } from '../../common/authoring/fixtures'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'authoring-test-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
function content() { const m = scaffold('monster', 'Synthetic shade', 7, 'lurker') as Monster; m.powers.push(testPower()); return m }
describe('draft collaboration', () => {
  it('survives restart and preserves comments across independent content revisions', async () => {
    const s = new DraftStore(root); const d = await s.create('monster', content())
    await s.comment(d.id, 'Make it faster', '/', 'dm')
    const next = await s.patch({ id: d.id, revision: 1, changes: [{ path: '/content/speed/walk', value: 8 }] }, 'agent')
    expect(next.comments).toHaveLength(1)
    expect((await new DraftStore(root).get(d.id)).content).toEqual(next.content)
    expect((await s.history(d.id, 1))!.revision).toBe(1)
    const restored = await s.restore(d.id, next.revision, 1)
    expect((restored.content as Monster).speed.walk).toBe(6)
    expect(restored.revision).toBe(next.revision + 1)
    expect(restored.comments).toHaveLength(1)
  })
  it('rejects stale edits but lets the agent revise applied DM edits, which then stop counting as DM-authored', async () => {
    const s = new DraftStore(root); const d = await s.create('monster', (() => { const m = content(); m.powers.push({ ...testPower(), name: 'Other power' }); return m })())
    await s.patch({ id: d.id, revision: 1, changes: [{ path: '/content/defenses/ac', value: 24 }, { path: '/content/hp', value: 50 }, { path: '/order/powers', value: d.nodes.powers }] }, 'dm')
    await expect(s.patch({ id: d.id, revision: 1, changes: [] }, 'agent')).rejects.toThrow('Revision conflict')
    await expect(s.patch({ id: d.id, revision: 2, changes: [], release: ['/content/defenses/ac'] }, 'agent')).rejects.toThrow('Only the DM')
    const revised = await s.patch({ id: d.id, revision: 2, changes: [{ path: '/content/defenses', value: { ac: 23, fortitude: 18, reflex: 21, will: 19 } }, { path: '/order/powers', value: d.nodes.powers }] }, 'agent')
    expect((revised.content as Monster).defenses.ac).toBe(23)
    expect(revised.overrides).toEqual(['/content/hp', '/order/powers'])
    const reordered = await s.patch({ id: d.id, revision: 3, changes: [{ path: '/order/powers', value: [...d.nodes.powers].reverse() }] }, 'agent')
    expect(reordered.overrides).toEqual(['/content/hp'])
  })
  it('retains semantic anchors through reordering and marks edited prose stale', async () => {
    const m = content(); m.powers.push({ ...testPower(), name: 'Other power' })
    const s = new DraftStore(root); const d = await s.create('monster', m)
    const id = d.nodes.powers[0], path = `/content/powers/@${id}`
    await s.comment(d.id, 'Keep surge loss', path, 'dm')
    const changed = await s.patch({ id: d.id, revision: 1, changes: [{ path: '/order/powers', value: [...d.nodes.powers].reverse() }, { path: `${path}/attacks/0/hit/text`, value: 'The target loses one healing surge.' }] }, 'dm')
    expect(changed.nodes.powers[1]).toBe(id)
    expect(changed.comments[0].target).toBe(path)
    expect(changed.stale).toContain(path)
    await expect(s.patch({ id: d.id, revision: 2, changes: [{ path: '/content/powers/0/name', value: 'Bad' }] }, 'agent')).rejects.toThrow('stable')
  })
  it('lets the agent close only its own threads, and only with a reply; DM feedback stays DM-resolved', async () => {
    const s = new DraftStore(root); const d = await s.create('monster', content())
    const q = await s.comment(d.id, 'When does it act?', '/', 'agent', true)
    await expect(s.comment(d.id, '', '/', 'agent', false, q.comments[0].id, true)).rejects.toThrow('Resolving needs a reply')
    const answered = await s.comment(d.id, 'DM answer in chat: right after its creator.', '/', 'agent', false, q.comments[0].id, true)
    expect(answered.comments[0].resolved).toBe(true)
    expect(answered.comments[0].replies.at(-1)!.author).toBe('agent')
    const feedback = await s.comment(d.id, 'Make it faster', '/', 'dm')
    const dmThread = feedback.comments[1].id
    await expect(s.comment(d.id, 'Done in revision 2', '/', 'agent', false, dmThread, true)).rejects.toThrow('Only the DM')
    const reply = await s.comment(d.id, 'Done in revision 2', '/', 'agent', false, dmThread)
    expect(reply.comments[1].resolved).toBe(false)
    expect((await s.comment(d.id, '', '/', 'dm', false, dmThread, true)).comments[1].resolved).toBe(true)
  })
  it('opens drafts from compatible older kit schemas and still rejects incompatible ones', async () => {
    const s = new DraftStore(root); const d = await s.create('monster', content())
    const file = join(root, d.id, 'current.json')
    await writeFile(file, JSON.stringify({ ...d, schemaVersion: 4 }))
    expect((await s.get(d.id)).schemaVersion).toBe(SCHEMA_VERSION)
    const next = await s.patch({ id: d.id, revision: 1, changes: [{ path: '/content/hp', value: 70 }] }, 'agent')
    expect(JSON.parse(await readFile(file, 'utf8')).schemaVersion).toBe(SCHEMA_VERSION)
    await writeFile(file, JSON.stringify({ ...next, schemaVersion: 3 }))
    await expect(s.get(d.id)).rejects.toThrow('schema migration')
  })
  it('rejects protected envelope fields, traversal and malicious paths', async () => {
    const s = new DraftStore(root); const d = await s.create('monster', content())
    await expect(s.get('../escape')).rejects.toThrow('Invalid identifier')
    for (const path of ['/receipt', '/revision', '/content/__proto__/x', '/content']) await expect(s.patch({ id: d.id, revision: 1, changes: [{ path, value: {} }] }, 'agent')).rejects.toThrow()
  })
  it('derives metadata under DM prose without discarding the DM-authored marker, and lets the agent revise DM-edited clauses', async () => {
    const s = new DraftStore(root); const d = await s.create('monster', content())
    const node = `/content/powers/@${d.nodes.powers[0]}`, path = `${node}/attacks/0/hit`
    const edited = await s.patch({ id: d.id, revision: 1, changes: [{ path, value: { text: 'The target loses one healing surge.', clauses: [] } }] }, 'dm')
    const derived = await s.patch({ id: d.id, revision: edited.revision, changes: [{ path: `${path}/clauses`, value: [{ kind: 'lose-healing-surge', count: 1, who: 'target', quote: 'loses one healing surge' }] }], reconciled: [node] }, 'agent')
    expect(derived.stale).toEqual([])
    expect(derived.overrides).toEqual([path])
    const dmClauses = await s.patch({ id: d.id, revision: derived.revision, changes: [{ path: `${path}/clauses`, value: [] }] }, 'dm')
    const revised = await s.patch({ id: d.id, revision: dmClauses.revision, changes: [{ path, value: { text: 'The target loses two healing surges.', clauses: [{ text: 'The target loses two healing surges.' }] } }], reconciled: [node] }, 'agent')
    expect(revised.overrides).toEqual([])
    expect(revised.stale).toEqual([])
    const removed = await s.patch({ id: d.id, revision: revised.revision, changes: [{ path: `/remove/powers/@${d.nodes.powers[0]}`, value: null }] }, 'agent')
    expect((removed.content as Monster).powers).toHaveLength(0)
  })
})

describe('approval and save recovery', () => {
  function publisher() {
    const saved = new Map<string, unknown>(); let writes = 0, failAt = 0
    const p: Publisher = {
      check: async () => {}, read: async (d, id) => saved.get(d.id + '/' + id) ?? null,
      encode: (c, _kind, id) => ({ ...c, id }),
      write: async (d, id, valueKind, value) => { writes++; if (writes === failAt) throw new Error('disk full'); saved.set(d.id + '/' + id, value) },
    }
    return { p, saved, fail: (n: number) => { failAt = n }, writes: () => writes }
  }
  it('requires current content, resolved metadata/questions, and advisory acceptance', async () => {
    const p = publisher(); const s = new DraftStore(root, p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }])
    await expect(s.approve(d.id, 2, true)).rejects.toThrow('Revision changed')
    await expect(s.approve(d.id, 1, false)).rejects.toThrow('Acknowledge')
    await s.comment(d.id, 'Clarify', '/', 'dm', true)
    await expect(s.approve(d.id, 1, true)).rejects.toThrow('blocking questions')
    expect(p.writes()).toBe(0)
  })
  it('needs acknowledgement for risks and problems but not for notes', async () => {
    const p = publisher(); const s = new DraftStore(root, p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }])
    await s.review(d.id, 1, 'Synthetic.', [{ severity: 'concern', target: '/content/hp', message: 'Risky.', suggestion: '' }], 'agent')
    await expect(s.approve(d.id, 1, false)).rejects.toThrow('Acknowledge')
    await s.review(d.id, 1, 'Synthetic.', [{ severity: 'info', target: '/content/hp', message: 'Matches the band.', suggestion: '' }], 'agent')
    expect((await s.approve(d.id, 1, false)).receipt?.revision).toBe(1)
  })
  it('is idempotent and binds saving to recorded destinations', async () => {
    const p = publisher(); const s = new DraftStore(root, p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'campaign-a' }])
    const saved = await s.approve(d.id, 1, true)
    await s.approve(d.id, 1, true)
    expect(p.writes()).toBe(1)
    expect(saved.receipt!.targets[0].destination.id).toBe('campaign-a')
    const edited = await s.patch({ id: d.id, revision: 1, changes: [{ path: '/content/hp', value: 30 }] }, 'dm')
    // The receipt records the last save; the draft has changed since.
    expect(edited.receipt!.revision).toBe(1)
    expect(edited.revision).toBe(2)
  })
  it('updates the saved entry on later saves instead of adding a copy', async () => {
    const p = publisher(); const s = new DraftStore(root, p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }])
    const first = await s.approve(d.id, 1, true)
    const entityId = first.receipt!.targets[0].entityId
    expect(first.destinations).toEqual([{ type: 'campaign', id: 'a', entityId, expectedHash: digest(p.saved.get(`a/${entityId}`)) }])
    await s.patch({ id: d.id, revision: first.revision, changes: [{ path: '/content/hp', value: 31 }] }, 'dm')
    const second = await s.approve(d.id, first.revision + 1, true)
    expect(second.receipt!.targets[0].entityId).toBe(entityId)
    expect(p.saved.size).toBe(1)
    expect((p.saved.get(`a/${entityId}`) as any).hp).toBe(31)
  })
  it('lists versions with who changed which fields, skipping comment-only events', async () => {
    const s = new DraftStore(root, publisher().p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }], 'agent')
    await s.patch({ id: d.id, revision: 1, changes: [{ path: '/content/hp', value: 44 }] }, 'dm')
    await s.comment(d.id, 'Too tough?', '/content/hp', 'agent')
    await s.patch({ id: d.id, revision: 2, changes: [{ path: `/content/powers/@${d.nodes.powers[0]}/name`, value: 'Gloom bite' }], reconciled: [`/content/powers/@${d.nodes.powers[0]}`] }, 'agent')
    await s.approve(d.id, 3, true)
    const versions = await s.versions(d.id)
    expect(versions.map(v => [v.by, v.action, v.revision])).toEqual([['dm', 'saved', 3], ['agent', 'edited', 3], ['dm', 'edited', 2], ['agent', 'created', 1]])
    expect(versions[2].changes).toEqual([{ label: 'HP', change: 'changed', before: String((d.content as Monster).hp), after: '44' }])
    expect(versions[1].changes[0]).toMatchObject({ label: 'Gloom bite › name', before: (d.content as Monster).powers[0].name, after: 'Gloom bite' })
    expect(versions[0].savedTo).toEqual([{ type: 'campaign', id: 'a' }])
  })
  it('recovers a partial multi-destination save after restarting without duplicating the first write', async () => {
    const p = publisher(); p.fail(2)
    const s = new DraftStore(root, p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }, { type: 'campaign', id: 'b' }])
    await expect(s.approve(d.id, 1, true)).rejects.toThrow('disk full')
    expect(p.saved.size).toBe(1)
    await expect(s.patch({ id: d.id, revision: 1, changes: [] }, 'dm')).rejects.toThrow('pending')
    const recovered = await new DraftStore(root, p.p).approve(d.id, 1, true)
    expect(p.saved.size).toBe(2)
    expect(recovered.receipt!.targets).toHaveLength(2)
    expect(p.writes()).toBe(3)
  })
  it('rejects stale destination hashes without overwriting existing content', async () => {
    const p = publisher(); p.saved.set('a/existing', { name: 'Changed' })
    const s = new DraftStore(root, p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a', entityId: 'existing', expectedHash: digest({ name: 'Old' }) }])
    await expect(s.approve(d.id, 1, true)).rejects.toThrow('Destination changed')
    expect(p.writes()).toBe(0)
  })
  it('requires fresh feedback acknowledgement and can abandon a partial save without deleting prior writes', async () => {
    const p = publisher(); p.fail(2)
    const s = new DraftStore(root, p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }, { type: 'campaign', id: 'b' }])
    await s.comment(d.id, 'Another consideration', '/', 'agent')
    await expect(s.approve(d.id, 1, true, d.event)).rejects.toThrow('feedback changed')
    await expect(s.approve(d.id, 1, true)).rejects.toThrow('disk full')
    const abandoned = await s.abandonSave(d.id)
    expect(p.saved.size).toBe(1)
    expect(abandoned.comments.some(c => c.question && !c.resolved)).toBe(true)
    expect((await s.saveStatus(d.id)).pending).toBe(false)
    await expect(s.patch({ id: d.id, revision: 1, changes: [{ path: '/content/hp', value: 20 }] }, 'dm')).resolves.toBeDefined()
  })
})
