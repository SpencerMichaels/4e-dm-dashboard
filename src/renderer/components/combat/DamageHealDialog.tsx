import { useState } from 'react'
import { Modal, modalStyles } from '../shared/Modal'

/** Evaluate a simple integer expression with + and - operators.
 *  Returns null if any part is not a valid integer or the result is <= 0. */
function evalExpr(s: string): number | null {
  const stripped = s.replace(/\s/g, '')
  if (stripped === '') return null
  // Split into tokens preserving +/- as delimiters
  const tokens = stripped.match(/[+-]?[^+-]+/g)
  if (!tokens) return null
  let sum = 0
  for (const tok of tokens) {
    const n = Number(tok)
    if (!Number.isInteger(n)) return null
    sum += n
  }
  return sum > 0 ? sum : null
}

interface Props {
  mode: 'damage' | 'heal'
  combatantName: string
  initialAmount?: number
  resistEntries?: { type: string; value: number }[]
  onSubmit: (amount: number, wasHit: boolean) => void
  onClose: () => void
}

export function DamageHealDialog({ mode, combatantName, initialAmount, resistEntries, onSubmit, onClose }: Props) {
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : '')
  const [missDamage, setMissDamage] = useState(false)
  const [selectedResistIndex, setSelectedResistIndex] = useState(-1)

  const handleSubmit = (e: React.FormEvent, applyResist?: boolean) => {
    e.preventDefault()
    const num = evalExpr(amount)
    if (num == null) return
    let effective = num
    if (applyResist && mode === 'damage' && resistEntries && selectedResistIndex >= 0) {
      const resist = resistEntries[selectedResistIndex]
      if (resist) effective = Math.max(0, num - resist.value)
    }
    if (effective <= 0 && applyResist) {
      // Resist reduced damage to 0 — still submit as 0 so caller can decide
      onSubmit(0, !missDamage)
    } else {
      onSubmit(effective, !missDamage)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.shiftKey && mode === 'damage' && resistEntries && resistEntries.length > 0 && selectedResistIndex >= 0) {
      e.preventDefault()
      handleSubmit(e, true)
    }
  }

  const showResist = mode === 'damage' && resistEntries && resistEntries.length > 0

  return (
    <Modal onClose={onClose} minWidth={300}>
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <h3 style={{ marginBottom: 'var(--space-3)' }}>
          {mode === 'damage' ? 'Damage' : 'Heal'} {combatantName}
        </h3>
        <input
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (e.g. 10+5-2)"
          style={{ width: '100%', marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-lg)', textAlign: 'center' }}
          autoFocus
        />
        {mode === 'damage' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={missDamage} onChange={e => setMissDamage(e.target.checked)} />
            Miss damage (minions ignore)
          </label>
        )}
        {showResist && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 'var(--space-1)' }}>
              Resist
            </label>
            <select
              value={selectedResistIndex}
              onChange={e => setSelectedResistIndex(Number(e.target.value))}
              style={{ width: '100%', fontSize: 'var(--font-size-sm)' }}
            >
              <option value={-1}>None</option>
              {resistEntries!.map((entry, i) => (
                <option key={i} value={i}>Resist {entry.value} {entry.type}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className={modalStyles.btnSecondary}>Cancel</button>
          {showResist && selectedResistIndex >= 0 && (
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              className={modalStyles.btnDanger}
              style={{ opacity: 0.8 }}
              title="Shift+Enter"
            >
              Apply with Resist
            </button>
          )}
          <button
            type="submit"
            className={mode === 'damage' ? modalStyles.btnDanger : modalStyles.btnSuccess}
          >
            {mode === 'damage' ? 'Damage' : 'Heal'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
