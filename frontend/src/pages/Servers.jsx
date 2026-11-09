import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Clock, Lock, MapPin, Pencil, Play, Plus, Radio, Server, Square, Trash2, Users } from 'lucide-react'
import { api, can } from '../api'
import { useAuth } from '../auth'
import { useLive } from '../live'
import { GameBadge, hasCap, useGames } from '../games'
import { Avatar } from '../components/Drivers'
import { Badge, Confirm, Empty, Spinner, useAsync } from '../components/ui'
import { fmtClock, thumbSrc } from '../utils'

function Stat({ icon: Icon, label, value, tone = '' }) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-ink-700"><Icon size={18} className={tone || 'text-ink-200'} /></span>
      <div>
        <div className="font-display text-2xl font-semibold leading-none tabular-nums">{value}</div>
        <div className="mt-0.5 text-xs uppercase tracking-wider text-ink-300">{label}</div>
      </div>
    </div>
  )
}

function ServerCard({ s, names, canHost, isAdmin }) {
  const [busy, run] = useAsync()
  const [confirm, setConfirm] = useState(null)
  const st = s.state
  const players = st.players
  const online = Math.max(players.length, st.players_online || 0)
  const waiting = st.running && online === 0

  const start = () => run(() => api(`/api/servers/${s.id}/start`, { method: 'POST' }), 'Server wird gestartet')
  const stop = async () => { await run(() => api(`/api/servers/${s.id}/stop`, { method: 'POST' }), 'Server wird gestoppt'); setConfirm(null) }
  const del = async () => { await run(() => api(`/api/servers/${s.id}`, { method: 'DELETE' }), 'Server gelöscht'); setConfirm(null) }

  return (
    <article className={`card flex flex-col overflow-hidden transition hover:border-ink-400 ${st.running ? 'ring-1 ring-ok/20' : ''}`}>
      {thumbSrc(s) ? (
        <div className="relative h-28 overflow-hidden bg-ink-900">
          <img src={thumbSrc(s)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }} />
          <div className={`absolute inset-x-0 bottom-0 h-1 ${st.running ? 'bg-ok' : 'bg-ink-600'}`} />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-800 via-transparent to-transparent" />
        </div>
      ) : <div className={`h-1 ${st.running ? 'bg-ok' : 'bg-ink-600'}`} />}
      <div className="flex flex-1 flex-col gap-4 p-5">
        <header>
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 truncate font-display text-2xl font-semibold tracking-wide">{s.name}</h3>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <GameBadge game={s.game} />
              {s.has_password && <span title="Mit Passwort geschützt" className="text-ink-300"><Lock size={14} /></span>}
              {st.running ? <Badge tone="green" dot>Läuft</Badge> : <Badge tone="gray">Gestoppt</Badge>}
            </div>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-200">
            <MapPin size={14} className="shrink-0 text-ink-300" />
            <span className="truncate">{s.layout.track} <span className="text-ink-300">· {s.layout.name}</span></span>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-ink-900/60 px-2 py-2.5">
            <div className="font-display text-2xl font-semibold tabular-nums leading-none">{st.running ? online : '–'}<span className="text-base text-ink-300">/{s.max_players}</span></div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-ink-300">Fahrer</div>
          </div>
          <div className="rounded-lg bg-ink-900/60 px-2 py-2.5">
            <div className="truncate font-display text-lg font-semibold leading-none">{st.running ? (waiting ? 'Wartet' : st.session_label || '–') : '–'}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-ink-300">Session</div>
          </div>
          <div className="rounded-lg bg-ink-900/60 px-2 py-2.5">
            <div className="font-display text-2xl font-semibold tabular-nums leading-none">{st.running && !waiting ? fmtClock(st.time_left) : '–'}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-ink-300">Restzeit</div>
          </div>
        </div>

        <div className="flex min-h-8 items-center justify-between gap-3">
          <div className="flex -space-x-2">
            {players.slice(0, 7).map((p) => <span key={p.user_id} className="rounded-full ring-2 ring-ink-800"><Avatar info={names[String(p.user_id)]} uid={p.user_id} size={30} /></span>)}
            {players.length > 7 && <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-ink-600 text-xs ring-2 ring-ink-800">+{players.length - 7}</span>}
            {!players.length && <span className="text-sm text-ink-300">{st.running ? (online ? `${online} verbunden` : 'Noch niemand verbunden') : 'Server ist aus'}</span>}
          </div>
          {st.running && <span className="text-xs tabular-nums text-ink-300">UDP {st.port}</span>}
        </div>

        <footer className="mt-auto flex flex-wrap gap-2 pt-1">
          <Link to={`/server/${s.id}`} className="btn-ghost flex-1"><Radio size={15} /> {st.running ? 'Live ansehen' : 'Details'}</Link>
          {canHost && hasCap(s, 'start') && (st.running
            ? <button className="btn-danger" disabled={busy} onClick={() => (online ? setConfirm('stop') : stop())}>{busy ? <Spinner /> : <Square size={14} />} Stopp</button>
            : <button className="btn-ok" disabled={busy} onClick={start}>{busy ? <Spinner /> : <Play size={14} />} Start</button>)}
          {canHost && hasCap(s, 'edit') && <Link to={`/server/${s.id}?tab=settings`} className="btn-ghost !px-2.5" title="Einstellungen"><Pencil size={15} /></Link>}
          {isAdmin && hasCap(s, 'delete') && !st.running && <button className="btn-ghost !px-2.5 hover:!border-accent/60 hover:!text-red-300" title="Löschen" onClick={() => setConfirm('delete')}><Trash2 size={15} /></button>}
        </footer>
      </div>
      <Confirm open={confirm === 'stop'} danger title="Server stoppen?" confirmLabel="Stoppen" busy={busy} onClose={() => setConfirm(null)} onConfirm={stop}
        text={`Auf „${s.name}" sind gerade ${online} Fahrer. Sie werden getrennt und die laufende Session geht verloren.`} />
      <Confirm open={confirm === 'delete'} danger title="Server löschen?" confirmLabel="Löschen" busy={busy} onClose={() => setConfirm(null)} onConfirm={del}
        text={`„${s.name}" wird samt Konfiguration dauerhaft gelöscht.`} />
    </article>
  )
}

