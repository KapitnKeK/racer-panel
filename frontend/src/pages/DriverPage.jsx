import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Award, Clock, ExternalLink, Gauge, Route, Timer, TriangleAlert, Wifi } from 'lucide-react'
import { api } from '../api'
import { useLive } from '../live'
import { Avatar } from '../components/Drivers'
import { Badge, Card, Empty, Spinner } from '../components/ui'
import { fmtDate, fmtDuration, fmtKm, flagEmoji } from '../utils'

function Tile({ icon: Icon, label, value }) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-700"><Icon size={18} className="text-ink-200" /></span>
      <div className="min-w-0">
        <div className="truncate font-display text-2xl font-semibold leading-none tabular-nums">{value}</div>
        <div className="mt-0.5 truncate text-xs uppercase tracking-wider text-ink-300">{label}</div>
      </div>
    </div>
  )
}

export default function DriverPage() {
  const { id } = useParams()
  const { snap } = useLive()
  const [d, setD] = useState(undefined)

  useEffect(() => {
    let stop = false
    const load = () => api(`/api/drivers/${id}`).then((x) => { if (!stop) setD(x) }).catch(() => { if (!stop) setD(null) })
    load()
    const iv = setInterval(load, 15000)
    return () => { stop = true; clearInterval(iv) }
  }, [id])

  if (d === undefined) return <div className="grid place-items-center py-24"><Spinner className="text-accent" /></div>
  if (d === null) return <div className="card"><Empty icon={Award} title="Fahrer nicht gefunden" text="Dieser Fahrer ist noch nicht erfasst."><Link to="/drivers" className="btn-ghost mt-2"><ArrowLeft size={15} /> Zur Fahrerliste</Link></Empty></div>

  const live = (snap?.servers || []).flatMap((s) => (s.state.running ? s.state.players.map((p) => ({ p, s })) : [])).find((x) => x.p.user_id === d.id)
  const maxCar = Math.max(1, ...d.cars.map((c) => c.seconds))

  return (
    <div>
      <Link to="/drivers" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100"><ArrowLeft size={15} /> Alle Fahrer</Link>

      <header className="card mb-5 overflow-hidden">
        {d.banner && <div className="h-24 bg-ink-900"><img src={d.banner} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-70" onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }} /></div>}
        <div className="flex flex-wrap items-center gap-4 p-5">
          <Avatar info={{ avatar: d.avatar, name: d.name }} uid={d.id} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-4xl font-bold tracking-wide">{d.name} <span className="text-2xl">{flagEmoji(d.country?.code)}</span></h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-300">
              <span>{d.team || 'Kein Team'}</span>
              {d.country?.name && <span>· {d.country.name}</span>}
              <span>· seit {fmtDate(d.first_seen)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {live ? <Link to={`/server/${live.s.id}`}><Badge tone="green" dot>Online auf {live.s.name}</Badge></Link> : <Badge>Offline</Badge>}
            {d.profile_url && <a href={d.profile_url} target="_blank" rel="noreferrer noopener" className="btn-ghost btn-sm"><ExternalLink size={14} /> RaceRoom-Profil</a>}
          </div>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <Tile icon={Clock} label="Fahrzeit" value={fmtDuration(d.drive_seconds)} />
        <Tile icon={Timer} label="Auf dem Server" value={fmtDuration(d.seconds)} />
        <Tile icon={Route} label="Distanz" value={fmtKm(d.meters)} />
        <Tile icon={Gauge} label="Topspeed" value={`${d.top_kmh} km/h`} />
        <Tile icon={Gauge} label="Ø Tempo" value={`${d.avg_kmh} km/h`} />
        <Tile icon={Wifi} label="Ø Ping" value={d.avg_ping != null ? `${d.avg_ping} ms` : '–'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Fahrzeuge">
          {d.cars.length === 0 ? <p className="text-sm text-ink-300">Noch keine Daten.</p> : (
            <ul className="space-y-2.5">
              {d.cars.map((c) => (
                <li key={c.name}>
                  <div className="flex justify-between text-sm"><span className="truncate">{c.name} {c.class && <span className="text-xs text-ink-300">· {c.class}</span>}</span><span className="tabular-nums text-ink-300">{fmtDuration(c.seconds)}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-ink-600"><div className="h-full rounded bg-accent" style={{ width: `${(c.seconds / maxCar) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Strecken">
          {d.tracks.length === 0 ? <p className="text-sm text-ink-300">Noch keine Daten.</p> : (
            <table className="w-full text-sm">
              <thead><tr><th className="th !px-0">Strecke</th><th className="th text-right">Zeit</th><th className="th text-right">Distanz</th><th className="th text-right">Top</th></tr></thead>
              <tbody>
                {d.tracks.map((t, i) => (
                  <tr key={i} className="border-t border-ink-700/70"><td className="py-2 pr-2">{t.track} <span className="text-xs text-ink-300">· {t.layout}</span></td><td className="py-2 text-right tabular-nums">{fmtDuration(t.seconds)}</td><td className="py-2 text-right tabular-nums">{fmtKm(t.meters)}</td><td className="py-2 text-right tabular-nums">{t.top_kmh}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Letzte Besuche" className="lg:col-span-2" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-ink-600"><th className="th">Wann</th><th className="th">Server</th><th className="th">Strecke</th><th className="th">Fahrzeug</th><th className="th text-right">Dauer</th><th className="th text-right">Distanz</th><th className="th text-right">Top</th><th className="th text-right">Vorfälle</th></tr></thead>
              <tbody>
                {d.visits.map((v, i) => (
                  <tr key={i} className="border-b border-ink-700/70">
                    <td className="td whitespace-nowrap text-ink-300">{fmtDate(v.start)}</td><td className="td">{v.server}</td><td className="td">{v.track} <span className="text-xs text-ink-300">· {v.layout}</span></td><td className="td">{v.car || '–'}</td>
                    <td className="td text-right tabular-nums">{fmtDuration(v.seconds)}</td><td className="td text-right tabular-nums">{fmtKm(v.meters)}</td><td className="td text-right tabular-nums">{v.top_kmh}</td>
                    <td className="td text-right">{v.incident_points ? <Badge tone="amber"><TriangleAlert size={11} /> {v.incident_points}</Badge> : <span className="text-ink-400">–</span>}</td>
                  </tr>
                ))}
                {!d.visits.length && <tr><td colSpan={8} className="td py-8 text-center text-ink-300">Noch keine abgeschlossenen Besuche.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
