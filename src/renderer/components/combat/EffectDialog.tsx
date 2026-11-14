import { useState } from 'react'
import { Modal } from '../shared/Modal'

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
    <Modal title="Add Effect" onClose={onClose} minWidth={350} footer={<>
      <button type="button" onClick={onClose} className="btn">Cancel</button>
      <button type="submit" form="add-effect" disabled={!name.trim()} className="btn btn-primary">Add</button>
    </>}>
      <form id="add-effect" onSubmit={handleSubmit}>

        <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
            Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bless, Shield of Faith"
            style={{ width: '100%' }}
            autoFocus
          />
        </label>

        <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
            Description (optional)
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description..."
            style={{ width: '100%' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
            Duration
          </span>
          <select
            value={durationType}
            onChange={(e) => setDurationType(e.target.value as DurationType)}
            style={{ width: '100%' }}
          >
            <option value="unlimited">Save ends</option>
            <option value="encounter">Until end of encounter</option>
            <option value="rounds">Rounds</option>
          </select>
        </label>

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
      </form>
    </Modal>
  )
}
