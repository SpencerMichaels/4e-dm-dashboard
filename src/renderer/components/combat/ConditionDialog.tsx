import { useState, useEffect } from 'react'
import { useUiStore } from '../../stores/ui-store'
import type { AppliedCondition, DurationType } from '@common/types'

interface Props {
  combatantId: string
  onClose: () => void
}

export function ConditionDialog({ combatantId, onClose }: Props) {
  const systemPlugin = useUiStore((s) => s.systemPlugin)
  const [selectedConditionId, setSelectedConditionId] = useState('')
  const [value, setValue] = useState('')
  const [durationType, setDurationType] = useState<DurationType>('encounter')
  const [durationRounds, setDurationRounds] = useState('')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const conditions = systemPlugin?.conditions ?? []
  const selectedDef = conditions.find((c: any) => c.id === selectedConditionId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedConditionId) return

    const condition: AppliedCondition = {
      conditionId: selectedConditionId,
    }

    if (selectedDef?.hasValue && value) {
      condition.value = Number(value)
    }

    condition.duration = {
      type: durationType,
      ...(durationType === 'rounds' && durationRounds ? { remaining: Number(durationRounds) } : {}),
    }

    window.api.combat.addCondition(combatantId, condition)
    onClose()
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
          minWidth: 350,
        }}
      >
        <h3 style={{ marginBottom: 'var(--space-3)' }}>Add Condition</h3>

        <select
          value={selectedConditionId}
          onChange={(e) => setSelectedConditionId(e.target.value)}
          style={{ width: '100%', marginBottom: 'var(--space-3)' }}
          autoFocus
        >
          <option value="">Select condition...</option>
          {conditions.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {selectedDef?.hasValue && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
              Value
            </label>
            <input
              type="number"
              min={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 2"
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
            Duration
          </label>
          <select
            value={durationType}
            onChange={(e) => setDurationType(e.target.value as DurationType)}
            style={{ width: '100%' }}
          >
            <option value="encounter">Until end of encounter</option>
            <option value="rounds">Rounds</option>
            <option value="minutes">Minutes</option>
            <option value="unlimited">Unlimited</option>
          </select>
        </div>

        {durationType === 'rounds' && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <input
              type="number"
              min={1}
              value={durationRounds}
              onChange={(e) => setDurationRounds(e.target.value)}
              placeholder="Number of rounds"
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            disabled={!selectedConditionId}
            style={{
              background: selectedConditionId ? 'var(--color-accent)' : 'var(--color-bg-surface)',
              color: selectedConditionId ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
              padding: '4px 16px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Apply
          </button>
        </div>
      </form>
    </div>
  )
}
