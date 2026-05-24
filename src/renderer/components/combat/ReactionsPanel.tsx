// TODO: This component imports directly from plugins/dnd-4e/, violating the system-agnostic rule.
// It must be refactored to use the SystemPlugin interface before it can be wired into the UI.
import { useState } from 'react'
import type { CombatState, CombatNotification } from '@common/types'
import { PowerCardView, type PowerCardEntry } from '../../plugins/dnd-4e/PowerCardView'
import { USAGE_COLORS } from '../../plugins/dnd-4e/dnd4e-utils'

interface Props {
  combat: CombatState
  currentCombatantId?: string
  notifications?: CombatNotification[]
}

const REACTION_TYPES = ['immediate-reaction', 'immediate-interrupt', 'free']

interface GroupedReaction {
  card: PowerCardEntry
  powerIndex: number
  /** All combatants with this reaction — includes used and available */
  combatants: { id: string; name: string; used: boolean }[]
  power: any
  parsedTrigger: ParsedTrigger | null
}

/** Compact key for grouping identical reactions. Same name + same trigger = same reaction. */
function reactionKey(power: any): string {
  // Simple hash to keep keys short
  const s = `${power.name}\0${power.trigger ?? ''}`
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return `${power.name}:${h >>> 0}`
}

function toPowerCard(p: any): PowerCardEntry {
  let kw = Array.isArray(p.keywords) ? [...p.keywords]
    : typeof p.keywords === 'string' ? p.keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
    : undefined

  // Use pre-computed encounter usage if available
  let usage = p.encounterUses ? 'encounter' : (p.usage || 'at-will')
  if (kw) {
    kw = kw.filter((k: string) => !/^\d+\/encounter$/i.test(k.trim()) && !/^at-will\s*\(\d+\/\w+\)$/i.test(k.trim()))
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

type TriggerEvent = 'bloodied' | 'reduced-to-0' | 'takes-damage'
type TriggerSubject = 'self' | 'ally' | 'any-creature'

interface ParsedTrigger {
  events: TriggerEvent[]
  subject: TriggerSubject
}

/** Build a ParsedTrigger from pre-computed action fields (set at import time) */
function parseTrigger(action: any): ParsedTrigger | null {
  const events = action.triggerEvents as TriggerEvent[] | undefined
  const subject = action.triggerSubject as TriggerSubject | undefined
  if (!events || events.length === 0) return null
  return { events, subject: subject ?? 'self' }
}

/** Check if a parsed trigger matches a notification, given the reactor's combatant IDs */
function triggerMatchesNotification(
  parsed: ParsedTrigger | null,
  notifs: CombatNotification[],
  reactorCombatantIds: string[],
): boolean {
  if (!parsed || notifs.length === 0) return false
  for (const n of notifs) {
    const nEvent: TriggerEvent | null =
      n.type === 'bloodied' ? 'bloodied' :
      n.type === 'death' ? 'reduced-to-0' : null
    if (!nEvent) continue
    if (!parsed.events.includes(nEvent) && !(nEvent === 'bloodied' && parsed.events.includes('takes-damage'))) continue

    const eventHappenedToReactor = reactorCombatantIds.includes(n.combatantId)
    switch (parsed.subject) {
      case 'self':
        if (eventHappenedToReactor) return true
        break
      case 'ally':
        if (!eventHappenedToReactor) return true
        break
      case 'any-creature':
        return true
    }
  }
  return false
}

export function ReactionsPanel({ combat, currentCombatantId, notifications = [] }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const grouped = new Map<string, GroupedReaction>()

  for (const c of Object.values(combat.combatants)) {
    if (c.isPC || c.id === currentCombatantId || c.hp <= 0) continue
    const actions = Array.isArray((c.statBlock as any)?.actions) ? (c.statBlock as any).actions as any[] : []
    const usedPowers = c.usedPowers ?? {}
    const usedReaction = c.usedReaction ?? false
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i]
      if (!REACTION_TYPES.includes(a.actionType)) continue
      // Free actions: must have a trigger, and exclude ones that can only fire on own turn
      if (a.actionType === 'free') {
        if (!a.trigger) continue
        if (a.selfTurnOnly) continue
      }
      // Skip if fully used
      const timesUsed = usedPowers[i] ?? 0
      if (timesUsed > 0) {
        const effectiveUsage = a.encounterUses ? 'encounter' : (a.usage || 'at-will')
        if (effectiveUsage === 'encounter' || effectiveUsage === 'recharge') {
          const maxUses = a.encounterUses ?? 1
          if (timesUsed >= maxUses) continue
        }
      }

      const key = reactionKey(a)
      if (!grouped.has(key)) {
        grouped.set(key, {
          card: toPowerCard(a), powerIndex: i, combatants: [], power: a,
          parsedTrigger: parseTrigger(a),
        })
      }
      // Free actions aren't limited by the reaction-per-round rule
      const isReactionUsed = a.actionType !== 'free' && usedReaction
      grouped.get(key)!.combatants.push({ id: c.id, name: c.name, used: isReactionUsed })
    }
  }

  const reactions = [...grouped.values()]
  if (reactions.length === 0) return null

  const handleToggleReaction = async (combatantId: string, reaction: GroupedReaction, currentlyUsed: boolean) => {
    const isFree = reaction.power.actionType === 'free'
    if (currentlyUsed) {
      // Revert
      if (!isFree) await window.api.combat.updateCombatant(combatantId, { usedReaction: false })
      if (reaction.power.usage !== 'at-will') {
        await window.api.combat.unusePower(combatantId, reaction.powerIndex)
      }
    } else {
      // Use
      if (!isFree) await window.api.combat.updateCombatant(combatantId, { usedReaction: true })
      if (reaction.power.usage !== 'at-will') {
        await window.api.combat.usePower(combatantId, reaction.powerIndex)
      }
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
      <div style={{
        fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)',
        fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
        position: 'sticky', top: 0, background: 'var(--color-bg-primary)', zIndex: 1, padding: '2px 0',
      }}>
        Triggered Actions
      </div>
      <div className="stat-block-4e" style={{ fontSize: 11 }}>
        {reactions.map((r) => {
          const key = reactionKey(r.power)
          const allUsed = r.combatants.every(c => c.used)
          const reactorIds = r.combatants.map(c => c.id)
          const triggered = triggerMatchesNotification(r.parsedTrigger, notifications, reactorIds)
          const isExpanded = expandedKey === key
          const usageColor = USAGE_COLORS[r.card.usage] ?? (r.card.usage ? '#6a6a72' : '#7a6f5e')

          return (
            <div key={key} style={{
              marginBottom: 3,
              opacity: allUsed ? 0.4 : 1,
              transition: 'opacity 0.15s',
              borderLeft: triggered ? '3px solid var(--color-action-point)' : 'none',
              paddingLeft: triggered ? 2 : 0,
              animation: triggered ? 'reaction-pulse 1.5s ease-in-out 2' : 'none',
            }}>
              {/* Compact summary row */}
              <div
                onClick={() => setExpandedKey(isExpanded ? null : key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                  padding: '2px 4px', borderRadius: 'var(--radius-sm)',
                }}
              >
                {/* Usage color bar */}
                <div style={{ width: 3, height: 14, borderRadius: 1, background: usageColor, flexShrink: 0 }} />
                {triggered && <span style={{ fontSize: 9, color: 'var(--color-action-point)' }}>⚡</span>}
                <span style={{ fontWeight: 600, fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.card.name}
                </span>
                <span style={{ fontSize: 9, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {isExpanded ? '▾' : '▸'}
                </span>
              </div>
              {/* Trigger text — always visible */}
              {r.power.trigger && (
                <div style={{ padding: '0 4px 0 11px', fontSize: 10, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>
                  {r.power.trigger}
                </div>
              )}
              {/* Expanded: full power card + creature chips */}
              {isExpanded && (
                <div style={{ marginTop: 2 }}>
                  <PowerCardView entry={r.card} />
                </div>
              )}
              {/* Creature chips */}
              <div style={{ padding: '2px 4px 2px 11px', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {r.combatants.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleToggleReaction(c.id, r, c.used)}
                    title={c.used ? `Undo reaction for ${c.name}` : `Use reaction for ${c.name}`}
                    style={{
                      fontSize: 10, padding: '1px 6px',
                      background: c.used ? 'transparent' : 'var(--color-bg-hover)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      color: 'var(--color-text-primary)',
                      opacity: c.used ? 0.4 : 1,
                      textDecoration: c.used ? 'line-through' : 'none',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
