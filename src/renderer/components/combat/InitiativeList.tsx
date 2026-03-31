import type { CombatState } from '@common/types'

interface Props {
  combat: CombatState
  currentId: string
  selectedId: string | null
  onSelect: (id: string) => void
}

export function InitiativeList({ combat, currentId, selectedId, onSelect }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
      {combat.initiativeOrder.map((id) => {
        const c = combat.combatants[id]
        if (!c) return null
        const isCurrent = id === currentId
        const isSelected = id === selectedId
        const isDelayed = combat.delayedIds.includes(id)
        const isDead = c.hp <= 0

        const hpPct = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0

        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              background: isSelected
                ? 'var(--color-bg-hover)'
                : isCurrent
                  ? 'var(--color-accent)'
                  : 'var(--color-bg-surface)',
              color: isCurrent && !isSelected ? 'var(--color-accent-text)' : 'var(--color-text-primary)',
              border: isSelected ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'left',
              cursor: 'pointer',
              opacity: isDelayed || isDead ? 0.5 : 1,
              textDecoration: isDead ? 'line-through' : 'none',
              width: '100%',
            }}
          >
            {/* Initiative number */}
            <span style={{
              minWidth: 28,
              textAlign: 'center',
              fontWeight: 600,
              fontSize: 'var(--font-size-sm)',
            }}>
              {c.initiative ?? '—'}
            </span>

            {/* Name and indicators */}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
              {isDelayed && <span style={{ fontSize: 'var(--font-size-xs)', marginLeft: 'var(--space-1)' }}>[D]</span>}
            </span>

            {/* Condition count badge */}
            {c.conditions.length > 0 && (
              <span style={{
                background: '#c90',
                color: '#000',
                borderRadius: '999px',
                padding: '0 6px',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
              }}>
                {c.conditions.length}
              </span>
            )}

            {/* HP bar */}
            <div style={{
              width: 50,
              height: 6,
              background: 'var(--color-border)',
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${hpPct}%`,
                height: '100%',
                background: hpPct > 50 ? '#0a0' : hpPct > 25 ? '#c90' : '#c00',
                transition: 'width 0.2s',
              }} />
            </div>
          </button>
        )
      })}

      {/* Delayed combatants shown at bottom */}
      {combat.delayedIds.length > 0 && (
        <>
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
            padding: 'var(--space-1) var(--space-3)',
            marginTop: 'var(--space-2)',
          }}>
            Delayed
          </div>
          {combat.delayedIds.map((id) => {
            const c = combat.combatants[id]
            if (!c) return null
            return (
              <button
                key={`delayed-${id}`}
                onClick={() => onSelect(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  background: id === selectedId ? 'var(--color-bg-hover)' : 'transparent',
                  color: 'var(--color-text-muted)',
                  border: id === selectedId ? '1px solid var(--color-accent)' : '1px solid transparent',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontStyle: 'italic',
                  width: '100%',
                }}
              >
                <span style={{ minWidth: 28, textAlign: 'center', fontSize: 'var(--font-size-sm)' }}>
                  {c.initiative ?? '—'}
                </span>
                <span style={{ flex: 1 }}>{c.name}</span>
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}
