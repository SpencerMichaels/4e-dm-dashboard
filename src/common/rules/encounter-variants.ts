// Level variants of one encounter: the same encounter planned for several party levels (an adventure run
// for parties of different levels). Each variant is a whole encounter of its own, with its own level, rows
// and treasure; variants share `Encounter.variantGroup`. A variant is made by copying an encounter and
// shifting each creature row's level adjustment by the difference in level (templates, themes and minions
// apply on top as before, `adjust-monster.ts`).

import type { Encounter } from '../types'
import { encounterFrame } from './rewards'

/** An encounter's variants (itself included), lowest level first; an encounter without a group is its own only variant. */
export function variantsOf(e: Encounter, all: Encounter[], partyLevel?: number): Encounter[] {
  if (!e.variantGroup) return [e]
  const group = all.filter(x => x.variantGroup === e.variantGroup)
  if (!group.some(x => x.id === e.id)) group.push(e)
  return group.sort((a, b) => (encounterFrame(a, partyLevel) ?? 0) - (encounterFrame(b, partyLevel) ?? 0))
}

/** The variant to run for a party level: the one planned for it, else the nearest below, else the nearest above. */
export function pickVariant(variants: Encounter[], partyLevel: number | undefined): Encounter {
  if (partyLevel == null) return variants[0]
  const frame = (e: Encounter) => encounterFrame(e, partyLevel) ?? partyLevel
  const below = variants.filter(e => frame(e) <= partyLevel)
  return below.length ? below.reduce((a, b) => frame(b) > frame(a) ? b : a) : variants.reduce((a, b) => frame(b) < frame(a) ? b : a)
}

/** Encounters as list entries: one per group (the variant for the party's level) with all its variants, in list order. */
export function groupVariants(all: Encounter[], partyLevel: number | undefined): { shown: Encounter; variants: Encounter[] }[] {
  const seen = new Set<string>()
  const out: { shown: Encounter; variants: Encounter[] }[] = []
  for (const e of all) {
    if (e.variantGroup && seen.has(e.variantGroup)) continue
    if (e.variantGroup) seen.add(e.variantGroup)
    const variants = variantsOf(e, all, partyLevel)
    out.push({ shown: pickVariant(variants, partyLevel), variants })
  }
  return out
}

/**
 * A copy of `e` planned for `level`: a new id, the same group (`e`'s, or `e`'s id when it had none, which
 * `e` then takes too), and each creature row's level adjustment shifted by the difference from `e`'s level
 * (`from`, its frame). Treasure is not copied: each variant has its own.
 */
export function makeVariant(e: Encounter, level: number, from: number, id: string, now: string): { variant: Encounter; original: Encounter } {
  const group = e.variantGroup ?? e.id
  const delta = level - from
  const variant: Encounter = {
    ...structuredClone(e), id, level, variantGroup: group, done: undefined, createdAt: now, updatedAt: now,
    creatures: e.creatures.map(c => {
      const levelAdjust = (c.levelAdjust ?? 0) + delta
      const { levelAdjust: _old, ...rest } = structuredClone(c)
      return levelAdjust ? { ...rest, levelAdjust } : rest
    }),
  }
  return { variant, original: { ...e, level: e.level ?? from, variantGroup: group } }
}
