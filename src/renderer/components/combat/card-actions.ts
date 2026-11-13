// What a combat power card needs from combat: how often a power can be used, what its text lets the DM
// apply (conditions and diseases), and the card for one of a combatant's entries. Shared by the combat
// panel and the pinned cards, so a pinned card is the same live card.

import type { CombatState, CombatantState, DiseaseRef } from '@common/types'
import type { DiseaseName } from '@common/rules/diseases'
import type { PowerEntry } from '../creature/PowerEntryEditor'
import type { PowerCardEntry } from '../creature/PowerCardView'
import { toPowerCardEntry } from '../creature/power-card-entry'
import { combatStatBlock } from './combat-view'
import { detectConditions, detectDiseases, type DetectedCondition } from './condition-detection'

/** The most a power can be used: N for "N/Encounter", 1 for encounter and recharge powers, Infinity at will. */
export function maxUses(p: PowerEntry): number {
  const uses = (p as any).encounterUses
  if (typeof uses === 'number' && uses > 0) return uses
  for (const k of Array.isArray(p.keywords) ? p.keywords : []) {
    const m = String(k).match(/^(\d+)\/encounter$/i) ?? String(k).match(/^at-will\s*\((\d+)\/\w+\)$/i)
    if (m) return parseInt(m[1])
  }
  return p.usage === 'encounter' || p.usage === 'recharge' ? 1 : Infinity
}

/** Condition keywords and disease names in an entry's text; both highlight and apply to targets. */
export function detectIn(p: PowerEntry, diseaseNames: DiseaseName<DiseaseRef>[]): DetectedCondition[] {
  const conditions = detectConditions({ hit: p.hit, effect: p.effect, miss: p.miss, target: p.target })
  return [...conditions, ...detectDiseases(p, diseaseNames, conditions)]
}

export interface ApplyHandlers {
  onApplyConditionToTargets: (condition: any, multi: boolean) => void
  onApplyDiseaseToTargets?: (disease: DiseaseRef, name: string, multi: boolean) => void
}

/** A highlighted condition or disease clicked on one of `c`'s cards: pick targets to apply it to. */
export function applyDetection(c: CombatantState, det: DetectedCondition, multi: boolean, h: ApplyHandlers) {
  if (det.disease) return void h.onApplyDiseaseToTargets?.(det.disease, det.conditionName, multi)
  const condData: any = { conditionId: det.conditionId, value: det.value, customDescription: det.damageType, sourceId: c.id, duration: det.duration }
  // Marked: "by <source>".
  if (det.conditionId === 'marked') condData.customDescription = `by ${c.name}`
  // Regenerating lasts the encounter and has no damage type.
  if (det.conditionId === 'regenerating') {
    condData.duration = det.duration ?? { type: 'encounter' }
    condData.customDescription = undefined
  }
  // Grants combat advantage: the recipient and its label suffix; the source is the power's owner.
  if (det.conditionId === 'combat-advantage') {
    const recipient = det.grantsCATo ?? 'all'
    condData.grantsCATo = recipient
    condData.customDescription = recipient === 'source' ? `to ${c.name}` : recipient === 'source-allies' ? `to ${c.name}'s allies` : undefined
  }
  h.onApplyConditionToTargets(condData, multi)
}

/** A trait, aura, or power of a combatant as its card; auras carry their printed size. */
export function cardFor(a: PowerEntry): PowerCardEntry {
  return toPowerCardEntry(a.entryType === 'aura' ? { ...a, rangeType: 'aura', rangeValue: String((a as any).auraSize ?? (a as any).auraRange ?? a.rangeValue ?? 1) } : a)
}

/** The combatant's entry at `index` (in combat entry order), for a live pinned card. */
export function entryAt(c: CombatantState, index: number): PowerEntry | undefined {
  return (combatStatBlock(c).actions as PowerEntry[] | undefined)?.[index]
}

/** Whether the engine is waiting on this power's recharge roll (start of the combatant's turn). */
export const rechargeQueued = (combat: CombatState, combatantId: string, index: number) =>
  combat.turnPhase === 'start-of-turn' && combat.initiativeOrder[combat.turnIndex] === combatantId
  && combat.turnItems.some(t => t.id === `rch-${index}` && t.result === undefined)
