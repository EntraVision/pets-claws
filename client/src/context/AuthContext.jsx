import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api, { setAuthToken } from '../lib/api'

const AuthContext = createContext(null)

const adminPermissions = {
  pos: true,
  stock: true,
  purchases: true,
  expenses: true,
  dashboard: true,
  monthly_report: true,
  admin: true,
}

const staffDefaults = {
  pos: true,
  stock: false,
  purchases: false,
  expenses: false,
  dashboard: false,
  monthly_report: false,
  admin: false,
}

export function permissionsFor(user) {
  if (user?.role === 'admin') return adminPermissions
  return { ...staffDefaults, ...(user?.permissions || {}) }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('pc_token'))
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('pc_user')
    return raw ? JSON.parse(raw) : null
  })
  const [loading, setLoading] = useState(Boolean(token))

  useEffect(() => {
    setAuthToken(token)
    if (!token) {
      setLoading(false)
      return
    }
    api.get('/api/auth/me')
      .then(res => {
        setUser(res.data.user)
        localStorage.setItem('pc_user', JSON.stringify(res.data.user))
      })
      .catch(() => logout())
      .finally(() => setLoading(false))
  }, [token])

  const login = async (username, password) => {
    const res = await api.post('/api/auth/login', { username, password })
    localStorage.setItem('pc_token', res.data.token)
    localStorage.setItem('pc_user', JSON.stringify(res.data.user))
    setToken(res.data.token)
    setUser(res.data.user)
  }

  const logout = () => {
    localStorage.removeItem('pc_token')
    localStorage.removeItem('pc_user')
    setAuthToken(null)
    setToken(null)
    setUser(null)
  }

  const permissions = useMemo(() => permissionsFor(user), [user])
  const can = (permission) => Boolean(permissions[permission])
  const value = useMemo(() => ({ token, user, permissions, can, loading, login, logout, isAuthenticated: Boolean(token && user) }), [token, user, permissions, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
