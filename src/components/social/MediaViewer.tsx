import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef } from 'react'
import type { PostMedia } from '../../types/models'

interface MediaViewerProps {
  media: readonly PostMedia[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}

function validDimension(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function MediaViewer({ media, index, onIndexChange, onClose }: MediaViewerProps) {
  const titleId = useId()
  const counterId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const mediaCount = media.length
  const safeIndex = mediaCount > 0
    ? Math.min(Math.max(index, 0), mediaCount - 1)
    : 0
  const currentMedia = media[safeIndex]
  const hasCurrentMedia = Boolean(currentMedia)

  const showPrevious = useCallback(() => {
    if (safeIndex > 0) onIndexChange(safeIndex - 1)
  }, [onIndexChange, safeIndex])

  const showNext = useCallback(() => {
    if (safeIndex < mediaCount - 1) onIndexChange(safeIndex + 1)
  }, [mediaCount, onIndexChange, safeIndex])

  useEffect(() => {
    if (!hasCurrentMedia) return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const animationFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [hasCurrentMedia])

  useEffect(() => {
    if (!currentMedia) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        showPrevious()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        showNext()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('aria-hidden'))
      const first = focusableElements[0]
      const last = focusableElements.at(-1)

      if (!first || !last) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }

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
  }, [currentMedia, onClose, showNext, showPrevious])

  if (!currentMedia) return null

  const hasMultipleMedia = mediaCount > 1
  const imageWidth = validDimension(currentMedia.width) ? currentMedia.width : undefined
  const imageHeight = validDimension(currentMedia.height) ? currentMedia.height : undefined

  return (
    <div
      className="media-viewer-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="media-viewer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={counterId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="sr-only">Visualizador de imagens</h2>
        <button
          ref={closeButtonRef}
          type="button"
          className="icon-button media-viewer-close"
          aria-label="Fechar visualizador"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>

        <div
          className="media-viewer-stage"
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          {hasMultipleMedia && (
            <button
              type="button"
              className="icon-button media-viewer-navigation media-viewer-previous"
              aria-label="Mostrar imagem anterior"
              onClick={showPrevious}
              disabled={safeIndex === 0}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          )}

          <img
            key={currentMedia.id}
            className="media-viewer-image"
            src={currentMedia.url}
            alt={currentMedia.altText ?? ''}
            width={imageWidth}
            height={imageHeight}
            loading="eager"
            decoding="async"
          />

          {hasMultipleMedia && (
            <button
              type="button"
              className="icon-button media-viewer-navigation media-viewer-next"
              aria-label="Mostrar próxima imagem"
              onClick={showNext}
              disabled={safeIndex === mediaCount - 1}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          )}
        </div>

        <p id={counterId} className="media-viewer-counter" aria-live="polite">
          Imagem {safeIndex + 1} de {mediaCount}
        </p>
      </div>
    </div>
  )
}
