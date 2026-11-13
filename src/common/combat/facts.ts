// What combat needs to know about a combatant, read from its kit content (a Monster or a Trap).
// The engine and the combat UI read combatants only through these functions.

import type { ActionType, Aura, Monster, Power, Trait, Trap, Usage } from '@kit'
import { findRevival, triggerHints, type Revival, type TriggerHints } from '../rules/combat-text'

export type CombatContent = { kind: 'creature'; content: Monster } | { kind: 'trap'; content: Trap }
/** The part of a combatant the facts read; PCs have no content. */
export interface WithContent { kind?: 'creature' | 'trap'; content?: Monster | Trap }

const monster = (c: WithContent) => c.content && c.kind !== 'trap' ? c.content as Monster : undefined
const trap = (c: WithContent) => c.content && c.kind === 'trap' ? c.content as Trap : undefined

/**
 * One stat block entry in combat order: traits, then auras, then powers. `usedPowers` is keyed by
 * `index`, and the stat block projection (`monsterToCreature`) lists its actions in the same order.
 */
export interface CombatEntry {
  index: number
  group: 'traits' | 'auras' | 'powers'
  name: string
  text: string
  trait?: Trait | Aura
  power?: Power
  action?: ActionType
  usage?: Usage | 'unknown'
  /** Lowest d6 roll that recharges the power; recharges on other conditions roll from 6. */
  rechargeMin?: number
  usesPerEncounter?: number
  trigger?: string
  hints: TriggerHints
}

// "Recharge 5 or if the chariot takes lightning damage" rolls from 5 too; "when first bloodied" from 6.
const rechargeMin = (p: Power) => p.recharge?.kind === 'roll' ? p.recharge.min : p.recharge?.kind === 'text' ? parseInt(p.recharge.text) || 6 : 6

export function combatEntries(c: WithContent): CombatEntry[] {
  const content = c.content
  if (!content) return []
  const entries: CombatEntry[] = []
  const add = (e: Omit<CombatEntry, 'index' | 'hints'> & { hints?: TriggerHints }) => entries.push({ hints: {}, ...e, index: entries.length })
  for (const t of content.traits) add({ group: 'traits', name: t.name, text: t.text.text, trait: t })
  for (const a of content.auras) add({ group: 'auras', name: a.name, text: a.text.text, trait: a })
  for (const p of content.powers) {
    const trigger = p.trigger?.text
    add({
      group: 'powers', name: p.name, text: p.effect?.text ?? '', power: p, action: p.action, usage: p.usage,
      rechargeMin: p.usage === 'recharge' ? rechargeMin(p) : undefined,
      usesPerEncounter: p.usesPerEncounter, trigger, hints: trigger ? triggerHints(trigger) : {},
    })
  }
  return entries
}

export const saveBonus = (c: WithContent) => monster(c)?.savingThrowBonus ?? 0
export const actionPoints = (c: WithContent) => monster(c)?.actionPoints ?? 0
export const isMinion = (c: WithContent) => monster(c)?.rank === 'minion'
export const initiativeBonus = (c: WithContent): number | undefined => c.content?.initiative
export const level = (c: WithContent): number | undefined => c.content?.level

export function defenses(c: WithContent): { ac?: number; fortitude?: number; reflex?: number; will?: number } {
  return { ...(c.content?.defenses ?? {}) }
}

/** A defense by its printed name ("AC", "Reflex"). */
export const defense = (c: WithContent, name: string) => defenses(c)[name.toLowerCase() as 'ac']

export interface DamageModifiers { resist: { type: string; value?: number }[]; immune: { type: string }[]; vulnerable: { type: string; value?: number }[] }

export function damageModifiers(c: WithContent): DamageModifiers {
  const content = c.content
  if (!content) return { resist: [], immune: [], vulnerable: [] }
  const mod = (m: { type: string; value?: number }) => ({ type: m.type, ...(m.value !== undefined ? { value: m.value } : {}) })
  return { resist: content.resist.map(mod), immune: content.immune.map(i => ({ type: i.type })), vulnerable: (monster(c)?.vulnerable ?? []).map(mod) }
}

export function regeneration(c: WithContent): { value: number; inhibitDamageTypes: string[] } | undefined {
  const r = monster(c)?.regeneration
  return r && { value: r.value, inhibitDamageTypes: [...r.suppressedBy] }
}

/** Revival abilities are read from the printed text of traits and powers. */
export function revival(c: WithContent): Revival | undefined {
  const m = monster(c)
  if (!m) return undefined
  return findRevival([...m.traits.map(t => ({ name: t.name, text: t.text.text })), ...m.powers.map(p => ({ name: p.name, text: p.effect?.text ?? '' }))])
}

/** Traps without initiative act only when triggered and stay out of the turn order. */
export const actsOnInitiative = (c: WithContent) => c.kind !== 'trap' || trap(c)?.initiative !== undefined

/** Traps without hit points ("see text", or none) can't be reduced to 0; they're disabled instead. */
export const hasHitPoints = (c: WithContent) => c.kind !== 'trap' || trap(c)?.hp !== undefined

/** Out of the fight: marked dead, or a monster (or trap with hit points) at 0 HP. PCs at 0 HP are dying, not defeated. */
export const isDefeated = (c: WithContent & { isPC: boolean; hp: number; dead?: boolean }) =>
  !!c.dead || (!c.isPC && c.hp <= 0 && hasHitPoints(c))
