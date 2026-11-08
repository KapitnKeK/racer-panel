import { useMemo } from 'react'

/** Geschwindigkeitsverlauf (SVG) der letzten ~2 Minuten */
export default function SpeedChart({ samples, color = '#e10600', windowSec = 120 }) {
  const { path, area, max, cur, peak } = useMemo(() => {
    const now = Date.now()
    const pts = (samples || []).filter((s) => now - s.t <= windowSec * 1000)
    if (pts.length < 2) return { path: '', area: '', max: 100, cur: pts.at(-1)?.kmh ?? 0, peak: 0 }
    const peak = Math.max(...pts.map((p) => p.kmh))
    const max = Math.max(100, Math.ceil(peak / 50) * 50)
    const W = 300, H = 80
    const x = (t) => W - ((now - t) / (windowSec * 1000)) * W
    const y = (v) => H - (v / max) * (H - 6) - 3
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.kmh).toFixed(1)}`).join(' ')
    return { path: d, area: `${d} L${x(pts.at(-1).t).toFixed(1)},${H} L${x(pts[0].t).toFixed(1)},${H} Z`, max, cur: pts.at(-1).kmh, peak }
  }, [samples, windowSec, Math.floor(Date.now() / 1000)]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="mb-1 flex items-end justify-between text-xs text-ink-300">
        <span>Letzte {Math.round(windowSec / 60)} Min.</span>
        <span>Spitze <b className="text-ink-100">{Math.round(peak)}</b> km/h</span>
      </div>
      <svg viewBox="0 0 300 80" className="h-24 w-full overflow-visible rounded bg-ink-900/70" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2="300" y1={80 * f} y2={80 * f} stroke="#222733" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {area && <path d={area} fill={color} opacity="0.16" />}
        {path && <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        {!path && <text x="150" y="44" textAnchor="middle" fill="#6b7690" fontSize="11">Noch keine Fahrdaten</text>}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-ink-400"><span>0</span><span>Achse bis {max} km/h · jetzt {Math.round(cur)}</span></div>
    </div>
  )
}
