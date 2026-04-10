import { useState, useEffect, useRef } from 'react'

/**
 * A ghost-styled number input that allows empty during editing.
 * The value can be undefined (blank). Only emits onChange with a valid number
 * or undefined when cleared. No forced defaults — the parent decides what blank means.
 */
interface Props {
  value: number | undefined
  onChange: (value: number | undefined) => void
  min?: number
  max?: number
  placeholder?: string
  style?: React.CSSProperties
  className?: string
}

export function GhostNumberInput({ value, onChange, min, max, placeholder, style, className = 'ghost' }: Props) {
  const [str, setStr] = useState(value != null ? String(value) : '')
  const focused = useRef(false)

  // Sync from parent when value changes externally (but not while focused)
  useEffect(() => {
    if (!focused.current) setStr(value != null ? String(value) : '')
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setStr(raw)
    // Emit live value for preview (unclamped) — undefined if empty/invalid
    const n = parseInt(raw)
    onChange(isNaN(n) ? undefined : n)
  }

  const handleBlur = () => {
    focused.current = false
    if (str.trim() === '') {
      onChange(undefined)
      return
    }
    let n = parseInt(str)
    if (isNaN(n)) { onChange(undefined); setStr(''); return }
    if (min != null) n = Math.max(min, n)
    if (max != null) n = Math.min(max, n)
    setStr(String(n))
    onChange(n)
  }

  return (
    <input
      className={className}
      type="number"
      value={str}
      onChange={handleChange}
      onFocus={() => { focused.current = true }}
      onBlur={handleBlur}
      placeholder={placeholder}
      style={style}
    />
  )
}
