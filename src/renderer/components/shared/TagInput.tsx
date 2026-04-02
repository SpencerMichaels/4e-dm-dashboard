import { useState, useRef, useEffect } from 'react'

interface Props {
  values: string[]
  onChange: (values: string[]) => void
  suggestions?: string[]
  placeholder?: string
  compact?: boolean
}

export function TagInput({ values, onChange, suggestions = [], placeholder, compact }: Props) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = input
    ? suggestions.filter(
        (s) => s.toLowerCase().includes(input.toLowerCase()) && !values.includes(s)
      ).slice(0, 8)
    : []

  useEffect(() => {
    setHighlightIndex(0)
  }, [input])

  const addValue = (val: string) => {
    const trimmed = val.trim()
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed])
    }
    setInput('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const removeValue = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (filtered.length > 0 && showSuggestions) {
        addValue(filtered[highlightIndex])
      } else if (input.trim()) {
        addValue(input)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Backspace' && !input && values.length > 0) {
      removeValue(values.length - 1)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  return (
    <div style={{ position: 'relative', display: compact ? 'inline' : 'block' }}>
      <div style={{
        display: compact ? 'inline-flex' : 'flex',
        flexWrap: 'wrap',
        gap: compact ? 2 : 4,
        padding: compact ? '0 2px' : '4px 6px',
        border: compact ? 'none' : '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        background: compact ? 'transparent' : 'var(--color-bg-surface)',
        minHeight: compact ? undefined : 34,
        alignItems: 'center',
        cursor: 'text',
      }}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((val, i) => (
          <span key={i} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: compact ? 2 : 4,
            padding: compact ? '0 4px' : '2px 8px',
            background: 'var(--color-bg-hover)',
            borderRadius: 'var(--radius-sm)',
            fontSize: compact ? 'var(--font-size-xs)' : 'var(--font-size-sm)',
          }}>
            {val}
            <button
              onClick={(e) => { e.stopPropagation(); removeValue(i) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, color: 'var(--color-text-muted)',
                lineHeight: 1,
              }}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          className={compact ? 'ghost' : undefined}
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true) }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : (compact ? '+' : '')}
          style={{
            flex: compact ? '0 1 auto' : 1,
            minWidth: compact ? 20 : 80,
            border: compact ? undefined : 'none',
            background: compact ? undefined : 'transparent',
            outline: 'none',
            fontSize: compact ? 'var(--font-size-xs)' : 'var(--font-size-sm)',
            padding: compact ? '0' : '2px 0',
          }}
        />
      </div>

      {showSuggestions && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          maxHeight: 160,
          overflow: 'auto',
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          marginTop: 2,
          zIndex: 50,
        }}>
          {filtered.map((s, i) => (
            <button
              key={s}
              onMouseDown={(e) => { e.preventDefault(); addValue(s) }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '4px 10px',
                background: i === highlightIndex ? 'var(--color-bg-hover)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--font-size-sm)',
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
