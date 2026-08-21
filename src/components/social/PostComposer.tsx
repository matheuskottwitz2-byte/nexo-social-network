import { ImagePlus, ListChecks, Plus, RefreshCw, SendHorizontal, Trash2, X } from 'lucide-react'
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
  POLL_DURATION_OPTIONS,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX_LENGTH,
  POLL_QUESTION_MAX_LENGTH,
  POST_MAX_LENGTH,
  POST_MEDIA_MAX_ITEMS,
} from '../../lib/constants'
import type { CreatePostMediaInput } from '../../services/posts'
import type { CreatePollInput, PollDurationMinutes, ProfileSummary } from '../../types/models'
import { ClipboardImageError, readPastedImage } from '../../utils/clipboard'
import {
  POST_IMAGE_MIME_TYPES,
  processPostImage,
} from '../../utils/imageProcessing'
import { getErrorMessage } from '../../utils/errors'
import { validatePollInput } from '../../utils/polls'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'

type ComposerMedia = CreatePostMediaInput & { id: string }

function createPollDraft(): CreatePollInput {
  return {
    question: '',
    options: ['', ''],
    durationMinutes: 1440,
  }
}

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
  const [poll, setPoll] = useState<CreatePollInput | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const preparingRef = useRef(false)
  const submittingRef = useRef(false)
  const mediaRef = useRef<ComposerMedia[]>([])
  const pollRef = useRef<CreatePollInput | null>(null)
  const dragDepthRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replacementInputRef = useRef<HTMLInputElement>(null)
  const replacementIndexRef = useRef<number | null>(null)
  const pollQuestionRef = useRef<HTMLInputElement>(null)
  const pollOptionRefs = useRef<Array<HTMLInputElement | null>>([])
  const mutation = useCreatePost(userId)
  const remaining = POST_MAX_LENGTH - content.length
  const busy = preparing || mutation.isPending
  const pollValidation = poll ? validatePollInput(poll) : null
  const normalizedPoll = pollValidation?.valid ? pollValidation.poll : null
  const canSubmit =
    (content.trim().length > 0 || media.length > 0 || normalizedPoll !== null) &&
    (poll === null || normalizedPoll !== null) &&
    remaining >= 0 &&
    !busy

  function replaceMedia(nextMedia: ComposerMedia[]) {
    mediaRef.current = nextMedia
    setMedia(nextMedia)
  }

  function replacePoll(nextPoll: CreatePollInput | null) {
    pollRef.current = nextPoll
    setPoll(nextPoll)
  }

  async function prepareFiles(files: readonly File[], replacementIndex: number | null = null) {
    if (preparingRef.current || submittingRef.current || mutation.isPending || files.length === 0) return
    if (pollRef.current) {
      toast.error('Remova a enquete antes de adicionar imagens.')
      return
    }

    const available = replacementIndex === null
      ? POST_MEDIA_MAX_ITEMS - mediaRef.current.length
      : 1
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

      if (pollRef.current) {
        toast.error('Remova a enquete antes de adicionar imagens.')
      } else if (replacementIndex === null) {
        replaceMedia([...mediaRef.current, ...prepared].slice(0, POST_MEDIA_MAX_ITEMS))
      } else if (prepared[0]) {
        replaceMedia(mediaRef.current.map(
          (item, index) => index === replacementIndex ? prepared[0] : item,
        ))
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
    const currentPollValidation = pollRef.current ? validatePollInput(pollRef.current) : null
    if (currentPollValidation && !currentPollValidation.valid) {
      toast.error(currentPollValidation.error)
      return
    }
    const submittedPoll = currentPollValidation?.valid ? currentPollValidation.poll : null
    submittingRef.current = true
    try {
      await mutation.mutateAsync({
        content,
        media: mediaRef.current.map(
          ({ file, width, height, altText }) => ({ file, width, height, altText }),
        ),
        poll: submittedPoll,
      })
      setContent('')
      replaceMedia([])
      replacePoll(null)
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

  function requestMediaSelection() {
    if (busy || preparingRef.current || submittingRef.current) return
    if (pollRef.current) {
      toast.error('Remova a enquete antes de adicionar imagens.')
      return
    }
    fileInputRef.current?.click()
  }

  function addPoll() {
    if (busy || preparingRef.current || submittingRef.current || pollRef.current) return
    if (mediaRef.current.length > 0) {
      toast.error('Remova as imagens antes de adicionar uma enquete.')
      return
    }
    dragDepthRef.current = 0
    setDragging(false)
    replacePoll(createPollDraft())
    requestAnimationFrame(() => pollQuestionRef.current?.focus())
  }

  function removePoll() {
    if (busy || preparingRef.current || submittingRef.current) return
    replacePoll(null)
  }

  function updatePollOption(index: number, value: string) {
    const current = pollRef.current
    if (!current) return
    replacePoll({
      ...current,
      options: current.options.map((option, optionIndex) => optionIndex === index ? value : option),
    })
  }

  function addPollOption() {
    if (busy || preparingRef.current || submittingRef.current) return
    const current = pollRef.current
    if (!current || current.options.length >= POLL_MAX_OPTIONS) return
    const nextOptionIndex = current.options.length
    replacePoll({ ...current, options: [...current.options, ''] })
    requestAnimationFrame(() => pollOptionRefs.current[nextOptionIndex]?.focus())
  }

  function removePollOption(index: number) {
    if (busy || preparingRef.current || submittingRef.current) return
    const current = pollRef.current
    if (!current || current.options.length <= POLL_MIN_OPTIONS) return
    replacePoll({
      ...current,
      options: current.options.filter((_, optionIndex) => optionIndex !== index),
    })
  }

  function requestReplacement(index: number) {
    if (busy || preparingRef.current || submittingRef.current) return
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
    if (busy || preparingRef.current || submittingRef.current) return
    replaceMedia(mediaRef.current.filter((item) => item.id !== id))
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
    if (busy || pollRef.current) return
    dragDepthRef.current += 1
    setDragging(true)
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    if (!transferContainsFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = busy || pollRef.current ? 'none' : 'copy'
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

        {poll && (
          <section className="composer-poll" aria-label="Enquete">
            <div className="composer-poll-header">
              <span className="composer-poll-title">
                <ListChecks aria-hidden="true" />
                Enquete
              </span>
              <button
                type="button"
                className="composer-poll-remove"
                onClick={removePoll}
                disabled={busy}
                aria-label="Remover enquete"
              >
                <X aria-hidden="true" />
                Remover
              </button>
            </div>

            <label className="composer-poll-field">
              <span>Pergunta</span>
              <input
                ref={pollQuestionRef}
                type="text"
                value={poll.question}
                onChange={(event) => replacePoll({ ...poll, question: event.target.value })}
                maxLength={POLL_QUESTION_MAX_LENGTH}
                placeholder="Faça uma pergunta"
                disabled={busy}
              />
            </label>

            <div className="composer-poll-options" role="group" aria-label="Opções da enquete">
              {poll.options.map((option, index) => (
                <div className="composer-poll-option" key={index}>
                  <label>
                    <span className="sr-only">Opção {index + 1}</span>
                    <span className="composer-poll-option-number" aria-hidden="true">{index + 1}</span>
                    <input
                      ref={(node) => { pollOptionRefs.current[index] = node }}
                      type="text"
                      value={option}
                      onChange={(event) => updatePollOption(index, event.target.value)}
                      maxLength={POLL_OPTION_MAX_LENGTH}
                      placeholder={`Opção ${index + 1}`}
                      disabled={busy}
                    />
                  </label>
                  {poll.options.length > POLL_MIN_OPTIONS && (
                    <button
                      type="button"
                      className="composer-poll-option-remove"
                      onClick={() => removePollOption(index)}
                      disabled={busy}
                      aria-label={`Remover opção ${index + 1}`}
                    >
                      <X aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="composer-poll-settings">
              <button
                type="button"
                className="composer-poll-add-option"
                onClick={addPollOption}
                disabled={busy || poll.options.length >= POLL_MAX_OPTIONS}
              >
                <Plus aria-hidden="true" />
                Adicionar opção
              </button>
              <label className="composer-poll-duration">
                <span>Duração</span>
                <select
                  value={poll.durationMinutes}
                  onChange={(event) => replacePoll({
                    ...poll,
                    durationMinutes: Number(event.target.value) as PollDurationMinutes,
                  })}
                  disabled={busy}
                >
                  {POLL_DURATION_OPTIONS.map((duration) => (
                    <option key={duration.minutes} value={duration.minutes}>{duration.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {pollValidation && !pollValidation.valid && (
              <p className="composer-poll-validation" aria-live="polite">{pollValidation.error}</p>
            )}
          </section>
        )}

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
              onClick={requestMediaSelection}
              disabled={busy || media.length >= POST_MEDIA_MAX_ITEMS}
              aria-disabled={Boolean(poll) || undefined}
            >
              <ImagePlus aria-hidden="true" />
              Adicionar fotos
            </button>
            {!poll && <span className="composer-media-limit">{media.length}/{POST_MEDIA_MAX_ITEMS}</span>}
            <button
              type="button"
              className="composer-add-media"
              onClick={addPoll}
              disabled={busy || Boolean(poll)}
              aria-disabled={media.length > 0 || undefined}
            >
              <ListChecks aria-hidden="true" />
              Enquete
            </button>
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
