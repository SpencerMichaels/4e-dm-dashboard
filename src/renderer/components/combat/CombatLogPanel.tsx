import { useState, useRef, useCallback, useEffect } from 'react'
import type { CombatEvent } from '@common/types'
import { renderEvent, eventColor } from './combat-log-utils'

interface Props {
  events: CombatEvent[]
  onClose: () => void
}

export function CombatLogPanel({ events, onClose }: Props) {
  const [pos, setPos] = useState({ x: window.innerWidth - 340, y: 60 })
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-log-content]')) return
    setDragging(true)
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }, [pos])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
  }, [dragging])

  const handleMouseUp = useCallback(() => setDragging(false), [])

  // Group events with round and turn headers
  let lastRound = 0
  let lastTurnTarget = ''

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 50,
        width: 320, maxHeight: '50vh',
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        style={{
          padding: '4px 8px', background: 'var(--color-bg-surface)',
          borderBottom: '1px solid var(--color-border)',
          cursor: dragging ? 'grabbing' : 'grab',
          fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          userSelect: 'none', display: 'flex', alignItems: 'center',
        }}
      >
        <span style={{ flex: 1 }}>Combat Log</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: 'var(--color-text-muted)', padding: 0,
        }}>×</button>
      </div>

      <div data-log-content style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
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
      </div>
    </div>
  )
}
