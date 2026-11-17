import { describe, expect, it } from 'vitest'
import type { SkillChallenge } from '../types'
import { ADVANCEMENT_XP, challengeOutcome, challengeSuccesses, challengeXp, encounterFrame, isSkillChallenge, questXp, recordChallengeCheck, xpToNextLevel } from './rewards'

describe('experience by level', () => {
  it('takes the Character Advancement table\'s steps (PHB p. 29, RC p. 85)', () => {
    for (let level = 1; level < 30; level++) expect(ADVANCEMENT_XP[level + 1]).toBeGreaterThan(ADVANCEMENT_XP[level])
    expect(xpToNextLevel(1)).toBe(1000)
    expect(xpToNextLevel(4)).toBe(1750)
    expect(xpToNextLevel(29)).toBe(175000)
    expect(xpToNextLevel(30)).toBeUndefined()
  })

  it('plans an encounter at its own level, else the party\'s level now', () => {
    expect(encounterFrame({ level: 7 }, 4)).toBe(7)
    expect(encounterFrame({}, 4)).toBe(4)
    expect(encounterFrame({}, undefined)).toBeUndefined()
  })
})

describe('quest XP', () => {
  it('prices quests in standard monsters of their level (DMG p. 122, RC pp. 294-295)', () => {
    // A 10th-level major quest gives each PC 500 XP whatever the party's size (DMG p. 122).
    expect(questXp('major', 10, 5) / 5).toBe(500)
    expect(questXp('major', 10, 4)).toBe(2000)
    // A 9th-level minor quest is 400 XP shared: 100 each for four (DMG p. 122); a 1st-level one 20 each for five (RC p. 294).
    expect(questXp('minor', 9, 4) / 4).toBe(100)
    expect(questXp('minor', 1, 5) / 5).toBe(20)
    // Moderate: half a 1st-level monster to each PC, 50 XP (RC p. 295).
    expect(questXp('moderate', 1, 5) / 5).toBe(50)
  })
})

describe('skill challenges', () => {
  it('needs 4-12 successes before 3 failures and is worth complexity x a standard monster (RC pp. 159, 293-294)', () => {
    expect([1, 2, 3, 4, 5].map(challengeSuccesses)).toEqual([4, 6, 8, 10, 12])
    // A 7th-level challenge of complexity 3 counts as three 7th-level threats, 900 XP (RC p. 293).
    expect(challengeXp({ level: 7, complexity: 3 })).toBe(900)
    expect(challengeXp({ level: 30, complexity: 5 })).toBe(95000)
    const enc = { creatures: [], challenge: { level: 3, complexity: 1 } }
    expect(isSkillChallenge(enc)).toBe(true)
    expect(isSkillChallenge({ ...enc, traps: [{ compendiumId: 't', count: 1 }] })).toBe(false)
    expect(isSkillChallenge({ creatures: [] })).toBe(false)
  })
})

describe('running a skill challenge', () => {
  it('ends at its successes or three failures, and counts no checks after (RC p. 158)', () => {
    let c: SkillChallenge = { level: 3, complexity: 1 }
    for (let i = 0; i < 3; i++) c = recordChallengeCheck(c, 'success', 1)
    expect(challengeOutcome(c)).toBeUndefined()
    c = recordChallengeCheck(c, 'failure', 1)
    c = recordChallengeCheck(c, 'success', 1)
    expect(c).toMatchObject({ successes: 4, failures: 1 })
    expect(challengeOutcome(c)).toBe('success')
    expect(recordChallengeCheck(c, 'failure', 1)).toBe(c)
    // Taking one back reopens it; a count never goes below zero.
    c = recordChallengeCheck(c, 'success', -1)
    expect(challengeOutcome(c)).toBeUndefined()
    expect(recordChallengeCheck({ level: 1, complexity: 2 } as SkillChallenge, 'failure', -1).failures).toBeUndefined()
    const failed = [1, 2, 3].reduce(x => recordChallengeCheck(x, 'failure', 1), { level: 5, complexity: 5 } as SkillChallenge)
    expect(challengeOutcome(failed)).toBe('failure')
  })
})
