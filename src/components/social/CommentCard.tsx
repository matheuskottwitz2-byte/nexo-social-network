import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useDeleteComment } from '../../hooks/useNexoQueries'
import type { Comment } from '../../types/models'
import { getErrorMessage } from '../../utils/errors'
import { formatRelativeDate } from '../../utils/format'
import { Avatar } from '../ui/Avatar'
import { ConfirmDialog } from '../ui/ConfirmDialog'

export function CommentCard({ comment, currentUserId }: { comment: Comment; currentUserId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const mutation = useDeleteComment(comment.postId)

  async function handleDelete() {
    try {
      await mutation.mutateAsync(comment.id)
      setConfirmOpen(false)
      toast.success('Comentário excluído.')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível excluir o comentário.'))
    }
  }

  return (
    <article className="comment-card">
      <Link to={`/@${comment.author.username}`}><Avatar name={comment.author.name} src={comment.author.avatarUrl} size="sm" /></Link>
      <div className="min-w-0 flex-1">
        <header className="post-header">
          <div className="post-author-line">
            <Link to={`/@${comment.author.username}`} className="author-name">{comment.author.name}</Link>
            <span className="author-handle">@{comment.author.username}</span>
            <span aria-hidden="true">·</span>
            <span className="post-time">{formatRelativeDate(comment.createdAt)}</span>
          </div>
          {comment.authorId === currentUserId && (
            <button className="icon-button" onClick={() => setConfirmOpen(true)} aria-label="Excluir comentário"><Trash2 className="size-4" /></button>
          )}
        </header>
        <p className="comment-text">{comment.content}</p>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Excluir comentário?"
        description="Essa ação não poderá ser desfeita."
        loading={mutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
      />
    </article>
  )
}
