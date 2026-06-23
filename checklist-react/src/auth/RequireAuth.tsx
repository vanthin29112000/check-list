import { Navigate, useLocation } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuth, type AppRole } from '../auth/AuthContext'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  }

  return <>{children}</>
}

export function RequireRole({
  roles,
  children,
}: {
  roles: AppRole[]
  children: React.ReactNode
}) {
  const { role, loading, user } = useAuth()
  const loc = useLocation()

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (!roles.includes(role)) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
