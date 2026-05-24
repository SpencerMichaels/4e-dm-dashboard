import { useRef, useState, useLayoutEffect } from 'react'
import type { CombatState, CombatNotification } from '@common/types'
import { CombatToken } from './CombatToken'
import type { ConditionDef } from '@common/types/system-plugin'
import type { AttackMode } from './CombatView'
import { getConditionStyle } from '../../plugins/dnd-4e/condition-styles'
import { ConditionPill, buildConditionLabel } from '../../plugins/dnd-4e/ConditionPill'
import { USAGE_COLORS } from '../../plugins/dnd-4e/dnd4e-utils'
import { PowerCardView, ACTION_ICONS } from '../../plugins/dnd-4e/PowerCardView'
import { getCreatureReactions, triggerMatchesNotification, toggleReaction, type CreatureReaction } from './reaction-utils'
import { hpPercentage, formatConditionName } from '../../utils/combat-utils'

interface Props {
  combat: CombatState
  currentId: string
  selectedIds: string[]
  onSelect: (id: string, event: React.MouseEvent) => void
  onContextMenu?: (combatantId: string, event: React.MouseEvent) => void
  attackMode?: AttackMode
  conditionDefs?: ConditionDef[]
  notifications?: CombatNotification[]
  onUndelay?: (id: string) => void
  onResolveReady?: (id: string) => void
  onCancelReady?: (id: string) => void
}

