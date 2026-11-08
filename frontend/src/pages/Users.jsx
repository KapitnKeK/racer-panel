import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Plus, Shuffle, Trash2, UserPlus } from 'lucide-react'
import { api, ROLE_LABEL } from '../api'
import { useAuth } from '../auth'
import { Badge, Card, Confirm, Field, Modal, Select, Spinner, useAsync, useToast } from '../components/ui'
import { randomPassword } from '../utils'

const ROLES = [
  { value: 'viewer', label: 'Zuschauer — sieht Live-Daten' },
  { value: 'host', label: 'Host — steuert und konfiguriert Server' },
  { value: 'admin', label: 'Admin — zusätzlich Benutzer, Bans, Löschen' },
]

function PasswordBox({ value, onChange }) {
  const toast = useToast()
  const [shown, setShown] = useState(false)
  return (
    <div className="flex gap-2">
      <input className="input font-mono" type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" placeholder="mind. 10 Zeichen" />
      <button type="button" className="btn-ghost !px-2.5" title="Zufallspasswort" onClick={() => { onChange(randomPassword(16)); setShown(true) }}><Shuffle size={16} /></button>
      <button type="button" className="btn-ghost !px-2.5" title="Kopieren" disabled={!value} onClick={async () => { await navigator.clipboard?.writeText(value); toast('Passwort kopiert', 'ok') }}><Copy size={16} /></button>
    </div>
  )
}

export default function Users() {
  const { user: me } = useAuth()
  const [list, setList] = useState(null)
  const [busy, run] = useAsync()
  const [add, setAdd] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', role: 'host' })
  const [pwFor, setPwFor] = useState(null)
  const [pw, setPw] = useState('')
  const [delFor, setDelFor] = useState(null)
  const [created, setCreated] = useState(null)

  const load = useCallback(() => api('/api/users').then(setList).catch(() => setList([])), [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    const r = await run(() => api('/api/users', { method: 'POST', body: form }))
    if (r) { setCreated({ ...form }); setAdd(false); setForm({ username: '', password: '', role: 'host' }); load() }
  }

  if (!list) return <div className="grid place-items-center py-24"><Spinner className="text-accent" /></div>

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold uppercase tracking-wider">Benutzer</h1>
          <p className="mt-1 text-sm text-ink-300">Wer das Panel nutzen darf und was er darf.</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm({ username: '', password: randomPassword(16), role: 'host' }); setAdd(true) }}><UserPlus size={16} /> Benutzer anlegen</button>
      </div>

      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr className="border-b border-ink-600"><th className="th">Benutzer</th><th className="th">Rolle</th><th className="th">Angelegt</th><th className="th text-right">Aktion</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-b border-ink-700/70">
                  <td className="td font-medium">{u.username} {u.id === me.id && <Badge tone="blue" className="ml-1.5">Du</Badge>}</td>
                  <td className="td">
                    <Select className="!w-44 !py-1.5" value={u.role} onChange={async (role) => { await run(() => api(`/api/users/${u.id}`, { method: 'PATCH', body: { role } }), `${u.username}: ${ROLE_LABEL[role]}`); load() }} options={ROLES.map((r) => ({ value: r.value, label: ROLE_LABEL[r.value] }))} />
                  </td>
                  <td className="td text-ink-300">{new Date(u.created * 1000).toLocaleDateString('de-DE')}</td>
                  <td className="td text-right">
                    <div className="inline-flex gap-1.5">
                      <button className="btn-ghost btn-sm" onClick={() => { setPwFor(u); setPw(randomPassword(16)) }}><KeyRound size={14} /> Passwort</button>
                      <button className="btn-ghost btn-sm hover:!border-accent/60 hover:!text-red-300" disabled={u.id === me.id} onClick={() => setDelFor(u)} title={u.id === me.id ? 'Du kannst dich nicht selbst löschen' : 'Löschen'}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={add} onClose={() => setAdd(false)} title="Benutzer anlegen" footer={<><button className="btn-ghost" onClick={() => setAdd(false)}>Abbrechen</button><button className="btn-primary" disabled={busy || form.username.length < 2 || form.password.length < 10} onClick={create}>{busy ? <Spinner /> : <Plus size={15} />} Anlegen</button></>}>
        <div className="space-y-4">
          <Field label="Benutzername" hint="Buchstaben, Zahlen, . _ -"><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus /></Field>
          <Field label="Rolle"><Select value={form.role} onChange={(role) => setForm({ ...form, role })} options={ROLES} /></Field>
          <Field label="Passwort" hint="Es wird nur einmal angezeigt. Gib es dem Fahrer persönlich weiter."><PasswordBox value={form.password} onChange={(password) => setForm({ ...form, password })} /></Field>
        </div>
      </Modal>

      <Modal open={!!created} onClose={() => setCreated(null)} title="Benutzer angelegt" footer={<button className="btn-primary" onClick={() => setCreated(null)}><Check size={15} /> Fertig</button>}>
        <p className="mb-3 text-sm text-ink-200">Diese Zugangsdaten werden nur jetzt angezeigt:</p>
        <dl className="space-y-2 rounded-lg bg-ink-900/70 p-3 font-mono text-sm">
          <div className="flex justify-between gap-3"><dt className="text-ink-300">Benutzer</dt><dd>{created?.username}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-300">Passwort</dt><dd className="break-all">{created?.password}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-300">Rolle</dt><dd>{created && ROLE_LABEL[created.role]}</dd></div>
        </dl>
        <p className="hint">Tipp: Lege die Zugangsdaten zusätzlich im Passwort-Tresor ab, falls ihr sie gemeinsam verwaltet.</p>
      </Modal>

      <Modal open={!!pwFor} onClose={() => setPwFor(null)} title={`Passwort: ${pwFor?.username || ''}`} footer={<><button className="btn-ghost" onClick={() => setPwFor(null)}>Abbrechen</button><button className="btn-primary" disabled={busy || pw.length < 10} onClick={async () => { const r = await run(() => api(`/api/users/${pwFor.id}`, { method: 'PATCH', body: { password: pw } }), 'Passwort geändert'); if (r) setPwFor(null) }}>{busy && <Spinner />}Setzen</button></>}>
        <Field label="Neues Passwort" hint="Der Benutzer wird überall abgemeldet und muss sich neu anmelden."><PasswordBox value={pw} onChange={setPw} /></Field>
      </Modal>

      <Confirm open={!!delFor} danger title="Benutzer löschen?" confirmLabel="Löschen" busy={busy} onClose={() => setDelFor(null)}
        text={`„${delFor?.username}" kann sich danach nicht mehr anmelden.`}
        onConfirm={async () => { await run(() => api(`/api/users/${delFor.id}`, { method: 'DELETE' }), 'Benutzer gelöscht'); setDelFor(null); load() }} />
    </div>
  )
}
