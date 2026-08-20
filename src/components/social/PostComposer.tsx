import { ImagePlus, RefreshCw, SendHorizontal, Trash2 } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from 'react'
import { toast } from 'sonner'
import { useCreatePost } from '../../hooks/useNexoQueries'
import {
  POST_MAX_LENGTH,
  POST_MEDIA_MAX_ITEMS,
} from '../../lib/constants'
import type { CreatePostMediaInput } from '../../services/posts'
import type { ProfileSummary } from '../../types/models'
import { ClipboardImageError, readPastedImage } from '../../utils/clipboard'
import {
  POST_IMAGE_MIME_TYPES,
  processPostImage,
} from '../../utils/imageProcessing'
import { getErrorMessage } from '../../utils/errors'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'

type ComposerMedia = CreatePostMediaInput & { id: string }

interface ComposerPreviewImageProps {
  file: File
  width: number
  height: number
}

function ComposerPreviewImage({ file, width, height }: ComposerPreviewImageProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  if (!url) return <span className="composer-media-placeholder skeleton" aria-hidden="true" />
  return <img src={url} alt="" width={width} height={height} />
}

function transferContainsFiles(event: DragEvent<HTMLFormElement>) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function shouldContainInPreview(width: number, height: number, mediaCount: number, index: number) {
  const sourceRatio = width / height
  const frameRatio = mediaCount === 3 && index === 0 ? 16 / 9 : 1
  return Math.max(sourceRatio / frameRatio, frameRatio / sourceRatio) > 1.5
}

