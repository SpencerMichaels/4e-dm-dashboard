import { useRef, useEffect } from 'react'
import type { CombatEvent } from '@common/types'
import { renderEvent, eventColor } from './combat-log-utils'
import { FloatingPanel } from '../shared/FloatingPanel'
import { Icon } from '../shared/Icon'
import styles from './CombatLogPanel.module.css'

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
      popoutKey="combat-log"
      initialX={window.innerWidth - 340}
      initialY={60}
      width={320}
      maxHeight="50vh"
      onClose={onClose}
      bodyStyle={{ padding: '4px 0' }}
    >
      <>
        {events.length === 0 ? (
          <div className={styles.emptyState}>
            No events yet
          </div>
        ) : events.map((ev, i) => {
          const elements: React.ReactNode[] = []

          // Round header
          if (ev.round > lastRound) {
            lastRound = ev.round
            lastTurnTarget = ''
            elements.push(
              <div key={`round-${ev.round}`} className={i > 0 ? styles.roundHeaderSeparator : styles.roundHeader}
                style={i > 0 ? { marginTop: 6 } : undefined}>
                Round {ev.round}
              </div>
            )
          }

          // Turn header
          if (ev.type === 'turn-start') {
            lastTurnTarget = ev.targetName
            elements.push(
              <div key={`turn-${i}`} className={styles.turnHeader}>
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
            <div key={i} className={styles.eventRow}>
              {color && <span className={styles.eventDot} style={{ color }}><Icon name="circle" fill="currentColor" size="0.6em" style={{ verticalAlign: '0.1em' }} /></span>}
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
