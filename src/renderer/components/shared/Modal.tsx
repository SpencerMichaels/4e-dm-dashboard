import { useEffect, useCallback, useId } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  /** The header title (4ecb's dialog contract: branded header with the title and a close x). */
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  /** Footer actions, right-aligned as [Cancel] [Back] [Primary]; wrap others in `.dialog-footer-start`. */
  footer?: React.ReactNode
  minWidth?: number | string
  maxWidth?: number | string
  closeOnOverlayClick?: boolean
}

/** A dialog: Esc and the close x equal Cancel. Styles in styles/components.css (.dialog-*). */
export function Modal({
  title,
  onClose,
  children,
  footer,
  minWidth = 350,
  maxWidth,
  closeOnOverlayClick = true,
}: ModalProps) {
  const titleId = useId()
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleOverlayClick = useCallback(() => {
    if (closeOnOverlayClick) onClose()
  }, [closeOnOverlayClick, onClose])

  return (
    <div className="dialog-backdrop" onClick={handleOverlayClick}>
      <div className="dialog-shell" role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{ minWidth, maxWidth }} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="dialog-close" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}
