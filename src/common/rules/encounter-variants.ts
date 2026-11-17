// Variants of one encounter: the same encounter planned for several parties (an adventure run for parties of
// different levels or sizes). Each variant is a whole encounter of its own, with its own frame (level and party
// size), rows and treasure; variants share `Encounter.variantGroup`. A variant is made by copying an encounter
// and shifting each creature row's level adjustment by the difference in level (templates, themes and minions
// apply on top as before, `adjust-monster.ts`); a different party size is the DM's to rebalance (more or fewer
// creatures), which the builder's budget for that size shows.

import type { Encounter } from '../types'
import { encounterFrame, encounterPartySize } from './rewards'

/** The party now, which variants are picked for and frames default to. */
export interface PartyNow { level: number | undefined; size: number }

/** An encounter's variants (itself included), by level then size; an encounter without a group is its own only variant. */
export function variantsOf(e: Encounter, all: Encounter[], party: PartyNow): Encounter[] {
  if (!e.variantGroup) return [e]
  const group = all.filter(x => x.variantGroup === e.variantGroup)
  if (!group.some(x => x.id === e.id)) group.push(e)
  const level = (x: Encounter) => encounterFrame(x, party.level) ?? 0
  return group.sort((a, b) => level(a) - level(b) || encounterPartySize(a, party.size) - encounterPartySize(b, party.size))
}

/**
 * The variant to run for the party: of those planned for its level (else the nearest below, else above), the
 * one closest to its size (the larger on a tie).
 */
export function pickVariant(variants: Encounter[], party: PartyNow): Encounter {
  if (party.level == null) return variants[0]
  const frame = (e: Encounter) => encounterFrame(e, party.level) ?? party.level!
  const below = variants.filter(e => frame(e) <= party.level!)
  const level = below.length ? Math.max(...below.map(frame)) : Math.min(...variants.map(frame))
  const size = (e: Encounter) => encounterPartySize(e, party.size)
  return variants.filter(e => frame(e) === level).reduce((a, b) => {
    const da = Math.abs(size(a) - party.size), db = Math.abs(size(b) - party.size)
    return db < da || (db === da && size(b) > size(a)) ? b : a
  })
}

/** Encounters as list entries: one per group (the variant for the party) with all its variants, in list order. */
export function groupVariants(all: Encounter[], party: PartyNow): { shown: Encounter; variants: Encounter[] }[] {
  const seen = new Set<string>()
  const out: { shown: Encounter; variants: Encounter[] }[] = []
  for (const e of all) {
    if (e.variantGroup && seen.has(e.variantGroup)) continue
    if (e.variantGroup) seen.add(e.variantGroup)
    const variants = variantsOf(e, all, party)
    out.push({ shown: pickVariant(variants, party), variants })
  }
  return out
}

/** A variant's tab label: "L8", or "L8 · 6 PCs" when the group's variants differ in size. */
export function variantLabel(e: Encounter, variants: Encounter[], party: PartyNow): string {
  const sizes = new Set(variants.map(v => encounterPartySize(v, party.size)))
  const level = encounterFrame(e, party.level)
  return `L${level ?? '?'}${sizes.size > 1 ? ` · ${encounterPartySize(e, party.size)} PCs` : ''}`
}

/**
 * A copy of `e` planned for another frame (`to`: a level and party size): a new id, the same group (`e`'s, or `e`'s id when it had none, which
 * `e` then takes too, with its own frame `from` made explicit), and each creature row's level adjustment shifted by the difference from `e`'s level
 * (`from`, its frame), as are its skill challenges' own levels (their progress isn't copied). Treasure is not copied: each variant has its own.
 */
export function makeVariant(e: Encounter, to: { level: number; size: number }, from: { level: number; size: number }, id: string, now: string): { variant: Encounter; original: Encounter } {
  const group = e.variantGroup ?? e.id
  const delta = to.level - from.level
  const variant: Encounter = {
    ...structuredClone(e), id, level: to.level, partySize: to.size, variantGroup: group, done: undefined, createdAt: now, updatedAt: now,
    creatures: e.creatures.map(c => {
      const levelAdjust = (c.levelAdjust ?? 0) + delta
      const { levelAdjust: _old, ...rest } = structuredClone(c)
      return levelAdjust ? { ...rest, levelAdjust } : rest
    }),
    // A skill challenge with its own level here moves by the same difference; one without follows the variant's level.
    ...(e.challenges ? { challenges: e.challenges.map(({ successes: _s, failures: _f, ...c }) => c.level != null ? { ...c, level: Math.min(30, Math.max(1, c.level + delta)) } : c) } : {}),
  }
  return { variant, original: { ...e, level: e.level ?? from.level, partySize: e.partySize ?? from.size, variantGroup: group } }
}
