// Drag-to-reorder for editor lists (powers, traits, auras, and the kit statblocks' lists), on pointer events
// rather than HTML5 drag and drop: rows hold text inputs (which native dragging fights) and may render into a
// pop-out window. The grip starts a drag (pointer capture keeps it while the pointer leaves the grip), rows
// report their bounds, and the drop slot is the row gap nearest the pointer, marked with an accent line.
// Escape cancels. The up/down buttons beside the grip stay the keyboard route.

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Icon } from './Icon'

export interface DragReorder {
  /** Props for the grip that starts a drag of row `i`. */
  handle: (i: number) => {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void
    onPointerMove: (e: PointerEvent<HTMLElement>) => void
    onPointerUp: (e: PointerEvent<HTMLElement>) => void
    onPointerCancel: () => void
  }
  /** Props for row `i`: its element (for bounds) and the dragged / drop-slot styling. */
  row: (i: number) => { ref: (el: HTMLElement | null) => void; style?: CSSProperties }
}

/**
 * `move(from, to)` moves the entry at `from` so it ends up at index `to` (as `listOps().move`).
 * `count` is the number of rows.
 */
export function useDragReorder(count: number, move?: (from: number, to: number) => void): DragReorder | undefined {
  const rows = useRef<(HTMLElement | null)[]>([])
  // `slot` is the gap the row would drop into: 0 before the first row, `count` after the last.
  const [drag, setDrag] = useState<{ from: number; slot: number } | null>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag
  useEffect(() => {
    if (!drag) return
    const doc = rows.current[drag.from]?.ownerDocument ?? document
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setDrag(null) } }
    doc.addEventListener('keydown', key, true)
    return () => doc.removeEventListener('keydown', key, true)
  }, [drag !== null])
  if (!move) return undefined

  const slotAt = (y: number) => {
    let slot = 0
    for (let i = 0; i < count; i++) {
      const r = rows.current[i]?.getBoundingClientRect()
      if (r && y > r.top + r.height / 2) slot = i + 1
    }
    return slot
  }
  return {
    handle: i => ({
      onPointerDown: e => {
        if (e.button !== 0) return
        e.preventDefault()
        // Keeps the drag while the pointer leaves the grip (an id from a synthetic event can't be captured).
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not a live pointer */ }
        setDrag({ from: i, slot: i })
      },
      onPointerMove: e => {
        const d = dragRef.current
        if (!d) return
        const slot = slotAt(e.clientY)
        if (slot !== d.slot) setDrag({ ...d, slot })
      },
      onPointerUp: () => {
        const d = dragRef.current
        setDrag(null)
        if (!d) return
        const to = d.slot > d.from ? d.slot - 1 : d.slot
        if (to !== d.from) move(d.from, to)
      },
      onPointerCancel: () => setDrag(null),
    }),
    row: i => {
      const ref = (el: HTMLElement | null) => { rows.current[i] = el }
      if (!drag) return { ref }
      const line = '0 0 0 0 transparent'
      const before = drag.slot === i && drag.slot !== drag.from && drag.slot !== drag.from + 1
      const after = i === count - 1 && drag.slot === count && drag.from !== count - 1
      return { ref, style: {
        opacity: i === drag.from ? 0.4 : undefined,
        boxShadow: before ? 'inset 0 2px 0 0 var(--accent)' : after ? 'inset 0 -2px 0 0 var(--accent)' : line,
      } }
    },
  }
}

/** The grip a drag starts from. */
export function DragGrip({ drag, index, style }: { drag?: DragReorder; index: number; style?: CSSProperties }) {
  if (!drag) return null
  return <span {...drag.handle(index)} className="drag-grip" title="Drag to reorder" aria-hidden="true"
    style={{ cursor: 'grab', color: 'var(--muted)', display: 'inline-flex', touchAction: 'none', ...style }}>
    <Icon name="grip-vertical" size={10} />
  </span>
}

/**
 * `list` with the entries at `slots` (indices into it, in display order) reordered among those slots: the entry
 * shown at `from` moves to `to`. For one kind of entry shown from a mixed list (traits among a creature's actions).
 */
export function moveWithin<T>(list: T[], slots: number[], from: number, to: number): T[] {
  if (to < 0 || to >= slots.length || from === to) return list
  const group = slots.map(i => list[i])
  const [x] = group.splice(from, 1)
  group.splice(to, 0, x)
  const next = [...list]
  slots.forEach((slot, k) => { next[slot] = group[k] })
  return next
}
