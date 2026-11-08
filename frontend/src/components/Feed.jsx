import { useState } from 'react'
import { AlertTriangle, Flag, MessageSquare, Power, Send, UserMinus, UserPlus } from 'lucide-react'
import { api } from '../api'
import { Spinner, useAsync } from './ui'
import { timeHM } from '../utils'

const ICON = { join: UserPlus, leave: UserMinus, incident: AlertTriangle, session: Flag, server: Power }
const TONE = { join: 'text-ok', leave: 'text-ink-300', incident: 'text-warn', session: 'text-sky-300', server: 'text-ink-200' }

export function EventFeed({ events, names }) {
  const list = [...(events || [])].reverse()
  if (!list.length) return <p className="py-6 text-center text-sm text-ink-300">Noch keine Ereignisse. Beitritte, Vorfälle und Session-Wechsel erscheinen hier live.</p>
  return (
    <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
      {list.map((e, i) => {
        const I = ICON[e.kind] || Flag
        const nm = e.user_id ? names[String(e.user_id)]?.name || `Fahrer ${e.user_id}` : null
        let text = e.text
        if (e.kind === 'join' || e.kind === 'leave') text = `${nm} ${e.text}`
        if (e.kind === 'incident') text = `${nm}: Vorfall ${e.text} (gesamt ${e.total})`
        return (
          <li key={`${e.ts}-${i}`} className="flex items-start gap-2.5 rounded-lg bg-ink-900/50 px-2.5 py-2 text-sm">
            <I size={15} className={`mt-0.5 shrink-0 ${TONE[e.kind] || ''}`} />
            <span className="min-w-0 flex-1 text-ink-100">{text}</span>
            <time className="shrink-0 text-[11px] tabular-nums text-ink-400">{timeHM(e.ts)}</time>
          </li>
        )
      })}
    </ul>
  )
}

export function Chat({ server, canHost }) {
  const [text, setText] = useState('')
  const [busy, run] = useAsync()
  const msgs = server.chat || []
  const send = async (e) => {
    e.preventDefault()
    const m = text.trim()
    if (!m) return
    const r = await run(() => api(`/api/servers/${server.id}/chat`, { method: 'POST', body: { message: m } }))
    if (r) setText('')
  }
  return (
    <div>
      <div className="mb-2 h-48 overflow-y-auto rounded-lg bg-ink-900/60 p-2.5">
        {msgs.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-sm text-ink-300"><span><MessageSquare className="mx-auto mb-1 text-ink-400" size={22} />Noch keine Chat-Nachrichten.</span></div>
        ) : (
          <ul className="space-y-1.5">
            {msgs.map((m) => (
              <li key={m.id} className="text-sm">
                <time className="mr-1.5 text-[11px] tabular-nums text-ink-400">{m.ts ? timeHM(m.ts) : ''}</time>
                <b className="text-ink-100">{m.user}:</b> <span className="text-ink-200">{m.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {canHost ? (
        <form onSubmit={send} className="flex gap-2">
          <input className="input" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="Nachricht an alle Fahrer senden…" disabled={!server.state.running} />
          <button className="btn-primary" disabled={busy || !text.trim() || !server.state.running}>{busy ? <Spinner /> : <Send size={15} />}</button>
        </form>
      ) : (
        <p className="text-xs text-ink-300">Nur Hosts können Nachrichten senden.</p>
      )}
    </div>
  )
}
