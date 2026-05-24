import { useState } from 'react'
import { Modal, modalStyles } from '../shared/Modal'

interface Props {
  combatantName: string
  onSubmit: (actionText: string) => void
  onClose: () => void
}

export function ReadyActionDialog({ combatantName, onSubmit, onClose }: Props) {
  const [text, setText] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <Modal onClose={onClose} minWidth={360}>
      <form onSubmit={handleSubmit}>
        <h3 style={{ marginBottom: 'var(--space-3)' }}>
          Ready Action: {combatantName}
        </h3>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Action and trigger (e.g. Attack orc if it moves)"
          style={{ width: '100%', marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-base)' }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className={modalStyles.btnSecondary}>Cancel</button>
          <button
            type="submit"
            disabled={!text.trim()}
            className={modalStyles.btnInfo}
          >
            Ready
          </button>
        </div>
      </form>
    </Modal>
  )
}
