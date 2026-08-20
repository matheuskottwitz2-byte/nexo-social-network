import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createComment, deleteComment, getComments } from '../services/comments'
import { getDashboardStats, getPostsOverTime } from '../services/dashboard'
import {
  createPost,
  deletePost,
  getFeed,
  getPost,
  getPostsByAuthor,
  setPostLiked,
  type CreatePostInput,
  type DeletePostInput,
} from '../services/posts'
import {
  getProfile,
  getProfileById,
  getSuggestedProfiles,
  searchProfiles,
  setFollowing,
  updateProfileWithMedia,
  type ProfileUpdateInput,
} from '../services/profiles'
import type { Post } from '../types/models'

type LikeVariables = { userId: string; postId: string; authorId: string; shouldLike: boolean }
type DeletePostVariables = DeletePostInput & { authorId: string }

function updatePostLike(post: Post, variables: LikeVariables): Post {
  if (post.id !== variables.postId || post.likedByMe === variables.shouldLike) return post
  return {
    ...post,
    likedByMe: variables.shouldLike,
    likeCount: Math.max(0, post.likeCount + (variables.shouldLike ? 1 : -1)),
  }
}

export function useCurrentProfile(userId?: string) {
  return useQuery({
    queryKey: ['current-profile', userId],
    queryFn: () => getProfileById(userId!),
    enabled: Boolean(userId),
  })
}

export function useFeed(userId: string, mode: 'all' | 'following') {
  return useQuery({ queryKey: ['feed', userId, mode], queryFn: () => getFeed(userId, mode) })
}

export function useCreatePost(userId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePostInput) => createPost(userId, input),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['feed', userId] }),
        client.invalidateQueries({ queryKey: ['profile'] }),
        client.invalidateQueries({ queryKey: ['author-posts', userId, userId], exact: true }),
        client.invalidateQueries({ queryKey: ['dashboard', userId], exact: true }),
      ])
    },
  })
}

export function useDeletePost() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ postId, userId }: DeletePostVariables) => deletePost({ postId, userId }),
    onSuccess: async (_result, variables) => {
      client.removeQueries({ queryKey: ['post', variables.postId, variables.userId], exact: true })
      await Promise.all([
        client.invalidateQueries({ queryKey: ['feed', variables.userId] }),
        client.invalidateQueries({ queryKey: ['profile'] }),
        client.invalidateQueries({
          queryKey: ['author-posts', variables.authorId, variables.userId],
          exact: true,
        }),
        client.invalidateQueries({ queryKey: ['dashboard', variables.userId], exact: true }),
      ])
    },
  })
}

export function useToggleLike() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, postId, shouldLike }: LikeVariables) =>
      setPostLiked(userId, postId, shouldLike),
    onMutate: async (variables) => {
      const feedKey = ['feed', variables.userId] as const
      const postKey = ['post', variables.postId, variables.userId] as const
      const authorPostsKey = ['author-posts', variables.authorId, variables.userId] as const
      const dashboardKey = ['dashboard', variables.userId] as const

      await Promise.all([
        client.cancelQueries({ queryKey: feedKey }),
        client.cancelQueries({ queryKey: postKey, exact: true }),
        client.cancelQueries({ queryKey: authorPostsKey, exact: true }),
        client.cancelQueries({ queryKey: dashboardKey, exact: true }),
      ])

      const feedSnapshots = client.getQueriesData<Post[]>({ queryKey: feedKey })
      const postSnapshot = client.getQueryData<Post | null>(postKey)
      const authorPostsSnapshot = client.getQueryData<Post[]>(authorPostsKey)

      for (const [queryKey] of feedSnapshots) {
        client.setQueryData<Post[]>(queryKey, (current) => current?.map((post) => updatePostLike(post, variables)))
      }
      client.setQueryData<Post | null>(postKey, (current) => current ? updatePostLike(current, variables) : current)
      client.setQueryData<Post[]>(authorPostsKey, (current) => current?.map((post) => updatePostLike(post, variables)))

      return { feedSnapshots, postSnapshot, authorPostsSnapshot }
    },
    onError: (_error, variables, context) => {
      if (!context) return
      for (const [queryKey, previous] of context.feedSnapshots) {
        client.setQueryData(queryKey, previous)
      }
      client.setQueryData(['post', variables.postId, variables.userId], context.postSnapshot)
      client.setQueryData(['author-posts', variables.authorId, variables.userId], context.authorPostsSnapshot)
    },
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['feed', variables.userId] }),
        client.invalidateQueries({ queryKey: ['post', variables.postId, variables.userId], exact: true }),
        client.invalidateQueries({ queryKey: ['author-posts', variables.authorId, variables.userId], exact: true }),
        client.invalidateQueries({ queryKey: ['dashboard', variables.userId], exact: true }),
      ])
    },
  })
}

