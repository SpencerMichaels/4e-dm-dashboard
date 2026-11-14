import { useState, useRef, useCallback, useEffect, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { usePopoutWindow } from './popout-window'

// Module-scope counter so every FloatingPanel instance shares one z-index stack.
// Clicking a panel bumps this and assigns the new top value to that panel.
let topZ = 50

interface Props {
  title: ReactNode
  initialX?: number
  initialY?: number
  width?: number
  maxHeight?: string | number
  onClose?: () => void
  zIndex?: number
  children: ReactNode
  bodyStyle?: CSSProperties
  /** Enables "open in window": the panel's body moves into an OS window (remembered by this key). */
  popoutKey?: string
  /** Where its window opens, when several panels share a place (stat blocks): defaults to popoutKey. */
  popoutPlace?: string
  /** The OS window's title, when `title` is not plain text. */
  windowTitle?: string
}

/**
 * A reusable draggable, minimizable floating window.
 *
 * - Drag from the title bar to move.
 * - Double-click the title bar to minimize/restore.
 * - The close (x) button in the header closes (if onClose provided).
 * - With `popoutKey`, a header button moves the body into an OS window; closing that window closes the
 *   panel (or, for a panel with no close, puts it back in the app).
 *
 * Mouse listeners attach to window during drag so the cursor can leave the
 * panel without breaking the drag.
 */
export function FloatingPanel({
  title, initialX = 20, initialY = 60,
  width = 320, maxHeight = '60vh',
  onClose, zIndex = 50,
  children, bodyStyle, popoutKey, popoutPlace, windowTitle,
}: Props) {
  const [inWindow, setInWindow] = useState(false)
  const popout = usePopoutWindow(popoutKey ?? '', inWindow && !!popoutKey, {
    title: windowTitle ?? (typeof title === 'string' ? title : '4e DM Dashboard'),
    width, boundsKey: popoutPlace, onClosed: () => onClose ? onClose() : setInWindow(false),
  })
  const [pos, setPos] = useState({ x: initialX, y: initialY })
  const [dragging, setDragging] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const movedDuringDrag = useRef(false)
  const [currentZ, setCurrentZ] = useState(() => {
    topZ = Math.max(topZ, zIndex) + 1
    return topZ
  })
  const bringToFront = useCallback(() => {
    topZ += 1
    setCurrentZ(topZ)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    movedDuringDrag.current = false
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }, [pos])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const nx = e.clientX - dragOffset.current.x
      const ny = e.clientY - dragOffset.current.y
      if (Math.abs(nx - pos.x) > 1 || Math.abs(ny - pos.y) > 1) movedDuringDrag.current = true
      setPos({ x: nx, y: ny })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, pos.x, pos.y])

  const handleHeaderDoubleClick = useCallback((e: React.MouseEvent) => {
    // Don't toggle if the user double-clicked the close button
    if ((e.target as HTMLElement).closest('button')) return
    setMinimized(m => !m)
  }, [])

  // In its own window the panel is just its body; the OS window has the title bar.
  if (inWindow) return popout ? createPortal(<div style={{ background: 'var(--background)', minHeight: '100%', ...bodyStyle }}>{children}</div>, popout) : null

  return (
    <div
      onMouseDownCapture={bringToFront}
      style={{
        position: 'fixed',
        left: pos.x, top: pos.y,
        zIndex: currentZ,
        width,
        maxHeight: minimized ? undefined : maxHeight,
        background: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleHeaderDoubleClick}
        title="Drag to move · double-click to minimize"
        style={{
          padding: '4px 8px',
          background: 'var(--surface-raised)',
          borderBottom: minimized ? 'none' : '1px solid var(--border)',
          cursor: dragging ? 'grabbing' : 'grab',
          fontSize: 10, fontWeight: 600, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6,
          flexShrink: 0,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {minimized && (
          <span style={{ fontSize: 9, opacity: 0.6 }}>(minimized)</span>
        )}
        {popoutKey && (
          <button onClick={() => setInWindow(true)} title="Open in its own window" aria-label="Open in its own window"
            style={{ background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, color: 'var(--muted)', padding: 0, display: 'inline-flex' }}>
            <Icon name="app-window" size={12} />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} title="Close" aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              lineHeight: 1, color: 'var(--muted)', padding: 0, display: 'inline-flex',
            }}><Icon name="x" size={13} /></button>
        )}
      </div>
      {!minimized && (
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0, ...bodyStyle }}>
          {children}
        </div>
      )}
    </div>
  )
}
