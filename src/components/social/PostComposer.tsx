import { SendHorizontal } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useCreatePost } from '../../hooks/useNexoQueries'
import { POST_MAX_LENGTH } from '../../lib/constants'
import type { ProfileSummary } from '../../types/models'
import { getErrorMessage } from '../../utils/errors'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'

export function PostComposer({ userId, profile }: { userId: string; profile?: ProfileSummary }) {
  const [content, setContent] = useState('')
  const mutation = useCreatePost(userId)
  const remaining = POST_MAX_LENGTH - content.length
  const canSubmit = content.trim().length > 0 && remaining >= 0

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    try {
      await mutation.mutateAsync(content)
      setContent('')
      toast.success('Publicação criada.')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível publicar.'))
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <Avatar name={profile?.name || 'Você'} src={profile?.avatarUrl} />
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor="new-post">Escreva uma publicação</label>
        <textarea
          id="new-post"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Escreva uma publicação…"
          rows={3}
          maxLength={POST_MAX_LENGTH + 1}
        />
        <div className="composer-footer">
          <span className={`character-count ${remaining < 30 ? 'warning' : ''} ${remaining < 0 ? 'error' : ''}`}>
            {remaining}
          </span>
          <Button type="submit" loading={mutation.isPending} disabled={!canSubmit}>
            Publicar <SendHorizontal aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </form>
  )
}
