import type { CombatantState } from '@common/types'
import { useUiStore } from '../../stores/ui-store'
import { hpPercentage, hpColor, formatConditionName } from '../../utils/combat-utils'
import styles from './CombatantDetail.module.css'

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
  const hpPct = hpPercentage(c.hp, c.maxHp)

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.name}>
          {c.name}
        </h2>
        {isCurrent && (
          <span className={styles.currentTurnBadge}>
            Current Turn
          </span>
        )}
        {isDelayed && (
          <span className={styles.delayedBadge}>
            Delayed
          </span>
        )}
        {isReadied && (
          <span className={styles.readiedBadge}>
            Readied
          </span>
        )}
      </div>

      {/* HP */}
      <div className={styles.hpSection}>
        <div className={styles.hpHeader}>
          <span className={styles.hpLabel}>HP</span>
          <span className={styles.hpValue}>
            {c.hp} / {c.maxHp}
            {c.tempHp > 0 && <span className={styles.tempHp}>+{c.tempHp} temp</span>}
          </span>
        </div>
        <div className={styles.hpBarTrack}>
          <div className={styles.hpBarFill} style={{
            width: `${hpPct}%`,
            background: hpColor(hpPct),
          }} />
        </div>
      </div>

      {/* Active conditions strip */}
      {c.conditions.length > 0 && (
        <div className={styles.conditionsStrip}>
          {c.conditions.map((cond) => {
            const def = systemPlugin?.conditions?.find((d: any) => d.id === cond.conditionId)
            const name = formatConditionName(cond.conditionId, systemPlugin?.conditions ?? [], cond.customName)
            const label = cond.value != null ? `${name} ${cond.value}` : name
            return (
              <span
                key={cond.conditionId}
                title={[name, def?.description].filter(Boolean).join(' — ')}
                className={styles.conditionBadge}
                style={{
                  background: cond.customColor ?? 'var(--color-condition-default)',
                  color: 'var(--color-text-on-warning)',
                }}
              >
                {label}
                <button
                  onClick={() => window.api.combat.removeCondition(c.id, cond.conditionId)}
                  className={styles.conditionRemoveBtn}
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
        <div className={styles.readiedAction}>
          {c.readiedAction}
        </div>
      )}

      {/* Action buttons */}
      <div className={styles.actionButtons}>
        <button onClick={onDamage} className={styles.btnDamage}>
          Damage
        </button>
        <button onClick={onHeal} className={styles.btnHeal}>
          Heal
        </button>
        <button onClick={onAddCondition} className={styles.actionBtn}>
          + Condition
        </button>
        <button onClick={onAddEffect} className={styles.actionBtn}>
          + Effect
        </button>
        {isReadied ? (
          <>
            {onResolveReady && <button onClick={onResolveReady} className={styles.btnReadied}>
              Resolve Ready
            </button>}
            {onCancelReady && <button onClick={onCancelReady} className={styles.actionBtn}>
              Cancel Ready
            </button>}
          </>
        ) : isDelayed ? (
          <button onClick={onUndelay} className={styles.actionBtn}>
            Undelay
          </button>
        ) : (
          <>
            <button onClick={onDelay} className={styles.actionBtn}>
              Delay
            </button>
            {onReady && <button onClick={onReady} className={styles.actionBtn}>
              Ready
            </button>}
          </>
        )}
      </div>

      {/* Effects */}
      {c.effects.length > 0 && (
        <div className={styles.effectsSection}>
          <h3 className={styles.effectsHeading}>Effects</h3>
          <div className={styles.effectsList}>
            {c.effects.map((eff) => (
              <div key={eff.id} className={styles.effectRow}>
                <span className={styles.effectName}>{eff.name}</span>
                {eff.remainingRounds != null && (
                  <span className={styles.effectRounds}>{eff.remainingRounds}r</span>
                )}
                <button
                  onClick={() => window.api.combat.removeEffect(c.id, eff.id)}
                  className={styles.effectRemoveBtn}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className={styles.info}>
        <div>Initiative: {c.initiative ?? '—'}</div>
        <div>{c.isPC ? 'Player Character' : 'NPC/Monster'}</div>
      </div>

      {/* Remove combatant */}
      <button onClick={onRemove} className={styles.removeBtn}>
        Remove from combat
      </button>
    </div>
  )
}
