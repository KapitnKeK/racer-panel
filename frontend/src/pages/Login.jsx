import { useState } from 'react'
import { api } from '../api'
import { Logo } from '../components/Layout'
import { Field, Spinner } from '../components/ui'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await api('/api/login', { method: 'POST', body: { username, password } })
      onLogin(await api('/api/me'))
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo size="lg" /></div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wider">Anmelden</h1>
          <Field label="Benutzername"><input className="input" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
          <Field label="Passwort"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {err && <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-red-300" role="alert">{err}</p>}
          <button className="btn-primary w-full" disabled={busy || !username || !password}>{busy && <Spinner />}Anmelden</button>
        </form>
        <p className="mt-4 text-center text-xs text-ink-400">Zugang nur auf Einladung. Konten legt ein Admin an.</p>
      </div>
    </div>
  )
}
