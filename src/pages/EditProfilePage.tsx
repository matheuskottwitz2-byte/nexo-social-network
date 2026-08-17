import { Camera, ImageUp, Save } from 'lucide-react'
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '../components/layout/PageHeader'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { ErrorState, PageLoader } from '../components/ui/Status'
import { useAuth } from '../contexts/AuthContext'
import { useCurrentProfile, useProfile, useUpdateProfile } from '../hooks/useNexoQueries'
import { PROFILE_BIO_MAX_LENGTH, PROFILE_NAME_MAX_LENGTH } from '../lib/constants'
import { getErrorMessage } from '../utils/errors'

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

export function EditProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const current = useCurrentProfile(user!.id)
  const fullProfile = useProfile(current.data?.username || '', user!.id)
  const mutation = useUpdateProfile(user!.id)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarFile, setAvatarFile] = useState<File>()
  const preview = useMemo(() => avatarFile ? URL.createObjectURL(avatarFile) : null, [avatarFile])

  useEffect(() => {
    if (fullProfile.data) {
      setName(fullProfile.data.name)
      setBio(fullProfile.data.bio)
    }
  }, [fullProfile.data])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error('Use uma imagem JPG, PNG, WebP, GIF ou AVIF.')
      event.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5 MB.')
      event.target.value = ''
      return
    }
    setAvatarFile(file)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (name.trim().length < 2 || name.length > PROFILE_NAME_MAX_LENGTH) {
      toast.error(`O nome deve ter entre 2 e ${PROFILE_NAME_MAX_LENGTH} caracteres.`)
      return
    }
    if (bio.length > PROFILE_BIO_MAX_LENGTH) {
      toast.error(`A bio deve ter no máximo ${PROFILE_BIO_MAX_LENGTH} caracteres.`)
      return
    }
    try {
      await mutation.mutateAsync({ name, bio, avatarFile })
      toast.success('Perfil atualizado.')
      navigate(`/@${current.data!.username}`)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível atualizar seu perfil.'))
    }
  }

  if (current.isLoading || fullProfile.isLoading) return <main className="page-surface"><PageHeader title="Editar perfil" back /><PageLoader /></main>
  if (current.isError || fullProfile.isError || !current.data || !fullProfile.data) return <main className="page-surface"><PageHeader title="Editar perfil" back /><ErrorState /></main>

  return (
    <main className="page-surface">
      <PageHeader title="Editar perfil" subtitle="Mostre às pessoas quem está por trás das ideias" back />
      <form className="edit-profile-form" onSubmit={submit}>
        <section className="avatar-editor">
          <div className="avatar-preview">
            <Avatar name={name || fullProfile.data.name} src={preview || fullProfile.data.avatarUrl} size="xl" />
            <span><Camera /></span>
          </div>
          <div><h2>Sua foto</h2><p>JPG, PNG, WebP, GIF ou AVIF, com até 5 MB.</p><label className="button button-secondary" htmlFor="avatar"><ImageUp className="size-4" /> Escolher imagem</label><input className="sr-only" id="avatar" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={chooseAvatar} /></div>
        </section>
        <div className="field-group">
          <label htmlFor="profile-name">Nome</label>
          <input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={PROFILE_NAME_MAX_LENGTH} required />
          <small>{name.length}/{PROFILE_NAME_MAX_LENGTH}</small>
        </div>
        <div className="field-group">
          <label htmlFor="profile-username">Nome de usuário</label>
          <input id="profile-username" value={`@${fullProfile.data.username}`} disabled />
          <small>O nome de usuário não pode ser alterado nesta versão.</small>
        </div>
        <div className="field-group">
          <label htmlFor="profile-bio">Bio</label>
          <textarea id="profile-bio" rows={5} value={bio} onChange={(event) => setBio(event.target.value)} maxLength={PROFILE_BIO_MAX_LENGTH} placeholder="Conte sobre você, seus interesses e o que pretende compartilhar." />
          <small>{bio.length}/{PROFILE_BIO_MAX_LENGTH}</small>
        </div>
        <div className="form-actions"><Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancelar</Button><Button type="submit" loading={mutation.isPending}><Save className="size-4" /> Salvar alterações</Button></div>
      </form>
    </main>
  )
}
