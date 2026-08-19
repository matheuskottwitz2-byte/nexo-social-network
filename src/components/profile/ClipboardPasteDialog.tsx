import { ClipboardPaste, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ImageCropMode } from '../../utils/imageProcessing'
import { ClipboardImageError, readPastedImage } from '../../utils/clipboard'
import { Button } from '../ui/Button'

interface ClipboardPasteDialogProps {
  open: boolean
  mode: ImageCropMode
  onCancel: () => void
  onImage: (file: File) => void
}

function ClipboardPasteDialogSession({ mode, onCancel, onImage }: Omit<ClipboardPasteDialogProps, 'open'>) {
  const titleId = useId()
  const descriptionId = useId()
  const instructionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const pasteTargetRef = useRef<HTMLTextAreaElement>(null)
  const capturedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const animationFrame = window.requestAnimationFrame(() => pasteTargetRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [])

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (capturedRef.current) return
      event.preventDefault()

      try {
        const file = readPastedImage(event.clipboardData)
        capturedRef.current = true
        setError(null)
        onImage(file)
      } catch (pasteError) {
        setError(
          pasteError instanceof ClipboardImageError
            ? pasteError.message
            : 'Não foi possível ler a imagem da área de transferência.',
        )
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [onImage])

  const requestCancel = useCallback(() => {
    if (!capturedRef.current) onCancel()
  }, [onCancel])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestCancel()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('aria-hidden'))
      const first = focusableElements[0]
      const last = focusableElements.at(-1)
      if (!first || !last) return

      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [requestCancel])

  const destination = mode === 'avatar' ? 'foto do perfil' : 'capa do perfil'

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && requestCancel()}
    >
      <div
        ref={dialogRef}
        className="dialog-card clipboard-paste-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${instructionId}`}
      >
        <button type="button" className="icon-button dialog-close" aria-label="Cancelar colagem" onClick={requestCancel}>
          <X aria-hidden="true" />
        </button>
        <span className="empty-icon clipboard-paste-icon"><ClipboardPaste aria-hidden="true" /></span>
        <h2 id={titleId}>Colar imagem</h2>
        <p id={descriptionId}>Seu navegador precisa que você cole a imagem manualmente para usar como {destination}.</p>
        <p id={instructionId} className="clipboard-paste-instruction">
          <strong>Pressione Ctrl + V</strong>
          <span>ou ⌘ + V no macOS</span>
        </p>
        <textarea
          ref={pasteTargetRef}
          className="clipboard-paste-target"
          value=""
          onChange={() => undefined}
          aria-label={`Cole aqui a imagem para usar como ${destination}`}
          placeholder="Cole a imagem aqui"
          rows={2}
          spellCheck={false}
        />
        {error && <p className="clipboard-paste-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={requestCancel}>Cancelar</Button>
        </div>
      </div>
    </div>
  )
}

export function ClipboardPasteDialog(props: ClipboardPasteDialogProps) {
  if (!props.open) return null
  return <ClipboardPasteDialogSession key={props.mode} {...props} />
}
