import { useEffect, useRef, useState } from 'react'
import { Camera, Copy, Eye, Flag, Save, Trophy, Video } from 'lucide-react'
import Hls from 'hls.js'
import { api } from '../api'
import { Badge, Card, Field, Spinner, useAsync, useToast } from './ui'
import { driverColor } from '../utils'

export const fmtLap = (ms) => {
  if (ms == null || ms <= 0) return '–'
  const m = Math.floor(ms / 60000), s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0')
  return m ? `${m}:${s}` : s
}

const CAMS = [['cockpit', 'Cockpit'], ['onboard', 'Onboard'], ['nosecam', 'Nase'], ['swingman', 'Verfolger'], ['trackside', 'TV']]

export function BotStandings({ bot, names, canHost }) {
  const [busy, run] = useAsync()
  const [cam, setCam] = useState('cockpit')
  if (!bot?.connected) return null
  const s = bot.session || {}
  const setCamera = (slot) => run(() => api('/api/bot/camera', { method: 'POST', body: { slot, camera: cam } }), 'Kamera umgeschaltet')
  return (
    <Card title="Rangliste (Zuschauer-Bot)" pad={false} right={<span className="flex items-center gap-2 pr-1 text-xs text-ink-300"><Badge tone="green" dot>Bot live</Badge>{s.type} · {s.phase}{s.timeLeft > 0 ? ` · noch ${Math.floor(s.timeLeft / 60)}:${String(s.timeLeft % 60).padStart(2, '0')}` : ''}</span>}>
      {canHost && (
        <div className="flex flex-wrap items-center gap-1.5 px-5 pb-2">
          <span className="text-xs text-ink-300">Kamera:</span>
          {CAMS.map(([k, l]) => <button key={k} className={`btn-sm ${cam === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCam(k)}>{l}</button>)}
          <span className="text-xs text-ink-400">→ dann beim Fahrer auf <Camera size={12} className="inline" /> klicken</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead><tr className="border-b border-ink-600"><th className="th w-12">Pos</th><th className="th">Fahrer</th><th className="th text-right">Runden</th><th className="th text-right">Aktuell</th><th className="th text-right">Beste</th><th className="th text-right">Abstand</th>{canHost && <th className="th text-right">Kamera</th>}</tr></thead>
          <tbody>
            {bot.drivers.map((d) => (
              <tr key={d.slot} className="border-b border-ink-700/70">
                <td className="td font-display text-xl font-semibold tabular-nums">{d.pos > 0 ? d.pos : '–'}</td>
                <td className="td"><span className="mr-2 inline-block h-3 w-1 rounded" style={{ background: driverColor(d.user_id) }} />{names[String(d.user_id)]?.name || d.name}{d.flags?.blue ? <Badge tone="blue" className="ml-2"><Flag size={10} /> blau</Badge> : null}{d.flags?.yellow ? <Badge tone="amber" className="ml-2"><Flag size={10} /> gelb</Badge> : null}</td>
                <td className="td text-right tabular-nums">{d.laps ?? '–'}</td>
                <td className="td text-right tabular-nums text-ink-300">{fmtLap(d.current_ms)}</td>
                <td className={`td text-right tabular-nums ${d.best_valid === false ? 'text-ink-400 line-through' : ''}`}>{fmtLap(d.best_ms)}</td>
                <td className="td text-right tabular-nums text-ink-300">{d.pos === 1 ? 'Führung' : d.gap_laps > 0 ? `+${d.gap_laps} Rd.` : d.gap_ms > 0 ? `+${(d.gap_ms / 1000).toFixed(1)} s` : '–'}</td>
                {canHost && <td className="td text-right"><button className="btn-ghost btn-sm !px-2" disabled={busy} title={`Kamera: ${cam}`} onClick={() => setCamera(d.slot)}><Camera size={14} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function BotVideo() {
  const ref = useRef(null)
  const [ok, setOk] = useState(null)
  useEffect(() => {
    const src = '/api/bot/hls/stream.m3u8'
    let hls
    fetch(src, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) { setOk(false); return }
      setOk(true)
      const v = ref.current
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: false, liveSyncDurationCount: 2, xhrSetup: (x) => { x.withCredentials = true } })
        hls.loadSource(src); hls.attachMedia(v)
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = src }
    }).catch(() => setOk(false))
    return () => hls?.destroy()
  }, [])
  if (ok === false) return null
  return (
    <Card title="Bot-Kamera" right={<Badge tone="red" dot>Live</Badge>}>
      <div className="aspect-video overflow-hidden rounded-lg border border-ink-600 bg-black">
        <video ref={ref} className="h-full w-full" muted autoPlay playsInline controls />
      </div>
      {ok === null && <div className="mt-2 flex justify-center"><Spinner /></div>}
    </Card>
  )
}

export function BotSetup() {
  const toast = useToast()
  const [cfg, setCfg] = useState(null)
  const [hls, setHls] = useState('')
  const [busy, run] = useAsync()
  useEffect(() => { api('/api/bot/config').then((c) => { setCfg(c); setHls(c.hls_url || '') }).catch(() => {}) }, [])
  if (!cfg) return null
  const url = `${location.origin}/broadcast/?t=${cfg.token}`
  const save = async (rotate) => { const r = await run(() => api('/api/bot/config', { method: 'PUT', body: { hls_url: hls, rotate } }), rotate ? 'Neuer Token erzeugt' : 'Gespeichert'); if (r) setCfg({ ...cfg, token: r.token, hls_url: hls }) }
  return (
    <Card title="Zuschauer-Bot" right={<Eye size={16} className="text-ink-400" />} className="lg:col-span-2">
      <p className="mb-3 text-sm text-ink-300">Ein RaceRoom-Client tritt dem Server als Zuschauer bei und liefert Rangliste, Rundenzeiten und ein ferngesteuertes Kamerabild. Startoption im Bot: <code className="rounded bg-ink-900 px-1">-broadcastUrl=&lt;Adresse unten&gt;</code> (im LAN statt der Domain die IP des Panels verwenden).</p>
      <Field label="Zuschauer-Adresse (enthält den geheimen Bot-Token)">
        <div className="flex gap-2"><input className="input font-mono text-xs" readOnly value={url} /><button className="btn-ghost !px-2.5" onClick={async () => { await navigator.clipboard?.writeText(url); toast('Kopiert', 'ok') }}><Copy size={15} /></button></div>
      </Field>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Field label="Videostream (HLS-Basisadresse des Bots)" hint="z. B. http://192.0.2.10:8888/hls — das Panel reicht den Stream nur an angemeldete Benutzer durch."><input className="input" value={hls} onChange={(e) => setHls(e.target.value)} placeholder="http://<bot>:8888/hls" /></Field>
        <button className="btn-primary self-end" disabled={busy} onClick={() => save(false)}><Save size={15} /> Speichern</button>
        <button className="btn-danger self-end" disabled={busy} onClick={() => save(true)}>Token erneuern</button>
      </div>
    </Card>
  )
}
