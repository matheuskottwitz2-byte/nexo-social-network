import { supabase } from '../lib/supabase'
import type { Profile, ProfileSummary } from '../types/models'

type ProfileRow = {
  id: string
  username: string
  name: string
  bio: string
  avatar_url: string | null
  cover_url: string | null
  created_at: string
}

type ProfileMediaKind = 'avatar' | 'cover'

type UploadedMedia = {
  bucket: 'avatars' | 'covers'
  path: string
  publicUrl: string
}

export type ProfileUpdateInput = {
  name: string
  bio: string
  currentAvatarUrl: string | null
  currentCoverUrl: string | null
  avatarFile?: File
  coverFile?: File
  removeAvatar?: boolean
  removeCover?: boolean
}

export type ProfileUpdateResult = {
  cleanupFailed: boolean
}

function toSummary(row: Pick<ProfileRow, 'id' | 'username' | 'name' | 'avatar_url'>): ProfileSummary {
  return { id: row.id, username: row.username, name: row.name, avatarUrl: row.avatar_url }
}

export async function getProfileById(id: string): Promise<ProfileSummary> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, avatar_url')
    .eq('id', id)
    .single()
  if (error) throw error
  return toSummary(data)
}

export async function getProfile(username: string, viewerId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, bio, avatar_url, cover_url, created_at')
    .eq('username', username.toLowerCase())
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const [followers, following, posts, followed] = await Promise.all([
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', data.id),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', data.id),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', data.id),
    viewerId === data.id
      ? Promise.resolve({ data: null, error: null })
      : supabase.from('follows').select('follower_id').eq('follower_id', viewerId).eq('following_id', data.id).maybeSingle(),
  ])

  const countError = followers.error || following.error || posts.error || followed.error
  if (countError) throw countError

  return {
    ...toSummary(data),
    bio: data.bio,
    coverUrl: data.cover_url,
    createdAt: data.created_at,
    followersCount: followers.count ?? 0,
    followingCount: following.count ?? 0,
    postsCount: posts.count ?? 0,
    followedByMe: Boolean(followed.data),
  }
}

export async function searchProfiles(term: string): Promise<ProfileSummary[]> {
  const safeTerm = term.trim().replace(/[^\p{L}\p{N}\s_]/gu, '')
  if (!safeTerm) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, avatar_url')
    .or(`username.ilike.%${safeTerm}%,name.ilike.%${safeTerm}%`)
    .order('name')
    .limit(20)
  if (error) throw error
  return data.map(toSummary)
}

export async function getSuggestedProfiles(viewerId: string): Promise<ProfileSummary[]> {
  const [profiles, follows] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, name, avatar_url')
      .neq('id', viewerId)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase.from('follows').select('following_id').eq('follower_id', viewerId),
  ])
  const error = profiles.error || follows.error
  if (error) throw error
  const followedIds = new Set(follows.data.map((follow) => follow.following_id))
  return profiles.data.filter((profile) => !followedIds.has(profile.id)).slice(0, 4).map(toSummary)
}

export async function setFollowing(viewerId: string, profileId: string, shouldFollow: boolean): Promise<void> {
  if (viewerId === profileId) throw new Error('Você não pode seguir a si mesmo.')
  const result = shouldFollow
    ? await supabase.from('follows').insert({ follower_id: viewerId, following_id: profileId })
    : await supabase.from('follows').delete().eq('follower_id', viewerId).eq('following_id', profileId)
  if (result.error) throw result.error
}

export async function updateProfile(
  userId: string,
  values: { name: string; bio: string; avatarUrl?: string | null; coverUrl?: string | null },
): Promise<void> {
  const payload: { name: string; bio: string; avatar_url?: string | null; cover_url?: string | null } = {
    name: values.name.trim(),
    bio: values.bio.trim(),
  }
  if (values.avatarUrl !== undefined) payload.avatar_url = values.avatarUrl
  if (values.coverUrl !== undefined) payload.cover_url = values.coverUrl
  const { error } = await supabase.from('profiles').update(payload).eq('id', userId)
  if (error) throw error
}

