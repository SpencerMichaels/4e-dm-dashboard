import { useEffect, useRef } from 'react'
import { Modal, modalStyles } from './Modal'

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  danger?: boolean
}

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  danger = true,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  return (
    <Modal onClose={onCancel} maxWidth={400}>
      <p style={{ marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <button className={modalStyles.btnSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          ref={confirmRef}
          className={danger ? modalStyles.btnDanger : modalStyles.btnPrimary}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