export default function Servers() {
  const { snap } = useLive()
  const { user } = useAuth()
  const canHost = can(user, 'host')
  const names = snap?.names || {}
  const { games } = useGames()
  const [filter, setFilter] = useState('all')
  const all = snap?.servers
  const list = useMemo(() => (all ? all.filter((s) => filter === 'all' || s.game === filter) : all), [all, filter])

  if (!snap) return <div className="grid place-items-center py-24"><Spinner className="text-accent" /></div>
  const running = list.filter((s) => s.state.running).length
  const drivers = list.reduce((n, s) => n + (s.state.running ? Math.max(s.state.players.length, s.state.players_online || 0) : 0), 0)

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold uppercase tracking-wider">Server</h1>
          <p className="mt-1 text-sm text-ink-300">Alle Rennspiel-Server auf einen Blick, live aktualisiert.</p>
        </div>
        {canHost && <Link to="/server/new" className="btn-primary"><Plus size={16} /> Neuer Server</Link>}
      </div>

      {games.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {[{ key: 'all', name: 'Alle' }, ...games].map((g) => <button key={g.key} className={`btn-sm ${filter === g.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(g.key)}>{g.name}</button>)}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat icon={Server} label="Server" value={list.length} />
        <Stat icon={Activity} label="Laufen" value={running} tone={running ? 'text-ok' : ''} />
        <Stat icon={Users} label="Fahrer online" value={drivers} tone={drivers ? 'text-accent-hi' : ''} />
      </div>

      {snap.manager_ok === false && (
        <div className="mb-5 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-red-300">
          Ein Spiel-Host antwortet nicht. Die Anzeige zeigt den letzten bekannten Stand.
        </div>
      )}

      {list.length === 0 ? (
        <div className="card"><Empty icon={Clock} title="Noch kein Server" text="Lege deinen ersten Server an, wähle Strecke und Fahrzeuge und starte ihn mit einem Klick.">
          {canHost && <Link to="/server/new" className="btn-primary mt-2"><Plus size={16} /> Server anlegen</Link>}
        </Empty></div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => <ServerCard key={s.id} s={s} names={names} canHost={canHost} isAdmin={can(user, 'admin')} />)}
        </div>
      )}
    </div>
  )
}
