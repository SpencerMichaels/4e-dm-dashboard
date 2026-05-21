import { useState, useEffect, useRef } from 'react'

interface Props {
  combatantName: string
  onSubmit: (actionText: string) => void
  onClose: () => void
}

export function ReadyActionDialog({ combatantName, onSubmit, onClose }: Props) {
  const [text, setText] = useState('')
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
    const trimmed = text.trim()
    if (trimmed) onSubmit(trimmed)
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
          minWidth: 360,
        }}
      >
        <h3 style={{ marginBottom: 'var(--space-3)' }}>
          Ready Action: {combatantName}
        </h3>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Action and trigger (e.g. Attack orc if it moves)"
          style={{ width: '100%', marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-base)' }}
        />
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            disabled={!text.trim()}
            style={{
              background: '#39c',
              color: '#fff',
              padding: '4px 16px',
              borderRadius: 'var(--radius-sm)',
              opacity: text.trim() ? 1 : 0.5,
            }}
          >
            Ready
          </button>
        </div>
      </form>
    </div>
  )
}
