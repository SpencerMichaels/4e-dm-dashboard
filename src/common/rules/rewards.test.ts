import { describe, expect, it } from 'vitest'
import { ADVANCEMENT_XP, encounterFrame, questXp, xpToNextLevel } from './rewards'

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
