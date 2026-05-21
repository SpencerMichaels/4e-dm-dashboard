import type { CombatantState, CombatNotification } from '@common/types'
import type { PowerCardEntry } from '../../plugins/dnd-4e/PowerCardView'

export const REACTION_TYPES = ['immediate-reaction', 'immediate-interrupt', 'free']

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

/** Convert a creature's power entry into the shared PowerCardEntry shape */
function toPowerCard(p: any): PowerCardEntry {
  let kw = Array.isArray(p.keywords) ? [...p.keywords]
    : typeof p.keywords === 'string' ? p.keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
    : undefined

  let usage = p.usage || 'at-will'
  if (kw) {
    const usageKwIdx = kw.findIndex((k: string) => /^\d+\/encounter$/i.test(k.trim()) || /^at-will\s*\(\d+\/\w+\)$/i.test(k.trim()))
    if (usageKwIdx >= 0) {
      if (/^\d+\/encounter$/i.test(kw[usageKwIdx].trim())) usage = 'encounter'
      kw = kw.filter((_: any, i: number) => i !== usageKwIdx)
    }
  }

  return {
    name: p.name,
    usage,
    actionType: p.actionType,
    rechargeValue: p.rechargeCondition ? (parseInt(p.rechargeCondition) || undefined) : undefined,
    rechargeCondition: p.rechargeCondition && isNaN(parseInt(p.rechargeCondition)) ? p.rechargeCondition : undefined,
    keywords: kw?.length ? kw : undefined,
    rangeType: p.range ?? p.rangeType,
    rangeValue: p.rangeValue,
    target: p.target,
    attackBonus: p.attackBonus ?? null,
    defense: p.defense,
    damage: p.damage,
    hit: p.hit,
    miss: p.miss,
    effect: p.effect,
    trigger: p.trigger,
    requirement: p.requirement,
  }
}

/** Parse a trigger string into structured data for matching against notifications */
export function parseTrigger(trigger: string, _creatureName: string): ParsedTrigger | null {
  if (!trigger) return null
  const t = trigger.toLowerCase().replace(/\.$/, '').trim()

  const events: TriggerEvent[] = []
  if (/\bbloodied\b/.test(t)) events.push('bloodied')
  if (/\breduced to 0\b|\bdrops to 0\b|\bhit points or fewer\b/.test(t)) events.push('reduced-to-0')
  if (/\btakes damage\b/.test(t) && !events.includes('bloodied')) events.push('takes-damage')
  if (/\btakes damage\b/.test(t) && events.includes('bloodied')) events.push('takes-damage')
  if (events.length === 0) return null

  if (/\ban ally\b|\ballied\b|\badjacent ally\b/.test(t)) return { events, subject: 'ally' }
  if (/\ba creature\b|\ban enemy\b|\ban undead\b|\ba [\w]+ creature\b/.test(t)) return { events, subject: 'any-creature' }
  return { events, subject: 'self' }
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
  if (c.isPC || isCurrentTurn || c.hp <= 0) return []
  const actions = Array.isArray((c.statBlock as any)?.actions) ? (c.statBlock as any).actions as any[] : []
  const usedPowers = c.usedPowers ?? {}
  const usedReaction = c.usedReaction ?? false
  const out: CreatureReaction[] = []

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    if (!REACTION_TYPES.includes(a.actionType)) continue

    // Free actions: must have a trigger, exclude self-only ones
    if (a.actionType === 'free') {
      const trigger = (a.trigger || '').toLowerCase()
      if (!trigger) continue
      const selfTurnOnly = /\b(hits with|misses with|makes an attack|attacks with|scores a critical|makes a melee|makes a ranged)\b/.test(trigger)
        && !/\benemy\b|\ban ally\b|\ba creature\b/.test(trigger)
      if (selfTurnOnly) continue
      const selfMove = /\b(shifts|moves|charges|teleports)\b/.test(trigger)
        && !/\benemy\b|\ban ally\b|\ba creature\b|\bmarked\b/.test(trigger)
      if (selfMove) continue
    }

    // Determine "used" state — encounter/recharge powers are exhausted at maxUses,
    // otherwise the reaction-per-round rule applies (and free actions are exempt).
    const timesUsed = usedPowers[i] ?? 0
    const kws = Array.isArray(a.keywords) ? a.keywords : []
    const kwMatch = kws.find((k: string) => /^\d+\/encounter$/i.test(String(k).trim()))
    const effectiveUsage = kwMatch ? 'encounter' : (a.usage || 'at-will')
    const maxUses = kwMatch ? parseInt(kwMatch) : 1
    const isLimitedUse = effectiveUsage === 'encounter' || effectiveUsage === 'recharge'
    const exhausted = isLimitedUse && timesUsed >= maxUses

    const isFree = a.actionType === 'free'
    out.push({
      power: a,
      card: toPowerCard(a),
      powerIndex: i,
      parsedTrigger: parseTrigger(a.trigger || '', c.name),
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
    if (!reaction.isFree) await window.api.combat.updateCombatant(combatantId, { usedReaction: false })
    if (reaction.power.usage !== 'at-will') {
      await window.api.combat.unusePower(combatantId, reaction.powerIndex)
    }
  } else {
    if (!reaction.isFree) await window.api.combat.updateCombatant(combatantId, { usedReaction: true })
    if (reaction.power.usage !== 'at-will') {
      await window.api.combat.usePower(combatantId, reaction.powerIndex)
    }
  }
}
