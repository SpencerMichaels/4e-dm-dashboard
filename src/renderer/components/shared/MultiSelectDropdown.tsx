import { useEffect, useRef, useState, type CSSProperties } from 'react'

interface Props {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  className?: string
  style?: CSSProperties
  optionLabel?: (option: string) => string
  optionTitle?: (option: string) => string | undefined
}

/**
 * Compact multi-select dropdown. Renders as a single-line trigger that shows
 * the placeholder when nothing is selected, the option name when one is
 * selected, or "N selected" otherwise. Clicking opens a small popover with
 * a checkbox list. Closes on outside click or Escape.
 */
export function MultiSelectDropdown({ options, selected, onChange, placeholder = '', className, style, optionLabel, optionTitle }: Props) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter(o => o !== opt))
    else onChange([...selected, opt])
  }

  const labelOf = (o: string) => optionLabel ? optionLabel(o) : o
  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? labelOf(selected[0])
      : selected.slice(0, -1).map(labelOf).join(', ') + ' or ' + labelOf(selected[selected.length - 1])

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{ color: 'inherit', font: 'inherit', textAlign: 'left' }}
      >
        {label}
      </button>
      {open && (
        <div role="menu" style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 2,
          minWidth: 140,
          maxHeight: 240,
          overflowY: 'auto',
          background: 'var(--background)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-md)',
          zIndex: 100,
          padding: 'var(--space-1) 0',
        }}>
          {options.length === 0 && (
            <div style={{ padding: '4px 10px', color: 'var(--muted)', fontSize: 'var(--font-size-xs)', fontStyle: 'italic' }}>
              No options
            </div>
          )}
          {options.map(opt => {
            const checked = selected.includes(opt)
            return (
              <label key={opt}
                title={optionTitle?.(opt)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 10px', cursor: 'pointer',
                  fontSize: 'var(--font-size-xs)',
                  background: checked ? 'var(--hover)' : 'transparent',
                  color: 'var(--text)',
                }}
                onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--hover)' }}
                onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(opt)} style={{ cursor: 'pointer' }} />
                {optionLabel ? optionLabel(opt) : opt}
              </label>
            )
          })}
          {selected.length > 0 && (
            <div style={{
              borderTop: '1px solid var(--border)',
              padding: '4px 10px', marginTop: 2,
            }}>
              <button type="button" role="menuitem" onClick={() => onChange([])}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', fontSize: 'var(--font-size-xs)',
                  padding: 0,
                }}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
