// Experience by level frame. A character needs the Character Advancement table's total XP to reach
// each level (PHB p. 29, RC p. 85, the same numbers); each PC earns its share of an encounter's XP.
// Encounters are planned for a party level (their level frame, `Encounter.level`); one without its own
// level counts at the party's level now, as the encounter editor budgets it.

import type { Encounter } from '../types'

/** Total XP to reach each level (PHB p. 29, RC p. 85). */
export const ADVANCEMENT_XP: Record<number, number> = {
  1: 0, 2: 1000, 3: 2250, 4: 3750, 5: 5500, 6: 7500, 7: 10000, 8: 13000, 9: 16500, 10: 20500,
  11: 26000, 12: 32000, 13: 39000, 14: 47000, 15: 57000, 16: 69000, 17: 83000, 18: 99000, 19: 119000, 20: 143000,
  21: 175000, 22: 210000, 23: 255000, 24: 310000, 25: 375000, 26: 450000, 27: 550000, 28: 675000, 29: 825000, 30: 1000000,
}

/** XP a character earns from reaching `level` to reaching the next; undefined at 30. */
export const xpToNextLevel = (level: number): number | undefined => level >= 30 ? undefined : ADVANCEMENT_XP[level + 1] - ADVANCEMENT_XP[level]

/** The level an encounter is planned for: its own, else the party's level now. */
export const encounterFrame = (e: Pick<Encounter, 'level'>, partyLevel: number | undefined): number | undefined => e.level ?? partyLevel