export function InitiativeList({ combat, currentId, selectedIds, onSelect, onContextMenu, attackMode, conditionDefs = [], notifications = [], onUndelay, onResolveReady, onCancelReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const posCache = useRef<Map<string, number>>(new Map())

  const snapshotPositions = () => {
    if (!containerRef.current) return
    const map = new Map<string, number>()
    for (let i = 0; i < containerRef.current.children.length; i++) {
      const el = containerRef.current.children[i] as HTMLElement
      const key = el.dataset.flipKey
      if (key) map.set(key, el.getBoundingClientRect().top)
    }
    posCache.current = map
  }

  // FLIP: slide cards smoothly from old to new position
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const old = posCache.current
    if (old.size === 0) { snapshotPositions(); return }
    for (let i = 0; i < containerRef.current.children.length; i++) {
      const el = containerRef.current.children[i] as HTMLElement
      const key = el.dataset.flipKey
      if (!key || !old.has(key)) continue
      const delta = old.get(key)! - el.getBoundingClientRect().top
      if (Math.abs(delta) < 1) continue
      // Skip animation for cards that moved downward (wrapped from top to bottom)
      if (delta < 0) continue
      el.style.transform = `translateY(${delta}px)`
      el.style.transition = 'none'
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.25s ease-out'
        el.style.transform = ''
        el.addEventListener('transitionend', () => { el.style.transition = '' }, { once: true })
      })
    }
    snapshotPositions()
  })
  snapshotPositions()

  // Build display order: categorize each creature as waiting/delayed/acted
  const turnIdx = combat.turnIndex
  const order = combat.initiativeOrder
  const delayedSet = new Set(combat.delayedIds)

  type DisplayItem = { id: string; section: 'waiting' | 'delayed' | 'readied' | 'header' | 'acted' }

  // Categorize: creatures at or after turnIndex that aren't delayed = waiting (haven't acted)
  // Creatures before turnIndex that aren't delayed = acted (already went this round)
  const waiting: string[] = []   // will act this round (includes current)
  const acted: string[] = []     // already acted this round

  for (let i = 0; i < order.length; i++) {
    const id = order[i]
    if (delayedSet.has(id)) continue  // delayed shown separately
    if (combat.combatants[id]?.hiddenDead) continue  // auto-hidden dead creatures
    if (i >= turnIdx) waiting.push(id)
    else acted.push(id)
  }

  // Sort delayed by initiative (highest first) for display
  const delayedSorted = [...combat.delayedIds]
    .filter(id => combat.combatants[id])
    .sort((a, b) => (combat.combatants[b]?.initiative ?? 0) - (combat.combatants[a]?.initiative ?? 0))

  // Sort readied by initiative (highest first) for display
  const readiedSorted = [...(combat.readiedIds ?? [])]
    .filter(id => combat.combatants[id])
    .sort((a, b) => (combat.combatants[b]?.initiative ?? 0) - (combat.combatants[a]?.initiative ?? 0))

  const displayOrder: DisplayItem[] = [
    // Readied creatures before current (can interrupt)
    ...readiedSorted.map(id => ({ id, section: 'readied' as const })),
    // Current creature
    ...(waiting.length > 0 ? [{ id: waiting[0], section: 'waiting' as const }] : []),
    // Delayed creatures float right after the current creature
    ...delayedSorted.map(id => ({ id, section: 'delayed' as const })),
    // Remaining waiting creatures
    ...waiting.slice(1).map(id => ({ id, section: 'waiting' as const })),
    // Next round header + creatures that already acted
    ...(acted.length > 0 ? [
      { id: '__next_round__', section: 'header' as const },
      ...acted.map(id => ({ id, section: 'acted' as const })),
    ] : []),
  ]

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
      {displayOrder.map(({ id, section }) => {
        if (section === 'header') {
          return (
            <div key="__next_round__" data-flip-key="__next_round__" style={{
              fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              padding: '4px var(--space-3) 2px', marginTop: 4,
              borderTop: '1px solid var(--color-border)',
            }}>
              {combat.round === 0 ? 'Round 1' : `Round ${combat.round + 1}`}
            </div>
          )
        }
        const c = combat.combatants[id]
        if (!c) return null
        const isCurrent = id === currentId
        const isSelected = selectedIds.includes(id)
        const isDelayed = section === 'delayed'
        const isReadied = section === 'readied'
        const isActed = section === 'acted'
        const isDead = c.dead === true || (!c.isPC && c.hp <= 0)
        const isSurprised = combat.round === 0 && c.conditions?.some(co => co.conditionId === 'surprised')
        const isHidden = !!c.hidden

        const hpPct = hpPercentage(c.hp, c.maxHp)

        // Attack mode state for this creature
        const isAttackTarget = attackMode?.targetIds.includes(id) ?? false
        const isAttackCurrent = attackMode?.phase === 'resolve' && attackMode.targetIds[attackMode.currentIndex] === id
        const attackResult = attackMode?.results[id] ?? null
        const attackFaded = attackMode && (attackMode.phase === 'resolve' || attackMode.phase === 'apply') && !isAttackTarget

        // Defense value for resolve phase
        const defenseValue = isAttackCurrent && attackMode?.defense
          ? (c.statBlock as any)?.defenses?.[attackMode.defense.toLowerCase()] ?? (attackMode.defense === 'AC' ? (c.statBlock as any)?.ac : null)
          : null

        return (
          <div key={id} data-flip-key={id} style={(isDelayed || isReadied) ? { display: 'flex', alignItems: 'center', gap: 4, marginLeft: 16, position: 'relative' } : { position: 'relative' }}>
          <button
            onClick={(e) => onSelect(id, e)}
            onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(id, e) } : undefined}
            style={{
              display: 'flex', flex: (isDelayed || isReadied) ? 1 : undefined,
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '3px var(--space-3) 3px 0',
              minHeight: 38,
              background: isAttackCurrent
                ? 'rgba(92,124,250,0.25)'
                : attackMode?.phase === 'select' && isAttackTarget
                  ? 'rgba(92,124,250,0.15)'
                  : isSelected
                    ? 'var(--color-bg-hover)'
                    : isCurrent
                      ? 'var(--color-accent)'
                      : 'var(--color-bg-surface)',
              color: isCurrent && !isSelected && !isAttackCurrent ? 'var(--color-accent-text)' : 'var(--color-text-primary)',
              border: isAttackCurrent ? '2px solid rgba(92,124,250,0.6)'
                : attackMode?.phase === 'select' && isAttackTarget ? '1px solid rgba(92,124,250,0.4)'
                : isSelected ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
              borderRadius: '19px var(--radius-sm) var(--radius-sm) 19px',
              textAlign: 'left',
              cursor: 'pointer',
              opacity: attackFaded ? 0.3 : isHidden ? 0.4 : isDelayed || isReadied || isDead || isSurprised ? 0.5 : 1,
              width: '100%',
              transition: 'opacity 0.15s, background 0.15s',
            }}
          >
            <div style={{ marginLeft: 2, marginRight: 4, flexShrink: 0 }}>
              <CombatToken name={c.name} baseName={c.baseName} imageId={c.imageId} tokenImageId={c.tokenImageId}
                hp={c.hp} maxHp={c.maxHp} isDead={isDead} size={32}
                hideHpRing={!!c.color}
                solidRingColor={c.color}
                miniNumber={c.miniNumber} />
            </div>

            {/* Name + condition pills */}
            <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isDead ? 'line-through' : 'none' }}>
                  {c.name}
                  {isDelayed && <span style={{ fontSize: 'var(--font-size-xs)', marginLeft: 'var(--space-1)' }}>[D]</span>}
                  {isReadied && <span style={{ fontSize: 'var(--font-size-xs)', marginLeft: 'var(--space-1)', color: 'var(--color-readied)' }}>[R]</span>}
                  {isHidden && <span style={{ fontSize: 'var(--font-size-xs)', marginLeft: 'var(--space-1)', opacity: 0.6 }}>👁‍🗨</span>}
                </span>
                {c.isPC && (c.deathSaveFailures != null && c.deathSaveFailures > 0 || c.conditions.some(cd => cd.conditionId === 'dying')) && (
                  <span style={{ display: 'inline-flex', gap: 1, fontSize: 11, lineHeight: 1, flexShrink: 0 }}>
                    {[0, 1, 2].map(i => {
                      const filled = (c.deathSaveFailures ?? 0) > i
                      return <span key={i} style={{ opacity: filled ? 1 : 0.3 }}>💀</span>
                    })}
                  </span>
                )}
              </div>
              {isReadied && c.readiedAction && (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-readied)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={c.readiedAction}>
                  {c.readiedAction}
                </div>
              )}
              {c.conditions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 1 }}>
                  {c.conditions.map(cond => {
                    const def = conditionDefs.find(d => d.id === cond.conditionId) ?? (cond.conditionId.startsWith('ongoing-damage') ? conditionDefs.find(d => d.id === 'ongoing-damage') : undefined)
                    const name = formatConditionName(cond.conditionId, conditionDefs, cond.customName)
                    const expiresOnName = cond.duration?.expiresOnId ? combat.combatants[cond.duration.expiresOnId]?.name : undefined
                    const pillLabel = buildConditionLabel({
                      conditionId: cond.conditionId, name, value: cond.value,
                      customDescription: cond.customDescription, damageType: cond.customDescription,
                      durationType: cond.duration?.type, expiresOnName,
                    })
                    const tooltipParts = [name, cond.customDescription ?? def?.description].filter(Boolean)
                    return (
                      <ConditionPill
                        key={cond.conditionId}
                        conditionId={cond.conditionId}
                        label={pillLabel}
                        damageType={cond.customDescription}
                        customColor={cond.customColor}
                        customIcon={cond.customIcon}
                        title={tooltipParts.join(' — ')}
                      />
                    )
                  })}
                </div>
              )}
            </div>


            {/* Attack mode: hit/miss indicator */}
            {attackResult === 'hit' && <span style={{ fontSize: 14, color: 'var(--color-check)' }} title="Hit">⚔</span>}
            {attackResult === 'miss' && <span style={{ fontSize: 14, color: 'var(--color-miss)' }} title="Miss">✕</span>}

            {/* Attack mode: selection checkmark */}
            {attackMode?.phase === 'select' && isAttackTarget && <span style={{ fontSize: 12, color: 'rgba(92,124,250,0.8)' }}>✓</span>}
          </button>
          {/* Undelay button for delayed creatures */}
          {isDelayed && onUndelay && (
            <button onClick={() => onUndelay(id)} title="Undelay"
              style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: 11, whiteSpace: 'nowrap' }}>
              ▶ Undelay
            </button>
          )}
          {/* Resolve/Cancel buttons for readied creatures */}
          {isReadied && (
            <div style={{ display: 'flex', gap: 2 }}>
              {onResolveReady && (
                <button onClick={() => onResolveReady(id)} title="Resolve readied action"
                  style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'var(--color-readied)', border: '1px solid var(--color-readied-border)', color: 'var(--color-text-on-dark)', fontSize: 11, whiteSpace: 'nowrap' }}>
                  ▶ Resolve
                </button>
              )}
              {onCancelReady && (
                <button onClick={() => onCancelReady(id)} title="Cancel readied action"
                  style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: 11, whiteSpace: 'nowrap' }}>
                  ✕
                </button>
              )}
            </div>
          )}
          {/* Hidden toggle — not for PCs */}
          {!c.isPC && (
            <button
              onClick={(e) => { e.stopPropagation(); window.api.combat.updateCombatant(id, { hidden: !isHidden }) }}
              title={isHidden ? 'Hidden from players — click to reveal' : 'Visible to players — click to hide'}
              style={{
                position: 'absolute', top: 2, right: 2,
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 10, padding: '0 2px', opacity: isHidden ? 0.6 : 0.3,
                lineHeight: 1,
              }}
            >
              {isHidden ? '🚫' : '👁'}
            </button>
          )}
          {/* Attack mode: expanded defense row for current target */}
          {isAttackCurrent && (
            <div style={{
              display: 'flex', gap: 'var(--space-3)', padding: '2px var(--space-3) 4px',
              marginTop: -1, marginBottom: 2,
              background: 'rgba(92,124,250,0.1)', borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
              border: '1px solid rgba(92,124,250,0.3)', borderTop: 'none',
              fontSize: 11, fontWeight: 600,
            }}>
              <span><b style={{ color: 'var(--color-text-muted)' }}>AC</b> {(c.statBlock as any)?.ac ?? '—'}</span>
              <span><b style={{ color: 'var(--color-text-muted)' }}>Fort</b> {(c.statBlock as any)?.defenses?.fortitude ?? '—'}</span>
              <span><b style={{ color: 'var(--color-text-muted)' }}>Ref</b> {(c.statBlock as any)?.defenses?.reflex ?? '—'}</span>
              <span><b style={{ color: 'var(--color-text-muted)' }}>Will</b> {(c.statBlock as any)?.defenses?.will ?? '—'}</span>
            </div>
          )}

          {/* Triggered reactions row — directly under the creature card */}
          <CreatureReactions combatantId={id} combatant={c} isCurrent={isCurrent}
            notifications={notifications}
            turnSig={`${combat.round}:${combat.turnIndex}`} />
          </div>
        )
      })}

    </div>
  )
}

