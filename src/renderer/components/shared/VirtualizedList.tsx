import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from 'react'

/**
 * Generic virtualized list for rendering large datasets efficiently.
 * Only renders rows visible in the viewport + overscan buffer.
 * Rows are striped (--row-odd/--row-even) by absolute index, so the stripes
 * don't shift while scrolling. A row leaves its own background transparent
 * unless it has a state to show (selected), which then paints over the stripe.
 */

const DEFAULT_ROW_HEIGHT = 28
const DEFAULT_OVERSCAN = 10

interface Props<T> {
  items: T[]
  rowHeight?: number
  overscan?: number
  renderRow: (item: T, index: number) => ReactNode
  style?: CSSProperties
}

export function VirtualizedList<T>({ items, rowHeight = DEFAULT_ROW_HEIGHT, overscan = DEFAULT_OVERSCAN, renderRow, style }: Props<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height)
    })
    ro.observe(el)
    setContainerHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const totalHeight = items.length * rowHeight
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const endIdx = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan)

  return (
    <div ref={containerRef} onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      style={{ flex: 1, overflow: 'auto', minHeight: 0, ...style }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {items.slice(startIdx, endIdx).map((item, i) => {
          const idx = startIdx + i
          return (
            <div key={idx} style={{
              position: 'absolute', top: idx * rowHeight, left: 0, right: 0, height: rowHeight,
              background: idx % 2 ? 'var(--row-even)' : 'var(--row-odd)',
            }}>
              {renderRow(item, idx)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
