import { useEffect, useRef } from 'react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  danger?: boolean
  title?: string
}

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  title = 'Are you sure?',
  danger = true,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  return (
    <Modal title={title} onClose={onCancel} maxWidth={400} footer={<>
      <button className="btn" onClick={onCancel}>Cancel</button>
      <button ref={confirmRef} className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
    </>}>
      <p style={{ margin: 0, lineHeight: 1.5 }}>{message}</p>
    </Modal>
  )
}
