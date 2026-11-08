import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react'

export function Spinner({ className = '' }) {
  return <Loader2 className={`animate-spin ${className}`} size={18} />
}

export function Badge({ tone = 'gray', children, dot = false, className = '' }) {
  const tones = {
    gray: 'border-ink-500 bg-ink-700/60 text-ink-200',
    green: 'border-ok/40 bg-ok/10 text-ok',
    red: 'border-accent/50 bg-accent-soft text-red-300',
    amber: 'border-warn/40 bg-warn/10 text-warn',
    blue: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
  }
  return (
    <span className={`badge ${tones[tone]} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full bg-current ${tone === 'green' ? 'animate-pulseDot' : ''}`} />}
      {children}
    </span>
  )
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  )
}

export function Select({ value, onChange, options, className = '', disabled }) {
  return (
    <select className={`input pr-8 ${className}`} value={value} disabled={disabled} onChange={(e) => onChange(Number.isNaN(+e.target.value) || e.target.value === '' ? e.target.value : +e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-ink-600 bg-ink-900/60 px-3 py-2.5 text-left transition hover:border-ink-400">
      <span>
        <span className="block text-sm text-ink-100">{label}</span>
        {hint && <span className="block text-xs text-ink-300">{hint}</span>}
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-ink-500'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

export function Card({ title, right, children, className = '', pad = true, id }) {
  return (
    <section id={id} className={`card ${pad ? 'card-pad' : ''} ${className}`}>
      {(title || right) && (
        <header className={`flex items-center justify-between gap-3 ${pad ? 'mb-3' : 'px-5 pb-1 pt-4'}`}>
          {title && <h2 className="h-section">{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

export function Empty({ icon: Icon, title, text, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Icon && <Icon className="text-ink-400" size={34} />}
      <div className="font-display text-xl tracking-wide text-ink-100">{title}</div>
      {text && <p className="max-w-md text-sm text-ink-300">{text}</p>}
      {children}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-b-xl`} role="dialog" aria-modal="true">
        <header className="flex items-center justify-between border-b border-ink-600 px-5 py-3.5">
          <h3 className="font-display text-xl font-semibold uppercase tracking-wider">{title}</h3>
          <button className="rounded p-1 text-ink-300 hover:bg-ink-600 hover:text-white" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-ink-600 px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  )
}

export function Confirm({ open, title, text, confirmLabel = 'Bestätigen', danger = false, onConfirm, onClose, busy }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={
      <>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Abbrechen</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>{busy && <Spinner />}{confirmLabel}</button>
      </>
    }>
      <p className="text-sm text-ink-200">{text}</p>
    </Modal>
  )
}

/* ---------------- Toasts ---------------- */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const id = useRef(0)
  const push = useCallback((text, tone = 'ok') => {
    const n = ++id.current
    setItems((l) => [...l, { n, text, tone }])
    setTimeout(() => setItems((l) => l.filter((x) => x.n !== n)), tone === 'err' ? 7000 : 3500)
  }, [])
  const icons = { ok: CheckCircle2, err: AlertTriangle, info: Info }
  const colors = { ok: 'text-ok', err: 'text-red-400', info: 'text-sky-300' }
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => {
          const I = icons[t.tone]
          return (
            <div key={t.n} className="card pointer-events-auto flex max-w-md items-start gap-2.5 px-4 py-3 text-sm shadow-2xl">
              <I size={18} className={`mt-0.5 shrink-0 ${colors[t.tone]}`} />
              <span>{t.text}</span>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export function useAsync() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (fn, okText) => {
    setBusy(true)
    try {
      const r = await fn()
      if (okText) toast(okText, 'ok')
      return r
    } catch (e) {
      toast(e.message || 'Fehler', 'err')
      return undefined
    } finally {
      setBusy(false)
    }
  }, [toast])
  return [busy, run]
}
