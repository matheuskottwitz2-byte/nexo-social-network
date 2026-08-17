import { Heart, MessageCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useDeletePost, useToggleLike } from '../../hooks/useNexoQueries'
import type { Post } from '../../types/models'
import { getErrorMessage } from '../../utils/errors'
import { compactNumber, formatFullDate, formatRelativeDate } from '../../utils/format'
import { Avatar } from '../ui/Avatar'
import { ConfirmDialog } from '../ui/ConfirmDialog'

interface PostCardProps {
  post: Post
  currentUserId: string
  detail?: boolean
}

export function PostCard({ post, currentUserId, detail = false }: PostCardProps) {
  const navigate = useNavigate()
  const likeMutation = useToggleLike()
  const deleteMutation = useDeletePost()
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleLike() {
    if (likeMutation.isPending) return
    try {
      await likeMutation.mutateAsync({ userId: currentUserId, postId: post.id, authorId: post.authorId, shouldLike: !post.likedByMe })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível atualizar a curtida.'))
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(post.id)
      setConfirmOpen(false)
      toast.success('Publicação excluída.')
      if (detail) navigate('/')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível excluir a publicação.'))
    }
  }

  return (
    <article className={`post-card ${detail ? 'post-detail' : ''}`}>
      <Link to={`/@${post.author.username}`} aria-label={`Perfil de ${post.author.name}`}>
        <Avatar name={post.author.name} src={post.author.avatarUrl} />
      </Link>
      <div className="post-content">
        <header className="post-header">
          <div className="post-author-line">
            <Link to={`/@${post.author.username}`} className="author-name">{post.author.name}</Link>
            <Link to={`/@${post.author.username}`} className="author-handle">@{post.author.username}</Link>
            <span aria-hidden="true">·</span>
            <Link to={`/post/${post.id}`} className="post-time" title={formatFullDate(post.createdAt)}>
              {formatRelativeDate(post.createdAt)}
            </Link>
          </div>
          {post.authorId === currentUserId && (
            <button className="icon-button" aria-label="Excluir publicação" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="size-4" />
            </button>
          )}
        </header>
        {detail ? (
          <p className="post-text detail-text">{post.content}</p>
        ) : (
          <Link to={`/post/${post.id}`} className="post-body-link">
            <p className="post-text">{post.content}</p>
          </Link>
        )}
        {post.imageUrl && <img className="post-image" src={post.imageUrl} alt="Imagem anexada à publicação" />}
        <footer className="post-actions">
          <button className={`post-action ${post.likedByMe ? 'liked' : ''}`} onClick={handleLike} disabled={likeMutation.isPending} aria-label={post.likedByMe ? 'Remover curtida' : 'Curtir'} aria-pressed={post.likedByMe}>
            <Heart className="size-5" fill={post.likedByMe ? 'currentColor' : 'none'} />
            <span>{compactNumber(post.likeCount)}</span>
          </button>
          <Link className="post-action" to={`/post/${post.id}`} aria-label={`${post.commentCount} comentários`}>
            <MessageCircle className="size-5" />
            <span>{compactNumber(post.commentCount)}</span>
          </Link>
        </footer>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Excluir publicação?"
        description="Essa ação é permanente e a publicação, suas curtidas e comentários serão removidos."
        loading={deleteMutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
      />
    </article>
  )
}
