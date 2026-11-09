import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Gavel, LogOut, Users } from 'lucide-react'
import { api } from '../api'
import { Badge, Confirm, Empty, Modal, Spinner, useAsync } from './ui'
import { INCIDENT_TYPES, driverColor, flagEmoji, liveryImg } from '../utils'

const classTone = (name) => {
  if (!name) return 'gray'
  const tones = ['blue', 'amber', 'green', 'red']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return tones[h % tones.length]
}
const pingTone = (ms) => (ms < 70 ? 'text-ok' : ms < 140 ? 'text-warn' : 'text-red-400')

function Avatar({ info, uid, size = 32 }) {
  const col = driverColor(uid)
  if (info?.avatar) {
    return <img src={info.avatar} alt="" width={size} height={size} referrerPolicy="no-referrer" loading="lazy" className="shrink-0 rounded-full border border-ink-500 object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-full text-xs font-bold text-ink-950" style={{ width: size, height: size, background: col }}>
      {(info?.name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}
export { Avatar }

export default function Drivers({ server, names, selected, onSelect, canHost, isAdmin }) {
  const can_ = (c) => !server.caps || server.caps.includes(c)
  const players = server.state.players
  const [penaltyFor, setPenaltyFor] = useState(null)
  const [kickFor, setKickFor] = useState(null)
  const [banFor, setBanFor] = useState(null)
  const [ptype, setPtype] = useState(1)
  const [dur, setDur] = useState(10)
  const [busy, run] = useAsync()

  const nameOf = (uid) => names[String(uid)]?.name || `Fahrer ${uid}`

  if (!server.state.running) {
    return <Empty icon={Users} title="Server gestoppt" text="Sobald der Server läuft und Fahrer beitreten, erscheinen sie hier live." />
  }
  if (players.length === 0) {
    const n = server.state.players_online || 0
    return n > 0
      ? <Empty icon={Users} title={`${n} Fahrer verbunden`} text="Positionen und Details erscheinen, sobald die Fahrer auf der Strecke sind." />
      : <Empty icon={Users} title="Warte auf Fahrer" text="Der Server läuft, aber es ist noch niemand verbunden." />
  }

  const sorted = [...players].sort((a, b) => b.kmh - a.kmh)
  const base = `/api/servers/${server.id}/users`

  return (
    <>
      <ul className="divide-y divide-ink-700/70 md:hidden">
        {sorted.map((p) => {
          const info = names[String(p.user_id)]
          const sel = selected === p.user_id
          return (
            <li key={p.user_id} onClick={() => onSelect(p.user_id)} className={`cursor-pointer px-4 py-3 transition ${sel ? 'bg-accent-soft' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: driverColor(p.user_id) }} />
                <Avatar info={info} uid={p.user_id} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{info?.name || `Fahrer ${p.user_id}`}</div>
                  <div className="truncate text-xs text-ink-300">{p.car || `Livery ${p.livery_id}`}{p.class ? ` · ${p.class}` : ''}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-2xl font-semibold leading-none tabular-nums">{Math.round(p.kmh)}<span className="ml-0.5 text-xs font-normal text-ink-300">km/h</span></div>
                  <div className={`mt-1 text-xs tabular-nums ${pingTone(p.ping)}`}>{Math.round(p.ping)} ms{p.incident_points > 0 ? <span className="ml-2 text-warn">{p.incident_points} Pkt</span> : null}</div>
                </div>
              </div>
              {canHost && (
                <div className="mt-2.5 flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {can_('penalty') && <button className="btn-ghost btn-sm" onClick={() => setPenaltyFor(p.user_id)}><Gavel size={14} /> Strafe</button>}
                  {can_('kick') && <button className="btn-ghost btn-sm" onClick={() => setKickFor(p.user_id)}><LogOut size={14} /> Kick</button>}
                  {isAdmin && can_('ban') && <button className="btn-danger btn-sm" onClick={() => setBanFor(p.user_id)}><Ban size={14} /> Ban</button>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-ink-600">
              <th className="th">Fahrer</th>
              <th className="th">Fahrzeug</th>
              <th className="th w-36">Tempo</th>
              <th className="th whitespace-nowrap text-right">Ping</th>
              <th className="th whitespace-nowrap text-right">Vorfälle</th>
              {canHost && <th className="th text-right">Aktion</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const info = names[String(p.user_id)]
              const sel = selected === p.user_id
              const incTitle = p.incidents.map((i) => `${INCIDENT_TYPES[i.type] || 'Vorfall'} (+${i.points})`).join('\n')
              return (
                <tr key={p.user_id} onClick={() => onSelect(p.user_id)} className={`cursor-pointer border-b border-ink-700/70 transition hover:bg-ink-700/40 ${sel ? 'bg-accent-soft' : ''}`}>
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: driverColor(p.user_id) }} />
                      <Avatar info={info} uid={p.user_id} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink-100"><Link to={`/drivers/${p.user_id}`} onClick={(e) => e.stopPropagation()} className="hover:text-accent-hi hover:underline">{info?.name || `Fahrer ${p.user_id}`}</Link> <span className="ml-0.5 text-xs">{flagEmoji(info?.country?.code)}</span></div>
                        {info?.team && <div className="truncate text-xs text-ink-300">{info.team}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <img src={liveryImg(p.livery_id)} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-9 w-14 shrink-0 rounded border border-ink-600 bg-ink-900 object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                      <div className="min-w-0">
                        <div className="truncate text-ink-100">{p.car || `Livery ${p.livery_id}`}</div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {p.class && <Badge tone={classTone(p.class)}>{p.class}</Badge>}
                          {p.livery && <span className="text-xs text-ink-300">{p.livery}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display text-2xl font-semibold tabular-nums leading-none">{Math.round(p.kmh)}</span>
                      <span className="text-xs text-ink-300">km/h</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded bg-ink-600">
                      <div className="h-full rounded transition-all duration-500" style={{ width: `${Math.min(100, (p.kmh / 330) * 100)}%`, background: driverColor(p.user_id) }} />
                    </div>
                  </td>
                  <td className={`td whitespace-nowrap text-right tabular-nums ${pingTone(p.ping)}`}>{Math.round(p.ping)} ms</td>
                  <td className="td whitespace-nowrap text-right">
                    {p.incident_points > 0 ? <span title={incTitle}><Badge tone="amber">{p.incident_points} Pkt</Badge></span> : <span className="text-ink-400">–</span>}
                  </td>
                  {canHost && (
                    <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex gap-1">
                        {can_('penalty') && <button className="btn-ghost btn-sm !px-2" title="Strafe verhängen" onClick={() => setPenaltyFor(p.user_id)}><Gavel size={14} /></button>}
                        {can_('kick') && <button className="btn-ghost btn-sm !px-2" title="Vom Server werfen" onClick={() => setKickFor(p.user_id)}><LogOut size={14} /></button>}
                        {isAdmin && can_('ban') && <button className="btn-danger btn-sm !px-2" title="Dauerhaft sperren" onClick={() => setBanFor(p.user_id)}><Ban size={14} /></button>}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={penaltyFor != null} onClose={() => setPenaltyFor(null)} title={`Strafe: ${penaltyFor ? nameOf(penaltyFor) : ''}`} footer={
        <>
          <button className="btn-ghost" onClick={() => setPenaltyFor(null)}>Abbrechen</button>
          <button className="btn-danger" disabled={busy} onClick={async () => {
            await run(() => api(`${base}/${penaltyFor}/penalty`, { method: 'POST', body: { type: ptype, duration: ptype === 0 ? dur : 0 } }), 'Strafe verhängt')
            setPenaltyFor(null)
          }}>{busy && <Spinner />}Strafe verhängen</button>
        </>
      }>
        <div className="grid gap-2">
          {[[0, 'Slowdown', 'Fahrer muss kurz verlangsamen'], [1, 'Drive-Through', 'Durchfahrt durch die Boxengasse'], [2, 'Stop & Go', 'Stopp in der Box'], [3, 'Disqualifikation', 'Ausschluss aus dem Rennen']].map(([v, l, h]) => (
            <label key={v} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${ptype === v ? 'border-accent bg-accent-soft' : 'border-ink-600 hover:border-ink-400'}`}>
              <input type="radio" name="ptype" checked={ptype === v} onChange={() => setPtype(v)} />
              <span><span className="block text-sm font-medium">{l}</span><span className="block text-xs text-ink-300">{h}</span></span>
            </label>
          ))}
          {ptype === 0 && (
            <div className="mt-1">
              <span className="label">Dauer: {dur} s</span>
              <input type="range" min={0} max={30} value={dur} onChange={(e) => setDur(+e.target.value)} className="w-full" />
            </div>
          )}
        </div>
      </Modal>
      <Confirm open={kickFor != null} danger title="Fahrer kicken?" confirmLabel="Kicken" busy={busy} onClose={() => setKickFor(null)}
        text={`${kickFor ? nameOf(kickFor) : ''} wird vom Server geworfen. Wiedereintritt bleibt möglich.`}
        onConfirm={async () => { await run(() => api(`${base}/${kickFor}/kick`, { method: 'POST' }), 'Fahrer gekickt'); setKickFor(null) }} />
      <Confirm open={banFor != null} danger title="Fahrer dauerhaft sperren?" confirmLabel="Sperren" busy={busy} onClose={() => setBanFor(null)}
        text={`${banFor ? nameOf(banFor) : ''} wird vom Server geworfen und in die globale Sperrliste eingetragen. Das gilt für alle deine Server, bis ein Admin die Sperre aufhebt.`}
        onConfirm={async () => { await run(() => api(`${base}/${banFor}/ban`, { method: 'POST' }), 'Fahrer gesperrt'); setBanFor(null) }} />
    </>
  )
}
