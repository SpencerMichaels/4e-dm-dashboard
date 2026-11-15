// What a combat power card needs from combat: how often a power can be used, what its text lets the DM
// apply, and the card for one of a combatant's entries. Shared by the combat panel and the pinned
// cards, so a pinned card is the same live card.
//
// Click-to-apply reads the effect clauses of the card's kit lines (src/common/combat/clause-effects.ts):
// each applicable clause is a highlighted span, and a "save ends both" group applies together. Text no
// clause covers falls back to the regex detector (condition-detection.ts) on Hit, Miss, and Effect.

import type { CombatState, CombatantState, DiseaseRef } from '@common/types'
import type { Line } from '@kit'
import type { DiseaseName } from '@common/rules/diseases'
import { lineEffects, uncoveredRanges, type ApplyCondition, type ClauseEffect } from '@common/combat/clause-effects'
import { generateId } from '@common/utils/id'
import type { PowerEntry } from '../creature/PowerEntryEditor'
import type { PowerCardEntry } from '../creature/PowerCardView'
import { toPowerCardEntry } from '../creature/power-card-entry'
import { kitCardGroups } from '../creature/card-lines'
import { combatStatBlock } from './combat-view'
import { detectConditionsInText, detectDiseasesInText } from './condition-detection'

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

export type ApplyItem = { kind: 'condition'; condition: ApplyCondition } | { kind: 'disease'; ref: DiseaseRef; name: string }

/** A highlighted span on a card line, and what clicking it applies. */
export interface CardApply {
  at: [number, number]
  /** What a click applies, for the tooltip: "Dazed and Ongoing 5 fire (save ends both)". */
  label: string
  items: ApplyItem[]
  /** Spans applied together (a "save ends both" group) share it, so they highlight together. */
  group?: string
  /** The printed condition it depends on ("if the target is bloodied"): the DM's call. */
  condition?: string
}

/** Click targets per card line key (card-lines.ts). */
export type CardApplies = Record<string, CardApply[]>

/** The card's lines that are the attack's outcome or the power's effect: where the fallback looks. */
const FALLBACK_KEY = /^(a\d+\.(hit|miss)|effect)$/

/** Every click target on a card: from the clauses of its kit lines, and the fallback on uncovered text. */
export function cardApplies(e: PowerCardEntry, diseaseNames: DiseaseName<DiseaseRef>[], level?: number): CardApplies {
  const isPower = e.usage !== 'trait' && e.usage !== 'aura'
  const lines: { key: string; line: Line }[] = e.kit
    ? kitCardGroups(e.kit).flatMap(g => g.lines.flatMap(l => l.line ? [{ key: l.key, line: l.line }] : []))
    : e.kitLine ? [{ key: 'effect', line: e.kitLine }]
    : ([['a0.hit', e.hit], ['a0.miss', e.miss], ['effect', e.effect]] as const).flatMap(([key, text]) => text ? [{ key, line: { text, clauses: [] } }] : [])
  // Conditions in a power with no target, attack, or Hit describe its owner, not something to apply (the old detector's rule).
  const targetsOthers = isPower && !!(e.target?.trim() || e.attackBonus != null || e.defense || e.hit || e.kit?.attacks.length)
  const out: CardApplies = {}
  for (const { key, line } of lines) {
    const applies: CardApply[] = []
    const spans = lineEffects(line, level)
    for (const span of spans) {
      const items = span.group.flatMap(effect => applyItem(effect, diseaseNames))
      if (!items.length) continue
      // A group's "(save ends both)" is printed after its last member.
      const printed = spans.filter(s => s === span || (span.saveGroup && s.saveGroup === span.saveGroup)).map(s => line.text.slice(...s.at)).join(' ')
      applies.push({
        at: span.at, items,
        label: span.group.length > 1 ? `${span.group.map(g => g.label).join(' and ')}${/save ends/i.test(printed) ? ` (${printed.match(/save ends[^)]*/i)![0]})` : ''}` : span.effect.label,
        ...(span.saveGroup ? { group: `${key}:${span.saveGroup}` } : {}),
        ...(span.if?.length || span.unless?.length ? { condition: [...(span.if ?? []), ...(span.unless ?? []).map(u => `not ${u}`)].join('; ') } : {}),
      })
    }
    if (FALLBACK_KEY.test(key)) applies.push(...fallback(line, targetsOthers, diseaseNames))
    if (applies.length) out[key] = applies.sort((a, b) => a.at[0] - b.at[0])
  }
  return out
}

