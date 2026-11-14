import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), getAppPath: () => tmpdir() } }))
const { AuthoringService } = await import('./service')

const root = mkdtempSync(join(tmpdir(), 'authoring-service-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

// An installed content pack with one invented theme, for copying a published entry.
const { scaffold } = await import('@common/authoring/core')
mkdirSync(join(root, 'content', 'themes'), { recursive: true })
writeFileSync(join(root, 'content', 'manifest.json'), JSON.stringify({ format: 1, content: 'test', schema: 15, files: {} }))
writeFileSync(join(root, 'content', 'themes', 'lantern-keepers.json'), JSON.stringify({ ...(scaffold('theme', 'Lantern Keepers') as object), id: 'lantern-keepers' }))

describe('AI sessions writing into campaigns', () => {
  it('writes every kind into the campaign as it changes; traps and friends as kit records in an envelope', async () => {
    const campaign = join(root, 'campaigns', 'c1')
    mkdirSync(campaign, { recursive: true })
    writeFileSync(join(campaign, 'campaign.json'), JSON.stringify({ id: 'c1', name: 'Test' }))
    const published: string[] = []
    const s = new AuthoringService(root, join(root, 'content'), () => {}, (_c, kind) => { published.push(kind) })
    expect(await s.destinations()).toEqual([{ type: 'campaign', id: 'c1', name: 'Test' }, { type: 'library', id: 'library', name: 'Library' }])

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

  it('puts new content into a campaign: none without one, and a published copy keeps its source and art', async () => {
    const campaign = join(root, 'campaigns', 'c2')
    mkdirSync(campaign, { recursive: true })
    writeFileSync(join(campaign, 'campaign.json'), JSON.stringify({ id: 'c2', name: 'Copies' }))
    const s = new AuthoringService(root, join(root, 'content'))
    await expect(s.call('create_draft', { kind: 'trap', name: 'Loose', level: 1 }, 'agent')).rejects.toThrow('needs a home')
    const key = 'published/theme/' + (await s.call('search', { kind: 'theme', text: '', limit: 1 }) as { key: string }[])[0].key.split('/').pop()
    writeFileSync(join(campaign, 'annotations.json'), JSON.stringify({ [key.split('/').pop()!]: { imageId: 'art.png' } }))
    const d: any = await s.call('create_draft', { from: key, destinations: [{ type: 'campaign', id: 'c2' }] }, 'agent')
    const record = JSON.parse(readFileSync(join(campaign, 'themes', `${d.destinations[0].entityId}.json`), 'utf8'))
    expect(record).toMatchObject({ basedOn: key, art: { imageId: 'art.png' } })
  })

  it('writes Library entries, and copies between the Library and a campaign with source and art', async () => {
    const campaign = join(root, 'campaigns', 'c3')
    mkdirSync(join(campaign, 'assets', 'images'), { recursive: true })
    writeFileSync(join(campaign, 'campaign.json'), JSON.stringify({ id: 'c3', name: 'Shared' }))
    const published: string[] = []
    const s = new AuthoringService(root, join(root, 'content'), () => {}, home => { published.push(home) })
    // The old homebrew libraries' destinations stay refused: the Library is the one with id "library".
    await expect(s.call('create_draft', { kind: 'trap', name: 'X', level: 1, destinations: [{ type: 'library', id: 'old' }] }, 'dm')).rejects.toThrow('campaign or the Library')
    await expect(s.call('create_library', { name: 'Old' }, 'dm')).rejects.toThrow('Unknown authoring operation')

    const lib: any = await s.call('create_draft', { kind: 'trap', name: 'Shared snare', level: 2, destinations: [{ type: 'library', id: 'library' }] }, 'dm')
    const libId = lib.destinations[0].entityId
    expect(JSON.parse(readFileSync(join(root, 'library', 'traps', `${libId}.json`), 'utf8'))).toMatchObject({ id: libId, content: { name: 'Shared snare' } })
    expect(published).toEqual(['library'])
    // Its working copy is the same draft.
    expect((await s.call('working_copy', { campaignId: 'library', kind: 'trap', entityId: libId }, 'dm') as any).id).toBe(lib.id)

    // A copy from the Library into a campaign: the Library entry is the source.
    const toCampaign: any = await s.call('create_draft', { from: `library/trap/${libId}`, destinations: [{ type: 'campaign', id: 'c3' }] }, 'dm')
    expect(JSON.parse(readFileSync(join(campaign, 'traps', `${toCampaign.destinations[0].entityId}.json`), 'utf8'))).toMatchObject({ basedOn: `library/trap/${libId}`, content: { name: 'Shared snare' } })

    // A copy into the Library: a campaign entry's art comes along, with its image file; its own source stays.
    const entry: any = await s.call('create_draft', { kind: 'monster', name: 'Grave hound', level: 4, destinations: [{ type: 'campaign', id: 'c3' }] }, 'dm')
    const entryId = entry.destinations[0].entityId
    const path = join(campaign, 'creatures', `${entryId}.json`)
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), basedOn: 'published/creature/m1', art: { imageId: 'hound.png' } }))
    writeFileSync(join(campaign, 'assets', 'images', 'hound.png'), 'png')
    const toLibrary: any = await s.call('create_draft', { from: `campaign/c3/monster/${entryId}`, destinations: [{ type: 'library', id: 'library' }] }, 'dm')
    expect(JSON.parse(readFileSync(join(root, 'library', 'creatures', `${toLibrary.destinations[0].entityId}.json`), 'utf8'))).toMatchObject({ basedOn: 'published/creature/m1', art: { imageId: 'hound.png' }, content: { name: 'Grave hound' } })
    expect(readFileSync(join(root, 'library', 'assets', 'images', 'hound.png'), 'utf8')).toBe('png')
  })
})

describe('where an agent\'s new content goes', () => {
  it('the open campaign, or the Library when asked or when no campaign is open', async () => {
    const { agentHome } = await import('./service')
    expect(agentHome('create_draft', { kind: 'trap' }, 'c1')).toEqual({ kind: 'trap', destinations: [{ type: 'campaign', id: 'c1' }] })
    expect(agentHome('create_draft', { kind: 'trap', destination: 'library' }, 'c1')).toEqual({ kind: 'trap', destinations: [{ type: 'library', id: 'library' }] })
    expect(agentHome('create_draft', { kind: 'trap' }, null)).toEqual({ kind: 'trap', destinations: [{ type: 'library', id: 'library' }] })
    // Explicit destinations, and other calls, pass through.
    const explicit = { kind: 'trap', destinations: [{ type: 'campaign', id: 'c2' }] }
    expect(agentHome('create_draft', explicit, 'c1')).toBe(explicit)
    expect(agentHome('patch_draft', { id: 'x' }, 'c1')).toEqual({ id: 'x' })
  })
})
