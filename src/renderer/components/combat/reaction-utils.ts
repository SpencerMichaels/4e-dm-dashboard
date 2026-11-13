import { toPowerCardEntry } from '../creature/power-card-entry'
import type { CombatantState, CombatNotification } from '@common/types'
import { combatStatBlock } from './combat-view'
import { isDefeated } from '@common/combat/facts'
import type { PowerCardEntry } from '../creature/PowerCardView'

export const REACTION_TYPES = ['immediate-reaction', 'immediate-interrupt', 'free', 'no-action']

export interface CreatureReaction {
  power: any
  card: PowerCardEntry
  powerIndex: number
  parsedTrigger: ParsedTrigger | null
  used: boolean
  isFree: boolean
}

type TriggerEvent = 'bloodied' | 'reduced-to-0' | 'takes-damage'
type TriggerSubject = 'self' | 'ally' | 'any-creature'

export interface ParsedTrigger {
  events: TriggerEvent[]
  subject: TriggerSubject
}


/** Build a ParsedTrigger from pre-computed action fields (set at import time) */
export function parseTrigger(action: any): ParsedTrigger | null {
  const events = action.triggerEvents as TriggerEvent[] | undefined
  const subject = action.triggerSubject as TriggerSubject | undefined
  if (!events || events.length === 0) return null
  return { events, subject: subject ?? 'self' }
}

export function triggerMatchesNotification(
  parsed: ParsedTrigger | null,
  notifs: CombatNotification[],
  reactorCombatantId: string,
): boolean {
  if (!parsed || notifs.length === 0) return false
  for (const n of notifs) {
    const nEvent: TriggerEvent | null =
      n.type === 'bloodied' ? 'bloodied' :
      n.type === 'death' ? 'reduced-to-0' : null
    if (!nEvent) continue
    if (!parsed.events.includes(nEvent) && !(nEvent === 'bloodied' && parsed.events.includes('takes-damage'))) continue

    const eventHappenedToReactor = n.combatantId === reactorCombatantId
    switch (parsed.subject) {
      case 'self':         if (eventHappenedToReactor) return true; break
      case 'ally':         if (!eventHappenedToReactor) return true; break
      case 'any-creature': return true
    }
  }
  return false
}

/** Extract all currently-actionable triggered reactions from a single combatant. */
export function getCreatureReactions(c: CombatantState, isCurrentTurn: boolean): CreatureReaction[] {
  if (c.isPC || isCurrentTurn || isDefeated(c)) return []
  const actions = (combatStatBlock(c).actions ?? []) as any[]
  const usedPowers = c.usedPowers ?? {}
  const usedReaction = c.conditions?.some(co => co.conditionId === 'reacted') ?? false
  const out: CreatureReaction[] = []

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    if (!REACTION_TYPES.includes(a.actionType)) continue

    // Free actions: must have a trigger, exclude self-only ones
    if (a.actionType === 'free' || a.actionType === 'no-action') {
      if (!a.trigger) continue
      if (a.selfTurnOnly) continue
    }

    // Determine "used" state — encounter/recharge powers are exhausted at maxUses,
    // otherwise the reaction-per-round rule applies (and free actions are exempt).
    const timesUsed = usedPowers[i] ?? 0
    const effectiveUsage = a.encounterUses ? 'encounter' : (a.usage || 'at-will')
    const maxUses = a.encounterUses ?? 1
    const isLimitedUse = effectiveUsage === 'encounter' || effectiveUsage === 'recharge'
    const exhausted = isLimitedUse && timesUsed >= maxUses

    const isFree = a.actionType === 'free' || a.actionType === 'no-action'
    out.push({
      power: a,
      card: toPowerCardEntry(a, { hideUsageKeywords: true }),
      powerIndex: i,
      parsedTrigger: parseTrigger(a),
      // A reaction is "used" if its limited-use slot is exhausted, or if the
      // creature has already spent its one reaction this round (free actions exempt).
      used: exhausted || (!isFree && usedReaction),
      isFree,
    })
  }

  return out
}

/** Toggle a reaction's used state via the IPC api */
export async function toggleReaction(combatantId: string, reaction: CreatureReaction) {
  const currentlyUsed = reaction.used
  if (currentlyUsed) {
    if (!reaction.isFree) await window.api.combat.removeCondition(combatantId, 'reacted')
    if (reaction.power.usage !== 'at-will') {
      await window.api.combat.unusePower(combatantId, reaction.powerIndex)
    }
  } else {
    if (!reaction.isFree) await window.api.combat.addCondition(combatantId, {
      conditionId: 'reacted',
      duration: { type: 'sont', expiresOnId: combatantId },
    })
    if (reaction.power.usage !== 'at-will') {
      await window.api.combat.usePower(combatantId, reaction.powerIndex)
    }
  }
}
