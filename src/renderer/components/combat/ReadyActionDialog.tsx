import { useState } from 'react'
import { Modal } from '../shared/Modal'

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
    <Modal title={<>Ready Action: {combatantName}</>} onClose={onClose} minWidth={360} footer={<>
      <button type="button" onClick={onClose} className="btn">Cancel</button>
      <button type="submit" form="ready-action" disabled={!text.trim()} className="btn btn-info">Ready</button>
    </>}>
      <form id="ready-action" onSubmit={handleSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Action and trigger (e.g. Attack orc if it moves)"
          style={{ width: '100%', fontSize: 'var(--font-size-base)' }}
          autoFocus
        />      </form>
    </Modal>
  )
}
