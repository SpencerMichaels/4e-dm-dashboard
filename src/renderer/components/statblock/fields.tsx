// Statblock fields shared by the kit-native view/edit components (traps, diseases, templates,
// themes). Each renders as printed text, or as the ghost-input editor when given onChange, so a
// statblock's viewer and editor are the same component and cannot drift apart.

import type { CSSProperties, ReactNode } from 'react'
import type { Line } from '@kit'
import { TagInput } from '@renderer/components/shared/TagInput'
import { Icon } from '../shared/Icon'
import { DragGrip, type DragReorder } from '../shared/drag-reorder'

interface Base { placeholder?: string; className?: string; style?: CSSProperties; label?: string }

export function Text({ value, onChange, placeholder, className, style, label }: Base & { value: string | undefined; onChange?: (v: string) => void }) {
  if (!onChange) return value ? <span className={className} style={style}>{value}</span> : null
  return <input className={`ghost ${className ?? ''}`} aria-label={label ?? placeholder} value={value ?? ''} placeholder={placeholder} style={style} onChange={e => onChange(e.target.value)} />
}

/** A number; empty input is undefined, for optional fields. */
export function Num({ value, onChange, placeholder, className, style, label, min, max }: Base & { value: number | undefined; onChange?: (v: number | undefined) => void; min?: number; max?: number }) {
  if (!onChange) return value === undefined ? null : <span className={className} style={style}>{value}</span>
  return <input className={`ghost ${className ?? ''}`} type="number" aria-label={label ?? placeholder} min={min} max={max} value={value ?? ''} placeholder={placeholder} style={style}
    onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
}

export type Option = string | { value: string; label: string }
const optValue = (o: Option) => typeof o === 'string' ? o : o.value
const optLabel = (o: Option) => typeof o === 'string' ? o : o.label

export function Choice({ value, options, onChange, className, style, label }: Base & { value: string; options: readonly Option[]; onChange?: (v: string) => void }) {
  const current = options.find(o => optValue(o) === value)
  if (!onChange) return <span className={className} style={style}>{current ? optLabel(current) : value}</span>
  return <select className={`ghost ${className ?? ''}`} aria-label={label} value={value} style={{ color: 'inherit', ...style }} onChange={e => onChange(e.target.value)}>
    {!current && <option value={value}>{value}</option>}
    {options.map(o => <option key={optValue(o)} value={optValue(o)}>{optLabel(o)}</option>)}
  </select>
}

/** Multi-line text that wraps like printed prose. */
export function Prose({ value, onChange, placeholder, className, style, label }: Base & { value: string | undefined; onChange?: (v: string) => void }) {
  if (!onChange) return value ? <span className={className} style={{ whiteSpace: 'pre-wrap', ...style }}>{value}</span> : null
  return <textarea className={`ghost ${className ?? ''}`} aria-label={label ?? placeholder} value={value ?? ''} placeholder={placeholder} rows={1}
    style={{ width: '100%', resize: 'none', ...style }} onChange={e => onChange(e.target.value)} />
}

/**
 * A kit Line's printed text. Clauses ride along unchanged: applying the DM's patch keeps the clauses
 * the edit left alone and drops the rest (src/common/authoring/clause-rebase.ts).
 */
export function LineText({ line, onChange, ...rest }: Base & { line: Line | undefined; onChange?: (l: Line) => void }) {
  return <Prose {...rest} value={line?.text} onChange={onChange && (text => onChange({ ...(line ?? { clauses: [] }), text }))} />
}

export function Tags({ values, onChange, suggestions, placeholder }: { values: string[]; onChange?: (v: string[]) => void; suggestions?: string[]; placeholder?: string }) {
  if (!onChange) return values.length ? <span>{values.join(', ')}</span> : null
  return <TagInput compact values={values} onChange={onChange} suggestions={suggestions ?? []} placeholder={placeholder} />
}

const small: CSSProperties = { color: 'var(--muted)', padding: '0 2px', lineHeight: 1, background: 'none', border: 0, cursor: 'pointer' }

/** Remove (x) control, shown only while editing. */
export function Remove({ onClick, label }: { onClick?: () => void; label: string }) {
  return onClick ? <button type="button" className="sb-remove" aria-label={label} title={label} onClick={onClick} style={{ ...small, display: 'inline-flex', verticalAlign: '-0.125em' }}><Icon name="x" /></button> : null
}

/** Dashed "+ thing" control, shown only while editing. */
export function Add({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  return onClick ? <button type="button" className="sb-add" onClick={onClick} style={{ ...small, border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 6px', margin: '2px 0' }}>+ {children}</button> : null
}

/** Up/down reorder controls for list entries, shown only while editing. */
export function Move({ index, length, move, drag }: { index: number; length: number; move?: (from: number, to: number) => void
  /** The list's drag reordering (`useDragReorder`), for a grip between the buttons. */
  drag?: DragReorder }) {
  if (!move) return null
  return <span className="sb-move" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', opacity: 0.5, marginRight: 2 }}>
    <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, index - 1)} title="Move up" style={{ ...small, display: 'inline-flex' }}><Icon name="chevron-up" size={10} /></button>
    <DragGrip drag={drag} index={index} />
    <button type="button" aria-label="Move down" disabled={index === length - 1} onClick={() => move(index, index + 1)} title="Move down" style={{ ...small, display: 'inline-flex' }}><Icon name="chevron-down" size={10} /></button>
  </span>
}

/** List editing helpers: replace, remove, move, and insert entries of an array field. */
export function listOps<T>(list: T[], onChange?: (next: T[]) => void) {
  if (!onChange) return { set: undefined, remove: undefined, move: undefined, add: undefined }
  return {
    set: (i: number, v: T) => onChange(list.map((x, j) => j === i ? v : x)),
    remove: (i: number) => onChange(list.filter((_, j) => j !== i)),
    move: (from: number, to: number) => { if (to < 0 || to >= list.length) return; const next = [...list]; const [x] = next.splice(from, 1); next.splice(to, 0, x); onChange(next) },
    add: (v: T, at = list.length) => { const next = [...list]; next.splice(at, 0, v); onChange(next) },
  }
}
