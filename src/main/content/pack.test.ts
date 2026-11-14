import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SCHEMA_VERSION, type Item, type Monster, type MonsterTemplate } from '@kit'
import { scaffold } from '@common/authoring/core'

const userData = mkdtempSync(join(tmpdir(), 'content-pack-'))
afterAll(() => rmSync(userData, { recursive: true, force: true }))
vi.mock('electron', () => ({ app: { getPath: () => userData } }))

const { readZip, writeZip, ZipError } = await import('./zip')
const { PACK_FORMAT, PackError, readPack, sha256 } = await import('./pack')
const store = await import('./store')
const { buildPack } = await import('../../../tools/content/pack')

// Invented entries only: no book text in committed tests.
const gnawer = { ...(scaffold('monster', 'Cellar Gnawer', 2, 'skirmisher') as Monster), id: 'monster9001', rank: 'elite' as const, sources: [{ book: 'Test Book', page: 3 }] }
const lantern = { ...(scaffold('item', 'Lantern of Testing', 4) as Item), id: 'item9001', rarity: 'uncommon' as const, slot: 'wondrous' as const, levels: [{ level: 4, price: 840 }], sources: [{ book: 'Test Book' }] }
const keeper = { ...(scaffold('template', 'Lantern Keeper') as MonsterTemplate), id: 'lantern-keeper' }

/** A content repo folder with the given entries, as tools/content/pack.ts reads it. */
function repo(entries: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(userData, 'repo-'))
  for (const [path, value] of Object.entries({ ...entries, ...extra })) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), JSON.stringify(value, null, 2) + '\n')
  }
  return dir
}
const goodRepo = () => repo({
  'monsters/monster9001.json': gnawer, 'items/item9001.json': lantern, 'templates/lantern-keeper.json': keeper,
  'glossary.json': { gnawing: { name: 'Gnawing', category: 'other', definition: 'Chewing loudly.', source: 'Test Book' } },
  'conditions.json': { dazed: 'Test text for dazed.' },
})
const packFile = (zip: Buffer) => { const path = join(userData, `pack-${Math.random().toString(36).slice(2)}.zip`); writeFileSync(path, zip); return path }

describe('zip', () => {
  it('round-trips stored and deflated files', async () => {
    const files = [{ name: 'a.json', data: Buffer.from('{}') }, { name: 'monsters/b.json', data: Buffer.from('x'.repeat(5000)) }]
    const zip = writeZip(files)
    expect(zip.length).toBeLessThan(5000)
    expect(await readZip(zip, () => true)).toEqual(files)
  })

  it('refuses unexpected names, damaged data, and non-zips', async () => {
    const zip = writeZip([{ name: '../evil.json', data: Buffer.from('{}') }])
    await expect(readZip(zip, n => !n.includes('..'))).rejects.toThrow(/Unexpected file/)
    const good = writeZip([{ name: 'a.json', data: Buffer.from('hello hello hello hello') }])
    const bad = Buffer.from(good)
    bad[30 + 'a.json'.length + 2] ^= 0xff
    await expect(readZip(bad, () => true)).rejects.toBeInstanceOf(ZipError)
    await expect(readZip(Buffer.from('not a zip at all, not even close'), () => true)).rejects.toThrow(/Not a zip/)
  })
})

