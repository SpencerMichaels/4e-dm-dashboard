import { useState } from 'react'
import { Modal, modalStyles } from '../shared/Modal'

interface Props {
  combatantId: string
  onClose: () => void
}

type DurationType = 'unlimited' | 'encounter' | 'rounds'

export function EffectDialog({ combatantId, onClose }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [durationType, setDurationType] = useState<DurationType>('unlimited')
  const [rounds, setRounds] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    await window.api.combat.addEffect(combatantId, {
      name: name.trim(),
      description: description.trim() || undefined,
      durationType,
      durationRounds: durationType === 'rounds' && rounds ? Number(rounds) : undefined,
      remainingRounds: durationType === 'rounds' && rounds ? Number(rounds) : undefined,
    })
    onClose()
  }

  return (
    <Modal onClose={onClose} minWidth={350}>
      <form onSubmit={handleSubmit}>
        <h3 style={{ marginBottom: 'var(--space-3)' }}>Add Effect</h3>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bless, Shield of Faith"
            style={{ width: '100%' }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
            Description (optional)
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description..."
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
            Duration
          </label>
          <select
            value={durationType}
            onChange={(e) => setDurationType(e.target.value as DurationType)}
            style={{ width: '100%' }}
          >
            <option value="unlimited">Save ends</option>
            <option value="encounter">Until end of encounter</option>
            <option value="rounds">Rounds</option>
          </select>
        </div>

        {durationType === 'rounds' && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <input
              type="number"
              min={1}
              value={rounds}
              onChange={(e) => setRounds(e.target.value)}
              placeholder="Number of rounds"
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className={modalStyles.btnSecondary}>Cancel</button>
          <button
            type="submit"
            disabled={!name.trim()}
            className={modalStyles.btnPrimary}
          >
            Add
          </button>
        </div>
      </form>
    </Modal>
  )
}
