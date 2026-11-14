import { afterAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type { Trap } from '@kit'
import { scaffold } from '@common/authoring/core'
import { newRecord } from '@common/campaign-records'

const root = mkdtempSync(join(tmpdir(), 'library-store-'))
vi.mock('electron', () => ({ app: { getPath: () => root } }))
const library = await import('./library-store')
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('the Library', () => {
  it('keeps records outside every campaign, as the same envelopes', async () => {
    await library.ensureLibrary()
    for (const dir of ['creatures', 'items', 'traps', 'diseases', 'templates', 'themes', 'assets/images']) expect(existsSync(join(root, 'library', dir))).toBe(true)
    const record = newRecord('snare', scaffold('trap', 'Shared snare', 2) as Trap, '2026-11-14T00:00:00.000Z')
    await library.saveLibraryRecord('trap', record)
    const onDisk = JSON.parse(readFileSync(join(root, 'library', 'traps', 'snare.json'), 'utf8'))
    expect(onDisk).toEqual(record)
    expect(await library.getLibraryRecord('trap', 'snare')).toEqual(record)
    expect((await library.libraryState()).traps).toEqual([record])
    await expect(library.saveLibraryRecord('trap', { id: 'x' })).rejects.toThrow('kit content')
    await library.deleteLibraryRecord('trap', 'snare')
    expect(await library.listLibrary('trap')).toEqual([])
  })

  it('finds the campaigns that use an entry, and how often', async () => {
    const campaign = (id: string, name: string, files: Record<string, unknown>) => {
      mkdirSync(join(root, 'campaigns', id), { recursive: true })
      writeFileSync(join(root, 'campaigns', id, 'campaign.json'), JSON.stringify({ id, name }))
      for (const [path, value] of Object.entries(files)) {
        mkdirSync(dirname(join(root, 'campaigns', id, path)), { recursive: true })
        writeFileSync(join(root, 'campaigns', id, path), JSON.stringify(value))
      }
    }
    campaign('c1', 'Shadowfell', {
      'encounters/e1.json': { creatures: [{ libraryId: 'shade', count: 2, monsterTemplates: ['library:t1'] }, { compendiumId: 'shade', count: 1 }], traps: [{ libraryId: 'pit', count: 1 }] },
      'locations/l1.json': { traps: [{ libraryId: 'pit' }] },
      // p1 is from before PC diseases became conditions (a campaign not opened since).
      'player-characters/p1.json': { diseases: [{ libraryId: 'rot', stage: 1 }] },
      'player-characters/p2.json': { conditions: [{ kind: 'disease', libraryId: 'rot', stage: 2 }, { kind: 'effect', id: 'x', name: 'Cursed' }] },
    })
    campaign('c2', 'Elsewhere', { 'encounters/e1.json': { creatures: [{ creatureId: 'shade', count: 1, monsterTheme: { name: 'library:th1' } }] } })
    expect(await library.libraryUsage('creature', 'shade')).toEqual([{ campaignId: 'c1', name: 'Shadowfell', uses: 1 }])
    expect(await library.libraryUsage('trap', 'pit')).toEqual([{ campaignId: 'c1', name: 'Shadowfell', uses: 2 }])
    expect(await library.libraryUsage('disease', 'rot')).toEqual([{ campaignId: 'c1', name: 'Shadowfell', uses: 2 }])
    expect(await library.libraryUsage('template', 't1')).toEqual([{ campaignId: 'c1', name: 'Shadowfell', uses: 1 }])
    expect(await library.libraryUsage('theme', 'th1')).toEqual([{ campaignId: 'c2', name: 'Elsewhere', uses: 1 }])
    expect(await library.libraryUsage('creature', 'nobody')).toEqual([])
  })
})
