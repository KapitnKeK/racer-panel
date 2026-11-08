import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users } from 'lucide-react'
import { api } from '../api'
import { useLive } from '../live'
import { Avatar } from '../components/Drivers'
import { Badge, Card, Empty, Spinner } from '../components/ui'
import { fmtDate, fmtDuration, fmtKm, flagEmoji, relTime } from '../utils'

const SORTS = [
  ['last_seen', 'Zuletzt gesehen'], ['drive_seconds', 'Fahrzeit'], ['meters', 'Distanz'], ['top_kmh', 'Topspeed'], ['visits', 'Besuche'], ['incident_points', 'Vorfälle'],
]

export default function DriversPage() {
  const { snap } = useLive()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('last_seen')

  useEffect(() => {
    let stop = false
    const load = () => api('/api/drivers').then((d) => { if (!stop) setRows(d) }).catch(() => { if (!stop) setRows([]) })
    load()
    const iv = setInterval(load, 15000)
    return () => { stop = true; clearInterval(iv) }
  }, [])

  const online = useMemo(() => {
    const s = new Set()
    for (const sv of snap?.servers || []) if (sv.state.running) for (const p of sv.state.players) s.add(p.user_id)
    return s
  }, [snap])

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return [...(rows || [])]
      .filter((r) => !ql || r.name.toLowerCase().includes(ql) || (r.team || '').toLowerCase().includes(ql))
      .sort((a, b) => (online.has(b.id) - online.has(a.id)) || (b[sort] || 0) - (a[sort] || 0))
  }, [rows, q, sort, online])

  if (!rows) return <div className="grid place-items-center py-24"><Spinner className="text-accent" /></div>
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold uppercase tracking-wider">Fahrer</h1>
          <p className="mt-1 text-sm text-ink-300">Alle, die auf euren Servern gefahren sind, mit ihren Daten. Die Statistik wird live mitgeschrieben.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input w-56 pl-9" placeholder="Name oder Team" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-44" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {list.length === 0 ? (
        <Card><Empty icon={Users} title="Noch keine Fahrer erfasst" text="Sobald jemand auf einem Server fährt, erscheint er hier mit Fahrzeit, Distanz und Topspeed." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <Link key={r.id} to={`/drivers/${r.id}`} className="card flex flex-col gap-3 p-4 transition hover:border-ink-400">
              <div className="flex items-center gap-3">
                <Avatar info={{ avatar: r.avatar, name: r.name }} uid={r.id} size={46} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-xl font-semibold leading-tight">{r.name} <span className="text-base">{flagEmoji(r.country?.code)}</span></div>
                  <div className="truncate text-xs text-ink-300">{r.team || 'Kein Team'}</div>
                </div>
                {online.has(r.id) ? <Badge tone="green" dot>Online</Badge> : <span className="text-[11px] text-ink-400">{relTime(r.last_seen)}</span>}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[[fmtDuration(r.drive_seconds), 'Fahrzeit'], [fmtKm(r.meters), 'Distanz'], [`${r.top_kmh}`, 'Top km/h'], [r.visits, 'Besuche']].map(([v, l]) => (
                  <div key={l} className="rounded-lg bg-ink-900/60 px-1 py-2">
                    <div className="truncate font-display text-lg font-semibold leading-none tabular-nums">{v}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-ink-300">{l}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-ink-400">Zuletzt gesehen: {fmtDate(r.last_seen)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