describe('content packs', () => {
  it('builds a pack with a manifest of every file and its sha256', async () => {
    const { zip, manifest, warnings } = buildPack(goodRepo(), 'test-1')
    expect(warnings).toEqual(['traps/ is missing', 'diseases/ is missing', 'themes/ is missing'])
    expect(manifest).toMatchObject({ format: PACK_FORMAT, content: 'test-1', schema: SCHEMA_VERSION })
    expect(Object.keys(manifest.files).sort()).toEqual(['conditions.json', 'glossary.json', 'items/item9001.json', 'monsters/monster9001.json', 'templates/lantern-keeper.json'])
    const { files } = await readPack(zip)
    for (const f of files.filter(f => f.name !== 'manifest.json')) expect(sha256(f.data)).toBe(manifest.files[f.name])
  })

  it('skips repo files whose name is not their entry id', () => {
    const { manifest, warnings } = buildPack(repo({ 'monsters/monster1.json': gnawer }), 'test')
    expect(manifest.files).toEqual({})
    expect(warnings).toContainEqual(expect.stringMatching(/monsters\/monster1.json: its id is "monster9001"/))
  })

  it('refuses a changed file, a missing or unlisted file, and a newer schema', async () => {
    const { manifest } = buildPack(goodRepo(), 'test')
    const files = (m: object, entries: [string, unknown][]) => writeZip([{ name: 'manifest.json', data: Buffer.from(JSON.stringify(m)) },
      ...entries.map(([name, v]) => ({ name, data: Buffer.from(JSON.stringify(v, null, 2) + '\n') }))])
    const all: [string, unknown][] = [['monsters/monster9001.json', gnawer], ['items/item9001.json', lantern], ['templates/lantern-keeper.json', keeper],
      ['glossary.json', { gnawing: { name: 'Gnawing', category: 'other', definition: 'Chewing loudly.', source: 'Test Book' } }], ['conditions.json', { dazed: 'Test text for dazed.' }]]
    await expect(readPack(files(manifest, all))).resolves.toBeTruthy()
    await expect(readPack(files(manifest, [['monsters/monster9001.json', { ...gnawer, hp: 1 }], ...all.slice(1)]))).rejects.toThrow(/does not match its checksum/)
    await expect(readPack(files(manifest, all.slice(1)))).rejects.toThrow(/incomplete/)
    await expect(readPack(files(manifest, [...all, ['traps/trap1.json', {}]]))).rejects.toThrow(/does not list/)
    await expect(readPack(files({ ...manifest, schema: SCHEMA_VERSION + 1 }, all))).rejects.toThrow(/newer version of the app/)
    await expect(readPack(writeZip([{ name: 'monsters/monster9001.json', data: Buffer.from('{}') }]))).rejects.toThrow(/no manifest/)
    await expect(readPack(writeZip([{ name: 'notes.txt', data: Buffer.from('') }]))).rejects.toBeInstanceOf(PackError)
  })
})

describe('the installed pack', () => {
  beforeEach(() => { delete process.env.FOUR_E_CONTENT_DIR })

  it('is empty before any import: no indexes, entries, glossary, or condition text', () => {
    expect(store.contentVersion()).toBeNull()
    expect(store.publishedIndexes()).toEqual({ monsters: [], items: [], traps: [], diseases: [], templates: [], themes: [] })
    expect(store.readEntry('monster', 'monster9001')).toBeNull()
    expect(store.publishedGlossary()).toEqual({})
    expect(store.conditionDescriptions()).toEqual({})
  })

  it('installs a verified pack, builds its indexes, and serves its entries', async () => {
    const changed = vi.fn()
    store.onContentChanged(changed)
    expect(await store.importPack(packFile(buildPack(goodRepo(), 'test-2').zip))).toBe('test-2')
    expect(changed).toHaveBeenCalled()
    expect(store.contentVersion()).toBe('test-2')
    expect(store.readEntry('monster', 'monster9001')).toEqual(gnawer)
    expect(store.readEntry('monster', '../manifest')).toBeNull()
    const ix = store.publishedIndexes()
    expect(ix.monsters).toEqual([{ id: 'monster9001', name: 'Cellar Gnawer', level: 2, role: 'skirmisher', modifier: 'elite', size: 'Medium', type: 'humanoid', origin: 'natural', alignment: 'unaligned', xp: gnawer.xp, source: 'Test Book' }])
    expect(ix.items[0]).toMatchObject({ id: 'item9001', rarity: 'Uncommon', slot: 'Wondrous Item', price: '840 gp', priceGp: 840, source: 'Test Book' })
    expect(ix.templates.map(t => t.id)).toEqual(['lantern-keeper'])
    expect(store.conditionDescriptions()).toEqual({ dazed: 'Test text for dazed.' })
    expect(JSON.parse(readFileSync(join(userData, 'content', 'index.json'), 'utf-8'))).toMatchObject({ content: 'test-2' })
  })

  it('leaves the installed pack alone when an import fails', async () => {
    await store.importPack(packFile(buildPack(goodRepo(), 'test-3').zip))
    const result = store.importPack(packFile(Buffer.from('garbage')))
    await expect(result).rejects.toBeInstanceOf(PackError)
    expect(store.contentVersion()).toBe('test-3')
    expect(store.readEntry('item', 'item9001')).toEqual(lantern)
    expect(existsSync(join(userData, 'content.new'))).toBe(false)
  })

  it('restores the previous pack after an import interrupted between its renames', async () => {
    await store.importPack(packFile(buildPack(goodRepo(), 'test-4').zip))
    const { renameSync } = await import('fs')
    renameSync(join(userData, 'content'), join(userData, 'content.old'))
    mkdirSync(join(userData, 'content.new'))
    await store.recoverInterruptedImport()
    expect(existsSync(join(userData, 'content', 'manifest.json'))).toBe(true)
    expect(existsSync(join(userData, 'content.old'))).toBe(false)
    expect(existsSync(join(userData, 'content.new'))).toBe(false)
  })
})
