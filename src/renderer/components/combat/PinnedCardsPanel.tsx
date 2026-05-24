import { PowerCardView, type PowerCardEntry } from '../../plugins/dnd-4e/PowerCardView'
import { FloatingPanel } from '../shared/FloatingPanel'

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
  if (cards.length === 0) return null

  return (
    <FloatingPanel
      title={`📌 Pinned (${cards.length})`}
      initialX={20}
      initialY={60}
      width={320}
      maxHeight="60vh"
    >
      <div className="stat-block-4e" style={{ fontSize: 11 }}>
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
                    style={{ position: 'absolute', top: 2, right: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--color-text-on-warning)', padding: 0, zIndex: 1, fontWeight: 700 }}
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
    </FloatingPanel>
  )
}
