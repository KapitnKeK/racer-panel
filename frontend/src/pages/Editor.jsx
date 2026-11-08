import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Eye, EyeOff, RefreshCw, Save, Shuffle } from 'lucide-react'
import { api } from '../api'
import { Badge, Card, Field, Select, Spinner, Toggle, useAsync, useToast } from '../components/ui'
import { CarPicker, TrackPicker } from '../components/Pickers'
import { DEFAULT_FORM, PRESET_DEFAULTS, fromServer, opts, toPayload, tr } from '../meta'
import { SESSION_META, TIME_OF_DAY, imageToThumbnail, randomPassword, thumbSrc } from '../utils'

const SECTIONS = [
  ['allgemein', 'Allgemein'], ['strecke', 'Strecke'], ['fahrzeuge', 'Fahrzeuge'], ['sessions', 'Sessions'],
  ['regeln', 'Regeln'], ['fahrhilfen', 'Fahrhilfen'], ['zugang', 'Zugang'],
]

const num = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(+v) ? Math.round(+v) : min))

function NumberField({ label, hint, value, onChange, min = 0, max = 999, suffix }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input type="number" className="input pr-12" min={min} max={max} value={value} onChange={(e) => onChange(num(e.target.value, min, max))} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-300">{suffix}</span>}
      </div>
    </Field>
  )
}

function MetaSelect({ label, group, k, hint, form, set, meta }) {
  return (
    <Field label={label} hint={hint}>
      <Select value={form[k]} onChange={(v) => set({ [k]: v })} options={opts(meta, group)} />
    </Field>
  )
}

