import { useRef, useLayoutEffect } from 'react'
import type { CombatState } from '@common/types'
import { CombatToken } from './CombatToken'
import type { ConditionDef } from '@common/types/system-plugin'
import type { AttackMode } from './CombatView'
import { getConditionStyle } from '../../plugins/dnd-4e/condition-styles'
import { ConditionPill, buildConditionLabel } from '../../plugins/dnd-4e/ConditionPill'

interface Props {
  combat: CombatState
  currentId: string
  selectedId: string | null
  onSelect: (id: string) => void
  onContextMenu?: (combatantId: string, event: React.MouseEvent) => void
  attackMode?: AttackMode
  conditionDefs?: ConditionDef[]
  onUndelay?: (id: string) => void
}

export function InitiativeList({ combat, currentId, selectedId, onSelect, onContextMenu, attackMode, conditionDefs = [], onUndelay }: Props) {
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

  type DisplayItem = { id: string; section: 'waiting' | 'delayed' | 'header' | 'acted' }

  // Categorize: creatures at or after turnIndex that aren't delayed = waiting (haven't acted)
  // Creatures before turnIndex that aren't delayed = acted (already went this round)
  const waiting: string[] = []   // will act this round (includes current)
  const acted: string[] = []     // already acted this round

  for (let i = 0; i < order.length; i++) {
    const id = order[i]
    if (delayedSet.has(id)) continue  // delayed shown separately
    if (i >= turnIdx) waiting.push(id)
    else acted.push(id)
  }

  // Sort delayed by initiative (highest first) for display
  const delayedSorted = [...combat.delayedIds]
    .filter(id => combat.combatants[id])
    .sort((a, b) => (combat.combatants[b]?.initiative ?? 0) - (combat.combatants[a]?.initiative ?? 0))

  const displayOrder: DisplayItem[] = [
    // Current creature first
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
              Round {combat.round + 1}
            </div>
          )
        }
        const c = combat.combatants[id]
        if (!c) return null
        const isCurrent = id === currentId
        const isSelected = id === selectedId
        const isDelayed = section === 'delayed'
        const isActed = section === 'acted'
        const isDead = c.hp <= 0

        const hpPct = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0

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
          <div key={id} data-flip-key={id} style={isDelayed ? { display: 'flex', alignItems: 'center', gap: 4, marginLeft: 16 } : undefined}>
          <button
            onClick={() => onSelect(id)}
            onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(id, e) } : undefined}
            style={{
              display: 'flex', flex: isDelayed ? 1 : undefined,
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '0 var(--space-3) 0 0',
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
              opacity: attackFaded ? 0.3 : isDelayed || isDead ? 0.5 : 1,
              textDecoration: isDead ? 'line-through' : 'none',
              width: '100%',
              transition: 'opacity 0.15s, background 0.15s',
            }}
          >
            <div style={{ marginLeft: -1, marginTop: -1, marginBottom: -1, marginRight: 4 }}>
              <CombatToken name={c.name} imageId={c.imageId} tokenImageId={c.tokenImageId} hp={c.hp} maxHp={c.maxHp} isDead={isDead} />
            </div>

            {/* Name + condition pills */}
            <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
                {isDelayed && <span style={{ fontSize: 'var(--font-size-xs)', marginLeft: 'var(--space-1)' }}>[D]</span>}
              </div>
              {c.conditions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 1 }}>
                  {c.conditions.map(cond => {
                    const def = conditionDefs.find(d => d.id === cond.conditionId) ?? (cond.conditionId.startsWith('ongoing-damage') ? conditionDefs.find(d => d.id === 'ongoing-damage') : undefined)
                    const name = cond.customName ?? (cond.conditionId.startsWith('ongoing-damage') ? 'Ongoing Damage' : def?.name ?? cond.conditionId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
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
                        title={tooltipParts.join(' — ')}
                      />
                    )
                  })}
                </div>
              )}
            </div>


            {/* Attack mode: hit/miss indicator */}
            {attackResult === 'hit' && <span style={{ fontSize: 14, color: '#2a6' }} title="Hit">⚔</span>}
            {attackResult === 'miss' && <span style={{ fontSize: 14, color: '#a44' }} title="Miss">✕</span>}

            {/* Attack mode: selection checkmark */}
            {attackMode?.phase === 'select' && isAttackTarget && <span style={{ fontSize: 12, color: 'rgba(92,124,250,0.8)' }}>✓</span>}
          </button>
          {/* Undelay button for delayed creatures */}
          {isDelayed && onUndelay && (
            <button onClick={() => onUndelay(id)} title="Undelay"
              style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontSize: 11, whiteSpace: 'nowrap' }}>
              ▶ Undelay
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
          </div>
        )
      })}

    </div>
  )
}
