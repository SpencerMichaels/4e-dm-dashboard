import { useEffect, useCallback } from 'react'
import styles from './Modal.module.css'

interface ModalProps {
  onClose: () => void
  children: React.ReactNode
  minWidth?: number | string
  maxWidth?: number | string
  closeOnOverlayClick?: boolean
}

export function Modal({
  onClose,
  children,
  minWidth = 350,
  maxWidth,
  closeOnOverlayClick = true,
}: ModalProps) {
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
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        className={styles.panel}
        style={{ minWidth, maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export { styles as modalStyles }
