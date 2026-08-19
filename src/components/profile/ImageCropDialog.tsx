import { ImageIcon, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { createCroppedImageFile, type ImageCropMode } from '../../utils/imageProcessing'
import { Button } from '../ui/Button'

export interface ImageCropDialogProps {
  file: File | null
  mode: ImageCropMode
  open: boolean
  onCancel: () => void
  onConfirm: (result: File) => void | Promise<void>
  busy?: boolean
}

type CropPoint = { x: number; y: number }

function isGif(file: File | null) {
  return file?.type.toLowerCase() === 'image/gif'
}

function ImageCropDialogSession({
  file,
  mode,
  onCancel,
  onConfirm,
  busy = false,
}: Omit<ImageCropDialogProps, 'open'>) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const processingRef = useRef(false)
  const [crop, setCrop] = useState<CropPoint>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const preserveAnimatedGif = mode === 'cover' && isGif(file)
  const locked = busy || processing

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  useEffect(() => {
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
  }, [])

  const requestCancel = useCallback(() => {
    if (!locked) onCancel()
  }, [locked, onCancel])

  useEffect(() => {
    if (locked) dialogRef.current?.focus()
  }, [locked])

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
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
        return
      }

      if (event.shiftKey && document.activeElement === first) {
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

  const handleCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  function handleReset() {
    if (locked) return
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setError(null)
  }

  async function handleConfirm() {
    if (!file || locked || processingRef.current) return

    if (!preserveAnimatedGif && !croppedAreaPixels) {
      setError('Aguarde a imagem carregar antes de confirmar o recorte.')
      return
    }

    processingRef.current = true
    setProcessing(true)
    setError(null)

    try {
      let result = file

      if (!preserveAnimatedGif && croppedAreaPixels) {
        try {
          result = await createCroppedImageFile(file, croppedAreaPixels, mode)
        } catch (processingError) {
          setError(
            processingError instanceof Error
              ? processingError.message
              : 'Não foi possível preparar a imagem. Tente novamente.',
          )
          return
        }
      }

      try {
        await onConfirm(result)
      } catch {
        setError('A imagem foi preparada, mas não foi possível salvá-la. Tente novamente.')
      }
    } finally {
      processingRef.current = false
      setProcessing(false)
    }
  }

  const title = mode === 'avatar' ? 'Ajustar foto de perfil' : 'Ajustar capa do perfil'
  const description = preserveAnimatedGif
    ? 'Capas GIF são enviadas sem recorte para preservar a animação.'
    : mode === 'avatar'
      ? 'Posicione seu rosto dentro do círculo e ajuste o zoom.'
      : 'Posicione a imagem no formato horizontal da capa e ajuste o zoom.'

  return (
    <div
      className="dialog-backdrop image-crop-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && requestCancel()}
    >
      <div
        ref={dialogRef}
        className={`image-crop-dialog image-crop-dialog-${mode}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={locked}
        tabIndex={-1}
      >
        <header className="image-crop-header">
          <div>
            <span className="eyebrow">Imagem do perfil</span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button image-crop-close"
            aria-label="Fechar ajuste de imagem"
            onClick={requestCancel}
            disabled={locked}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        {previewUrl && !preserveAnimatedGif ? (
          <div className={`image-crop-stage${locked ? ' is-disabled' : ''}`} aria-label="Área de recorte">
            <Cropper
              image={previewUrl}
              crop={crop}
              zoom={zoom}
              minZoom={1}
              maxZoom={3}
              zoomSpeed={0.15}
              keyboardStep={10}
              aspect={mode === 'avatar' ? 1 : 3}
              cropShape={mode === 'avatar' ? 'round' : 'rect'}
              showGrid={mode === 'cover'}
              onCropChange={locked ? () => undefined : setCrop}
              onZoomChange={locked ? () => undefined : setZoom}
              onCropComplete={handleCropComplete}
              onTouchRequest={() => !locked}
              onWheelRequest={() => !locked}
              cropperProps={{
                'aria-label': 'Área de recorte; use as setas para reposicionar a imagem',
                'aria-disabled': locked,
                tabIndex: locked ? -1 : 0,
              }}
              disableAutomaticStylesInjection
            />
          </div>
        ) : previewUrl && preserveAnimatedGif ? (
          <div className="image-crop-gif-preview">
            <img src={previewUrl} alt="Prévia do GIF selecionado" />
            <p><ImageIcon aria-hidden="true" /> A animação original será mantida.</p>
          </div>
        ) : (
          <div className="image-crop-empty" role="status">
            <ImageIcon aria-hidden="true" />
            <p>Nenhuma imagem selecionada.</p>
          </div>
        )}

        {!preserveAnimatedGif && previewUrl && (
          <div className="image-crop-controls">
            <label htmlFor={`${titleId}-zoom`}>
              <span>Zoom</span>
              <output>{zoom.toFixed(1)}×</output>
            </label>
            <input
              id={`${titleId}-zoom`}
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              disabled={locked}
              aria-label="Zoom da imagem"
            />
          </div>
        )}

        {error && <p className="image-crop-error" role="alert">{error}</p>}

        <footer className="image-crop-actions">
          {!preserveAnimatedGif && previewUrl && (
            <Button type="button" variant="ghost" onClick={handleReset} disabled={locked}>
              <RotateCcw aria-hidden="true" />
              Redefinir
            </Button>
          )}
          <span className="image-crop-action-spacer" />
          <Button type="button" variant="secondary" onClick={requestCancel} disabled={locked}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            loading={locked}
            disabled={!file || (!preserveAnimatedGif && !croppedAreaPixels)}
          >
            {preserveAnimatedGif ? 'Usar capa GIF' : 'Aplicar recorte'}
          </Button>
        </footer>
      </div>
    </div>
  )
}

export function ImageCropDialog(props: ImageCropDialogProps) {
  if (!props.open) return null

  const fileKey = props.file
    ? `${props.file.name}-${props.file.size}-${props.file.lastModified}`
    : 'empty'

  return <ImageCropDialogSession key={`${props.mode}-${fileKey}`} {...props} />
}
