import { Camera, ClipboardPaste, ImageUp, LoaderCircle, Save, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '../components/layout/PageHeader'
import { ClipboardPasteDialog } from '../components/profile/ClipboardPasteDialog'
import { ImageCropDialog } from '../components/profile/ImageCropDialog'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { ErrorState, PageLoader } from '../components/ui/Status'
import { useAuth } from '../contexts/AuthContext'
import { useCurrentProfile, useProfile, useUpdateProfile } from '../hooks/useNexoQueries'
import { PROFILE_BIO_MAX_LENGTH, PROFILE_NAME_MAX_LENGTH } from '../lib/constants'
import {
  ClipboardImageError,
  readClipboardImage,
  shouldUseManualPasteFallback,
} from '../utils/clipboard'
import { getErrorMessage } from '../utils/errors'
import type { ImageCropMode } from '../utils/imageProcessing'
import { PROFILE_MEDIA_RULES, validateProfileMediaFile } from '../utils/profileMedia'

type PendingCrop = {
  file: File
  mode: ImageCropMode
}

type MediaPreparation = {
  mode: ImageCropMode
  source: 'file' | 'clipboard'
}

function useFilePreview(file?: File) {
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return preview
}

async function canDecodeImage(file: File) {
  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('invalid image'))
      image.src = objectUrl
    })
    return image.naturalWidth > 0 && image.naturalHeight > 0
  } catch {
    return false
  } finally {
    image.onload = null
    image.onerror = null
    image.src = ''
    URL.revokeObjectURL(objectUrl)
  }
}

