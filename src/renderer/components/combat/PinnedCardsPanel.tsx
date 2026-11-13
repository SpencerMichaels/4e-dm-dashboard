import type { CombatState } from '@common/types'
import { PowerCardView, type PowerCardEntry } from '../creature/PowerCardView'
import { FloatingPanel } from '../shared/FloatingPanel'
import { useDiseaseNames } from '../disease/disease-refs'
import { applyDetection, cardFor, detectIn, entryAt, maxUses, rechargeQueued, type ApplyHandlers } from './card-actions'

export interface PinnedCard {
  combatantName: string
  title: string
  /** The card as it was pinned: used when the combatant has left combat (or for grouped pins). */
  content: PowerCardEntry | string
  /** "<combatant id>:<power|trait|aura>:<entry index>" for a live card; "grouped:..." pins stay snapshots. */
  key: string
}

interface Props {
  cards: PinnedCard[]
  onUnpin: (key: string) => void
  /** Live pins read the combatant's current state: uses, recharge, and click-to-apply. */
  combat?: CombatState | null
  handlers?: ApplyHandlers
}

const LIVE_KEY = /^(.+):(power|trait|aura):(\d+)$/

export function PinnedCardsPanel({ cards, onUnpin, combat, handlers }: Props) {
  const diseaseNames = useDiseaseNames()
  if (cards.length === 0) return null

  // Group cards by combatant name, preserving order.
  const groups: { name: string; cards: PinnedCard[] }[] = []
  for (const card of cards) {
    const last = groups[groups.length - 1]
    if (last && last.name === card.combatantName) last.cards.push(card)
    else groups.push({ name: card.combatantName, cards: [card] })
  }

  const live = (card: PinnedCard) => {
    const m = card.key.match(LIVE_KEY)
    const c = m ? combat?.combatants[m[1]] : undefined
    const index = m ? Number(m[3]) : -1
    const entry = c ? entryAt(c, index) : undefined
    if (!c || !entry) return null
    const isPower = m![2] === 'power'
    const used = c.usedPowers?.[index] ?? 0
    const max = maxUses(entry)
    return <PowerCardView entry={cardFor(entry)} pinned onPin={() => onUnpin(card.key)}
      detectedConditions={handlers ? detectIn(entry, diseaseNames) : undefined}
      onConditionClick={handlers ? (det, multi) => applyDetection(c, det, multi, handlers) : undefined}
      {...(isPower ? {
        uses: { used, max }, rechargeQueued: rechargeQueued(combat!, c.id, index),
        onUse: max !== Infinity ? () => void window.api.combat.usePower(c.id, index) : undefined,
        onRestore: used > 0 ? () => void window.api.combat.unusePower(c.id, index) : undefined,
      } : {})} />
  }

  return (
    <FloatingPanel title={`📌 Pinned (${cards.length})`} initialX={20} initialY={60} width={320} maxHeight="60vh">
      <div className="stat-block-4e pinned-cards" style={{ fontSize: 11 }}>
        {groups.map(group => (
          <div key={group.name} style={{ padding: '4px 0' }}>
            <div style={{ padding: '0 8px 2px', fontSize: 9, color: 'var(--color-text-muted)', fontWeight: 600 }}>{group.name}</div>
            {group.cards.map(card => <div key={card.key}>
              {live(card) ?? <PowerCardView pinned onPin={() => onUnpin(card.key)}
                entry={typeof card.content === 'string' ? { name: card.title, usage: 'trait', effect: card.content } : card.content} />}
            </div>)}
          </div>
        ))}
      </div>
    </FloatingPanel>
  )
}
