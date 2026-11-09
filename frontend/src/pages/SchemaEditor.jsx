import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save } from 'lucide-react'
import { api } from '../api'
import { Card, Field, Select, Spinner, Toggle, useAsync, useToast } from '../components/ui'

// Editor für Spiele ohne eigenen Editor. Das Plugin liefert unter /api/games/<spiel>/schema eine Feldliste:
// [{ key, label, type: text|password|number|select|bool|textarea, group, hint, min, max, options:[{value,label}], default }]
export default function SchemaEditor({ game, serverId = null, embedded = false }) {
  const nav = useNavigate()
  const toast = useToast()
  const [schema, setSchema] = useState(null)
  const [form, setForm] = useState({})
  const [busy, run] = useAsync()
  const [err, setErr] = useState('')

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const sc = await api(`/api/games/${game}/schema`)
        let f = Object.fromEntries(sc.map((x) => [x.key, x.default ?? (x.type === 'bool' ? false : x.type === 'number' ? 0 : x.type === 'multiselect' ? [] : '')]))
        if (serverId) f = { ...f, ...(await api(`/api/servers/${serverId}`)) }
        if (!stop) { setSchema(sc); setForm(f) }
      } catch (e) { if (!stop) setErr(e.message) }
    })()
    return () => { stop = true }
  }, [game, serverId])

  const groups = useMemo(() => {
    const m = new Map()
    for (const f of schema || []) { const g = f.group || 'Allgemein'; if (!m.has(g)) m.set(g, []); m.get(g).push(f) }
    return [...m.entries()]
  }, [schema])

  if (err) return <Card><p className="text-sm text-red-300">Laden fehlgeschlagen: {err}</p></Card>
  if (!schema) return <div className="grid place-items-center py-16"><Spinner className="text-accent" /></div>

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const save = async () => {
    const body = Object.fromEntries(schema.map((x) => [x.key, x.type === 'number' ? Number(form[x.key]) : form[x.key]]))
    if (serverId) {
      const r = await run(() => api(`/api/servers/${serverId}`, { method: 'PUT', body }), 'Gespeichert')
      if (r?.restart_needed) toast('Änderungen gelten ab dem nächsten Serverstart.', 'ok')
    } else {
      const r = await run(() => api('/api/servers', { method: 'POST', body: { ...body, game } }), 'Server angelegt')
      if (r) nav(`/server/${r.id}`)
    }
  }

  const input = (f) => {
    const v = form[f.key]
    if (f.type === 'bool') return <Toggle checked={!!v} onChange={(x) => set(f.key, x)} label={f.label} hint={f.hint} />
    if (f.type === 'multiselect') {
      const cur = Array.isArray(v) ? v : []
      const toggle = (val) => set(f.key, cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val])
      return (
        <Field label={`${f.label} (${cur.length} gewählt)`} hint={f.hint}>
          <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-ink-600 bg-ink-900/60 p-2">
            {(f.options || []).map((o) => <button type="button" key={o.value} className={`btn-sm ${cur.includes(o.value) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggle(o.value)}>{o.label}</button>)}
            {!(f.options || []).length && <span className="text-sm text-ink-300">Keine Inhalte gefunden</span>}
          </div>
        </Field>
      )
    }
    const ctl = f.type === 'select' ? <Select value={v} onChange={(x) => set(f.key, x)} options={f.options || []} />
      : f.type === 'textarea' ? <textarea className="input min-h-24 font-mono text-xs" value={v ?? ''} onChange={(e) => set(f.key, e.target.value)} />
      : <input className="input" type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'} min={f.min} max={f.max} value={v ?? ''} onChange={(e) => set(f.key, e.target.value)} />
    return <Field label={f.label} hint={f.hint}>{ctl}</Field>
  }

  return (
    <div className="space-y-5">
      {groups.map(([g, fields]) => (
        <Card key={g} title={g}>
          <div className="grid gap-4 sm:grid-cols-2">{fields.map((f) => <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>{input(f)}</div>)}</div>
        </Card>
      ))}
      <div className={embedded ? '' : 'sticky bottom-4'}>
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : <Save size={15} />} {serverId ? 'Speichern' : 'Server anlegen'}</button>
      </div>
    </div>
  )
}
