import { useState, useEffect, useRef } from 'react'

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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const num = Number(amount)
    if (!isNaN(num) && num > 0) {
      onSubmit(num, !missDamage)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-6)',
          minWidth: 300,
        }}
      >
        <h3 style={{ marginBottom: 'var(--space-3)' }}>
          {mode === 'damage' ? 'Damage' : 'Heal'} {combatantName}
        </h3>
        <input
          ref={inputRef}
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          style={{ width: '100%', marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-lg)', textAlign: 'center' }}
        />
        {mode === 'damage' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={missDamage} onChange={e => setMissDamage(e.target.checked)} />
            Miss damage (minions ignore)
          </label>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            style={{
              background: mode === 'damage' ? '#c00' : '#0a0',
              color: '#fff',
              padding: '4px 16px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {mode === 'damage' ? 'Damage' : 'Heal'}
          </button>
        </div>
      </form>
    </div>
  )
}
