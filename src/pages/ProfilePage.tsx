import { CalendarDays, Edit3, UserCheck, UserPlus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '../components/layout/PageHeader'
import { PostCard } from '../components/social/PostCard'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, FeedSkeleton, PageLoader } from '../components/ui/Status'
import { useAuth } from '../contexts/AuthContext'
import { useAuthorPosts, useProfile, useToggleFollow } from '../hooks/useNexoQueries'
import { getErrorMessage } from '../utils/errors'
import { compactNumber } from '../utils/format'

function joinDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(value))
}

export function ProfilePage() {
  const { handle = '' } = useParams<{ handle: string }>()
  const username = handle.replace(/^@/, '')
  const { user } = useAuth()
  const profileQuery = useProfile(username, user!.id)
  const profile = profileQuery.data
  const postsQuery = useAuthorPosts(profile?.id, user!.id)
  const followMutation = useToggleFollow()

  async function handleFollow() {
    if (!profile) return
    try {
      await followMutation.mutateAsync({ viewerId: user!.id, profileId: profile.id, shouldFollow: !profile.followedByMe })
      toast.success(profile.followedByMe ? `Você deixou de seguir @${profile.username}.` : `Agora você segue @${profile.username}.`)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível atualizar essa conexão.'))
    }
  }

  if (profileQuery.isLoading) return <main className="page-surface"><PageLoader label="Carregando perfil" /></main>
  if (profileQuery.isError) return <main className="page-surface"><ErrorState onRetry={() => void profileQuery.refetch()} /></main>
  if (!profile) return <main className="page-surface"><PageHeader title="Perfil" back /><EmptyState title="Pessoa não encontrada" description="Este nome de usuário não existe ou foi alterado." /></main>

  const isOwnProfile = profile.id === user!.id

  return (
    <main className="page-surface">
      <PageHeader title={profile.name} subtitle={`${profile.postsCount} ${profile.postsCount === 1 ? 'publicação' : 'publicações'}`} back />
      <section className="profile-hero">
        <div className={`profile-cover ${profile.coverUrl ? 'has-image' : ''}`} aria-hidden="true">
          {profile.coverUrl ? (
            <img className="profile-cover-image" src={profile.coverUrl} alt="" />
          ) : (
            <><span /><span /><span /></>
          )}
        </div>
        <div className="profile-avatar-row">
          <Avatar name={profile.name} src={profile.avatarUrl} size="xl" />
          {isOwnProfile ? (
            <Link className="button button-secondary" to="/settings/profile"><Edit3 className="size-4" /> Editar perfil</Link>
          ) : (
            <Button variant={profile.followedByMe ? 'secondary' : 'primary'} loading={followMutation.isPending} onClick={handleFollow}>
              {profile.followedByMe ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
              {profile.followedByMe ? 'Seguindo' : 'Seguir'}
            </Button>
          )}
        </div>
        <div className="profile-info">
          <h1>{profile.name}</h1>
          <span>@{profile.username}</span>
          <p>{profile.bio || (isOwnProfile ? 'Conte um pouco sobre você no seu perfil.' : 'Esta pessoa ainda não escreveu uma bio.')}</p>
          <small><CalendarDays className="size-4" /> No Nexo desde {joinDate(profile.createdAt)}</small>
          <div className="profile-stats">
            <span><strong>{compactNumber(profile.followingCount)}</strong> Seguindo</span>
            <span><strong>{compactNumber(profile.followersCount)}</strong> Seguidores</span>
          </div>
        </div>
      </section>
      <div className="section-label"><h2>Publicações</h2></div>
      {postsQuery.isLoading && <FeedSkeleton />}
      {postsQuery.isError && <ErrorState onRetry={() => void postsQuery.refetch()} />}
      {postsQuery.data?.map((post) => <PostCard key={post.id} post={post} currentUserId={user!.id} />)}
      {postsQuery.data?.length === 0 && <EmptyState title="Ainda sem publicações" description={isOwnProfile ? 'Você ainda não publicou nada.' : `${profile.name} ainda não publicou nada.`} />}
    </main>
  )
}
