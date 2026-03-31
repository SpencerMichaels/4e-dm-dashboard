import { useState, useRef, useEffect } from 'react'

interface Option {
  value: string
  label: string
}

interface Props {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  style?: React.CSSProperties
}

export function Autocomplete({ options, value, onChange, placeholder, style }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Resolve display label from current value
  const selectedLabel = options.find((o) => o.value === value)?.label ?? ''

  // When value changes externally, update the query display
  useEffect(() => {
    if (!open) {
      setQuery(selectedLabel)
    }
  }, [selectedLabel, open])

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    setHighlightIndex(0)
  }, [query])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(selectedLabel)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [selectedLabel])

  const select = (opt: Option) => {
    onChange(opt.value)
    setQuery(opt.label)
    setOpen(false)
  }

  const clear = () => {
    onChange('')
    setQuery('')
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightIndex]) {
        select(filtered[highlightIndex])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery(selectedLabel)
      inputRef.current?.blur()
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          ref={inputRef}
          value={open ? query : selectedLabel}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQuery(selectedLabel) }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{ width: '100%' }}
        />
        {value && (
          <button
            onClick={clear}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              padding: '0 4px',
              fontSize: 'var(--font-size-sm)',
            }}
            tabIndex={-1}
          >
            x
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          maxHeight: 200,
          overflow: 'auto',
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          marginTop: 2,
          zIndex: 50,
        }}>
          {filtered.map((opt, i) => (
            <button
              key={opt.value}
              onClick={() => select(opt)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                background: i === highlightIndex ? 'var(--color-bg-hover)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