function fileExtension(file: File, kind: ProfileMediaKind): string {
  const extensionByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  }
  return extensionByMime[file.type.toLowerCase()] || (kind === 'cover' ? 'webp' : 'jpg')
}

async function uploadProfileMedia(userId: string, file: File, kind: ProfileMediaKind): Promise<UploadedMedia> {
  const bucket = kind === 'avatar' ? 'avatars' : 'covers'
  const safeId = crypto.randomUUID().slice(0, 8)
  const path = `${userId}/${kind}-${Date.now()}-${safeId}.${fileExtension(file, kind)}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type.toLowerCase(),
    upsert: false,
  })
  if (error) throw error
  return {
    bucket,
    path,
    publicUrl: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl,
  }
}

function ownedStoragePath(publicUrl: string, bucket: 'avatars' | 'covers', userId: string): string | null {
  try {
    const url = new URL(publicUrl)
    const configuredUrl = import.meta.env.VITE_SUPABASE_URL
    if (!configuredUrl) return null
    const supabaseOrigin = new URL(configuredUrl).origin
    const marker = `/storage/v1/object/public/${bucket}/`
    if (url.origin !== supabaseOrigin || !url.pathname.startsWith(marker)) return null
    const path = decodeURIComponent(url.pathname.slice(marker.length))
    const parts = path.split('/')
    return parts.length === 2 && parts[0] === userId && Boolean(parts[1]) ? path : null
  } catch {
    return null
  }
}

async function removeUploadedMedia(media: Pick<UploadedMedia, 'bucket' | 'path'>): Promise<boolean> {
  const { error } = await supabase.storage.from(media.bucket).remove([media.path])
  return !error
}

async function removePreviousMedia(
  publicUrl: string | null,
  bucket: 'avatars' | 'covers',
  userId: string,
): Promise<boolean> {
  if (!publicUrl) return true
  const path = ownedStoragePath(publicUrl, bucket, userId)
  if (!path) return true
  return removeUploadedMedia({ bucket, path })
}

export async function updateProfileWithMedia(userId: string, values: ProfileUpdateInput): Promise<ProfileUpdateResult> {
  const uploaded: UploadedMedia[] = []
  let avatar: UploadedMedia | undefined
  let cover: UploadedMedia | undefined

  try {
    if (values.avatarFile) {
      avatar = await uploadProfileMedia(userId, values.avatarFile, 'avatar')
      uploaded.push(avatar)
    }
    if (values.coverFile) {
      cover = await uploadProfileMedia(userId, values.coverFile, 'cover')
      uploaded.push(cover)
    }

    await updateProfile(userId, {
      name: values.name,
      bio: values.bio,
      avatarUrl: avatar?.publicUrl ?? (values.removeAvatar ? null : undefined),
      coverUrl: cover?.publicUrl ?? (values.removeCover ? null : undefined),
    })
  } catch (error) {
    const cleanup = await Promise.allSettled(uploaded.map(removeUploadedMedia))
    if (cleanup.some((result) => result.status === 'rejected' || !result.value)) {
      console.warn('Não foi possível remover uma mídia nova após a falha de atualização.')
    }
    throw error
  }

  const cleanupTasks: Promise<boolean>[] = []
  if (avatar || values.removeAvatar) {
    cleanupTasks.push(removePreviousMedia(values.currentAvatarUrl, 'avatars', userId))
  }
  if (cover || values.removeCover) {
    cleanupTasks.push(removePreviousMedia(values.currentCoverUrl, 'covers', userId))
  }

  const cleanup = await Promise.allSettled(cleanupTasks)
  const cleanupFailed = cleanup.some((result) => result.status === 'rejected' || !result.value)
  if (cleanupFailed) {
    console.warn('O perfil foi atualizado, mas uma mídia anterior não pôde ser removida do Storage.')
  }
  return { cleanupFailed }
}