function Editor({ serverId = null, embedded = false, running = false }) {
  const nav = useNavigate()
  const toast = useToast()
  const [content, setContent] = useState(null)
  const [meta, setMeta] = useState(null)
  const [form, setForm] = useState(null)
  const initial = useRef('')
  const [showPw, setShowPw] = useState(false)
  const [busy, run] = useAsync()
  const [restarting, setRestarting] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [thumbNew, setThumbNew] = useState(null) // null = unverändert, '' = entfernen, sonst Base64
  const [curThumb, setCurThumb] = useState(null)

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const [c, m] = await Promise.all([api('/api/content'), api('/api/meta')])
        let f = { ...DEFAULT_FORM, experience: c.experiences[0]?.Id ?? 2481 }
        let tv = null
        if (serverId) { const sv = await api(`/api/servers/${serverId}`); f = fromServer(sv); tv = thumbSrc(sv) }
        if (stop) return
        setContent(c); setMeta(m); setForm(f); setCurThumb(tv)
        initial.current = JSON.stringify(f)
      } catch (e) { if (!stop) setLoadErr(e.message) }
    })()
    return () => { stop = true }
  }, [serverId])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setSession = (key, patch) => setForm((f) => ({ ...f, sessions: { ...f.sessions, [key]: { ...f.sessions[key], ...patch } } }))
  const dirty = form && (JSON.stringify(form) !== initial.current || thumbNew !== null)

  const layout = useMemo(() => {
    if (!content || !form) return null
    for (const t of content.tracks) for (const l of t.layouts) if (l.id === form.layout_id) return { ...l, track: t.name }
    return null
  }, [content, form?.layout_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const problems = useMemo(() => {
    if (!form) return []
    const p = []
    if (!form.name.trim()) p.push('Der Servername fehlt.')
    if (!form.layout_id) p.push('Es ist keine Strecke gewählt.')
    if (!form.car_ids.length) p.push('Es ist kein Fahrzeug gewählt.')
    if (layout && form.max_players > layout.max) p.push(`Die Strecke erlaubt höchstens ${layout.max} Fahrzeuge, eingestellt sind ${form.max_players}.`)
    if (form.min_rating && form.max_rating && form.min_rating > form.max_rating) p.push('Das Mindest-Rating ist höher als das Höchst-Rating.')
    if (form.min_reputation && form.max_reputation && form.min_reputation > form.max_reputation) p.push('Die Mindest-Reputation ist höher als die Höchst-Reputation.')
    const active = SESSION_META.filter((s) => form.sessions[s.key].duration > 0 || form.sessions[s.key].laps > 0)
    if (!active.length) p.push('Mindestens eine Session muss eine Dauer oder Rundenzahl haben.')
    return p
  }, [form, layout])

  const onExperience = (exp) => {
    if (!content) return
    const allowedCars = new Set(content.cars.filter((c) => c.experiences.includes(exp)).map((c) => c.id))
    const layoutOk = content.tracks.some((t) => t.layouts.some((l) => l.id === form.layout_id && l.experiences.includes(exp)))
    set({ experience: exp, car_ids: form.car_ids.filter((id) => allowedCars.has(id)), layout_id: layoutOk ? form.layout_id : null })
  }

  const save = async (andRestart = false) => {
    if (problems.length) { toast(problems[0], 'err'); return }
    const payload = toPayload(form)
    if (thumbNew !== null) payload.thumbnail = thumbNew
    if (serverId) {
      const r = await run(() => api(`/api/servers/${serverId}`, { method: 'PUT', body: payload }))
      if (!r) return
      initial.current = JSON.stringify(form)
      if (thumbNew !== null) { setCurThumb(thumbNew ? `data:image/png;base64,${thumbNew}` : null); setThumbNew(null) }
      if (andRestart && running) {
        setRestarting(true)
        try {
          await api(`/api/servers/${serverId}/stop`, { method: 'POST' })
          for (let i = 0; i < 25; i++) {
            await new Promise((res) => setTimeout(res, 1000))
            const s = await api(`/api/servers/${serverId}`)
            if (!s.state.running) break
          }
          await api(`/api/servers/${serverId}/start`, { method: 'POST' })
          toast('Gespeichert, Server wurde neu gestartet', 'ok')
        } catch (e) { toast(`Neustart fehlgeschlagen: ${e.message}`, 'err') } finally { setRestarting(false) }
      } else {
        toast(r.restart_needed ? 'Gespeichert. Die Änderungen gelten ab dem nächsten Serverstart.' : 'Gespeichert', 'ok')
      }
    } else {
      const r = await run(() => api('/api/servers', { method: 'POST', body: payload }))
      if (!r) return
      initial.current = JSON.stringify(form)
      toast('Server angelegt', 'ok')
      nav(`/server/${r.id}`)
    }
  }

  if (loadErr) return <Card><p className="text-sm text-red-300">Laden fehlgeschlagen: {loadErr}</p></Card>
  if (!form || !content || !meta) return <div className="grid place-items-center py-24"><Spinner className="text-accent" /></div>

  const M = (group) => opts(meta, group)

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
      <nav className="sticky top-20 hidden self-start lg:block">
        <ul className="space-y-1">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className="block rounded-md px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-700 hover:text-ink-100">{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-5 pb-28">
        <Card id="allgemein" title="Allgemein" className="scroll-mt-24" >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Servername" hint="So erscheint der Server in der RaceRoom-Serverliste.">
              <input className="input" maxLength={40} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="z. B. Atzen Racing" />
            </Field>
            <Field label="Passwort" hint="Leer lassen für einen offenen Server.">
              <div className="flex gap-2">
                <input className="input" type={showPw ? 'text' : 'password'} maxLength={40} value={form.password} onChange={(e) => set({ password: e.target.value })} autoComplete="off" />
                <button type="button" className="btn-ghost !px-2.5" title={showPw ? 'Verbergen' : 'Anzeigen'} onClick={() => setShowPw((s) => !s)}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                <button type="button" className="btn-ghost !px-2.5" title="Zufälliges Passwort" onClick={() => { set({ password: randomPassword(10) }); setShowPw(true) }}><Shuffle size={16} /></button>
              </div>
            </Field>
            <Field label={`Maximale Fahrer: ${form.max_players}`} hint={layout ? `Diese Strecke erlaubt bis zu ${layout.max}.` : undefined}>
              <input type="range" min={1} max={layout?.max || 40} value={Math.min(form.max_players, layout?.max || 40)} onChange={(e) => set({ max_players: +e.target.value })} className="w-full" />
            </Field>
            <Field label="Spielinhalt (Experience)" hint="Bestimmt, welche Strecken und Autos verfügbar sind.">
              <Select value={form.experience} onChange={onExperience} options={content.experiences.map((e) => ({ value: e.Id, label: e.Name }))} />
            </Field>
            <Field label="Live-Takt des Servers" hint="Wie oft der Server Positionen meldet. Kürzer = flüssigere Live-Karte (500 ms empfohlen). Gilt ab dem nächsten Start.">
              <Select value={form.state_report_interval} onChange={(v) => set({ state_report_interval: v })} options={[250, 500, 1000, 2000, 3000].map((v) => ({ value: v, label: `${v} ms${v === 500 ? ' (empfohlen)' : v === 3000 ? ' (Standard)' : ''}` }))} />
            </Field>
          </div>
          <div className="mt-4">
            <span className="label">Server-Bild</span>
            <div className="flex flex-wrap items-center gap-4">
              <div className="h-20 w-56 overflow-hidden rounded-lg border border-ink-600 bg-ink-900/60">
                {(() => {
                  const src = thumbNew ? `data:image/png;base64,${thumbNew}` : thumbNew === '' ? null : curThumb
                  return src ? <img src={src} alt="Server-Bild" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <div className="grid h-full place-items-center text-xs text-ink-400">Kein Bild</div>
                })()}
              </div>
              <div className="flex flex-col gap-2">
                <label className="btn-ghost btn-sm cursor-pointer">
                  Bild wählen
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    try { setThumbNew(await imageToThumbnail(f)) } catch (err) { toast(err.message, 'err') }
                  }} />
                </label>
                {(thumbNew || (thumbNew === null && curThumb)) && <button type="button" className="btn-ghost btn-sm" onClick={() => setThumbNew('')}>Bild entfernen</button>}
                <span className="hint !mt-0">Wird auf 460 × 160 zugeschnitten und in der Serverliste von RaceRoom angezeigt.</span>
              </div>
            </div>
          </div>
        </Card>

        <Card id="strecke" title="Strecke" className="scroll-mt-24">
          <TrackPicker tracks={content.tracks} experience={form.experience} value={form.layout_id} onChange={(id) => set({ layout_id: id })} />
        </Card>

        <Card id="fahrzeuge" title="Fahrzeuge" className="scroll-mt-24">
          <CarPicker cars={content.cars} classes={content.car_classes} experience={form.experience} value={form.car_ids} onChange={(v) => set({ car_ids: v })} />
          <p className="hint">Alle Lackierungen der gewählten Fahrzeuge werden automatisch freigegeben.</p>
        </Card>

        <Card id="sessions" className="scroll-mt-24" title="Sessions" right={<Badge tone="gray">0 = Session aus</Badge>}>
          <div className="space-y-2.5">
            {SESSION_META.map((s) => {
              const v = form.sessions[s.key]
              const byLaps = v.laps > 0
              const off = !v.duration && !v.laps
              const isRace = s.key.startsWith('Race')
              return (
                <div key={s.key} className={`grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[110px_130px_110px_1fr_1fr] ${off ? 'border-ink-700 opacity-70' : 'border-ink-600'}`}>
                  <div className="flex items-center gap-2 self-center">
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-accent-soft font-display text-sm font-bold text-red-300">{s.short}</span>
                    <span className="text-sm font-medium">{s.label}</span>
                  </div>
                  <Field label="Länge nach">
                    <Select value={byLaps ? 'laps' : 'time'} onChange={(m) => setSession(s.key, m === 'laps' ? { laps: Math.max(1, v.duration || v.laps || 5), duration: 0 } : { duration: Math.max(1, v.laps || v.duration || 10), laps: 0 })} options={[{ value: 'time', label: 'Zeit (Min.)' }, { value: 'laps', label: 'Runden' }]} />
                  </Field>
                  <NumberField label={byLaps ? 'Runden' : 'Minuten'} min={0} max={byLaps ? 500 : 600} value={byLaps ? v.laps : v.duration} onChange={(n) => setSession(s.key, byLaps ? { laps: n, duration: 0 } : { duration: n, laps: 0 })} />
                  <Field label="Tageszeit"><Select value={v.time_of_day ?? 2} onChange={(t) => setSession(s.key, { time_of_day: t })} options={TIME_OF_DAY} /></Field>
                  <Field label="Start"><Select value={v.rolling_start ? 1 : 0} onChange={(t) => setSession(s.key, { rolling_start: !!t })} options={[{ value: 0, label: 'Stehender Start' }, { value: 1, label: 'Fliegender Start' }]} /></Field>
                  {off && <p className="text-xs text-ink-300 sm:col-span-5">{isRace ? 'Dieses Rennen findet nicht statt.' : 'Diese Session findet nicht statt.'}</p>}
                </div>
              )
            })}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField label="Warm-up" min={0} max={30} suffix="Min." value={form.warmup} onChange={(n) => set({ warmup: n })} hint="Aufwärmrunde vor dem Rennen." />
            <Field label={`Zeitraffer: ${form.time_multiplier === 0 ? 'aus' : `${form.time_multiplier}×`}`} hint="Beschleunigt den Tagesverlauf (Licht und Schatten).">
              <input type="range" min={0} max={25} value={form.time_multiplier} onChange={(e) => set({ time_multiplier: +e.target.value })} className="w-full" />
            </Field>
          </div>
        </Card>

        <Card id="regeln" title="Regeln" className="scroll-mt-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetaSelect form={form} set={set} meta={meta} label="Spritverbrauch" group="FuelUsage" k="fuel_usage" />
            <MetaSelect form={form} set={set} meta={meta} label="Reifenverschleiß" group="TireWear" k="tire_wear" />
            <MetaSelect form={form} set={set} meta={meta} label="Reifentemperatur" group="TireTemperature" k="tire_temperature" />
            <MetaSelect form={form} set={set} meta={meta} label="Schaden" group="Damage" k="damage" />
            <MetaSelect form={form} set={set} meta={meta} label="Flaggen" group="FlagRules" k="flag_rules" />
            <MetaSelect form={form} set={set} meta={meta} label="Streckenabkürzen" group="CutRules" k="cut_rules" />
            <MetaSelect form={form} set={set} meta={meta} label="Pflicht-Boxenstopp" group="MandatoryPitstop" k="mandatory_pitstop" />
            <MetaSelect form={form} set={set} meta={meta} label="Max. Ping" group="MaxPing" k="max_ping" hint="Fahrer mit höherem Ping werden abgelehnt." />
            <MetaSelect form={form} set={set} meta={meta} label="Rennende nach Sieger" group="RaceFinishDuration" k="race_finish_duration" hint="Sekunden, die das Rennen nach dem Sieger weiterläuft." />
            <MetaSelect form={form} set={set} meta={meta} label="Karierte Flagge nach" group="CheckeredAfterTime" k="checkered_after_time" hint="Sekunden." />
            <NumberField label="Umgekehrter Start" min={0} max={100} value={form.reverse_start_order_places} onChange={(n) => set({ reverse_start_order_places: n })} hint="Anzahl der Plätze, die im Rennen 2 umgedreht werden. 0 oder 1 = aus." />
            <NumberField label="Unfertige Fahrer: Start-Verzögerung" min={0} max={120} suffix="s" value={form.non_ready_pitlane_start_delay} onChange={(n) => set({ non_ready_pitlane_start_delay: n })} />
            <NumberField label="Max. Vorfallpunkte" min={0} max={1000} value={form.max_incident_points} onChange={(n) => set({ max_incident_points: n })} hint="Darüber wird ein Fahrer ausgeschlossen. 0 = aus." />
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <Toggle label="Fehlstart verhindern" hint="Fahrzeuge werden bis zur grünen Ampel gehalten." checked={!!form.prevent_false_start} onChange={(v) => set({ prevent_false_start: v ? 1 : 0 })} />
            <Toggle label="Rammschutz" hint="Verhindert absichtliches Rammen (Wrecker Prevention)." checked={!!form.wrecker_prevention} onChange={(v) => set({ wrecker_prevention: v ? 1 : 0 })} />
            <Toggle label="Training bei leerem Server fortsetzen" checked={!!form.stay_in_practice_if_empty} onChange={(v) => set({ stay_in_practice_if_empty: v ? 1 : 0 })} />
            <Toggle label="Beitritt im Qualifying erlauben" checked={!!form.allow_join_in_qualifying} onChange={(v) => set({ allow_join_in_qualifying: v ? 1 : 0 })} />
            <Toggle label="Startaufstellung nach Bestenliste" checked={!!form.starting_grid_from_leaderboards} onChange={(v) => set({ starting_grid_from_leaderboards: v ? 1 : 0 })} />
            <Toggle label="Feste Fahrzeug-Setups" hint="Alle fahren mit dem Standard-Setup." checked={!!form.fixed_setup} onChange={(v) => set({ fixed_setup: v ? 1 : 0 })} />
          </div>
        </Card>

        <Card id="fahrhilfen" title="Fahrhilfen" className="scroll-mt-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Vorlage" hint="Setzt die Einzelwerte darunter.">
              <Select value={form.drive_assist_preset} onChange={(v) => set({ drive_assist_preset: v, ...(PRESET_DEFAULTS[v] || {}) })} options={M('DriveAssistPreset')} />
            </Field>
            <MetaSelect form={form} set={set} meta={meta} label="Getriebe" group="DriveAssistTransmission" k="assist_transmission" />
            <MetaSelect form={form} set={set} meta={meta} label="ESP" group="DriveAssistEsp" k="assist_esp" />
            <MetaSelect form={form} set={set} meta={meta} label="Lenkhilfe" group="DriveAssistSteer" k="assist_steer" />
            <MetaSelect form={form} set={set} meta={meta} label="Bremshilfe" group="DriveAssistBrake" k="assist_brake" />
            <MetaSelect form={form} set={set} meta={meta} label="Traktionskontrolle" group="DriveAssistTractionControl" k="assist_traction" />
            <MetaSelect form={form} set={set} meta={meta} label="Rennlinie" group="DriveAssistRaceline" k="assist_raceline" />
            <MetaSelect form={form} set={set} meta={meta} label="Auto-Boxenstopp" group="DriveAssistAutopit" k="assist_autopit" />
          </div>
        </Card>

        <Card id="zugang" title="Zugang nach Rating" className="scroll-mt-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetaSelect form={form} set={set} meta={meta} label="Mindest-Rating" group="MinRating" k="min_rating" />
            <MetaSelect form={form} set={set} meta={meta} label="Höchst-Rating" group="MaxRating" k="max_rating" />
            <MetaSelect form={form} set={set} meta={meta} label="Mindest-Reputation" group="MinReputation" k="min_reputation" />
            <MetaSelect form={form} set={set} meta={meta} label="Höchst-Reputation" group="MaxReputation" k="max_reputation" />
          </div>
          <p className="hint">„{tr('Anyone')}" bedeutet keine Beschränkung.</p>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-600 bg-ink-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1 text-sm">
            {problems.length ? (
              <span className="flex items-center gap-2 text-warn"><AlertTriangle size={16} className="shrink-0" /><span className="truncate">{problems[0]}{problems.length > 1 ? ` (+${problems.length - 1})` : ''}</span></span>
            ) : dirty ? <span className="text-ink-200">Ungespeicherte Änderungen</span> : <span className="text-ink-300">Alles gespeichert</span>}
          </div>
          {!embedded && <button className="btn-ghost" onClick={() => nav(-1)}>Abbrechen</button>}
          {serverId && running && (
            <button className="btn-ghost" disabled={busy || restarting || !!problems.length} onClick={() => save(true)}>
              {restarting ? <Spinner /> : <RefreshCw size={15} />} Speichern &amp; neu starten
            </button>
          )}
          <button className="btn-primary" disabled={busy || restarting || !!problems.length || (serverId && !dirty)} onClick={() => save(false)}>
            {busy ? <Spinner /> : <Save size={15} />} {serverId ? 'Speichern' : 'Server anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(Editor)
