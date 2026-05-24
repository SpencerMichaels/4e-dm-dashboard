import type { CombatantState } from '@common/types'
import { useUiStore } from '../../stores/ui-store'

interface Props {
  combatant: CombatantState
  isCurrent: boolean
  isDelayed: boolean
  isReadied?: boolean
  onDamage: () => void
  onHeal: () => void
  onAddCondition: () => void
  onAddEffect: () => void
  onDelay: () => void
  onUndelay: () => void
  onReady?: () => void
  onResolveReady?: () => void
  onCancelReady?: () => void
  onRemove: () => void
}

export function CombatantDetail({
  combatant: c,
  isCurrent,
  isDelayed,
  isReadied,
  onDamage,
  onHeal,
  onAddCondition,
  onAddEffect,
  onDelay,
  onUndelay,
  onReady,
  onResolveReady,
  onCancelReady,
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
            background: 'var(--color-turn-delayed)',
            color: 'var(--color-text-on-dark)',
            padding: '2px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
          }}>
            Delayed
          </span>
        )}
        {isReadied && (
          <span style={{
            background: 'var(--color-readied)',
            color: 'var(--color-text-on-dark)',
            padding: '2px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
          }}>
            Readied
          </span>
        )}
      </div>

      {/* HP */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>HP</span>
          <span style={{ fontWeight: 600 }}>
            {c.hp} / {c.maxHp}
            {c.tempHp > 0 && <span style={{ color: 'var(--color-temp-hp)', marginLeft: 'var(--space-1)' }}>+{c.tempHp} temp</span>}
          </span>
        </div>
        <div style={{
          width: '100%',
          height: 10,
          background: 'var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${hpPct}%`,
            height: '100%',
            background: hpPct > 50 ? 'var(--color-hp-full)' : hpPct > 25 ? 'var(--color-hp-mid)' : 'var(--color-hp-low)',
            transition: 'width 0.2s',
          }} />
        </div>
      </div>

      {/* Active conditions strip */}
      {c.conditions.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)',
          marginBottom: 'var(--space-3)',
          padding: 'var(--space-2) var(--space-3)',
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
        }}>
          {c.conditions.map((cond) => {
            const def = systemPlugin?.conditions?.find((d: any) => d.id === cond.conditionId)
            const name = cond.customName ?? def?.name ?? cond.conditionId.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())
            const label = cond.value != null ? `${name} ${cond.value}` : name
            return (
              <span
                key={cond.conditionId}
                title={[name, def?.description].filter(Boolean).join(' — ')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 10,
                  background: cond.customColor ?? 'var(--color-condition-default)', color: 'var(--color-text-on-warning)',
                  fontSize: 'var(--font-size-xs)', fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
                <button
                  onClick={() => window.api.combat.removeCondition(c.id, cond.conditionId)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, marginLeft: 2, fontSize: 'var(--font-size-xs)',
                    lineHeight: 1, color: 'inherit', opacity: 0.7,
                  }}
                >
                  x
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Readied action text */}
      {isReadied && c.readiedAction && (
        <div style={{
          padding: 'var(--space-2) var(--space-3)',
          marginBottom: 'var(--space-3)',
          background: 'var(--color-readied-bg)',
          border: '1px solid var(--color-readied-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-readied)',
        }}>
          {c.readiedAction}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <button onClick={onDamage} style={{ background: 'var(--color-damage)', color: 'var(--color-text-on-dark)', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
          Damage
        </button>
        <button onClick={onHeal} style={{ background: 'var(--color-heal)', color: 'var(--color-text-on-dark)', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
          Heal
        </button>
        <button onClick={onAddCondition} style={{ padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
          + Condition
        </button>
        <button onClick={onAddEffect} style={{ padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
          + Effect
        </button>
        {isReadied ? (
          <>
            {onResolveReady && <button onClick={onResolveReady} style={{ padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-readied)', color: 'var(--color-text-on-dark)' }}>
              Resolve Ready
            </button>}
            {onCancelReady && <button onClick={onCancelReady} style={{ padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
              Cancel Ready
            </button>}
          </>
        ) : isDelayed ? (
          <button onClick={onUndelay} style={{ padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
            Undelay
          </button>
        ) : (
          <>
            <button onClick={onDelay} style={{ padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
              Delay
            </button>
            {onReady && <button onClick={onReady} style={{ padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
              Ready
            </button>}
          </>
        )}
      </div>

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
