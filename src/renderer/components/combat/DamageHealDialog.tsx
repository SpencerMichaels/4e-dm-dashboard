import { useState } from 'react'
import { Modal, modalStyles } from '../shared/Modal'

interface Props {
  mode: 'damage' | 'heal'
  combatantName: string
  initialAmount?: number
  onSubmit: (amount: number, wasHit: boolean) => void
  onClose: () => void
}

export function DamageHealDialog({ mode, combatantName, initialAmount, onSubmit, onClose }: Props) {
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : '')
  const [missDamage, setMissDamage] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const num = Number(amount)
    if (!isNaN(num) && num > 0) {
      onSubmit(num, !missDamage)
    }
  }

  return (
    <Modal onClose={onClose} minWidth={300}>
      <form onSubmit={handleSubmit}>
        <h3 style={{ marginBottom: 'var(--space-3)' }}>
          {mode === 'damage' ? 'Damage' : 'Heal'} {combatantName}
        </h3>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          style={{ width: '100%', marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-lg)', textAlign: 'center' }}
          autoFocus
        />
        {mode === 'damage' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={missDamage} onChange={e => setMissDamage(e.target.checked)} />
            Miss damage (minions ignore)
          </label>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className={modalStyles.btnSecondary}>Cancel</button>
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
