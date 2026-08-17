import { supabase } from '../lib/supabase'
import type { DashboardStats, PostsByDay } from '../types/models'

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats')
  if (error) throw error
  const row = data[0]
  return {
    postsCount: row?.posts_count ?? 0,
    likesReceived: row?.likes_received ?? 0,
    commentsReceived: row?.comments_received ?? 0,
    followersCount: row?.followers_count ?? 0,
    followingCount: row?.following_count ?? 0,
    engagementLast30Days: row?.engagement_last_30_days ?? 0,
  }
}

export async function getPostsOverTime(): Promise<PostsByDay[]> {
  const { data, error } = await supabase.rpc('get_posts_over_time', { days_back: 30 })
  if (error) throw error
  return data.map((row) => ({ day: row.day, posts: row.posts }))
}