export function EditProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const current = useCurrentProfile(user!.id)
  const fullProfile = useProfile(current.data?.username || '', user!.id)
  const mutation = useUpdateProfile(user!.id)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarFile, setAvatarFile] = useState<File>()
  const [coverFile, setCoverFile] = useState<File>()
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [removeCover, setRemoveCover] = useState(false)
  const [pendingCrop, setPendingCrop] = useState<PendingCrop | null>(null)
  const [mediaPreparation, setMediaPreparation] = useState<MediaPreparation | null>(null)
  const [manualPasteMode, setManualPasteMode] = useState<ImageCropMode | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const avatarTriggerRef = useRef<HTMLButtonElement>(null)
  const coverTriggerRef = useRef<HTMLButtonElement>(null)
  const avatarClipboardRef = useRef<HTMLButtonElement>(null)
  const coverClipboardRef = useRef<HTMLButtonElement>(null)
  const mediaPreparationBusyRef = useRef(false)
  const avatarPreview = useFilePreview(avatarFile)
  const coverPreview = useFilePreview(coverFile)

  useEffect(() => {
    if (fullProfile.data) {
      setName(fullProfile.data.name)
      setBio(fullProfile.data.bio)
    }
  }, [fullProfile.data])

  async function prepareMedia(file: File, mode: ImageCropMode, returnFocusTo: HTMLButtonElement | null) {
    const validationMessage = validateProfileMediaFile(file, mode)
    if (validationMessage) {
      toast.error(validationMessage)
      return false
    }
    if (!await canDecodeImage(file)) {
      toast.error('Não foi possível abrir esta imagem. Verifique o arquivo ou tente outro formato.')
      return false
    }
    returnFocusTo?.focus()
    setPendingCrop({ file, mode })
    return true
  }

  async function chooseMedia(event: ChangeEvent<HTMLInputElement>, mode: ImageCropMode) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || mediaPreparationBusyRef.current || pendingCrop) return

    mediaPreparationBusyRef.current = true
    setMediaPreparation({ mode, source: 'file' })
    const triggerRef = mode === 'avatar' ? avatarTriggerRef : coverTriggerRef
    try {
      await prepareMedia(file, mode, triggerRef.current)
    } finally {
      mediaPreparationBusyRef.current = false
      setMediaPreparation(null)
    }
  }

  async function pasteMedia(mode: ImageCropMode) {
    if (mediaPreparationBusyRef.current || pendingCrop) return
    mediaPreparationBusyRef.current = true
    setMediaPreparation({ mode, source: 'clipboard' })
    let manualFallbackOpened = false
    try {
      const file = await readClipboardImage(PROFILE_MEDIA_RULES[mode].mimeTypes)
      const triggerRef = mode === 'avatar' ? avatarClipboardRef : coverClipboardRef
      await prepareMedia(file, mode, triggerRef.current)
    } catch (error) {
      if (shouldUseManualPasteFallback(error)) {
        manualFallbackOpened = true
        setMediaPreparation(null)
        setManualPasteMode(mode)
      } else {
        toast.error(
          error instanceof ClipboardImageError
            ? error.message
            : 'Não foi possível ler a imagem da área de transferência.',
        )
      }
    } finally {
      if (!manualFallbackOpened) {
        mediaPreparationBusyRef.current = false
        setMediaPreparation(null)
      }
    }
  }

  async function prepareManualPaste(file: File) {
    const mode = manualPasteMode
    if (!mode || !mediaPreparationBusyRef.current) return

    setManualPasteMode(null)
    setMediaPreparation({ mode, source: 'clipboard' })
    const triggerRef = mode === 'avatar' ? avatarClipboardRef : coverClipboardRef
    try {
      await prepareMedia(file, mode, triggerRef.current)
    } finally {
      mediaPreparationBusyRef.current = false
      setMediaPreparation(null)
    }
  }

  function cancelManualPaste() {
    if (!manualPasteMode) return
    mediaPreparationBusyRef.current = false
    setManualPasteMode(null)
  }

  function applyPreparedImage(file: File) {
    if (!pendingCrop) return
    if (pendingCrop.mode === 'avatar') {
      setAvatarFile(file)
      setRemoveAvatar(false)
    } else {
      setCoverFile(file)
      setRemoveCover(false)
    }
    setPendingCrop(null)
  }

  function clearAvatar() {
    if (mediaPreparationBusyRef.current) return
    setAvatarFile(undefined)
    setRemoveAvatar(Boolean(fullProfile.data?.avatarUrl))
  }

  function clearCover() {
    if (mediaPreparationBusyRef.current) return
    setCoverFile(undefined)
    setRemoveCover(Boolean(fullProfile.data?.coverUrl))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (mediaPreparationBusyRef.current || pendingCrop) return
    const profile = fullProfile.data
    if (!profile) return
    if (name.trim().length < 2 || name.length > PROFILE_NAME_MAX_LENGTH) {
      toast.error(`O nome deve ter entre 2 e ${PROFILE_NAME_MAX_LENGTH} caracteres.`)
      return
    }
    if (bio.length > PROFILE_BIO_MAX_LENGTH) {
      toast.error(`A bio deve ter no máximo ${PROFILE_BIO_MAX_LENGTH} caracteres.`)
      return
    }

    try {
      const result = await mutation.mutateAsync({
        name,
        bio,
        previousName: profile.name,
        currentAvatarUrl: profile.avatarUrl,
        currentCoverUrl: profile.coverUrl,
        avatarFile,
        coverFile,
        removeAvatar,
        removeCover,
      })
      if (result.cleanupFailed) {
        toast.warning('Perfil atualizado. Uma imagem anterior não pôde ser removida do Storage.')
      } else {
        toast.success('Perfil atualizado.')
      }
      navigate(`/@${current.data!.username}`)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível atualizar seu perfil.'))
    }
  }

  if (current.isLoading || fullProfile.isLoading) return <main className="page-surface"><PageHeader title="Editar perfil" back /><PageLoader /></main>
  if (current.isError || fullProfile.isError || !current.data || !fullProfile.data) return <main className="page-surface"><PageHeader title="Editar perfil" back /><ErrorState /></main>

  const profile = fullProfile.data
  const effectiveAvatarUrl = avatarPreview || (removeAvatar ? null : profile.avatarUrl)
  const effectiveCoverUrl = coverPreview || (removeCover ? null : profile.coverUrl)
  const isPreparingMedia = Boolean(mediaPreparation || manualPasteMode)
  const isReadingCover = mediaPreparation?.source === 'clipboard' && mediaPreparation.mode === 'cover'
  const isReadingAvatar = mediaPreparation?.source === 'clipboard' && mediaPreparation.mode === 'avatar'
  const isPreparingCoverFile = mediaPreparation?.source === 'file' && mediaPreparation.mode === 'cover'
  const isPreparingAvatarFile = mediaPreparation?.source === 'file' && mediaPreparation.mode === 'avatar'

  return (
    <main className="page-surface">
      <PageHeader title="Editar perfil" subtitle="Atualize seus dados públicos" back />
      <form className="edit-profile-form" onSubmit={submit}>
        <fieldset
          className="profile-editor-fields"
          disabled={mutation.isPending}
          aria-busy={mutation.isPending || isPreparingMedia}
        >
          <section className="profile-media-editor cover-media-editor">
            <div className={`cover-editor-preview ${effectiveCoverUrl ? 'has-image' : ''}`}>
              {effectiveCoverUrl ? (
                <img src={effectiveCoverUrl} alt="Prévia da capa do perfil" />
              ) : (
                <><span /><span /><span /></>
              )}
            </div>
            <div className="profile-media-content">
              <div>
                <h2>Capa do perfil</h2>
                <p>JPG, PNG, WebP, AVIF ou GIF, até 8 MB. GIFs preservam a animação e não recebem recorte.</p>
              </div>
              <div className="profile-media-actions">
                <button
                  ref={coverTriggerRef}
                  type="button"
                  className="button button-secondary media-image-button"
                  aria-busy={isPreparingCoverFile}
                  aria-disabled={isPreparingMedia}
                  onClick={() => !mediaPreparationBusyRef.current && coverInputRef.current?.click()}
                >
                  {isPreparingCoverFile
                    ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    : <ImageUp className="size-4" aria-hidden="true" />}
                  {isPreparingCoverFile ? 'Preparando…' : effectiveCoverUrl ? 'Trocar capa' : 'Adicionar capa'}
                </button>
                <input ref={coverInputRef} className="sr-only" id="cover" type="file" accept={PROFILE_MEDIA_RULES.cover.mimeTypes.join(',')} tabIndex={-1} aria-label="Selecionar imagem de capa" disabled={isPreparingMedia} onChange={(event) => void chooseMedia(event, 'cover')} />
                <button
                  ref={coverClipboardRef}
                  type="button"
                  className="button button-ghost media-image-button"
                  aria-busy={isReadingCover}
                  aria-disabled={isPreparingMedia}
                  onClick={() => void pasteMedia('cover')}
                >
                  {isReadingCover
                    ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    : <ClipboardPaste className="size-4" aria-hidden="true" />}
                  {isReadingCover ? 'Lendo…' : 'Colar imagem'}
                </button>
                {effectiveCoverUrl && (
                  <Button type="button" variant="ghost" onClick={clearCover} disabled={isPreparingMedia}>
                    <Trash2 className="size-4" /> Remover capa
                  </Button>
                )}
              </div>
            </div>
          </section>

          <section className="profile-media-editor avatar-media-editor">
            <div className="avatar-preview">
              <Avatar name={name || profile.name} src={effectiveAvatarUrl} size="xl" />
              <span className="avatar-preview-badge"><Camera aria-hidden="true" /></span>
            </div>
            <div className="profile-media-content">
              <div>
                <h2>Foto do perfil</h2>
                <p>JPG, PNG, WebP ou AVIF, até 5 MB.</p>
              </div>
              <div className="profile-media-actions">
                <button ref={avatarTriggerRef} type="button" className="button button-secondary media-image-button" aria-busy={isPreparingAvatarFile} aria-disabled={isPreparingMedia} onClick={() => !mediaPreparationBusyRef.current && avatarInputRef.current?.click()}>
                  {isPreparingAvatarFile
                    ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    : <ImageUp className="size-4" aria-hidden="true" />}
                  {isPreparingAvatarFile ? 'Preparando…' : effectiveAvatarUrl ? 'Trocar foto' : 'Adicionar foto'}
                </button>
                <input ref={avatarInputRef} className="sr-only" id="avatar" type="file" accept={PROFILE_MEDIA_RULES.avatar.mimeTypes.join(',')} tabIndex={-1} aria-label="Selecionar foto de perfil" disabled={isPreparingMedia} onChange={(event) => void chooseMedia(event, 'avatar')} />
                <button
                  ref={avatarClipboardRef}
                  type="button"
                  className="button button-ghost media-image-button"
                  aria-busy={isReadingAvatar}
                  aria-disabled={isPreparingMedia}
                  onClick={() => void pasteMedia('avatar')}
                >
                  {isReadingAvatar
                    ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    : <ClipboardPaste className="size-4" aria-hidden="true" />}
                  {isReadingAvatar ? 'Lendo…' : 'Colar imagem'}
                </button>
                {effectiveAvatarUrl && (
                  <Button type="button" variant="ghost" onClick={clearAvatar} disabled={isPreparingMedia}>
                    <Trash2 className="size-4" /> Remover foto
                  </Button>
                )}
              </div>
            </div>
          </section>

          <div className="profile-data-fields">
            <div className="field-group">
              <label htmlFor="profile-name">Nome</label>
              <input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={PROFILE_NAME_MAX_LENGTH} required />
              <small>{name.length}/{PROFILE_NAME_MAX_LENGTH}</small>
            </div>
            <div className="field-group">
              <label htmlFor="profile-username">Nome de usuário</label>
              <input id="profile-username" value={`@${profile.username}`} disabled />
              <small>O nome de usuário não pode ser alterado nesta versão.</small>
            </div>
            <div className="field-group">
              <label htmlFor="profile-bio">Bio</label>
              <textarea id="profile-bio" rows={5} value={bio} onChange={(event) => setBio(event.target.value)} maxLength={PROFILE_BIO_MAX_LENGTH} placeholder="Escreva uma breve apresentação." />
              <small>{bio.length}/{PROFILE_BIO_MAX_LENGTH}</small>
            </div>
          </div>

          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={isPreparingMedia}>Cancelar</Button>
            <Button type="submit" loading={mutation.isPending} disabled={isPreparingMedia}><Save className="size-4" /> Salvar alterações</Button>
          </div>
        </fieldset>
      </form>

      <ImageCropDialog
        file={pendingCrop?.file ?? null}
        mode={pendingCrop?.mode ?? 'avatar'}
        open={Boolean(pendingCrop)}
        onCancel={() => setPendingCrop(null)}
        onConfirm={applyPreparedImage}
      />
      <ClipboardPasteDialog
        open={Boolean(manualPasteMode)}
        mode={manualPasteMode ?? 'avatar'}
        onCancel={cancelManualPaste}
        onImage={(file) => void prepareManualPaste(file)}
      />
    </main>
  )
}
