import { Sparkles, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { PostComposer } from '../components/social/PostComposer'
import { PostCard } from '../components/social/PostCard'
import { PageHeader } from '../components/layout/PageHeader'
import { EmptyState, ErrorState, FeedSkeleton } from '../components/ui/Status'
import { useAuth } from '../contexts/AuthContext'
import { useCurrentProfile, useFeed } from '../hooks/useNexoQueries'

export function FeedPage() {
  const { user } = useAuth()
  const [mode, setMode] = useState<'all' | 'following'>('all')
  const profileQuery = useCurrentProfile(user!.id)
  const feedQuery = useFeed(user!.id, mode)

  return (
    <main className="page-surface">
      <PageHeader title="Seu Nexo" subtitle="Conversas e ideias em movimento" />
      <div className="feed-tabs" role="tablist" aria-label="Tipo de feed">
        <button role="tab" aria-selected={mode === 'all'} className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}><Sparkles /> Para você</button>
        <button role="tab" aria-selected={mode === 'following'} className={mode === 'following' ? 'active' : ''} onClick={() => setMode('following')}><UsersRound /> Seguindo</button>
      </div>
      <div id="composer"><PostComposer userId={user!.id} profile={profileQuery.data} /></div>
      <section aria-label="Publicações do feed">
        {feedQuery.isLoading && <FeedSkeleton />}
        {feedQuery.isError && <ErrorState message="Não conseguimos buscar as publicações." onRetry={() => void feedQuery.refetch()} />}
        {feedQuery.data?.map((post) => <PostCard key={post.id} post={post} currentUserId={user!.id} />)}
        {feedQuery.data?.length === 0 && (
          <EmptyState
            icon={mode === 'following' ? UsersRound : Sparkles}
            title={mode === 'following' ? 'Seu feed está pronto para crescer' : 'Seja a primeira voz por aqui'}
            description={mode === 'following' ? 'Siga pessoas na busca e as publicações delas aparecerão aqui.' : 'Crie uma publicação para iniciar a conversa.'}
          />
        )}
      </section>
    </main>
  )
}
