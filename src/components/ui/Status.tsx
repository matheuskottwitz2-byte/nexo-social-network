import { AlertCircle, Inbox, LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

export function PageLoader({ label = 'Carregando' }: { label?: string }) {
  return (
    <div className="status-panel" role="status">
      <LoaderCircle className="size-7 animate-spin text-brand" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  )
}

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-label="Carregando publicações" role="status">
      {Array.from({ length: count }, (_, index) => (
        <div className="post-card" key={index}>
          <div className="skeleton size-11 rounded-full" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="skeleton h-4 w-2/5" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string
  description: string
  icon?: LucideIcon
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <span className="empty-icon error"><AlertCircle aria-hidden="true" /></span>
      <h2>Não foi possível carregar</h2>
      <p>{message || 'Confira sua conexão e tente novamente.'}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Tentar novamente</Button>}
    </div>
  )
}
