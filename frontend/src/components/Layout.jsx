import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, ScrollText, Server, UserRound, Users } from 'lucide-react'
import { useAuth } from '../auth'
import { useLive } from '../live'
import { ROLE_LABEL, can } from '../api'
import { Badge } from './ui'

export function Logo({ size = 'md' }) {
  const big = size === 'lg'
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid place-items-center rounded-lg bg-accent shadow-[0_0_24px_rgba(225,6,0,0.45)] ${big ? 'h-11 w-11' : 'h-8 w-8'}`}>
        <svg viewBox="0 0 32 32" className={big ? 'h-7 w-7' : 'h-5 w-5'}><path d="M9 25 17 7h6l-8 18z" fill="white" /></svg>
      </span>
      <span className={`font-display font-bold uppercase leading-none tracking-[0.12em] ${big ? 'text-3xl' : 'text-xl'}`}>
        Race<span className="text-accent-hi">Room</span> <span className="text-ink-300">Panel</span>
      </span>
    </div>
  )
}

const link = ({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-ink-600 text-white' : 'text-ink-300 hover:bg-ink-700 hover:text-ink-100'}`

export default function Layout() {
  const { user, logout } = useAuth()
  const { connected, snap } = useLive()
  const managerDown = snap && snap.manager_ok === false
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-600 bg-ink-900/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <NavLink to="/" className="shrink-0"><Logo /></NavLink>
          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            <NavLink to="/" end className={link}><Server size={15} /> Server</NavLink>
            <NavLink to="/drivers" className={link}><UserRound size={15} /> Fahrer</NavLink>
            {can(user, 'admin') && <NavLink to="/users" className={link}><Users size={15} /> Benutzer</NavLink>}
            {can(user, 'admin') && <NavLink to="/log" className={link}><ScrollText size={15} /> Verlauf</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {managerDown ? <Badge tone="red" dot>Manager offline</Badge> : connected ? <Badge tone="green" dot>Live</Badge> : <Badge tone="amber" dot>Verbinde…</Badge>}
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <span className="font-medium">{user.username}</span>
              <Badge tone={user.role === 'admin' ? 'red' : 'gray'}>{ROLE_LABEL[user.role]}</Badge>
            </div>
            <button className="btn-ghost btn-sm" onClick={logout} title="Abmelden"><LogOut size={15} /><span className="hidden sm:inline">Abmelden</span></button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-ink-700 px-3 py-1.5 sm:hidden">
          <NavLink to="/" end className={link}><Server size={15} /> Server</NavLink>
            <NavLink to="/drivers" className={link}><UserRound size={15} /> Fahrer</NavLink>
          {can(user, 'admin') && <NavLink to="/users" className={link}><Users size={15} /> Benutzer</NavLink>}
          {can(user, 'admin') && <NavLink to="/log" className={link}><ScrollText size={15} /> Verlauf</NavLink>}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
