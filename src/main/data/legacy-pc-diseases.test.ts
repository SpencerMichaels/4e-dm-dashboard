import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { migrateLegacyPcDiseases } from './legacy-pc-diseases'

const dir = mkdtempSync(join(tmpdir(), 'legacy-pc-diseases-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'))
const pc = (id: string, patch = {}) => writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, name: id, playerName: '', createdAt: '', updatedAt: '', ...patch }))

describe('PC diseases migration', () => {
  it('moves diseases into conditions, before any conditions already there', async () => {
    pc('sick', { diseases: [{ compendiumId: 'disease1', stage: 2, since: 't' }], conditions: [{ kind: 'effect', id: 'e', name: 'Cursed', since: 't' }] })
    pc('empty', { diseases: [] })
    pc('new', { conditions: [] })
    expect(await migrateLegacyPcDiseases(dir)).toBe(2)
    expect(read('sick.json').diseases).toBeUndefined()
    expect(read('sick.json').conditions).toEqual([
      { kind: 'disease', compendiumId: 'disease1', stage: 2, since: 't' },
      { kind: 'effect', id: 'e', name: 'Cursed', since: 't' },
    ])
    expect(read('empty.json')).toMatchObject({ conditions: [] })
    expect(read('new.json')).toMatchObject({ conditions: [] })
  })
})
