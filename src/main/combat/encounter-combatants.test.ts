import { describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), getAppPath: () => tmpdir() } }))
import type { Monster, Trap } from '@kit'
import type { CreatureRecord, Encounter } from '@common/types'
import { legacyCreatureToRecord } from '../data/legacy-creatures'
import { scaffold } from '@common/authoring/core'
import { convertTemplate } from '../../../tools/content/convert/template'
import { MONSTER_TEMPLATES } from '../../renderer/components/creature/monster-templates'
import { encounterCombatants, resolveRow, type EncounterSources } from './encounter-combatants'

const ctx = { provenance: { origin: 'parser' as const, at: '', by: 'test' } }
const published = { ...(scaffold('monster', 'Goblin Cutter', 3, 'skirmisher') as Monster), id: 'monster1' }
const custom: CreatureRecord = legacyCreatureToRecord({ id: 'c1', name: 'Captain', hp: 60, maxHp: 60, imageId: 'img', createdAt: '', updatedAt: '', statBlock: { level: 5, role: 'soldier', creatureType: 'humanoid', origin: 'natural', ac: 21, defenses: { fortitude: 18, reflex: 17, will: 16 }, abilities: { con: 14 }, actions: [] } })
const champion = convertTemplate(MONSTER_TEMPLATES.find(t => t.name === 'Battle Champion')!, ctx)
const sources: EncounterSources = {
  creatures: [custom], published: id => id === 'monster1' ? structuredClone(published) : null,
  templates: [{ ref: champion.name, template: champion }], themes: [],
  annotations: { monster1: { imageId: 'goblin-art' } },
  traps: [{ ...(scaffold('trap', 'Spiked Pit', 4) as Trap), id: 'pit' }],
  publishedTrap: id => id === 'trap40' ? { ...(scaffold('trap', 'Pyrotechnics Trap', 5) as Trap), id, initiative: 6 } : null,
}

describe('encounter combatants', () => {
  it('builds kit combatants with the row adjustments, names, counts, and images', () => {
    const encounter = { id: 'e', name: 'E', tags: [], createdAt: '', updatedAt: '', creatures: [
      { compendiumId: 'monster1', count: 3, isMinion: true },
      { creatureId: 'c1', count: 1, monsterTemplates: ['Battle Champion'], overrideName: 'The Captain', levelAdjust: 1 },
      { compendiumId: 'missing', count: 2 },
    ] } as Encounter
    const combatants = encounterCombatants(encounter, sources)
    expect(combatants).toHaveLength(4)
    const [goblin, , , captain] = combatants
    expect(goblin).toMatchObject({ name: 'Goblin Cutter', hp: 1, maxHp: 1, kind: 'creature', imageId: 'goblin-art', entityId: 'monster1' })
    expect(goblin.content).toMatchObject({ rank: 'minion' })
    expect(new Set(combatants.slice(0, 3).map(c => c.initiativeGroupId)).size).toBe(1)
    expect(captain).toMatchObject({ name: 'The Captain', imageId: 'img', entityId: 'c1', initiativeGroupId: undefined })
    expect(captain.content).toMatchObject({ rank: 'elite', level: 6, role: 'soldier' })
    expect(captain.attribution!.diffs.map(d => d.source)).toContain('Battle Champion')
    expect(captain.hp).toBe((captain.content as Monster).hp)
  })

  it('previews a row and lists the templates its creature qualifies for', () => {
    const row = resolveRow({ creatureId: 'c1', count: 1 }, sources)!
    expect(row.baseRank).toBe('standard')
    expect(row.eligible).toEqual(['Battle Champion'])
    expect(resolveRow({ creatureId: 'nope', count: 1 }, sources)).toBeNull()
  })
})

describe('encounter traps', () => {
  it('adds traps as hidden trap combatants unless their row is visible', () => {
    const encounter = { id: 'e', name: 'E', tags: [], createdAt: '', updatedAt: '', creatures: [], traps: [
      { trapId: 'pit', count: 1 },
      { compendiumId: 'trap40', count: 2, visible: true, overrideName: 'Fire Jets' },
      { compendiumId: 'missing', count: 1 },
    ] } as Encounter
    const [pit, jet1, jet2, ...rest] = encounterCombatants(encounter, sources)
    expect(rest).toHaveLength(0)
    expect(pit).toMatchObject({ kind: 'trap', name: 'Spiked Pit', hidden: true, hp: 0, maxHp: 0, entityId: 'pit' })
    expect(jet1).toMatchObject({ kind: 'trap', name: 'Fire Jets', hidden: false, entityId: 'trap40' })
    expect(jet1.initiativeGroupId).toBe(jet2.initiativeGroupId)
    expect((jet1.content as Trap).initiative).toBe(6)
  })
})

describe('location traps', () => {
  it('join the encounter hidden, once, unless the encounter lists them itself', () => {
    const encounter = { id: 'e', name: 'E', tags: [], createdAt: '', updatedAt: '', creatures: [], traps: [{ compendiumId: 'trap40', count: 1, visible: true }] } as Encounter
    const traps = encounterCombatants(encounter, { ...sources, locationTraps: [{ compendiumId: 'trap40' }, { trapId: 'pit' }] })
    expect(traps.map(t => [t.name, t.hidden])).toEqual([['Pyrotechnics Trap', false], ['Spiked Pit', true]])
  })
})
