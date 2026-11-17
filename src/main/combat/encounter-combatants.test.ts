import { describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), getAppPath: () => tmpdir() } }))
import type { Monster, SkillChallenge, Trap } from '@kit'
import type { CreatureRecord, Encounter } from '@common/types'
import { legacyCreatureToRecord } from '../data/legacy-creatures'
import { scaffold } from '@common/authoring/core'
import type { MonsterTemplate } from '@kit'
import { encounterCombatants, encounterXp, resolveRow, type EncounterSources } from './encounter-combatants'
import { monsterXp } from '@kit'

const published = { ...(scaffold('monster', 'Goblin Cutter', 3, 'skirmisher') as Monster), id: 'monster1' }
const custom: CreatureRecord = legacyCreatureToRecord({ id: 'c1', name: 'Captain', hp: 60, maxHp: 60, imageId: 'img', createdAt: '', updatedAt: '', statBlock: { level: 5, role: 'soldier', creatureType: 'humanoid', origin: 'natural', ac: 21, defenses: { fortitude: 18, reflex: 17, will: 16 }, abilities: { con: 14 }, actions: [] } })
// An invented elite template for humanoids (published ones come from the content pack).
const champion: MonsterTemplate = { ...(scaffold('template', 'Test Champion') as MonsterTemplate), role: 'soldier', prerequisite: { text: 'Humanoid', check: { kind: 'type', any: ['humanoid'] } }, defenses: { ac: 2 }, hpPerLevel: 8, savingThrows: 2, actionPoints: 1 }
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
      { creatureId: 'c1', count: 1, monsterTemplates: ['Test Champion'], overrideName: 'The Captain', levelAdjust: 1 },
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
    expect(captain.attribution!.diffs.map(d => d.source)).toContain('Test Champion')
    expect(captain.hp).toBe((captain.content as Monster).hp)
  })

  it('previews a row and lists the templates its creature qualifies for', () => {
    const row = resolveRow({ creatureId: 'c1', count: 1 }, sources)!
    expect(row.baseRank).toBe('standard')
    expect(row.eligible).toEqual(['Test Champion'])
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

describe('Library entries', () => {
  it('resolve live by libraryId: creatures, traps, and templates', () => {
    const shared: CreatureRecord = { id: 'lib1', createdAt: '', updatedAt: '', content: { ...(scaffold('monster', 'Shared Shade', 6, 'lurker') as Monster), id: 'lib1' }, art: { imageId: 'shade-art' } }
    const snare = { id: 'lib2', createdAt: '', updatedAt: '', content: { ...(scaffold('trap', 'Shared Snare', 2) as Trap), id: 'lib2' } }
    const s: EncounterSources = { ...sources, library: { creatures: [shared], traps: [snare] }, templates: [...sources.templates, { ref: 'library:t1', template: { ...champion, name: 'Shared Champion' } }] }
    const encounter = { id: 'e', name: 'E', tags: [], createdAt: '', updatedAt: '', creatures: [{ libraryId: 'lib1', count: 1, monsterTemplates: ['library:t1'] }, { libraryId: 'gone', count: 1 }], traps: [{ libraryId: 'lib2', count: 1 }] } as Encounter
    const [shade, trap, ...rest] = encounterCombatants(encounter, s)
    expect(rest).toHaveLength(0)
    expect(shade).toMatchObject({ name: 'Shared Shade', imageId: 'shade-art', entityId: 'lib1' })
    expect(shade.content).toMatchObject({ rank: 'elite' })
    expect(trap).toMatchObject({ kind: 'trap', name: 'Shared Snare', entityId: 'lib2' })
  })
})

describe('encounter XP', () => {
  it('adds each row\'s adjusted monster XP and each trap\'s, the location\'s too, times the count', () => {
    const encounter = { id: 'e', name: 'E', tags: [], createdAt: '', updatedAt: '', creatures: [
      { compendiumId: 'monster1', count: 4, isMinion: true },
      { creatureId: 'c1', count: 1, monsterTemplates: ['Test Champion'], levelAdjust: 1 },
      { compendiumId: 'missing', count: 2 },
    ], traps: [{ trapId: 'pit', count: 2 }] } as Encounter
    const pit = sources.traps[0].xp
    const expected = 4 * monsterXp(3, 'minion') + monsterXp(6, 'elite') + 2 * pit
    expect(encounterXp(encounter, sources)).toBe(expected)
    expect(encounterXp(encounter, { ...sources, locationTraps: [{ compendiumId: 'trap40' }, { trapId: 'pit' }] }))
      .toBe(expected + sources.publishedTrap('trap40')!.xp)
    // Skill challenges add complexity x a standard monster of their level each (RC p. 293): a campaign one at its
    // own level 7 (900), and a published one that follows the party, at the encounter's level 2 (2 x 125).
    const bridge = scaffold('challenge', 'Cross the Bridge') as SkillChallenge
    const ritual = { ...(scaffold('challenge', 'Stop the Ritual') as SkillChallenge), id: 'ritual', complexity: 2 }
    const withChallenges = { ...sources, challenges: [{ id: 'bridge', createdAt: '', updatedAt: '', content: { ...bridge, id: 'bridge', level: 7, complexity: 3 } }], publishedChallenge: (id: string) => id === 'ritual' ? ritual : null, partyLevel: 2 }
    expect(encounterXp({ ...encounter, challenges: [{ challengeId: 'bridge' }, { compendiumId: 'ritual' }] }, withChallenges)).toBe(expected + 900 + 250)
    // A row's own level wins; a missing challenge adds nothing.
    expect(encounterXp({ ...encounter, level: 5, challenges: [{ compendiumId: 'ritual', level: 9 }, { challengeId: 'gone' }] }, withChallenges)).toBe(expected + 800)
    // Standing alone, a challenge doesn't take its location's traps.
    expect(encounterXp({ ...encounter, creatures: [], traps: [], challenges: [{ challengeId: 'bridge' }] }, { ...withChallenges, locationTraps: [{ compendiumId: 'trap40' }] })).toBe(900)
  })
})
