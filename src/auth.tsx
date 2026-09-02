import React, { createContext, useContext, useEffect, useState } from 'react'

const API_BASE = import.meta.env.DEV ? 'http://localhost:4000' : ''

type User = { id: string; email: string; username?: string } | null

const AuthContext = createContext<{
  user: User
  loading: boolean
  login: (token: string, user: User) => void
  logout: () => void
} | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('token')
      if (!token) { setLoading(false); return }
      try {
        const res = await fetch(API_BASE + '/api/me', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) { localStorage.removeItem('token'); setLoading(false); return }
        const data = await res.json()
        setUser(data.user)
      } catch (err) {
        localStorage.removeItem('token')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const login = (token: string, u: User) => {
    localStorage.setItem('token', token)
    setUser(u)
  }

  const logout = async () => {
    const token = localStorage.getItem('token')
    if (token) {
      try {
        await fetch((import.meta.env.DEV ? 'http://localhost:4000' : '') + '/api/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch (err) {
        // ignore logout failures and keep the client session cleared
      }
    }
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthProvider
