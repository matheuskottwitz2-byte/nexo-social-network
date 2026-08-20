import { MessageCircle, SendHorizontal } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '../components/layout/PageHeader'
import { CommentCard } from '../components/social/CommentCard'
import { PostCard } from '../components/social/PostCard'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, FeedSkeleton, PageLoader } from '../components/ui/Status'
import { useAuth } from '../contexts/AuthContext'
import { useComments, useCreateComment, usePost } from '../hooks/useNexoQueries'
import { COMMENT_MAX_LENGTH } from '../lib/constants'
import { getErrorMessage } from '../utils/errors'

export function PostDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [content, setContent] = useState('')
  const postQuery = usePost(id, user!.id)
  const commentsQuery = useComments(id)
  const mutation = useCreateComment(id, user!.id)
  const remaining = COMMENT_MAX_LENGTH - content.length

  async function submitComment(event: FormEvent) {
    event.preventDefault()
    if (!content.trim() || remaining < 0) return
    try {
      await mutation.mutateAsync(content)
      setContent('')
      toast.success('Comentário publicado.')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível comentar.'))
    }
  }

  if (postQuery.isLoading) return <main className="page-surface"><PageHeader title="Publicação" back /><PageLoader /></main>
  if (postQuery.isError) return <main className="page-surface"><PageHeader title="Publicação" back /><ErrorState onRetry={() => void postQuery.refetch()} /></main>
  if (!postQuery.data) return <main className="page-surface"><PageHeader title="Publicação" back /><EmptyState title="Publicação não encontrada" description="Ela pode ter sido removida pelo autor." /></main>

  return (
    <main className="page-surface">
      <PageHeader title="Conversa" back />
      <PostCard post={postQuery.data} currentUserId={user!.id} detail />
      <form className="comment-form" onSubmit={submitComment}>
        <label htmlFor="comment">Entre na conversa</label>
        <textarea id="comment" rows={3} value={content} onChange={(event) => setContent(event.target.value)} maxLength={COMMENT_MAX_LENGTH + 1} placeholder="Escreva uma resposta..." />
        <div className="composer-footer">
          <span className={`character-count ${remaining < 30 ? 'warning' : ''} ${remaining < 0 ? 'error' : ''}`}>{remaining}</span>
          <Button type="submit" loading={mutation.isPending} disabled={!content.trim() || remaining < 0}>Comentar <SendHorizontal className="size-4" /></Button>
        </div>
      </form>
      <div className="section-label"><h2>Comentários</h2>{commentsQuery.data && <span>{commentsQuery.data.length}</span>}</div>
      {commentsQuery.isLoading && <FeedSkeleton count={2} />}
      {commentsQuery.isError && <ErrorState onRetry={() => void commentsQuery.refetch()} />}
      {commentsQuery.data?.map((comment) => <CommentCard key={comment.id} comment={comment} currentUserId={user!.id} />)}
      {commentsQuery.data?.length === 0 && <EmptyState icon={MessageCircle} title="Comece a conversa" description="Seja a primeira pessoa a comentar nesta publicação." />}
    </main>
  )
}
