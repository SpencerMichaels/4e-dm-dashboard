import { useState, useEffect, useRef } from 'react'

interface Props {
  combatantId: string
  onClose: () => void
}

export function EffectDialog({ combatantId, onClose }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rounds, setRounds] = useState('')
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
    if (!name.trim()) return

    window.api.combat.addEffect(combatantId, {
      name: name.trim(),
      description: description.trim() || undefined,
      durationRounds: rounds ? Number(rounds) : undefined,
      remainingRounds: rounds ? Number(rounds) : undefined,
    })
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
        <h3 style={{ marginBottom: 'var(--space-3)' }}>Add Effect</h3>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
            Name
          </label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bless, Shield of Faith"
            style={{ width: '100%' }}
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
            Duration (rounds, leave empty for permanent)
          </label>
          <input
            type="number"
            min={1}
            value={rounds}
            onChange={(e) => setRounds(e.target.value)}
            placeholder="Rounds"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            disabled={!name.trim()}
            style={{
              background: name.trim() ? 'var(--color-accent)' : 'var(--color-bg-surface)',
              color: name.trim() ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
              padding: '4px 16px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Add
          </button>
        </div>
      </form>
    </div>
  )
}
