import { describe, expect, it } from 'vitest'
import { ADVANCEMENT_XP, encounterFrame, xpToNextLevel } from './rewards'

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