// ─── Per-creature triggered-actions strip ───

interface CreatureReactionsProps {
  combatantId: string
  combatant: import('@common/types').CombatantState
  isCurrent: boolean
  notifications: CombatNotification[]
  /** Round + turnIndex signature; used to fade out reactions consumed during a previous turn */
  turnSig: string
}

function CreatureReactions({ combatantId, combatant, isCurrent, notifications, turnSig }: CreatureReactionsProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const allReactions = getCreatureReactions(combatant, isCurrent)

  // Track which reactions transitioned from unused → used during the *current* turn.
  // Reactions used in previous turns disappear.
  const turnTracking = useRef<{ turnSig: string; seenUnused: Set<number>; usedThisTurn: Set<number> }>({
    turnSig, seenUnused: new Set(), usedThisTurn: new Set(),
  })
  if (turnTracking.current.turnSig !== turnSig) {
    turnTracking.current = { turnSig, seenUnused: new Set(), usedThisTurn: new Set() }
  }
  for (const r of allReactions) {
    if (!r.used) {
      turnTracking.current.seenUnused.add(r.powerIndex)
      // If a reaction was marked used and then undone, drop it from the "fresh use" set
      // so we don't show stale entries on re-use.
      turnTracking.current.usedThisTurn.delete(r.powerIndex)
    } else if (turnTracking.current.seenUnused.has(r.powerIndex)) {
      turnTracking.current.usedThisTurn.add(r.powerIndex)
    }
  }
  // Visible: anything not used, OR a reaction whose use was observed during this turn
  const reactions = allReactions.filter(r =>
    !r.used || turnTracking.current.usedThisTurn.has(r.powerIndex)
  )
  if (reactions.length === 0) return null

  return (
    <div style={{ marginLeft: 24, marginTop: 1, marginBottom: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {reactions.map((r, idx) => {
        const key = `${r.power.name}-${idx}`
        const triggered = triggerMatchesNotification(r.parsedTrigger, notifications, combatantId)
        const isExpanded = expandedKey === key
        const usageColor = USAGE_COLORS[r.card.usage] ?? (r.card.usage ? '#6a6a72' : '#7a6f5e')
        return (
          <div key={key} style={{
            opacity: r.used ? 0.4 : 1,
            transition: 'opacity 0.15s',
            borderLeft: triggered ? '3px solid var(--color-action-point)' : '3px solid transparent',
            paddingLeft: 1,
            animation: triggered ? 'reaction-pulse 1.5s ease-in-out 2' : 'none',
            position: 'relative',
          }}>
            {isExpanded ? (
              // Expanded: full PowerCardView. Its header line sits in the same place as the collapsed tile.
              <div onClick={(e) => e.stopPropagation()}>
                <PowerCardView entry={r.card} />
              </div>
            ) : (
              // Collapsed: a tile that mimics the PowerCardView header line exactly
              <div
                onClick={() => toggleReaction(combatantId, r)}
                title={r.used ? 'Click to undo reaction' : 'Click to use reaction'}
                style={{
                  padding: '2px 32px 2px 8px',
                  fontSize: 'var(--font-size-xs)', lineHeight: 1.5,
                  background: usageColor, color: 'var(--color-text-on-dark)',
                  cursor: 'pointer',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecoration: r.used ? 'line-through' : 'none',
                }}
              >
                {r.power.actionType && ACTION_ICONS[r.power.actionType] && (
                  <span title={r.power.actionType.replace(/-/g, ' ')}
                    style={{ marginRight: 6, display: 'inline-block', minWidth: '1em', textAlign: 'center' }}>
                    {ACTION_ICONS[r.power.actionType]}
                  </span>
                )}
                {triggered && <span title="Triggered" style={{ marginRight: 4, color: 'var(--color-turn-active)' }}>⚡</span>}
                <b>{r.card.name}</b>
                {r.card.keywords && r.card.keywords.length > 0 && (
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}> ({r.card.keywords.join(', ')})</span>
                )}
              </div>
            )}
            {/* Toggle button — absolutely positioned so it sits in the same spot in both states */}
            <button onClick={(e) => { e.stopPropagation(); setExpandedKey(isExpanded ? null : key) }}
              title={isExpanded ? 'Collapse' : 'Show power card'}
              style={{
                position: 'absolute', top: 0, right: 0, height: 22,
                background: 'rgba(0,0,0,0.2)',
                border: 'none',
                color: 'rgba(255,255,255,0.9)',
                cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: '0 8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1,
              }}>{isExpanded ? '▾' : '▸'}</button>
            {/* Trigger text — only when collapsed; the card carries it when expanded */}
            {r.power.trigger && !isExpanded && (
              <div style={{ padding: '0 4px 0 11px', fontSize: 10, color: 'var(--color-text-secondary)', lineHeight: 1.3 }}>
                {r.power.trigger}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
