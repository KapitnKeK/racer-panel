import { useMemo, useState } from 'react'
import { Car, ChevronDown, ChevronRight, MapPin, Search } from 'lucide-react'
import { Badge } from './ui'

export function TrackPicker({ tracks, experience, value, onChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return tracks
      .map((t) => ({ ...t, layouts: t.layouts.filter((l) => l.experiences.includes(experience)) }))
      .filter((t) => t.layouts.length && (!ql || t.name.toLowerCase().includes(ql) || t.layouts.some((l) => l.name.toLowerCase().includes(ql))))
  }, [tracks, experience, q])

  const sel = useMemo(() => {
    for (const t of tracks) for (const l of t.layouts) if (l.id === value) return { track: t, layout: l }
    return null
  }, [tracks, value])

  return (
    <div>
      <div className={`mb-3 flex items-center gap-3 rounded-lg border px-3.5 py-3 ${sel ? 'border-accent/50 bg-accent-soft' : 'border-ink-600 bg-ink-900/60'}`}>
        <MapPin size={20} className={sel ? 'text-accent-hi' : 'text-ink-400'} />
        {sel ? (
          <div className="min-w-0">
            <div className="truncate font-display text-xl font-semibold leading-tight">{sel.track.name}</div>
            <div className="text-sm text-ink-200">{sel.layout.name} · max. {sel.layout.max} Fahrzeuge</div>
          </div>
        ) : (
          <span className="text-sm text-ink-300">Noch keine Strecke gewählt</span>
        )}
      </div>
      <div className="relative mb-2">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input className="input pl-9" placeholder={`Strecke suchen (${list.length} verfügbar)`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-ink-600 bg-ink-900/50 p-1.5">
        {list.map((t) => {
          const expanded = open === t.id || (q && list.length <= 6) || t.layouts.some((l) => l.id === value)
          return (
            <li key={t.id}>
              <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-ink-700">
                {expanded ? <ChevronDown size={15} className="text-ink-300" /> : <ChevronRight size={15} className="text-ink-300" />}
                <span className="flex-1 truncate">{t.name}</span>
                <span className="text-xs text-ink-400">{t.layouts.length} Layout{t.layouts.length > 1 ? 's' : ''}</span>
              </button>
              {expanded && (
                <div className="flex flex-wrap gap-1.5 px-2.5 pb-2 pl-8">
                  {t.layouts.map((l) => (
                    <button key={l.id} type="button" onClick={() => onChange(l.id, l)} className={`rounded-full border px-3 py-1 text-xs transition ${value === l.id ? 'border-accent bg-accent text-white' : 'border-ink-500 text-ink-200 hover:border-ink-300'}`}>
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
        {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-300">Keine Strecke gefunden.</li>}
      </ul>
    </div>
  )
}

export function CarPicker({ cars, classes, experience, value, onChange }) {
  const [q, setQ] = useState('')
  const [cls, setCls] = useState(null)
  const selected = useMemo(() => new Set(value), [value])
  const clsName = useMemo(() => Object.fromEntries(classes.map((c) => [c.Id, c.Name])), [classes])

  const avail = useMemo(() => cars.filter((c) => c.experiences.includes(experience)), [cars, experience])
  const classList = useMemo(() => {
    const m = new Map()
    for (const c of avail) m.set(c.class, (m.get(c.class) || 0) + 1)
    return [...m.entries()].map(([id, n]) => ({ id, n, name: clsName[id] || `Klasse ${id}` })).sort((a, b) => a.name.localeCompare(b.name))
  }, [avail, clsName])
  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return avail.filter((c) => (cls == null || c.class === cls) && (!ql || c.name.toLowerCase().includes(ql)))
  }, [avail, cls, q])

  const toggle = (id) => onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id])
  const addVisible = () => onChange([...new Set([...value, ...visible.map((c) => c.id)])])
  const removeVisible = () => { const v = new Set(visible.map((c) => c.id)); onChange(value.filter((x) => !v.has(x))) }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone={value.length ? 'red' : 'gray'}><Car size={12} /> {value.length} gewählt</Badge>
        <button type="button" className="btn-ghost btn-sm" onClick={addVisible}>Sichtbare alle</button>
        <button type="button" className="btn-ghost btn-sm" onClick={removeVisible}>Sichtbare keine</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([])}>Alle abwählen</button>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setCls(null)} className={`rounded-full border px-3 py-1 text-xs transition ${cls == null ? 'border-accent bg-accent text-white' : 'border-ink-500 text-ink-200 hover:border-ink-300'}`}>Alle ({avail.length})</button>
        {classList.map((c) => (
          <button key={c.id} type="button" onClick={() => setCls(cls === c.id ? null : c.id)} className={`rounded-full border px-3 py-1 text-xs transition ${cls === c.id ? 'border-accent bg-accent text-white' : 'border-ink-500 text-ink-200 hover:border-ink-300'}`}>
            {c.name} <span className="opacity-60">{c.n}</span>
          </button>
        ))}
      </div>
      <div className="relative mb-2">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input className="input pl-9" placeholder="Fahrzeug suchen" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="grid max-h-96 gap-1.5 overflow-y-auto rounded-lg border border-ink-600 bg-ink-900/50 p-1.5 sm:grid-cols-2">
        {visible.map((c) => (
          <li key={c.id}>
            <label className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm transition ${selected.has(c.id) ? 'border-accent/60 bg-accent-soft' : 'border-transparent hover:bg-ink-700'}`}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.name}</span>
                <span className="block truncate text-xs text-ink-300">{clsName[c.class]} · {c.liveries} Lackierungen</span>
              </span>
            </label>
          </li>
        ))}
        {visible.length === 0 && <li className="col-span-full px-3 py-6 text-center text-sm text-ink-300">Kein Fahrzeug gefunden.</li>}
      </ul>
    </div>
  )
}
