import { afterAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Trap } from '@kit'
import { scaffold } from '@common/authoring/core'
import { newRecord, rehomeRefs } from '@common/campaign-records'

const root = mkdtempSync(join(tmpdir(), 'move-entry-'))
vi.mock('electron', () => ({ app: { getPath: () => root } }))
const store = await import('./campaign-store')
const library = await import('./library-store')
const { moveEntry } = await import('./move-entry')
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('references follow a shared entry', () => {
  it('rewrites each kind of reference both ways, and leaves others alone', () => {
    const encounter = {
      creatures: [{ creatureId: 'x', count: 1, monsterTemplates: ['campaign:x', 'Lich'], monsterTheme: { name: 'campaign:x' } }, { compendiumId: 'x', count: 1 }],
      traps: [{ trapId: 'x', count: 1 }, { trapId: 'y', count: 1 }],
    }
    expect(rehomeRefs('creature', encounter, 'x', true)).toBe(true)
    expect(rehomeRefs('template', encounter, 'x', true)).toBe(true)
    expect(rehomeRefs('theme', encounter, 'x', true)).toBe(true)
    expect(rehomeRefs('trap', encounter, 'x', true)).toBe(true)
    expect(encounter).toEqual({
      creatures: [{ libraryId: 'x', count: 1, monsterTemplates: ['library:x', 'Lich'], monsterTheme: { name: 'library:x' } }, { compendiumId: 'x', count: 1 }],
      traps: [{ libraryId: 'x', count: 1 }, { trapId: 'y', count: 1 }],
    })
    const pc = { conditions: [{ kind: 'disease', libraryId: 'rot', stage: 1 }, { kind: 'effect', id: 'rot', name: 'Cursed' }] }
    expect(rehomeRefs('disease', pc, 'rot', false)).toBe(true)
    expect(pc).toEqual({ conditions: [{ kind: 'disease', diseaseId: 'rot', stage: 1 }, { kind: 'effect', id: 'rot', name: 'Cursed' }] })
    expect(rehomeRefs('disease', pc, 'rot', false)).toBe(false)
  })
})

describe('sharing an entry with every campaign', () => {
  it('moves it into the Library with its art, references, and working copy, and back while no other campaign uses it', async () => {
    const c = await store.createCampaign('Shared')
    await store.openCampaign(c.id)
    const trap = newRecord('pit', scaffold('trap', 'Spiked pit', 2) as Trap, '2026-11-14T00:00:00.000Z')
    await store.saveEntity('trap', { ...trap, art: { imageId: 'pit.png' } })
    mkdirSync(join(root, 'campaigns', c.id, 'assets', 'images'), { recursive: true })
    writeFileSync(join(root, 'campaigns', c.id, 'assets', 'images', 'pit.png'), 'png')
    await store.saveEntity('encounter', { id: 'e1', name: 'Pit room', creatures: [], traps: [{ trapId: 'pit', count: 1 }] })
    await store.saveEntity('location', { id: 'l1', name: 'Hall', traps: [{ trapId: 'pit' }] })
    const moves: string[][] = []
    const moveDraft = async (from: string, to: string, id: string) => { moves.push([from, to, id]) }

    expect(await moveEntry('trap', 'pit', true, moveDraft)).toEqual(['encounter', 'location'])
    expect(await store.getEntity('trap', 'pit')).toBeNull()
    expect(await library.getLibraryRecord('trap', 'pit')).toMatchObject({ id: 'pit', art: { imageId: 'pit.png' }, content: { name: 'Spiked pit' } })
    expect(existsSync(join(root, 'library', 'assets', 'images', 'pit.png'))).toBe(true)
    expect(await store.getEntity('encounter', 'e1')).toMatchObject({ traps: [{ libraryId: 'pit', count: 1 }] })
    expect(await store.getEntity('location', 'l1')).toMatchObject({ traps: [{ libraryId: 'pit' }] })
    expect(moves).toEqual([[c.id, 'library', 'pit']])
    await expect(moveEntry('trap', 'pit', true, moveDraft)).rejects.toThrow('No such campaign entry')

    // Another campaign uses it: it stays in the Library.
    mkdirSync(join(root, 'campaigns', 'other', 'encounters'), { recursive: true })
    writeFileSync(join(root, 'campaigns', 'other', 'campaign.json'), JSON.stringify({ id: 'other', name: 'Other campaign' }))
    writeFileSync(join(root, 'campaigns', 'other', 'encounters', 'e.json'), JSON.stringify({ id: 'e', traps: [{ libraryId: 'pit', count: 1 }] }))
    await expect(moveEntry('trap', 'pit', false, moveDraft)).rejects.toThrow('Other campaigns use it: Other campaign')
    rmSync(join(root, 'campaigns', 'other'), { recursive: true })

    expect(await moveEntry('trap', 'pit', false, moveDraft)).toEqual(['encounter', 'location'])
    expect(await library.getLibraryRecord('trap', 'pit')).toBeNull()
    expect(await store.getEntity('trap', 'pit')).toMatchObject({ id: 'pit', content: { name: 'Spiked pit' } })
    expect(await store.getEntity('encounter', 'e1')).toMatchObject({ traps: [{ trapId: 'pit', count: 1 }] })
    expect(moves[1]).toEqual(['library', c.id, 'pit'])
  })
})
