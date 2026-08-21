export interface ProfileSummary {
  id: string
  username: string
  name: string
  avatarUrl: string | null
}

export interface Profile extends ProfileSummary {
  bio: string
  coverUrl: string | null
  createdAt: string
  followersCount: number
  followingCount: number
  postsCount: number
  followedByMe: boolean
}

export interface PostMedia {
  id: string
  mediaType: 'image'
  storagePath: string | null
  url: string
  mimeType: string | null
  width: number | null
  height: number | null
  position: number
  altText: string | null
}

export type PollDurationMinutes = 60 | 360 | 1440 | 4320 | 10080

export interface CreatePollInput {
  question: string
  options: string[]
  durationMinutes: PollDurationMinutes
}

export interface PollOption {
  id: string
  text: string
  position: number
  voteCount: number
}

export interface PostPoll {
  id: string
  postId: string
  question: string
  expiresAt: string
  totalVotes: number
  viewerOptionId: string | null
  options: PollOption[]
}

export interface Post {
  id: string
  authorId: string
  content: string
  media: PostMedia[]
  poll: PostPoll | null
  createdAt: string
  author: ProfileSummary
  likeCount: number
  commentCount: number
  likedByMe: boolean
}

export interface Comment {
  id: string
  postId: string
  authorId: string
  content: string
  createdAt: string
  author: ProfileSummary
}

export interface DashboardStats {
  postsCount: number
  likesReceived: number
  commentsReceived: number
  followersCount: number
  followingCount: number
  engagementLast30Days: number
}

export interface PostsByDay {
  day: string
  posts: number
}
