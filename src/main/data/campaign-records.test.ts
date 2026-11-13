import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Trap } from '@kit'
import { scaffold } from '@common/authoring/core'
import { checkRecord, newRecord, RECORD_TYPES } from '@common/campaign-records'

const root = mkdtempSync(join(tmpdir(), 'campaign-records-'))
vi.mock('electron', () => ({ app: { getPath: () => root } }))
const store = await import('./campaign-store')
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('kit-native campaign records', () => {
  it('creates a folder per record type in new campaigns', async () => {
    const c = await store.createCampaign('Records')
    for (const dir of ['traps', 'diseases', 'templates', 'themes']) expect(existsSync(join(root, 'campaigns', c.id, dir))).toBe(true)
  })

  it('saves, lists, reads, and deletes records as human-readable envelopes', async () => {
    const trap = scaffold('trap', 'Poisoned needle', 3) as Trap
    const record = newRecord('needle', trap, '2026-11-12T00:00:00.000Z', 'published/trap/42')
    await store.saveEntity('trap', record)
    const file = join(root, 'campaigns', store.getActiveCampaignId()!, 'traps', 'needle.json')
    const onDisk = JSON.parse(readFileSync(file, 'utf8'))
    expect(onDisk).toEqual({ id: 'needle', createdAt: record.createdAt, updatedAt: record.updatedAt, basedOn: 'published/trap/42', content: { ...trap, id: 'needle' } })
    expect(readFileSync(file, 'utf8')).toContain('\n  "content": {')
    expect(await store.listEntities('trap')).toEqual([onDisk])
    expect(await store.getEntity('trap', 'needle')).toEqual(onDisk)
    await store.deleteEntity('trap', 'needle')
    expect(await store.listEntities('trap')).toEqual([])
  })

  it('keeps the content id in step with the record id and refuses malformed envelopes', async () => {
    const theme = { id: 'other', name: 'Test', description: '', powers: [], sources: [], provenance: { origin: 'human', at: '' } }
    await store.saveEntity('theme', { id: 't1', createdAt: 'a', updatedAt: 'a', content: theme })
    expect(((await store.getEntity<any>('theme', 't1')).content.id)).toBe('t1')
    await expect(store.saveEntity('disease', { id: 'd1' } as any)).rejects.toThrow('kit content')
    await expect(store.saveEntity('template', { id: '', content: {}, createdAt: 'a', updatedAt: 'a' } as any)).rejects.toThrow('needs an id')
    // Content that does not match the kit yet is saved; the editor reports it.
    await store.saveEntity('disease', { id: 'd2', createdAt: 'a', updatedAt: 'a', content: { name: 'Half-written' } } as any)
    expect((await store.getEntity<any>('disease', 'd2')).content.name).toBe('Half-written')
  })

  it('lists records from campaigns made before the record folders existed', async () => {
    rmSync(join(root, 'campaigns', store.getActiveCampaignId()!, 'templates'), { recursive: true })
    expect(await store.listEntities('template')).toEqual([])
    expect(RECORD_TYPES).toEqual(['creature', 'item', 'trap', 'disease', 'template', 'theme'])
    expect(() => checkRecord('trap', null)).toThrow('needs an id')
  })
})
