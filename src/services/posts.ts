import {
  POST_MAX_LENGTH,
  POST_MEDIA_ALT_MAX_LENGTH,
  POST_MEDIA_MAX_ITEMS,
} from '../lib/constants'
import { supabase } from '../lib/supabase'
import type { Json } from '../types/database'
import type { Post, PostMedia, ProfileSummary } from '../types/models'
import { validatePostImageFile } from '../utils/imageProcessing'

const POST_MEDIA_BUCKET = 'post-media'

type RawAuthor = { id: string; username: string; name: string; avatar_url: string | null }
type RawPostMedia = {
  id: string
  media_type: 'image'
  storage_path: string
  mime_type: string
  width: number
  height: number
  position: number
  alt_text: string | null
}
type RawPost = {
  id: string
  author_id: string
  content: string
  image_url: string | null
  created_at: string
  author: RawAuthor | RawAuthor[] | null
  media: RawPostMedia[] | null
  likes: { user_id: string }[] | null
  comments: { id: string }[] | null
}

export interface CreatePostMediaInput {
  file: File
  width: number
  height: number
  altText: string | null
}

export interface CreatePostInput {
  content: string
  media: CreatePostMediaInput[]
}

export interface DeletePostInput {
  postId: string
  userId: string
}

export interface DeletePostResult {
  cleanupFailed: boolean
}

type UploadedPostMedia = {
  path: string
  mimeType: string
  width: number
  height: number
  position: number
  altText: string | null
}

const postSelect = `
  id, author_id, content, image_url, created_at,
  author:profiles!posts_author_id_fkey(id, username, name, avatar_url),
  media:post_media(id, media_type, storage_path, mime_type, width, height, position, alt_text),
  likes(user_id), comments(id)
`

function mapAuthor(value: RawPost['author']): ProfileSummary {
  const author = Array.isArray(value) ? value[0] : value
  if (!author) throw new Error('Autor do post não encontrado.')
  return { id: author.id, username: author.username, name: author.name, avatarUrl: author.avatar_url }
}

function publicPostMediaUrl(path: string) {
  return supabase.storage.from(POST_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
}

function mapMedia(row: RawPost): PostMedia[] {
  const media = [...(row.media ?? [])]
    .sort((left, right) => left.position - right.position)
    .slice(0, POST_MEDIA_MAX_ITEMS)
    .map<PostMedia>((item) => ({
      id: item.id,
      mediaType: item.media_type,
      storagePath: item.storage_path,
      url: publicPostMediaUrl(item.storage_path),
      mimeType: item.mime_type,
      width: item.width,
      height: item.height,
      position: item.position,
      altText: item.alt_text,
    }))

  if (media.length > 0 || !row.image_url) return media

  // Read-only compatibility for posts created before post_media existed.
  return [{
    id: `legacy-${row.id}`,
    mediaType: 'image',
    storagePath: null,
    url: row.image_url,
    mimeType: null,
    width: null,
    height: null,
    position: 0,
    altText: null,
  }]
}

function mapPost(row: RawPost, viewerId: string): Post {
  return {
    id: row.id,
    authorId: row.author_id,
    content: row.content,
    media: mapMedia(row),
    createdAt: row.created_at,
    author: mapAuthor(row.author),
    likeCount: row.likes?.length ?? 0,
    commentCount: row.comments?.length ?? 0,
    likedByMe: row.likes?.some((like) => like.user_id === viewerId) ?? false,
  }
}

function postMediaExtension(mimeType: string) {
  const extensionByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
  }
  const extension = extensionByMime[mimeType]
  if (!extension) throw new Error('Formato de imagem não permitido em publicações.')
  return extension
}

function normalizeAltText(value: string | null) {
  const normalized = value?.trim() || null
  if (normalized && normalized.length > POST_MEDIA_ALT_MAX_LENGTH) {
    throw new Error(`A descrição da imagem pode ter no máximo ${POST_MEDIA_ALT_MAX_LENGTH} caracteres.`)
  }
  return normalized
}

function isOwnedPostMediaPath(path: string, userId: string, postId: string) {
  const parts = path.split('/')
  return parts.length === 3 && parts[0] === userId && parts[1] === postId && Boolean(parts[2])
}

async function removePostMedia(paths: readonly string[]) {
  if (paths.length === 0) return true
  const uniquePaths = [...new Set(paths)]
  const bucket = supabase.storage.from(POST_MEDIA_BUCKET)

  try {
    await bucket.remove(uniquePaths)

    const verification = await Promise.all(uniquePaths.map(async (path) => {
      const { data: exists } = await bucket.exists(path)
      return !exists
    }))

    return verification.every(Boolean)
  } catch {
    return false
  }
}

function cleanupError(original: unknown) {
  const detail = original instanceof Error ? original.message : 'Falha desconhecida.'
  return new Error(
    `Não foi possível concluir a publicação e alguns arquivos temporários podem precisar de limpeza. ${detail}`,
    { cause: original },
  )
}

