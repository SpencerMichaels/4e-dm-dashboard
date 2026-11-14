import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { migratePartyLevel } from './legacy-party-level'

const dir = mkdtempSync(join(tmpdir(), 'legacy-party-level-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'))
const pc = (id: string, patch = {}) => writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, name: id, playerName: '', createdAt: '', updatedAt: '', ...patch }))

describe('campaign party level migration', () => {
  it('gives the old party level only to PCs without a sheet or a level', async () => {
    pc('plain')
    pc('leveled', { level: 2 })
    pc('sheeted', { sheet: { level: 7 } })
    expect(await migratePartyLevel(dir, 5)).toBe(1)
    expect(read('plain.json').level).toBe(5)
    expect(read('leveled.json').level).toBe(2)
    expect(read('sheeted.json').level).toBeUndefined()
  })
})
