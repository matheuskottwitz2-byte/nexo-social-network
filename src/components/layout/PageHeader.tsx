import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export function PageHeader({ title, subtitle, back = false, actions }: { title: string; subtitle?: string; back?: boolean; actions?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="page-header">
      <div className="page-header-title">
        {back && <button className="icon-button" onClick={() => navigate(-1)} aria-label="Voltar"><ArrowLeft /></button>}
        <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      </div>
      {actions}
    </header>
  )
}
