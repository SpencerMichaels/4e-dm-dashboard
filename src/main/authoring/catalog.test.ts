import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Monster } from '@kit'
import { scaffold } from '@common/authoring/core'
import { Catalog } from './catalog'

const root = mkdtempSync(join(tmpdir(), 'authoring-catalog-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('authoring catalog', () => {
  it('lists the installed content pack entries as the pack has them', async () => {
    const dir = join(root, 'content')
    mkdirSync(join(dir, 'monsters'), { recursive: true })
    const gnaw = { ...(scaffold('monster', 'Cellar Gnawer', 2, 'skirmisher') as Monster), id: 'monster9001', sources: [{ book: 'Test Book', page: 3 }] }
    writeFileSync(join(dir, 'monsters', 'monster9001.json'), JSON.stringify(gnaw))
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ format: 1, content: 'test-1', schema: 15, files: {} }))
    const entries = await new Catalog(dir).entries()
    expect(entries).toEqual([{ key: 'published/monster/monster9001', kind: 'monster', content: gnaw, source: 'Content pack test-1; Test Book' }])
  })

  it('is empty without an installed pack', async () => {
    expect(await new Catalog(join(root, 'none')).entries()).toEqual([])
  })
})