function samePaths(actual: readonly string[], expected: readonly string[]) {
  if (actual.length !== expected.length) return false
  const orderedActual = [...actual].sort()
  const orderedExpected = [...expected].sort()
  return orderedActual.every((path, index) => path === orderedExpected[index])
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

export async function createPost(authorId: string, input: CreatePostInput): Promise<string> {
  const content = input.content.trim()
  if (!content && input.media.length === 0) throw new Error('Adicione texto ou pelo menos uma imagem.')
  if (content.length > POST_MAX_LENGTH) {
    throw new Error(`A publicação pode ter no máximo ${POST_MAX_LENGTH} caracteres.`)
  }
  if (input.media.length > POST_MEDIA_MAX_ITEMS) {
    throw new Error(`Você pode adicionar até ${POST_MEDIA_MAX_ITEMS} imagens por publicação.`)
  }

  const normalizedMedia = input.media.map((item) => {
    const validationError = validatePostImageFile(item.file)
    if (validationError) throw new Error(validationError)
    if (
      !Number.isInteger(item.width) ||
      item.width <= 0 ||
      item.width > 32768 ||
      !Number.isInteger(item.height) ||
      item.height <= 0 ||
      item.height > 32768
    ) {
      throw new Error('Uma das imagens não possui dimensões válidas.')
    }
    return { ...item, altText: normalizeAltText(item.altText) }
  })

  const postId = crypto.randomUUID()
  const uploaded: UploadedPostMedia[] = []
  const attemptedPaths: string[] = []

  try {
    for (const [position, item] of normalizedMedia.entries()) {
      const mimeType = item.file.type.toLowerCase()
      const filename = `${crypto.randomUUID()}.${postMediaExtension(mimeType)}`
      const path = `${authorId}/${postId}/${filename}`
      attemptedPaths.push(path)
      const { error } = await supabase.storage.from(POST_MEDIA_BUCKET).upload(path, item.file, {
        cacheControl: '31536000',
        contentType: mimeType,
        upsert: false,
      })
      if (error) throw error
      uploaded.push({
        path,
        mimeType,
        width: item.width,
        height: item.height,
        position,
        altText: item.altText,
      })
    }
  } catch (error) {
    const cleanupSucceeded = await removePostMedia(attemptedPaths)
    if (!cleanupSucceeded) throw cleanupError(error)
    throw error
  }

  const mediaPayload: Json = uploaded.map((item) => ({
    storage_path: item.path,
    mime_type: item.mimeType,
    width: item.width,
    height: item.height,
    position: item.position,
    alt_text: item.altText,
  }))
  let data: string | null = null
  let error: unknown = null
  try {
    const result = await supabase.rpc('create_post_with_media', {
      p_post_id: postId,
      p_content: content,
      p_media: mediaPayload,
    })
    data = result.data
    error = result.error
  } catch (requestError) {
    error = requestError
  }

  if (!error && data === postId) return postId

  const verification = await supabase
    .from('posts')
    .select('id, author_id, content, media:post_media(storage_path)')
    .eq('id', postId)
    .eq('author_id', authorId)
    .maybeSingle()

  if (verification.error) {
    throw new Error(
      'Não foi possível confirmar se a publicação foi criada. Recarregue o feed antes de tentar novamente.',
      { cause: error ?? verification.error },
    )
  }
  if (verification.data) {
    const verifiedMedia = (verification.data.media ?? []) as unknown as { storage_path: string }[]
    const creationWasCommitted =
      verification.data.content === content &&
      samePaths(verifiedMedia.map((item) => item.storage_path), attemptedPaths)
    if (creationWasCommitted) return postId
  }

  const cleanupSucceeded = await removePostMedia(attemptedPaths)
  if (!cleanupSucceeded) throw cleanupError(error)
  throw error ?? new Error('O banco não confirmou a criação da publicação.')
}

export async function deletePost({ postId, userId }: DeletePostInput): Promise<DeletePostResult> {
  const { data: post, error: readError } = await supabase
    .from('posts')
    .select('author_id, media:post_media(storage_path)')
    .eq('id', postId)
    .maybeSingle()
  if (readError) throw readError
  if (!post || post.author_id !== userId) throw new Error('Publicação não encontrada ou sem permissão para excluir.')

  const mediaRows = (post.media ?? []) as unknown as { storage_path: string }[]
  const paths = mediaRows
    .map((item) => item.storage_path)
    .filter((path) => isOwnedPostMediaPath(path, userId, postId))

  const deletion = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('author_id', userId)
    .select('id')

  if (deletion.error || (deletion.data?.length ?? 0) === 0) {
    const verification = await supabase.from('posts').select('id').eq('id', postId).maybeSingle()
    if (verification.error || verification.data) {
      throw deletion.error ?? new Error('A publicação não foi excluída.')
    }
  }

  const cleanupFailed = !(await removePostMedia(paths))
  if (cleanupFailed) {
    console.warn('A publicação foi excluída, mas parte da mídia não pôde ser removida do Storage.')
  }
  return { cleanupFailed }
}

export async function setPostLiked(userId: string, postId: string, shouldLike: boolean): Promise<void> {
  const result = shouldLike
    ? await supabase.from('likes').insert({ user_id: userId, post_id: postId })
    : await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId)
  if (result.error) throw result.error
}
