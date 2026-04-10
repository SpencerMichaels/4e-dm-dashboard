import { useState, useRef, useCallback } from 'react'
import { PowerCardView, type PowerCardEntry } from '../../plugins/dnd-4e/PowerCardView'

export interface PinnedCard {
  combatantName: string
  title: string
  content: any  // string for traits/auras, PowerCardEntry for powers
  key: string
}

interface Props {
  cards: PinnedCard[]
  onUnpin: (key: string) => void
}

export function PinnedCardsPanel({ cards, onUnpin }: Props) {
  const [pos, setPos] = useState({ x: 20, y: 60 })
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag from the header area
    if ((e.target as HTMLElement).closest('[data-pin-content]')) return
    setDragging(true)
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }, [pos])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
  }, [dragging])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
  }, [])

  if (cards.length === 0) return null

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'fixed',
        left: pos.x, top: pos.y,
        zIndex: 50,
        width: 320,
        maxHeight: '60vh',
        overflow: 'auto',
        background: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      {/* Drag handle header */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          padding: '4px 8px',
          background: 'var(--color-bg-surface)',
          borderBottom: '1px solid var(--color-border)',
          cursor: dragging ? 'grabbing' : 'grab',
          fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          userSelect: 'none',
        }}
      >
        📌 Pinned ({cards.length})
      </div>

      <div data-pin-content className="stat-block-4e" style={{ fontSize: 11 }}>
        {(() => {
          // Group cards by combatant name, preserving order
          const groups: { name: string; cards: PinnedCard[] }[] = []
          for (const card of cards) {
            const last = groups[groups.length - 1]
            if (last && last.name === card.combatantName) {
              last.cards.push(card)
            } else {
              groups.push({ name: card.combatantName, cards: [card] })
            }
          }
          return groups.map(group => (
            <div key={group.name} style={{ borderBottom: '1px solid var(--color-border)', padding: '4px 0' }}>
              <div style={{ padding: '0 8px 2px', fontSize: 9, color: 'var(--color-text-muted)', fontWeight: 600 }}>
                {group.name}
              </div>
              {group.cards.map(card => (
                <div key={card.key} style={{ position: 'relative' }}>
                  <button
                    onClick={() => onUnpin(card.key)}
                    title="Unpin"
                    style={{ position: 'absolute', top: 2, right: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#000', padding: 0, zIndex: 1, fontWeight: 700 }}
                  >
                    ×
                  </button>
                  {typeof card.content === 'string' ? (
                    <div style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.5, marginBottom: 1 }}>
                      <div style={{ padding: '2px 8px', background: '#7a6f5e', color: '#fff' }}>
                        <b>{card.title}</b>
                      </div>
                      {card.content && <div style={{ padding: '1px 8px 2px 16px' }}>{card.content}</div>}
                    </div>
                  ) : (
                    <PowerCardView entry={card.content as PowerCardEntry} />
                  )}
                </div>
              ))}
            </div>
          ))
        })()}
      </div>
    </div>
  )
}
