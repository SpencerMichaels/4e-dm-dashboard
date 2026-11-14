import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), getAppPath: () => tmpdir() } }))
const { AuthoringService } = await import('./service')

const root = mkdtempSync(join(tmpdir(), 'authoring-service-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('AI sessions writing into campaigns', () => {
  it('writes every kind into the campaign as it changes; traps and friends as kit records in an envelope', async () => {
    const campaign = join(root, 'campaigns', 'c1')
    mkdirSync(campaign, { recursive: true })
    writeFileSync(join(campaign, 'campaign.json'), JSON.stringify({ id: 'c1', name: 'Test' }))
    const published: string[] = []
    const s = new AuthoringService(root, join(root, 'content'), () => {}, (_c, kind) => { published.push(kind) })
    expect(await s.destinations()).toEqual([{ type: 'campaign', id: 'c1', name: 'Test' }])

    for (const kind of ['trap', 'disease', 'template', 'theme'] as const) {
      const d: any = await s.call('create_draft', { kind, name: `Test ${kind}`, level: 3, destinations: [{ type: 'campaign', id: 'c1' }] }, 'dm')
      const entityId = d.destinations[0].entityId
      const dir = { trap: 'traps', disease: 'diseases', template: 'templates', theme: 'themes' }[kind]
      const record = JSON.parse(readFileSync(join(campaign, dir, `${entityId}.json`), 'utf8'))
      expect(record).toMatchObject({ id: entityId, content: { ...d.content, id: entityId } })
      expect(typeof record.createdAt).toBe('string')

      // An update keeps the record's creation time and replaces the content.
      const { hash } = await s.call('destination_entity', { destination: { type: 'campaign', id: 'c1' }, kind, entityId }, 'dm') as { hash: string }
      const update: any = await s.call('create_draft', { kind, content: { ...record.content, name: `Renamed ${kind}` }, destinations: [{ type: 'campaign', id: 'c1', entityId, expectedHash: hash }] }, 'dm')
      const updated = JSON.parse(readFileSync(join(campaign, dir, `${entityId}.json`), 'utf8'))
      expect(updated.content.name).toBe(`Renamed ${kind}`)
      expect(updated.createdAt).toBe(record.createdAt)
    }
    expect(published).toEqual(['trap', 'trap', 'disease', 'disease', 'template', 'template', 'theme', 'theme'])
  })

  it('refuses library destinations, which were removed', async () => {
    const s = new AuthoringService(root, join(root, 'content'))
    await expect(s.call('create_draft', { kind: 'trap', name: 'X', level: 1, destinations: [{ type: 'library', id: 'old' }] }, 'dm')).rejects.toThrow('campaign')
    await expect(s.call('create_library', { name: 'Old' }, 'dm')).rejects.toThrow('Unknown authoring operation')
  })
})
