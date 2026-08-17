import { supabase } from '../lib/supabase'
import type { Profile, ProfileSummary } from '../types/models'

type ProfileRow = {
  id: string
  username: string
  name: string
  bio: string
  avatar_url: string | null
  created_at: string
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
    .select('id, username, name, bio, avatar_url, created_at')
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
  values: { name: string; bio: string; avatarUrl?: string | null },
): Promise<void> {
  const payload: { name: string; bio: string; avatar_url?: string | null } = {
    name: values.name.trim(),
    bio: values.bio.trim(),
  }
  if (values.avatarUrl !== undefined) payload.avatar_url = values.avatarUrl
  const { error } = await supabase.from('profiles').update(payload).eq('id', userId)
  if (error) throw error
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const extensionByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  }
  const extension = extensionByMime[file.type] || 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${extension}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}
