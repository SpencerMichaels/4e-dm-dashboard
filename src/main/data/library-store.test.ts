import { afterAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
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
})
