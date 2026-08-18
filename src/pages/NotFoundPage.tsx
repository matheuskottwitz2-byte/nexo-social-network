import { Compass, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { NexoLogo } from '../components/brand/NexoLogo'

export function NotFoundPage() {
  return (
    <main className="not-found-page">
      <NexoLogo size={40} showWordmark={false} />
      <span>404</span>
      <h1>Página não encontrada</h1>
      <p>A página pode ter mudado de endereço ou nunca ter existido.</p>
      <Link className="button button-primary" to="/"><Home className="size-4" /> Voltar ao início</Link>
      <Link to="/search"><Compass className="size-4" /> Explorar pessoas</Link>
    </main>
  )
}
