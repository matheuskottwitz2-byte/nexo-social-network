import { AlertTriangle, X } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ open, title, description, loading, onCancel, onConfirm }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, loading, onCancel])

  if (!open) return null
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description">
        <button className="icon-button dialog-close" aria-label="Fechar" onClick={onCancel}><X /></button>
        <span className="empty-icon error"><AlertTriangle aria-hidden="true" /></span>
        <h2 id="dialog-title">{title}</h2>
        <p id="dialog-description">{description}</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onCancel} disabled={loading} autoFocus>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>Excluir</Button>
        </div>
      </div>
    </div>
  )
}
