// Party level. Encounters are built for "the party's level" (DMG p.56), and the books assume
// every PC is at it: "the Dungeon Master's Guide recommends that all characters gain levels at
// the same rate" (DMG2 p.34, "Making Things Level", which adjusts a PC two or more levels away).
// The party level here is the most common level among the active PCs (on a tie, the higher, so
// encounters err toward hard); the PCs page warns when the active PCs' levels differ.

import type { PlayerCharacter } from '../types'

/** A PC's level: the imported sheet's, otherwise the level the DM set. */
export const pcLevel = (pc: PlayerCharacter): number | undefined => pc.sheet?.level ?? pc.level

export const isActivePc = (pc: PlayerCharacter) => pc.active !== false

/** The most common level of the active PCs that have one (the higher on a tie), or undefined when none has one. */
export function partyLevel(pcs: PlayerCharacter[]): number | undefined {
  const counts = new Map<number, number>()
  for (const pc of pcs.filter(isActivePc)) {
    const level = pcLevel(pc)
    if (level != null) counts.set(level, (counts.get(level) ?? 0) + 1)
  }
  let best: number | undefined
  for (const [level, count] of counts) {
    const bestCount = best == null ? 0 : counts.get(best)!
    if (count > bestCount || (count === bestCount && level > best!)) best = level
  }
  return best
}
