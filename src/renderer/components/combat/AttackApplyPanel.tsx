import { useState, useEffect } from 'react'
import type { CombatState, AppliedCondition } from '@common/types'
import type { ConditionDef } from '@common/types/system-plugin'
import type { AttackMode } from './CombatView'

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

  const sectionStyle: React.CSSProperties = {
    padding: 'var(--space-3)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    marginBottom: 'var(--space-3)',
  }

  return (
    <div style={{ padding: 'var(--space-4)', maxWidth: 500 }}>
      <h3 style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-lg)' }}>Apply Attack Results</h3>

      {/* Hit section */}
      {hitIds.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ fontWeight: 600, color: '#2a6', marginBottom: 'var(--space-2)', fontSize: 13 }}>
            ⚔ Hit ({hitIds.length}): {hitIds.map(id => combat.combatants[id]?.name).join(', ')}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12 }}>Damage:</label>
            <input type="number" min={0} value={hitDamage} onChange={e => setHitDamage(e.target.value)}
              placeholder="0" style={{ width: 60, textAlign: 'center' }} autoFocus />
            <label style={{ fontSize: 12 }}>Condition:</label>
            <select value={hitConditionId} onChange={e => setHitConditionId(e.target.value)} style={{ fontSize: 12 }}>
              <option value="">None</option>
              {conditionDefs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Miss section */}
      {missIds.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ fontWeight: 600, color: '#a44', marginBottom: 'var(--space-2)', fontSize: 13 }}>
            ✕ Miss ({missIds.length}): {missIds.map(id => combat.combatants[id]?.name).join(', ')}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12 }}>Damage:</label>
            <input type="number" min={0} value={missDamage} onChange={e => { setMissDamage(e.target.value); setHalfDamage(false) }}
              placeholder="0" style={{ width: 60, textAlign: 'center' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={halfDamage} onChange={e => setHalfDamage(e.target.checked)} />
              Half damage
            </label>
            <label style={{ fontSize: 12 }}>Condition:</label>
            <select value={missConditionId} onChange={e => setMissConditionId(e.target.value)} style={{ fontSize: 12 }}>
              <option value="">None</option>
              {conditionDefs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ fontSize: 12 }}>Cancel</button>
        <button onClick={handleApply} style={{
          padding: '4px 16px', background: 'var(--color-accent)', color: 'var(--color-accent-text)',
          borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: 12,
        }}>
          Apply (Space)
        </button>
      </div>
    </div>
  )
}