function applyItem(effect: ClauseEffect, names: DiseaseName<DiseaseRef>[]): ApplyItem[] {
  if (effect.kind === 'condition') return [{ kind: 'condition', condition: effect.apply }]
  // A disease applies when the campaign, the Library, or the content pack has it.
  const id = effect.diseaseId
  const match = names.find(n => id && (n.ref.compendiumId === id || n.ref.diseaseId === id || n.ref.libraryId === id))
    ?? names.find(n => n.name.toLowerCase() === effect.disease.toLowerCase())
  return match ? [{ kind: 'disease', ref: match.ref, name: match.name }] : []
}

/** Regex matches in the line's text that no clause covers. */
function fallback(line: Line, conditions: boolean, names: DiseaseName<DiseaseRef>[]): CardApply[] {
  const open = uncoveredRanges(line)
  const inOpen = (s: number, e: number) => open.some(([a, b]) => s >= a && e <= b)
  const out: CardApply[] = []
  if (conditions) for (const d of detectConditionsInText(line.text)) {
    if (!inOpen(d.matchStart, d.matchEnd)) continue
    const condition: ApplyCondition = { conditionId: d.conditionId, duration: d.duration ?? { type: 'save-ends' },
      ...(d.value !== undefined ? { value: d.value } : {}), ...(d.damageType ? { customDescription: d.damageType } : {}), ...(d.grantsCATo ? { grantsCATo: d.grantsCATo } : {}) }
    out.push({ at: [d.matchStart, d.matchEnd], label: d.conditionId === 'ongoing-damage' ? `Ongoing ${d.value ?? ''}${d.damageType ? ' ' + d.damageType : ''}` : d.conditionName, items: [{ kind: 'condition', condition }] })
  }
  for (const m of detectDiseasesInText(line.text, names)) {
    if (!inOpen(m.start, m.end) || out.some(o => m.start < o.at[1] && m.end > o.at[0])) continue
    out.push({ at: [m.start, m.end], label: m.name, items: [{ kind: 'disease', ref: m.ref, name: m.name }] })
  }
  return out
}

/** A condition as `addCondition` takes it, from combatant `c`'s card (before the targets' turn timing). */
export type PendingCondition = ApplyCondition & { sourceId: string; saveGroup?: string }

export interface ApplyHandlers {
  onApplyConditionToTargets: (conditions: PendingCondition[], multi: boolean) => void
  onApplyDiseaseToTargets?: (disease: DiseaseRef, name: string, multi: boolean) => void
}

/** A highlighted span clicked on one of `c`'s cards: pick targets to apply it (and its save group) to. */
export function applyCardApply(c: CombatantState, a: CardApply, multi: boolean, h: ApplyHandlers) {
  const disease = a.items.find(i => i.kind === 'disease')
  if (disease?.kind === 'disease') return void h.onApplyDiseaseToTargets?.(disease.ref, disease.name, multi)
  // One save ends the whole group: its members share a save group of their own.
  const saveGroup = a.items.length > 1 ? `sg-${generateId()}` : undefined
  const conditions = a.items.flatMap(i => i.kind !== 'condition' ? [] : [withSource(c, i.condition, saveGroup)])
  if (conditions.length) h.onApplyConditionToTargets(conditions, multi)
}

function withSource(c: CombatantState, cond: ApplyCondition, saveGroup: string | undefined): PendingCondition {
  const out: PendingCondition = { ...cond, sourceId: c.id, ...(saveGroup ? { saveGroup } : {}) }
  // Named effects get an id of their own, like the condition dialog's custom effects.
  if (cond.conditionId === 'custom') out.conditionId = `custom-${generateId()}`
  // Marked: "by <source>".
  if (cond.conditionId === 'marked') out.customDescription = `by ${c.name}`
  // Grants combat advantage: the label names the recipient; the source is the power's owner.
  if (cond.conditionId === 'combat-advantage') {
    const recipient = cond.grantsCATo ?? 'all'
    out.grantsCATo = recipient
    out.customDescription = recipient === 'source' ? `to ${c.name}` : recipient === 'source-allies' ? `to ${c.name}'s allies` : undefined
  }
  return out
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
