import { useRef, useEffect } from 'react'
import type { CombatEvent } from '@common/types'
import { renderEvent, eventColor } from './combat-log-utils'
import { FloatingPanel } from '../shared/FloatingPanel'

interface Props {
  events: CombatEvent[]
  onClose: () => void
}

export function CombatLogPanel({ events, onClose }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  // Group events with round and turn headers
  let lastRound = 0
  let lastTurnTarget = ''

  return (
    <FloatingPanel
      title="Combat Log"
      initialX={window.innerWidth - 340}
      initialY={60}
      width={320}
      maxHeight="50vh"
      onClose={onClose}
      bodyStyle={{ padding: '4px 0' }}
    >
      <>
        {events.length === 0 ? (
          <div style={{ padding: 8, color: 'var(--color-text-muted)', fontSize: 11, textAlign: 'center' }}>
            No events yet
          </div>
        ) : events.map((ev, i) => {
          const elements: React.ReactNode[] = []

          // Round header
          if (ev.round > lastRound) {
            lastRound = ev.round
            lastTurnTarget = ''
            elements.push(
              <div key={`round-${ev.round}`} style={{
                padding: '4px 8px', marginTop: i > 0 ? 6 : 0,
                fontSize: 11, fontWeight: 700, color: 'var(--color-text)',
                borderTop: i > 0 ? '2px solid var(--color-border)' : 'none',
              }}>
                Round {ev.round}
              </div>
            )
          }

          // Turn header
          if (ev.type === 'turn-start') {
            lastTurnTarget = ev.targetName
            elements.push(
              <div key={`turn-${i}`} style={{
                padding: '2px 8px', marginTop: 2,
                fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)',
                borderTop: '1px solid var(--color-border)',
              }}>
                {ev.targetName}'s turn
              </div>
            )
            return elements
          }

          // Skip turn-end events
          if (ev.type === 'turn-end') return elements.length > 0 ? elements : null

          // Regular event
          const color = eventColor(ev.type)
          elements.push(
            <div key={i} style={{ padding: '1px 8px 1px 16px', fontSize: 11 }}>
              {color && <span style={{ color, marginRight: 3 }}>●</span>}
              {renderEvent(ev)}
            </div>
          )

          return elements
        })}
        <div ref={bottomRef} />
      </>
    </FloatingPanel>
  )
}
