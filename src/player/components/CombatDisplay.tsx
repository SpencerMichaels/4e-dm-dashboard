import { useRef, useLayoutEffect } from 'react'
import type { PlayerCombatState, PlayerCombatantState } from '@common/types'

interface Props {
  combat: PlayerCombatState
}

export function CombatDisplay({ combat }: Props) {
  const currentId = combat.initiativeOrder[combat.turnIndex]

  if (combat.phase === 'initiative-entry') {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111',
        color: '#eee',
      }}>
        <h1 style={{ fontSize: '4rem', fontWeight: 700, marginBottom: '1rem' }}>
          Roll Initiative!
        </h1>
        <p style={{ fontSize: '1.5rem', color: '#888' }}>
          {Object.keys(combat.combatants).length} combatants
        </p>
      </div>
    )
  }

  // Build queue order: current combatant first, then remaining in this round,
  // then wrapped around for next round (those who already acted)
  const order = combat.initiativeOrder
  const idx = combat.turnIndex
  const thisRound = order.slice(idx)
  const nextRound = order.slice(0, idx)

  const current = currentId ? combat.combatants[currentId] : null

  // Build flat list of queue entries for animation
  const queueEntries: { id: string; section: 'current' | 'next'; roundLabel?: string }[] = []

  for (let i = 0; i < thisRound.length; i++) {
    queueEntries.push({ id: thisRound[i], section: 'current' })
  }
  for (let i = 0; i < nextRound.length; i++) {
    queueEntries.push({ id: nextRound[i], section: 'next', roundLabel: i === 0 ? `Round ${combat.round + 1}` : undefined })
  }

  return (
    <div style={{
      height: '100vh',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      background: '#111',
      color: '#eee',
      overflow: 'hidden',
    }}>
      {/* Left: initiative queue */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '2rem',
        overflow: 'auto',
        borderRight: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{
          fontSize: '0.85rem',
          color: '#888',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: '0.75rem',
        }}>
          Round {combat.round}
        </div>

        <AnimatedQueue
          entries={queueEntries}
          combatants={combat.combatants}
          currentId={currentId}
        />
      </div>

      {/* Right: active combatant spotlight */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem',
      }}>
        {current ? (
          <ActiveSpotlight combatant={current} round={combat.round} />
        ) : (
          <div style={{ color: '#555' }}>No active combatant</div>
        )}
      </div>
    </div>
  )
}

// Animated queue using FLIP technique
function AnimatedQueue({
  entries,
  combatants,
  currentId,
}: {
  entries: { id: string; section: 'current' | 'next'; roundLabel?: string }[]
  combatants: Record<string, PlayerCombatantState>
  currentId: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const positionsRef = useRef<Map<string, number>>(new Map())

  // Before DOM update: capture current positions
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const newPositions = new Map<string, number>()
    const children = container.querySelectorAll<HTMLElement>('[data-combatant-id]')
    children.forEach((el) => {
      const id = el.dataset.combatantId!
      newPositions.set(id, el.offsetTop)
    })

    // Animate from old position to new
    const oldPositions = positionsRef.current
    children.forEach((el) => {
      const id = el.dataset.combatantId!
      const oldTop = oldPositions.get(id)
      const newTop = newPositions.get(id)

      if (oldTop != null && newTop != null && oldTop !== newTop) {
        const delta = oldTop - newTop
        el.style.transform = `translateY(${delta}px)`
        el.style.transition = 'none'

        requestAnimationFrame(() => {
          el.style.transform = ''
          el.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
        })
      }
    })

    positionsRef.current = newPositions
  })

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column' }}>
      {entries.map((entry) => {
        const c = combatants[entry.id]
        if (!c) return null
        return (
          <div key={entry.id} data-combatant-id={entry.id}>
            {entry.roundLabel && (
              <div style={{
                fontSize: '0.85rem',
                color: '#555',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginTop: '1.5rem',
                marginBottom: '0.75rem',
              }}>
                {entry.roundLabel}
              </div>
            )}
            <InitiativeCard combatant={c} isCurrent={entry.id === currentId} />
          </div>
        )
      })}
    </div>
  )
}

function ActiveSpotlight({ combatant: c, round }: { combatant: PlayerCombatantState; round: number }) {
  return (
    <div style={{ textAlign: 'center', width: '100%', maxWidth: 500 }}>
      <div style={{ fontSize: '1rem', color: '#888', marginBottom: '0.5rem' }}>
        Round {round} — Current Turn
      </div>

      <div style={{
        fontSize: '3.5rem',
        fontWeight: 700,
        marginBottom: '1rem',
        lineHeight: 1.1,
      }}>
        {c.name}
      </div>

      <div style={{
        color: c.hpColor,
        fontWeight: 600,
        fontSize: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        {c.hpDescriptor}
      </div>

      {c.conditions.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '1rem',
        }}>
          {c.conditions.map((cond, i) => (
            <span key={i} style={{
              background: '#c90',
              color: '#000',
              padding: '4px 14px',
              borderRadius: '999px',
              fontSize: '1rem',
              fontWeight: 600,
            }}>
              {cond.name}{cond.value != null ? ` ${cond.value}` : ''}
            </span>
          ))}
        </div>
      )}

      {c.effects.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          {c.effects.map((eff, i) => (
            <span key={i} style={{
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '4px 12px',
              borderRadius: '999px',
              fontSize: '0.9rem',
              color: '#aaa',
            }}>
              {eff.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function InitiativeCard({ combatant: c, isCurrent }: { combatant: PlayerCombatantState; isCurrent: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '0.75rem 1rem',
      marginBottom: '0.5rem',
      background: isCurrent ? 'rgba(255,255,255,0.1)' : 'transparent',
      border: isCurrent ? '2px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.06)',
      borderRadius: '8px',
    }}>
      <div style={{
        flex: 1,
        fontSize: isCurrent ? '1.25rem' : '1rem',
        fontWeight: isCurrent ? 700 : 400,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {c.name}
      </div>

      {c.conditions.length > 0 && (
        <div style={{ display: 'flex', gap: '4px' }}>
          {c.conditions.map((cond, i) => (
            <span key={i} style={{
              background: '#c90',
              color: '#000',
              padding: '1px 6px',
              borderRadius: '999px',
              fontSize: '0.7rem',
              fontWeight: 600,
            }}>
              {cond.name}{cond.value != null ? ` ${cond.value}` : ''}
            </span>
          ))}
        </div>
      )}

      <div style={{
        color: c.hpColor,
        fontWeight: 600,
        fontSize: '0.85rem',
        minWidth: 80,
        textAlign: 'right',
      }}>
        {c.hpDescriptor}
      </div>
    </div>
  )
}
