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
    // The agent is told what the DM changed since its version, and to ask before overwriting it.
    await expect(s.patch({ id: d.id, revision: 1, changes: [] }, 'agent')).rejects.toThrow(/the DM changed: HP, Defenses › AC\..*ask the DM which version to keep/)
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

describe('live writes into the campaign', () => {
  function publisher() {
    const saved = new Map<string, unknown>(); let writes = 0, failAt = 0
    const p: Publisher = {
      check: async () => {}, read: async (d, id) => saved.get(d.id + '/' + id) ?? null,
      encode: (c, _kind, id) => ({ id, content: { ...c, id } }),
      write: async (d, id, valueKind, value) => { writes++; if (writes === failAt) throw new Error('disk full'); saved.set(d.id + '/' + id, value) },
    }
    return { p, saved, fail: (n: number) => { failAt = n }, writes: () => writes, content: (key: string) => (saved.get(key) as any)?.content }
  }
  it('creates the entry with the first version and updates that entry with every later one', async () => {
    const p = publisher(); const s = new DraftStore(root, p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }])
    const entityId = d.destinations[0].entityId!
    expect(p.saved.get(`a/${entityId}`)).toMatchObject({ id: entityId, content: { id: entityId, name: 'Synthetic shade' } })
    expect(d.destinations).toEqual([{ type: 'campaign', id: 'a', entityId, expectedHash: digest(p.saved.get(`a/${entityId}`)) }])
    expect((await new DraftStore(root).get(d.id)).destinations[0].entityId).toBe(entityId)
    await s.patch({ id: d.id, revision: 1, changes: [{ path: '/content/hp', value: 31 }] }, 'agent')
    expect(p.saved.size).toBe(1)
    expect(p.content(`a/${entityId}`).hp).toBe(31)
    // A comment changes nothing in the entry: no write.
    await s.comment(d.id, 'Too tough?', '/content/hp', 'dm')
    expect(p.writes()).toBe(2)
    expect((await s.syncState(d.id)).error).toBeUndefined()
  })
  it('restoring an earlier version writes it into the entry', async () => {
    const p = publisher(); const s = new DraftStore(root, p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }])
    const next = await s.patch({ id: d.id, revision: 1, changes: [{ path: '/content/hp', value: 31 }] }, 'dm')
    await s.restore(d.id, next.revision, 1, 'agent')
    expect(p.content(`a/${d.destinations[0].entityId}`).hp).toBe((d.content as Monster).hp)
  })
  it('folds a change made to the entry elsewhere into the draft; a field both changed keeps the draft value', async () => {
    const p = publisher(); const s = new DraftStore(root, p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }])
    const key = `a/${d.destinations[0].entityId}`
    await s.patch({ id: d.id, revision: 1, changes: [{ path: '/content/hp', value: 31 }] }, 'agent')
    // Renamed outside the draft (say, an older editor): the draft takes the new name at once.
    p.saved.set(key, { ...(p.saved.get(key) as object), content: { ...p.content(key), name: 'Renamed by hand' } })
    await s.entryChanged('a', d.destinations[0].entityId!)
    const folded = await s.get(d.id)
    expect(folded.content).toMatchObject({ name: 'Renamed by hand', hp: 31 })
    expect(folded.lastChange).toEqual({ by: 'dm', action: 'edited' })
    // Both change HP: the draft's edit wins, and the outside rename stays.
    p.saved.set(key, { ...(p.saved.get(key) as object), content: { ...p.content(key), hp: 99, speed: { walk: 4 } } })
    await s.patch({ id: d.id, revision: folded.revision, changes: [{ path: '/content/hp', value: 40 }] }, 'dm')
    expect(p.content(key)).toMatchObject({ name: 'Renamed by hand', hp: 40, speed: { walk: 4 } })
    expect((await s.get(d.id)).content).toMatchObject({ hp: 40, speed: { walk: 4 } })
    expect((await s.syncState(d.id)).error).toBeUndefined()
  })
  it('gives a new entry the campaign-side fields it was created with, and archives drafts of a deleted entry', async () => {
    const p = publisher(); const s = new DraftStore(join(root, 'drafts'), p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }], 'dm', { basedOn: 'published/creature/m1', art: { imageId: 'x' } })
    expect(p.saved.get(`a/${d.destinations[0].entityId}`)).toMatchObject({ basedOn: 'published/creature/m1', art: { imageId: 'x' } })
    await s.entryDeleted('a', d.destinations[0].entityId!)
    expect(await s.list()).toEqual([])
  })
  it('keeps the edit when the entry cannot be written, says why, and writes it with the next change', async () => {
    const p = publisher(); p.fail(2)
    const s = new DraftStore(root, p.p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }])
    const edited = await s.patch({ id: d.id, revision: 1, changes: [{ path: '/content/hp', value: 33 }] }, 'dm')
    expect((edited.content as Monster).hp).toBe(33)
    expect((await s.syncState(d.id)).error).toMatch(/disk full/)
    await s.patch({ id: d.id, revision: 2, changes: [{ path: '/content/speed/walk', value: 8 }] }, 'dm')
    expect(p.content(`a/${d.destinations[0].entityId}`)).toMatchObject({ hp: 33, speed: { walk: 8 } })
    expect((await s.syncState(d.id)).error).toBeUndefined()
  })
  it('lists versions with who changed which fields, skipping comment-only events', async () => {
    const s = new DraftStore(root, publisher().p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }], 'agent')
    await s.patch({ id: d.id, revision: 1, changes: [{ path: '/content/hp', value: 44 }] }, 'dm')
    await s.comment(d.id, 'Too tough?', '/content/hp', 'agent')
    await s.patch({ id: d.id, revision: 2, changes: [{ path: `/content/powers/@${d.nodes.powers[0]}/name`, value: 'Gloom bite' }], reconciled: [`/content/powers/@${d.nodes.powers[0]}`] }, 'agent')
    const versions = await s.versions(d.id)
    expect(versions.map(v => [v.by, v.action, v.revision])).toEqual([['agent', 'edited', 3], ['dm', 'edited', 2], ['agent', 'created', 1]])
    expect(versions[1].changes).toEqual([{ label: 'HP', change: 'changed', before: String((d.content as Monster).hp), after: '44' }])
    expect(versions[0].changes[0]).toMatchObject({ label: 'Gloom bite › name', before: (d.content as Monster).powers[0].name, after: 'Gloom bite' })
  })
  it('moves an archived session out of the drafts list, keeping its files', async () => {
    const s = new DraftStore(join(root, 'drafts'), publisher().p)
    const d = await s.create('monster', content(), '', [{ type: 'campaign', id: 'a' }])
    await s.archive(d.id)
    expect(await s.list()).toEqual([])
    await expect(s.get(d.id)).rejects.toThrow('not found')
  })
})
