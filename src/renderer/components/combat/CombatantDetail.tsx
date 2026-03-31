import type { CombatantState } from '@common/types'
import { useUiStore } from '../../stores/ui-store'

interface Props {
  combatant: CombatantState
  isCurrent: boolean
  isDelayed: boolean
  onDamage: () => void
  onHeal: () => void
  onAddCondition: () => void
  onAddEffect: () => void
  onDelay: () => void
  onUndelay: () => void
  onRemove: () => void
}

export function CombatantDetail({
  combatant: c,
  isCurrent,
  isDelayed,
  onDamage,
  onHeal,
  onAddCondition,
  onAddEffect,
  onDelay,
  onUndelay,
  onRemove,
}: Props) {
  const systemPlugin = useUiStore((s) => s.systemPlugin)
  const hpPct = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0

  return (
    <div style={{ maxWidth: 500 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ flex: 1, fontSize: 'var(--font-size-2xl)', margin: 0 }}>
          {c.name}
        </h2>
        {isCurrent && (
          <span style={{
            background: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
            padding: '2px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
          }}>
            Current Turn
          </span>
        )}
        {isDelayed && (
          <span style={{
            background: '#c90',
            color: '#000',
            padding: '2px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
          }}>
            Delayed
          </span>
        )}
      </div>

      {/* HP */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>HP</span>
          <span style={{ fontWeight: 600 }}>
            {c.hp} / {c.maxHp}
            {c.tempHp > 0 && <span style={{ color: '#09f', marginLeft: 'var(--space-1)' }}>+{c.tempHp} temp</span>}
          </span>
        </div>
        <div style={{
          width: '100%',
          height: 10,
          background: 'var(--color-border)',
          borderRadius: 5,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${hpPct}%`,
            height: '100%',
            background: hpPct > 50 ? '#0a0' : hpPct > 25 ? '#c90' : '#c00',
            transition: 'width 0.2s',
          }} />
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <button onClick={onDamage} style={{ background: '#c00', color: '#fff', padding: '4px 12px', borderRadius: 'var(--radius-sm)' }}>
          Damage
        </button>
        <button onClick={onHeal} style={{ background: '#0a0', color: '#fff', padding: '4px 12px', borderRadius: 'var(--radius-sm)' }}>
          Heal
        </button>
        <button onClick={onAddCondition} style={{ padding: '4px 12px', borderRadius: 'var(--radius-sm)' }}>
          + Condition
        </button>
        <button onClick={onAddEffect} style={{ padding: '4px 12px', borderRadius: 'var(--radius-sm)' }}>
          + Effect
        </button>
        {isDelayed ? (
          <button onClick={onUndelay} style={{ padding: '4px 12px', borderRadius: 'var(--radius-sm)' }}>
            Undelay
          </button>
        ) : (
          <button onClick={onDelay} style={{ padding: '4px 12px', borderRadius: 'var(--radius-sm)' }}>
            Delay
          </button>
        )}
      </div>

      {/* Conditions */}
      {c.conditions.length > 0 && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-2)' }}>Conditions</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {c.conditions.map((cond) => {
              const def = systemPlugin?.conditions?.find((d: any) => d.id === cond.conditionId)
              return (
                <span
                  key={cond.conditionId}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-1)',
                    padding: '2px 8px',
                    background: '#c90',
                    color: '#000',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                  }}
                >
                  {def?.name ?? cond.conditionId}
                  {cond.value != null && ` ${cond.value}`}
                  <button
                    onClick={() => window.api.combat.removeCondition(c.id, cond.conditionId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      marginLeft: 2,
                      fontSize: 'var(--font-size-sm)',
                      lineHeight: 1,
                    }}
                  >
                    x
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Effects */}
      {c.effects.length > 0 && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-2)' }}>Effects</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {c.effects.map((eff) => (
              <div
                key={eff.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: '4px 8px',
                  background: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <span style={{ flex: 1 }}>{eff.name}</span>
                {eff.remainingRounds != null && (
                  <span style={{ color: 'var(--color-text-muted)' }}>{eff.remainingRounds}r</span>
                )}
                <button
                  onClick={() => window.api.combat.removeEffect(c.id, eff.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    color: 'var(--color-danger)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
        <div>Initiative: {c.initiative ?? '—'}</div>
        <div>{c.isPC ? 'Player Character' : 'NPC/Monster'}</div>
      </div>

      {/* Remove combatant */}
      <button
        onClick={onRemove}
        style={{
          marginTop: 'var(--space-4)',
          color: 'var(--color-danger)',
          fontSize: 'var(--font-size-sm)',
        }}
      >
        Remove from combat
      </button>
    </div>
  )
}
