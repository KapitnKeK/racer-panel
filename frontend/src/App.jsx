import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api, can } from './api'
import { AuthCtx } from './auth'
import { LiveProvider } from './live'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Servers from './pages/Servers'
import ServerPage from './pages/ServerPage'
import NewServer from './pages/NewServer'
import Users from './pages/Users'
import Audit from './pages/Audit'
import DriversPage from './pages/DriversPage'
import DriverPage from './pages/DriverPage'

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = lädt, null = abgemeldet

  useEffect(() => {
    api('/api/me').then(setUser).catch(() => setUser(null))
  }, [])

  const logout = useCallback(async () => {
    try { await api('/api/logout', { method: 'POST' }) } catch { /* egal */ }
    setUser(null)
  }, [])
  const expired = useCallback(() => setUser(null), [])

  if (user === undefined) return <div className="grid min-h-screen place-items-center"><Spinner className="text-accent" /></div>
  if (user === null) return <Login onLogin={setUser} />

  return (
    <AuthCtx.Provider value={{ user, logout }}>
      <LiveProvider onUnauthorized={expired}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Servers />} />
            <Route path="server/new" element={can(user, 'host') ? <NewServer /> : <Navigate to="/" replace />} />
            <Route path="server/:id" element={<ServerPage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="drivers/:id" element={<DriverPage />} />
            <Route path="users" element={can(user, 'admin') ? <Users /> : <Navigate to="/" replace />} />
            <Route path="log" element={can(user, 'admin') ? <Audit /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </LiveProvider>
    </AuthCtx.Provider>
  )
}
