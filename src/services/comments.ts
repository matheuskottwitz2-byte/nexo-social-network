import { supabase } from '../lib/supabase'
import type { Comment, ProfileSummary } from '../types/models'

type RawComment = {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
  author: { id: string; username: string; name: string; avatar_url: string | null } | { id: string; username: string; name: string; avatar_url: string | null }[] | null
}

export async function getComments(postId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, post_id, author_id, content, created_at, author:profiles!comments_author_id_fkey(id, username, name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at')
  if (error) throw error
  return (data as unknown as RawComment[]).map((row) => {
    const rawAuthor = Array.isArray(row.author) ? row.author[0] : row.author
    if (!rawAuthor) throw new Error('Autor do comentário não encontrado.')
    const author: ProfileSummary = {
      id: rawAuthor.id,
      username: rawAuthor.username,
      name: rawAuthor.name,
      avatarUrl: rawAuthor.avatar_url,
    }
    return { id: row.id, postId: row.post_id, authorId: row.author_id, content: row.content, createdAt: row.created_at, author }
  })
}

export async function createComment(postId: string, authorId: string, content: string): Promise<void> {
  const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: authorId, content: content.trim() })
  if (error) throw error
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', commentId)
  if (error) throw error
}
