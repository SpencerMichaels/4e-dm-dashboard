import { useState, useRef, useEffect } from 'react'

interface DamageEntry {
  type: string
  value?: number
}

interface Props {
  entries: DamageEntry[]
  onChange: (entries: DamageEntry[]) => void
  suggestions: string[]
  showValue: boolean  // false for immunities (no number needed)
  placeholder?: string
  valueRange?: { min: number; max: number }  // show min/mid/max quick-set buttons
  defaultValue?: number                       // auto-set this value when adding (skip value entry)
}

export function DamageEntryList({ entries, onChange, suggestions, showValue, placeholder, valueRange, defaultValue }: Props) {
  const [typeInput, setTypeInput] = useState('')
  const [valueInput, setValueInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [phase, setPhase] = useState<'type' | 'value'>('type')
  const typeRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef<HTMLInputElement>(null)

  const filtered = typeInput
    ? suggestions.filter(
        (s) => s.toLowerCase().includes(typeInput.toLowerCase()) && !entries.some((e) => e.type === s)
      ).slice(0, 8)
    : []

  useEffect(() => {
    setHighlightIndex(0)
  }, [typeInput])

  const commitEntry = (type: string, value?: number) => {
    const trimmed = type.trim()
    if (trimmed && !entries.some((e) => e.type === trimmed)) {
      onChange([...entries, { type: trimmed, value }])
    }
    setTypeInput('')
    setValueInput('')
    setPhase('type')
    setShowSuggestions(false)
    typeRef.current?.focus()
  }

  const removeEntry = (idx: number) => {
    onChange(entries.filter((_, i) => i !== idx))
  }

  const selectType = (type: string) => {
    if (showValue) {
      if (defaultValue != null) {
        // Auto-commit with default value
        commitEntry(type, defaultValue)
      } else {
        setTypeInput(type)
        setPhase('value')
        setShowSuggestions(false)
        setTimeout(() => valueRef.current?.focus(), 0)
      }
    } else {
      commitEntry(type)
    }
  }

  const handleTypeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const selected = filtered.length > 0 && showSuggestions ? filtered[highlightIndex] : typeInput
      if (selected.trim()) selectType(selected.trim())
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Backspace' && !typeInput && entries.length > 0) {
      removeEntry(entries.length - 1)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleValueKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      commitEntry(typeInput, valueInput ? Number(valueInput) : undefined)
    } else if (e.key === 'Escape') {
      setPhase('type')
      setTypeInput('')
      typeRef.current?.focus()
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: '4px 6px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-raised)',
        minHeight: 34,
        alignItems: 'center',
        cursor: 'text',
      }}
        onClick={() => (phase === 'type' ? typeRef : valueRef).current?.focus()}
      >
        {entries.map((entry, i) => (
          <span key={i} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            background: 'var(--hover)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-sm)',
          }}>
            {entry.type}{entry.value != null ? ` ${entry.value}` : ''}
            <button
              onClick={(e) => { e.stopPropagation(); removeEntry(i) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, fontSize: 'var(--font-size-xs)', color: 'var(--muted)',
                lineHeight: 1,
              }}
            >x</button>
          </span>
        ))}

        {phase === 'type' ? (
          <input
            ref={typeRef}
            value={typeInput}
            onChange={(e) => { setTypeInput(e.target.value); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={handleTypeKeyDown}
            placeholder={entries.length === 0 ? placeholder : ''}
            style={{
              flex: 1, minWidth: 80, border: 'none', background: 'transparent',
              outline: 'none', fontSize: 'var(--font-size-sm)', padding: '2px 0',
            }}
          />
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-sm)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{typeInput}</span>
            <input
              ref={valueRef}
              type="number"
              min={1}
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              onKeyDown={handleValueKeyDown}
              placeholder="amount"
              style={{ width: 60, border: 'none', background: 'transparent', outline: 'none', fontSize: 'var(--font-size-sm)' }}
              autoFocus
            />
            {valueRange && (
              <span style={{ display: 'inline-flex', gap: 2 }}>
                <button
                  onMouseDown={(e) => { e.preventDefault(); commitEntry(typeInput, valueRange.min) }}
                  style={{
                    padding: '1px 4px', fontSize: '10px',
                    background: 'transparent', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    color: 'var(--accent)',
                  }}
                  title="Low"
                >{valueRange.min}</button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); commitEntry(typeInput, Math.round((valueRange.min + valueRange.max) / 2)) }}
                  style={{
                    padding: '1px 4px', fontSize: '10px',
                    background: 'transparent', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    color: 'var(--success)',
                  }}
                  title="Mid"
                >{Math.round((valueRange.min + valueRange.max) / 2)}</button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); commitEntry(typeInput, valueRange.max) }}
                  style={{
                    padding: '1px 4px', fontSize: '10px',
                    background: 'transparent', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    color: 'var(--hp-low)',
                  }}
                  title="High"
                >{valueRange.max}</button>
              </span>
            )}
          </span>
        )}
      </div>

      {showSuggestions && filtered.length > 0 && phase === 'type' && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          maxHeight: 160,
          overflow: 'auto',
          background: 'var(--background)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          marginTop: 2,
          zIndex: 50,
        }}>
          {filtered.map((s, i) => (
            <button
              key={s}
              onMouseDown={(e) => { e.preventDefault(); selectType(s) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '4px 10px',
                background: i === highlightIndex ? 'var(--hover)' : 'transparent',
                border: 'none', cursor: 'pointer',
                color: 'var(--text)', fontSize: 'var(--font-size-sm)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
