import { supabase } from '../lib/supabase'
import type { Post, ProfileSummary } from '../types/models'

type RawAuthor = { id: string; username: string; name: string; avatar_url: string | null }
type RawPost = {
  id: string
  author_id: string
  content: string
  image_url: string | null
  created_at: string
  author: RawAuthor | RawAuthor[] | null
  likes: { user_id: string }[] | null
  comments: { id: string }[] | null
}

const postSelect = `
  id, author_id, content, image_url, created_at,
  author:profiles!posts_author_id_fkey(id, username, name, avatar_url),
  likes(user_id), comments(id)
`

function mapAuthor(value: RawPost['author']): ProfileSummary {
  const author = Array.isArray(value) ? value[0] : value
  if (!author) throw new Error('Autor do post não encontrado.')
  return { id: author.id, username: author.username, name: author.name, avatarUrl: author.avatar_url }
}

function mapPost(row: RawPost, viewerId: string): Post {
  return {
    id: row.id,
    authorId: row.author_id,
    content: row.content,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    author: mapAuthor(row.author),
    likeCount: row.likes?.length ?? 0,
    commentCount: row.comments?.length ?? 0,
    likedByMe: row.likes?.some((like) => like.user_id === viewerId) ?? false,
  }
}

export async function getFeed(viewerId: string, mode: 'all' | 'following'): Promise<Post[]> {
  let followedIds: string[] | null = null
  if (mode === 'following') {
    const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', viewerId)
    if (error) throw error
    followedIds = data.map((follow) => follow.following_id)
    if (followedIds.length === 0) return []
  }

  let query = supabase.from('posts').select(postSelect).order('created_at', { ascending: false }).limit(50)
  if (followedIds) query = query.in('author_id', followedIds)
  const { data, error } = await query
  if (error) throw error
  return (data as unknown as RawPost[]).map((row) => mapPost(row, viewerId))
}

export async function getPostsByAuthor(authorId: string, viewerId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(postSelect)
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as RawPost[]).map((row) => mapPost(row, viewerId))
}

export async function getPost(postId: string, viewerId: string): Promise<Post | null> {
  const { data, error } = await supabase.from('posts').select(postSelect).eq('id', postId).maybeSingle()
  if (error) throw error
  return data ? mapPost(data as unknown as RawPost, viewerId) : null
}

export async function createPost(authorId: string, content: string): Promise<void> {
  const { error } = await supabase.from('posts').insert({ author_id: authorId, content: content.trim() })
  if (error) throw error
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) throw error
}

export async function setPostLiked(userId: string, postId: string, shouldLike: boolean): Promise<void> {
  const result = shouldLike
    ? await supabase.from('likes').insert({ user_id: userId, post_id: postId })
    : await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId)
  if (result.error) throw result.error
}
