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

export interface Post {
  id: string
  authorId: string
  content: string
  imageUrl: string | null
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