export function useProfile(username: string, viewerId: string) {
  return useQuery({
    queryKey: ['profile', username, viewerId],
    queryFn: () => getProfile(username, viewerId),
    enabled: Boolean(username && viewerId),
  })
}

export function useAuthorPosts(authorId: string | undefined, viewerId: string) {
  return useQuery({
    queryKey: ['author-posts', authorId, viewerId],
    queryFn: () => getPostsByAuthor(authorId!, viewerId),
    enabled: Boolean(authorId),
  })
}

export function useToggleFollow() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ viewerId, profileId, shouldFollow }: { viewerId: string; profileId: string; shouldFollow: boolean }) =>
      setFollowing(viewerId, profileId, shouldFollow),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['profile'] }),
        client.invalidateQueries({ queryKey: ['feed'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
        client.invalidateQueries({ queryKey: ['suggested-profiles'] }),
      ])
    },
  })
}

export function useSearchProfiles(term: string) {
  return useQuery({
    queryKey: ['search-profiles', term],
    queryFn: () => searchProfiles(term),
    enabled: term.trim().length > 0,
  })
}

export function useSuggestedProfiles(userId: string) {
  return useQuery({ queryKey: ['suggested-profiles', userId], queryFn: () => getSuggestedProfiles(userId) })
}

export function usePost(postId: string, viewerId: string) {
  return useQuery({ queryKey: ['post', postId, viewerId], queryFn: () => getPost(postId, viewerId), enabled: Boolean(postId) })
}

export function useComments(postId: string) {
  return useQuery({ queryKey: ['comments', postId], queryFn: () => getComments(postId), enabled: Boolean(postId) })
}

export function useCreateComment(postId: string, userId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => createComment(postId, userId, content),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['comments', postId] }),
        client.invalidateQueries({ queryKey: ['post', postId] }),
        client.invalidateQueries({ queryKey: ['feed'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })
}

export function useDeleteComment(postId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: deleteComment,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['comments', postId] }),
        client.invalidateQueries({ queryKey: ['post', postId] }),
        client.invalidateQueries({ queryKey: ['feed'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })
}

export function useDashboard(userId: string) {
  return useQuery({
    queryKey: ['dashboard', userId],
    queryFn: async () => {
      const [stats, postsOverTime] = await Promise.all([getDashboardStats(), getPostsOverTime()])
      return { stats, postsOverTime }
    },
  })
}

export function useUpdateProfile(userId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (values: ProfileUpdateInput & { previousName: string }) =>
      updateProfileWithMedia(userId, values),
    onSuccess: async (_result, values) => {
      const invalidations = [
        client.invalidateQueries({ queryKey: ['current-profile'] }),
        client.invalidateQueries({ queryKey: ['profile'] }),
      ]
      const socialIdentityChanged = Boolean(
        values.avatarFile ||
        values.removeAvatar ||
        values.name.trim() !== values.previousName.trim(),
      )
      if (socialIdentityChanged) {
        invalidations.push(
          client.invalidateQueries({ queryKey: ['feed'] }),
          client.invalidateQueries({ queryKey: ['post'] }),
          client.invalidateQueries({ queryKey: ['comments'] }),
          client.invalidateQueries({ queryKey: ['author-posts'] }),
          client.invalidateQueries({ queryKey: ['search-profiles'] }),
          client.invalidateQueries({ queryKey: ['suggested-profiles'] }),
        )
      }
      await Promise.all(invalidations)
    },
  })
}
