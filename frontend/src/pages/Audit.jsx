import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Spinner } from '../components/ui'

const LABEL = {
  login: 'Angemeldet', 'server.create': 'Server angelegt', 'server.update': 'Server geändert', 'server.start': 'Server gestartet', 'server.stop': 'Server gestoppt',
  'server.delete': 'Server gelöscht', 'user.create': 'Benutzer angelegt', 'user.update': 'Benutzer geändert', 'user.delete': 'Benutzer gelöscht',
  'user.kick': 'Fahrer gekickt', 'user.ban': 'Fahrer gesperrt', 'user.penalty': 'Strafe verhängt', 'ban.remove': 'Sperre aufgehoben',
  'chat.send': 'Chat-Nachricht', 'session.restart': 'Session neu gestartet', 'session.next': 'Nächste Session', 'motd.set': 'MOTD geändert',
  'whitelist.set': 'Whitelist geändert', 'stream.set': 'Stream geändert', 'outline.reset': 'Streckenumriss zurückgesetzt',
}

export default function Audit() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    const load = () => api('/api/audit').then(setRows).catch(() => setRows([]))
    load()
    const iv = setInterval(load, 10000)
    return () => clearInterval(iv)
  }, [])
  if (!rows) return <div className="grid place-items-center py-24"><Spinner className="text-accent" /></div>
  return (
    <div>
      <h1 className="mb-1 text-4xl font-bold uppercase tracking-wider">Verlauf</h1>
      <p className="mb-5 text-sm text-ink-300">Die letzten 100 Aktionen im Panel.</p>
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr className="border-b border-ink-600"><th className="th">Zeit</th><th className="th">Benutzer</th><th className="th">Aktion</th><th className="th">Details</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-ink-700/70">
                  <td className="td whitespace-nowrap tabular-nums text-ink-300">{new Date(r.ts * 1000).toLocaleString('de-DE')}</td>
                  <td className="td font-medium">{r.user}</td>
                  <td className="td">{LABEL[r.action] || r.action}</td>
                  <td className="td text-ink-300">{r.detail}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="td py-10 text-center text-ink-300">Noch keine Einträge.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
