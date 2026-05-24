import { useState, useEffect } from 'react'
import type { CombatState, AppliedCondition } from '@common/types'
import type { ConditionDef } from '@common/types/system-plugin'
import type { AttackMode } from './CombatView'
import styles from './AttackApplyPanel.module.css'

interface Props {
  combat: CombatState
  attackMode: AttackMode
  conditionDefs: ConditionDef[]
  onApply: (hitDamage: number, missDamage: number, hitConditions: AppliedCondition[], missConditions: AppliedCondition[]) => void
  onCancel: () => void
}

export function AttackApplyPanel({ combat, attackMode, conditionDefs, onApply, onCancel }: Props) {
  const [hitDamage, setHitDamage] = useState('')
  const [missDamage, setMissDamage] = useState('')
  const [halfDamage, setHalfDamage] = useState(false)
  const [hitConditionId, setHitConditionId] = useState('')
  const [missConditionId, setMissConditionId] = useState('')

  const hitIds = Object.entries(attackMode.results).filter(([, r]) => r === 'hit').map(([id]) => id)
  const missIds = Object.entries(attackMode.results).filter(([, r]) => r === 'miss').map(([id]) => id)

  // Auto-calc half damage
  useEffect(() => {
    if (halfDamage && hitDamage) {
      setMissDamage(String(Math.floor(parseInt(hitDamage) / 2)))
    }
  }, [halfDamage, hitDamage])

  const handleApply = () => {
    const hd = parseInt(hitDamage) || 0
    const md = parseInt(missDamage) || 0
    const currentId = combat.initiativeOrder[combat.turnIndex]
    const currentName = currentId ? combat.combatants[currentId]?.name : undefined
    const makeCondition = (condId: string): AppliedCondition => {
      const cond: AppliedCondition = { conditionId: condId, duration: { type: 'save-ends' } }
      // Auto-set mark source to current-turn creature
      if (condId === 'marked' && currentId) {
        cond.sourceId = currentId
        cond.customDescription = `by ${currentName ?? currentId}`
      }
      // Auto-set Grants CA recipient to the attacker (most common case from a hit)
      if (condId === 'combat-advantage' && currentId) {
        cond.sourceId = currentId
        cond.grantsCATo = 'source'
        cond.customDescription = `to ${currentName ?? currentId}`
      }
      return cond
    }
    const hitConds: AppliedCondition[] = hitConditionId ? [makeCondition(hitConditionId)] : []
    const missConds: AppliedCondition[] = missConditionId ? [makeCondition(missConditionId)] : []
    onApply(hd, md, hitConds, missConds)
  }

  // Keyboard: Space/Enter to apply
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        // Don't fire if typing in an input
        if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return
        e.preventDefault()
        handleApply()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hitDamage, missDamage, hitConditionId, missConditionId, halfDamage])

  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>Apply Attack Results</h3>

      {/* Hit section */}
      {hitIds.length > 0 && (
        <div className={styles.section}>
          <div className={styles.hitHeader}>
            ⚔ Hit ({hitIds.length}): {hitIds.map(id => combat.combatants[id]?.name).join(', ')}
          </div>
          <div className={styles.inputRow}>
            <label className={styles.fieldLabel}>Damage:</label>
            <input type="number" min={0} value={hitDamage} onChange={e => setHitDamage(e.target.value)}
              placeholder="0" className={styles.damageInput} autoFocus />
            <label className={styles.fieldLabel}>Condition:</label>
            <select value={hitConditionId} onChange={e => setHitConditionId(e.target.value)} className={styles.selectInput}>
              <option value="">None</option>
              {conditionDefs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Miss section */}
      {missIds.length > 0 && (
        <div className={styles.section}>
          <div className={styles.missHeader}>
            ✕ Miss ({missIds.length}): {missIds.map(id => combat.combatants[id]?.name).join(', ')}
          </div>
          <div className={styles.inputRow}>
            <label className={styles.fieldLabel}>Damage:</label>
            <input type="number" min={0} value={missDamage} onChange={e => { setMissDamage(e.target.value); setHalfDamage(false) }}
              placeholder="0" className={styles.damageInput} />
            <label className={styles.halfDamageLabel}>
              <input type="checkbox" checked={halfDamage} onChange={e => setHalfDamage(e.target.checked)} />
              Half damage
            </label>
            <label className={styles.fieldLabel}>Condition:</label>
            <select value={missConditionId} onChange={e => setMissConditionId(e.target.value)} className={styles.selectInput}>
              <option value="">None</option>
              {conditionDefs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className={styles.footer}>
        <button onClick={onCancel} className={styles.cancelBtn}>Cancel</button>
        <button onClick={handleApply} className={styles.applyBtn}>
          Apply (Space)
        </button>
      </div>
    </div>
  )
}
