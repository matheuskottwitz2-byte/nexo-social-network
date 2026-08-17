import {
  BarChart3,
  Compass,
  Home,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  UserRound,
  X,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { NexoLogo } from '../components/brand/NexoLogo'
import { ProfileResult } from '../components/social/ProfileResult'
import { Avatar } from '../components/ui/Avatar'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useCurrentProfile, useSuggestedProfiles } from '../hooks/useNexoQueries'
import { getErrorMessage } from '../utils/errors'

const navigation = [
  { to: '/', label: 'Início', icon: Home },
  { to: '/search', label: 'Explorar', icon: Compass },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
] as const

export function AppShell() {
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const profileQuery = useCurrentProfile(user?.id)
  const suggestionsQuery = useSuggestedProfiles(user!.id)
  const profile = profileQuery.data

  async function handleSignOut() {
    try {
      await signOut()
      toast.success('Sessão encerrada.')
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível sair.'))
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const value = search.trim()
    if (value) navigate(`/search?q=${encodeURIComponent(value)}`)
  }

  const profilePath = profile ? `/@${profile.username}` : '/'

  return (
    <div className="app-frame">
      <aside className={`desktop-sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <div className="sidebar-top">
          <Link to="/" className="sidebar-logo" onClick={() => setMobileMenu(false)}><NexoLogo size={40} /></Link>
          <button className="icon-button sidebar-close" onClick={() => setMobileMenu(false)} aria-label="Fechar menu"><X /></button>
          <nav className="main-nav" aria-label="Navegação principal">
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileMenu(false)}>
                <Icon aria-hidden="true" /><span>{label}</span>
              </NavLink>
            ))}
            <NavLink to={profilePath} onClick={() => setMobileMenu(false)}><UserRound aria-hidden="true" /><span>Perfil</span></NavLink>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <button className="sidebar-action" onClick={toggleTheme}>{theme === 'dark' ? <Sun /> : <Moon />}<span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span></button>
          <Link className="sidebar-account" to={profilePath}>
            <Avatar name={profile?.name || user?.email || 'Você'} src={profile?.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1"><strong>{profile?.name || 'Carregando…'}</strong><small>{profile ? `@${profile.username}` : user?.email}</small></span>
          </Link>
          <button className="sidebar-action signout" onClick={handleSignOut}><LogOut /><span>Sair</span></button>
        </div>
      </aside>

      {mobileMenu && <div className="mobile-menu-backdrop" onClick={() => setMobileMenu(false)} />}

      <div className="main-column">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu /></button>
          <Link to="/"><NexoLogo size={34} showWordmark={false} /></Link>
          <Link to={profilePath}><Avatar name={profile?.name || 'Você'} src={profile?.avatarUrl} size="sm" /></Link>
        </header>
        <Outlet />
      </div>

      <aside className="right-rail">
        <form className="rail-search" onSubmit={submitSearch}>
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor="global-search">Buscar pessoas</label>
          <input id="global-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no Nexo" />
        </form>
        <section className="rail-card">
          <div className="rail-card-header"><h2>Novos nexos</h2><Sparkles className="size-4" aria-hidden="true" /></div>
          {suggestionsQuery.isLoading && <div className="rail-loading"><span /><span /><span /></div>}
          {suggestionsQuery.data?.map((suggestion) => <ProfileResult key={suggestion.id} profile={suggestion} compact />)}
          {!suggestionsQuery.isLoading && suggestionsQuery.data?.length === 0 && <p className="rail-empty">Novas pessoas aparecerão aqui.</p>}
          <Link className="rail-link" to="/search">Ver mais pessoas</Link>
        </section>
        <section className="rail-card about-card">
          <span className="eyebrow">Sobre o Nexo</span>
          <h2>Ideias ganham força quando se encontram.</h2>
          <p>Uma rede aberta para compartilhar, conversar e descobrir.</p>
        </section>
        <footer className="rail-footer"><Link to="/settings/profile"><Settings className="size-3.5" /> Ajustes</Link><span>·</span><span>© 2026 Nexo</span></footer>
      </aside>

      <nav className="mobile-bottom-nav" aria-label="Navegação móvel">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} aria-label={label}><Icon /><span>{label}</span></NavLink>
        ))}
        <NavLink to={profilePath} aria-label="Perfil"><UserRound /><span>Perfil</span></NavLink>
      </nav>
    </div>
  )
}