export function PostComposer({ userId, profile }: { userId: string; profile?: ProfileSummary }) {
  const [content, setContent] = useState('')
  const [media, setMedia] = useState<ComposerMedia[]>([])
  const [preparing, setPreparing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const preparingRef = useRef(false)
  const submittingRef = useRef(false)
  const dragDepthRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replacementInputRef = useRef<HTMLInputElement>(null)
  const replacementIndexRef = useRef<number | null>(null)
  const mutation = useCreatePost(userId)
  const remaining = POST_MAX_LENGTH - content.length
  const busy = preparing || mutation.isPending
  const canSubmit = (content.trim().length > 0 || media.length > 0) && remaining >= 0 && !busy

  async function prepareFiles(files: readonly File[], replacementIndex: number | null = null) {
    if (preparingRef.current || submittingRef.current || mutation.isPending || files.length === 0) return

    const available = replacementIndex === null ? POST_MEDIA_MAX_ITEMS - media.length : 1
    if (available <= 0) {
      toast.error(`Você pode adicionar até ${POST_MEDIA_MAX_ITEMS} imagens por publicação.`)
      return
    }
    if (files.length > available) {
      toast.error(`Você pode adicionar até ${POST_MEDIA_MAX_ITEMS} imagens por publicação.`)
    }
    const candidates = files.slice(0, available)

    preparingRef.current = true
    setPreparing(true)
    try {
      const prepared: ComposerMedia[] = []
      for (const file of candidates) {
        const result = await processPostImage(file)
        prepared.push({
          id: crypto.randomUUID(),
          file: result.file,
          width: result.width,
          height: result.height,
          altText: null,
        })
      }

      if (replacementIndex === null) {
        setMedia((current) => [...current, ...prepared].slice(0, POST_MEDIA_MAX_ITEMS))
      } else if (prepared[0]) {
        setMedia((current) => current.map((item, index) => index === replacementIndex ? prepared[0] : item))
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível preparar a imagem.'))
    } finally {
      preparingRef.current = false
      setPreparing(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || preparingRef.current || submittingRef.current) return
    submittingRef.current = true
    try {
      await mutation.mutateAsync({
        content,
        media: media.map(({ file, width, height, altText }) => ({ file, width, height, altText })),
      })
      setContent('')
      setMedia([])
      toast.success('Publicação criada.')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível publicar.'))
    } finally {
      submittingRef.current = false
    }
  }

  function handleFileSelection(files: FileList | null) {
    if (!files) return
    void prepareFiles(Array.from(files))
  }

  function requestReplacement(index: number) {
    if (busy) return
    replacementIndexRef.current = index
    replacementInputRef.current?.click()
  }

  function handleReplacement(files: FileList | null) {
    const replacementIndex = replacementIndexRef.current
    replacementIndexRef.current = null
    if (!files?.[0] || replacementIndex === null) return
    void prepareFiles([files[0]], replacementIndex)
  }

  function removeMedia(id: string) {
    if (busy) return
    setMedia((current) => current.filter((item) => item.id !== id))
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (preparingRef.current || submittingRef.current || mutation.isPending) return
    try {
      const file = readPastedImage(event.clipboardData)
      event.preventDefault()
      void prepareFiles([file])
    } catch (error) {
      if (!(error instanceof ClipboardImageError && error.code === 'empty')) {
        event.preventDefault()
        toast.error(getErrorMessage(error, 'Não foi possível ler a imagem colada.'))
      }
    }
  }

  function handleDragEnter(event: DragEvent<HTMLFormElement>) {
    if (!transferContainsFiles(event)) return
    event.preventDefault()
    if (busy) return
    dragDepthRef.current += 1
    setDragging(true)
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    if (!transferContainsFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = busy ? 'none' : 'copy'
  }

  function handleDragLeave(event: DragEvent<HTMLFormElement>) {
    if (dragDepthRef.current === 0) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragging(false)
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    if (!transferContainsFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = 0
    setDragging(false)
    if (busy) return
    void prepareFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <form
      className={`composer${dragging ? ' is-dragging' : ''}`}
      onSubmit={handleSubmit}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-busy={busy}
    >
      <Avatar name={profile?.name || 'Você'} src={profile?.avatarUrl} />
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor="new-post">Escreva uma publicação</label>
        <textarea
          id="new-post"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onPaste={handlePaste}
          placeholder="O que está em movimento por aí?"
          rows={3}
          maxLength={POST_MAX_LENGTH + 1}
          disabled={mutation.isPending}
        />

        {media.length > 0 && (
          <div
            className={`composer-media-grid composer-media-grid-${media.length}`}
            role="group"
            aria-label={`${media.length} ${media.length === 1 ? 'imagem selecionada' : 'imagens selecionadas'}`}
          >
            {media.map((item, index) => (
              <div className={`composer-media-item composer-media-item-${index + 1}`} key={item.id}>
                <div
                  className={`composer-media-preview${
                    media.length > 1 && shouldContainInPreview(item.width, item.height, media.length, index)
                      ? ' uses-contain'
                      : ''
                  }`}
                  style={media.length === 1 ? { aspectRatio: `${item.width} / ${item.height}` } : undefined}
                >
                  <ComposerPreviewImage file={item.file} width={item.width} height={item.height} />
                  <div className="composer-media-controls">
                    <button
                      type="button"
                      className="composer-media-control"
                      aria-label={`Substituir imagem ${index + 1}`}
                      title="Substituir"
                      onClick={() => requestReplacement(index)}
                      disabled={busy}
                    >
                      <RefreshCw aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="composer-media-control"
                      aria-label={`Remover imagem ${index + 1}`}
                      title="Remover"
                      onClick={() => removeMedia(item.id)}
                      disabled={busy}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {preparing && <p className="composer-media-status" role="status">Otimizando imagens…</p>}

        <div className="composer-footer">
          <div className="composer-media-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept={POST_IMAGE_MIME_TYPES.join(',')}
              multiple
              hidden
              disabled={busy}
              onChange={(event) => {
                handleFileSelection(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
            />
            <input
              ref={replacementInputRef}
              type="file"
              accept={POST_IMAGE_MIME_TYPES.join(',')}
              hidden
              disabled={busy}
              onChange={(event) => {
                handleReplacement(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
            />
            <button
              type="button"
              className="composer-add-media"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || media.length >= POST_MEDIA_MAX_ITEMS}
            >
              <ImagePlus aria-hidden="true" />
              Adicionar fotos
            </button>
            <span className="composer-media-limit">{media.length}/{POST_MEDIA_MAX_ITEMS}</span>
          </div>
          <div className="composer-submit-actions">
            <span className={`character-count ${remaining < 30 ? 'warning' : ''} ${remaining < 0 ? 'error' : ''}`}>
              {remaining}
            </span>
            <Button type="submit" loading={mutation.isPending} disabled={!canSubmit}>
              Publicar <SendHorizontal aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
