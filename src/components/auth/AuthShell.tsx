import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { NexoLogo } from '../brand/NexoLogo'

export function AuthShell({ children, eyebrow, title, description }: { children: ReactNode; eyebrow: string; title: string; description: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-visual" aria-label="Apresentação do Nexo">
        <div className="auth-visual-inner">
          <Link to="/" className="auth-logo"><NexoLogo size={44} /></Link>
          <div className="auth-quote">
            <span className="eyebrow">Ideias encontram pessoas</span>
            <h1>Conexões começam com uma boa conversa.</h1>
            <p>Compartilhe o que importa, encontre novas perspectivas e construa seu próximo nexo.</p>
          </div>
          <div className="auth-proof" aria-hidden="true">
            <div className="proof-avatars"><span>ML</span><span>AR</span><span>JS</span></div>
            <p>Uma comunidade feita para conversas genuínas.</p>
          </div>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-mobile-logo"><NexoLogo size={38} /></div>
        <div className="auth-card">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p className="auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  )
}
