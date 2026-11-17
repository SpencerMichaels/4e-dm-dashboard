// Experience by level frame. A character needs the Character Advancement table's total XP to reach
// each level (PHB p. 29, RC p. 85, the same numbers); each PC earns its share of an encounter's XP.
// Encounters are planned for a party level (their level frame, `Encounter.level`); one without its own
// level counts at the party's level now, as the encounter editor budgets it.

import type { Encounter, QuestKind, SkillChallenge } from '../types'
import { monsterXp } from '@kit'

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

export const QUEST_KIND_LABELS: Record<QuestKind, string> = { minor: 'Minor', moderate: 'Moderate', major: 'Major' }

/**
 * A quest's XP for the whole party, priced in standard monsters of its level (DMG p. 120, RC p. 292):
 * a major quest gives each PC one monster's XP, a whole encounter's worth (DMG p. 122, RC p. 294); a minor
 * quest gives one monster's XP, shared (DMG p. 122, RC p. 294); a moderate quest is the RC's minor quest
 * "to carry more weight": up to half a monster's XP to each PC (RC pp. 294-295).
 */
export function questXp(kind: QuestKind, level: number, partySize: number): number {
  const monster = monsterXp(Math.min(30, Math.max(1, level)), 'standard')
  if (kind === 'major') return monster * partySize
  if (kind === 'moderate') return Math.round(monster / 2) * partySize
  return monster
}

/** Successes a skill challenge of a complexity needs, before 3 failures (RC p. 159). */
export const challengeSuccesses = (complexity: number) => 2 * Math.min(5, Math.max(1, complexity)) + 2
export const CHALLENGE_FAILURES = 3

/** A skill challenge's XP: as many standard monsters of its level as its complexity (RC pp. 293-294, DMG p. 121). */
export const challengeXp = (c: Pick<SkillChallenge, 'level' | 'complexity'>) => Math.min(5, Math.max(1, c.complexity)) * monsterXp(Math.min(30, Math.max(1, c.level)), 'standard')

/** An encounter that is only a skill challenge (no creatures or traps), standing on its own. */
export const isSkillChallenge = (e: Pick<Encounter, 'challenge' | 'creatures' | 'traps'>) => !!e.challenge && e.creatures.length === 0 && !e.traps?.length

/**
 * How a skill challenge ended, from its progress: success at its complexity's successes, failure at three
 * failures (RC p. 158), or undefined while it runs. Either way the party completes it and earns its XP (RC p. 158).
 */
export function challengeOutcome(c: Pick<SkillChallenge, 'complexity' | 'successes' | 'failures'>): 'success' | 'failure' | undefined {
  if ((c.successes ?? 0) >= challengeSuccesses(c.complexity)) return 'success'
  if ((c.failures ?? 0) >= CHALLENGE_FAILURES) return 'failure'
  return undefined
}

/** Counts one check (delta 1) or takes one back (-1); no new checks count once the challenge has ended. */
export function recordChallengeCheck<C extends SkillChallenge>(c: C, outcome: 'success' | 'failure', delta: 1 | -1): C {
  if (delta > 0 && challengeOutcome(c)) return c
  const key = outcome === 'success' ? 'successes' : 'failures'
  const n = Math.max(0, (c[key] ?? 0) + delta)
  return { ...c, [key]: n || undefined }
}
