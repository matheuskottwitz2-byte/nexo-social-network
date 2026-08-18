import { BarChart3, Heart, MessageCircle, PenLine, TrendingUp, UserPlus, UsersRound } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '../components/layout/PageHeader'
import { EmptyState, ErrorState, PageLoader } from '../components/ui/Status'
import { useAuth } from '../contexts/AuthContext'
import { useDashboard } from '../hooks/useNexoQueries'
import { compactNumber } from '../utils/format'

const statConfig = [
  { key: 'postsCount', label: 'Publicações', icon: PenLine, tone: 'teal' },
  { key: 'likesReceived', label: 'Curtidas recebidas', icon: Heart, tone: 'coral' },
  { key: 'commentsReceived', label: 'Comentários', icon: MessageCircle, tone: 'neutral' },
  { key: 'followersCount', label: 'Seguidores', icon: UserPlus, tone: 'neutral' },
  { key: 'followingCount', label: 'Seguindo', icon: UsersRound, tone: 'neutral' },
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
      <PageHeader title="Dashboard" subtitle="Atividade da conta" />
      <section className="dashboard-intro">
        <div><span className="eyebrow"><TrendingUp className="size-4" /> Visão geral</span><h2>Atividade da conta</h2><p>Dados das suas publicações e relações.</p></div>
        <div className="engagement-chip"><strong>{compactNumber(recentInteractions)}</strong><span>interações em 30 dias</span></div>
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
        <header><div><span className="eyebrow">Publicações</span><h2>Últimos 30 dias</h2></div><BarChart3 aria-hidden="true" /></header>
        {hasActivity ? (
          <div className="chart-container" role="img" aria-label="Gráfico de publicações nos últimos 30 dias">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={postsOverTime} margin={{ top: 12, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tickFormatter={chartDate} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={26} />
                <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(value) => chartDate(String(value))} formatter={(value) => [Number(value), 'Publicações']} contentStyle={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' }} />
                <Area type="monotone" dataKey="posts" stroke="var(--brand)" strokeWidth={2} fill="transparent" activeDot={{ r: 4, fill: 'var(--brand)', stroke: 'var(--surface)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon={BarChart3} title="Sem publicações no período" description="O gráfico aparecerá quando houver atividade." />
        )}
      </section>
    </main>
  )
}
