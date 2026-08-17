import { BarChart3, Heart, MessageCircle, PenLine, TrendingUp, UserPlus, UsersRound } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '../components/layout/PageHeader'
import { EmptyState, ErrorState, PageLoader } from '../components/ui/Status'
import { useAuth } from '../contexts/AuthContext'
import { useDashboard } from '../hooks/useNexoQueries'
import { compactNumber } from '../utils/format'

const statConfig = [
  { key: 'postsCount', label: 'Publicações', icon: PenLine, tone: 'purple' },
  { key: 'likesReceived', label: 'Curtidas recebidas', icon: Heart, tone: 'rose' },
  { key: 'commentsReceived', label: 'Comentários', icon: MessageCircle, tone: 'blue' },
  { key: 'followersCount', label: 'Seguidores', icon: UserPlus, tone: 'amber' },
  { key: 'followingCount', label: 'Seguindo', icon: UsersRound, tone: 'green' },
] as const

function chartDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`))
}

export function DashboardPage() {
  const { user } = useAuth()
  const dashboard = useDashboard(user!.id)
  if (dashboard.isLoading) return <main className="page-surface"><PageHeader title="Dashboard" /><PageLoader label="Calculando seus dados" /></main>
  if (dashboard.isError) return <main className="page-surface"><PageHeader title="Dashboard" /><ErrorState message="Não foi possível calcular suas métricas." onRetry={() => void dashboard.refetch()} /></main>

  const { stats, postsOverTime } = dashboard.data!
  const hasActivity = postsOverTime.some((point) => point.posts > 0)
  const recentInteractions = stats.engagementLast30Days

  return (
    <main className="page-surface dashboard-page">
      <PageHeader title="Dashboard" subtitle="Um retrato real da sua presença no Nexo" />
      <section className="dashboard-intro">
        <div><span className="eyebrow"><TrendingUp className="size-4" /> Sua atividade</span><h2>Continue criando conexões.</h2><p>Todos os números abaixo são calculados diretamente a partir das suas publicações e relações.</p></div>
        <div className="engagement-chip"><strong>{compactNumber(recentInteractions)}</strong><span>interações nos últimos 30 dias</span></div>
      </section>
      <section className="stats-grid" aria-label="Resumo da conta">
        {statConfig.map(({ key, label, icon: Icon, tone }) => (
          <article className="stat-card" key={key}>
            <span className={`stat-icon ${tone}`}><Icon aria-hidden="true" /></span>
            <div><strong>{compactNumber(stats[key])}</strong><span>{label}</span></div>
          </article>
        ))}
      </section>
      <section className="chart-card">
        <header><div><span className="eyebrow">Últimos 30 dias</span><h2>Ritmo de publicações</h2></div><BarChart3 aria-hidden="true" /></header>
        {hasActivity ? (
          <div className="chart-container" role="img" aria-label="Gráfico de publicações nos últimos 30 dias">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={postsOverTime} margin={{ top: 12, right: 8, left: -24, bottom: 0 }}>
                <defs><linearGradient id="postsGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7657ff" stopOpacity={0.36} /><stop offset="100%" stopColor="#7657ff" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tickFormatter={chartDate} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={26} />
                <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(value) => chartDate(String(value))} formatter={(value) => [Number(value), 'Publicações']} contentStyle={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text)' }} />
                <Area type="monotone" dataKey="posts" stroke="#7657ff" strokeWidth={3} fill="url(#postsGradient)" activeDot={{ r: 5, fill: '#7657ff', stroke: 'var(--surface)', strokeWidth: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon={BarChart3} title="Seu gráfico começa com uma publicação" description="Quando você publicar, a evolução aparecerá aqui sem dados inventados." />
        )}
      </section>
    </main>
  )
}
