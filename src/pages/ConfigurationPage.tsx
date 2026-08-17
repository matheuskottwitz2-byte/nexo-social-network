import { CheckCircle2, Copy, Database, ExternalLink, TerminalSquare } from 'lucide-react'
import { useState } from 'react'
import { NexoLogo } from '../components/brand/NexoLogo'
import { Button } from '../components/ui/Button'

export function ConfigurationPage() {
  const [copied, setCopied] = useState(false)
  async function copyCommand() {
    await navigator.clipboard.writeText('Copy-Item .env.example .env')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <main className="setup-page">
      <div className="setup-glow" />
      <section className="setup-card">
        <NexoLogo size={46} />
        <span className="setup-badge"><Database className="size-4" /> Configuração necessária</span>
        <h1>Conecte o Nexo ao Supabase</h1>
        <p>A aplicação está pronta. Para habilitar autenticação e dados reais, adicione a URL e a Publishable Key do seu projeto.</p>
        <ol className="setup-steps">
          <li><span>1</span><div><strong>Crie o arquivo local</strong><button onClick={copyCommand}><code>Copy-Item .env.example .env</code>{copied ? <CheckCircle2 /> : <Copy />}</button></div></li>
          <li><span>2</span><div><strong>Preencha as variáveis</strong><code>VITE_SUPABASE_URL=...{`\n`}VITE_SUPABASE_PUBLISHABLE_KEY=...</code></div></li>
          <li><span>3</span><div><strong>Aplique a migration</strong><p>Execute o SQL de <code>supabase/migrations/</code> no SQL Editor.</p></div></li>
          <li><span>4</span><div><strong>Reinicie o servidor</strong><code>npm run dev</code></div></li>
        </ol>
        <div className="setup-actions">
          <Button onClick={() => window.location.reload()}><TerminalSquare className="size-4" /> Verificar novamente</Button>
          <a className="button button-secondary" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Abrir Supabase <ExternalLink className="size-4" /></a>
        </div>
        <small>Nenhuma credencial é embutida no código ou enviada para outro serviço.</small>
      </section>
    </main>
  )
}
