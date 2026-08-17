import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { PageLoader } from '../ui/Status'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <main className="full-loader"><PageLoader label="Restaurando sua sessão" /></main>
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading } = useAuth()
  if (loading) return <main className="full-loader"><PageLoader label="Carregando" /></main>
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}
