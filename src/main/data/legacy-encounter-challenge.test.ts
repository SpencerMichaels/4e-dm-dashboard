import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { migrateLegacyEncounterChallenges } from './legacy-encounter-challenge'

describe('legacy encounter challenges', () => {
  it('turns an inline challenge into a campaign record and a row, keeping its progress', async () => {
    const root = mkdtempSync(join(tmpdir(), 'legacy-challenge-'))
    const encounters = join(root, 'encounters'), challenges = join(root, 'challenges')
    mkdirSync(encounters)
    writeFileSync(join(encounters, 'overlook.json'), JSON.stringify({ id: 'overlook', name: 'Overlook', creatures: [{ compendiumId: 'm', count: 4 }], tags: [], challenge: { level: 8, complexity: 2, successes: 1 } }))
    writeFileSync(join(encounters, 'bridge.json'), JSON.stringify({ id: 'bridge', name: 'Cross the bridge', creatures: [], tags: [], challenge: { level: 4, complexity: 3, notes: 'Athletics DC 16' } }))
    writeFileSync(join(encounters, 'plain.json'), JSON.stringify({ id: 'plain', name: 'Plain', creatures: [], tags: [] }))
    expect(await migrateLegacyEncounterChallenges(encounters, challenges, 'then')).toBe(2)
    const records = readdirSync(challenges).map(f => JSON.parse(readFileSync(join(challenges, f), 'utf8')))
    const overlook = JSON.parse(readFileSync(join(encounters, 'overlook.json'), 'utf8'))
    const fight = records.find(r => r.id === overlook.challenges[0].challengeId)
    expect(overlook.challenge).toBeUndefined()
    expect(overlook.challenges).toEqual([{ challengeId: fight.id, successes: 1 }])
    expect(fight.content).toMatchObject({ id: fight.id, name: 'Overlook: skill challenge', level: 8, complexity: 2 })
    const bridge = JSON.parse(readFileSync(join(encounters, 'bridge.json'), 'utf8'))
    expect(records.find(r => r.id === bridge.challenges[0].challengeId).content).toMatchObject({ name: 'Cross the bridge', level: 4, complexity: 3, special: 'Athletics DC 16' })
    expect(await migrateLegacyEncounterChallenges(encounters, challenges)).toBe(0)
  })
})
