import { useCallback, useEffect, useRef, useState } from 'react'
import { Crosshair, Minus, Navigation, Plus, RotateCw } from 'lucide-react'
import { api, can } from '../api'
import { useAuth } from '../auth'
import { useToast } from './ui'
import { classColor, driverColor, speedColor } from '../utils'

const ROT_KEY = 'r3e.map.rot.'
const M_PER_DEG = 111320

const TILES = {
  sat: { label: 'Satellit', url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, maxZ: 19, attr: 'Bilder © Esri, Maxar, Earthstar Geographics' },
  osm: { label: 'Straße', url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, maxZ: 19, attr: '© OpenStreetMap-Mitwirkende' },
}
const tileCache = new Map()
function getTile(kind, z, x, y, onLoad) {
  const key = `${kind}/${z}/${x}/${y}`
  let e = tileCache.get(key)
  if (!e) {
    e = { img: new Image(), ok: false }
    e.img.onload = () => { e.ok = true; onLoad() }
    e.img.onerror = () => { e.err = true }
    e.img.src = TILES[kind].url(z, x, y)
    tileCache.set(key, e)
    if (tileCache.size > 600) tileCache.delete(tileCache.keys().next().value)
  }
  return e.ok ? e.img : null
}
function worldToLL(g, x, z) {
  const zz = g.mirror ? -z : z
  const th = (g.rot_deg * Math.PI) / 180
  const e = x * Math.cos(th) - zz * Math.sin(th)
  const n = x * Math.sin(th) + zz * Math.cos(th)
  return [g.lat0 + n / M_PER_DEG, g.lon0 + e / (M_PER_DEG * Math.cos((g.lat0 * Math.PI) / 180))]
}
function llToWorld(g, lat, lon) {
  const e = (lon - g.lon0) * M_PER_DEG * Math.cos((g.lat0 * Math.PI) / 180)
  const n = (lat - g.lat0) * M_PER_DEG
  const th = (g.rot_deg * Math.PI) / 180
  const x = e * Math.cos(th) + n * Math.sin(th)
  const zz = -e * Math.sin(th) + n * Math.cos(th)
  return [x, g.mirror ? -zz : zz]
}
const tileToLL = (x, y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return [(180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), (x / 2 ** z) * 360 - 180]
}
const llToTile = (lat, lon, z) => {
  const sn = Math.sin((lat * Math.PI) / 180)
  return [((lon + 180) / 360) * 2 ** z, (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * 2 ** z]
}

function rotate(x, z, r) {
  switch (r & 3) {
    case 1: return [z, -x]
    case 2: return [-x, -z]
    case 3: return [-z, x]
    default: return [x, z]
  }
}

/**
 * Live-Streckenkarte (Canvas).
 * - Streckenumriss: aus gefahrenen Punkten gelernt (Backend), vorgerendert auf Offscreen-Canvas
 * - Fahrer: weich interpoliert, Kometenschweif aus der Verlaufshistorie
 */
export default function TrackMap({ layoutId, players, names, hist, serverId, selected, onSelect, reportMs = 3000 }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const tipRef = useRef(null)
  const [outline, setOutline] = useState({ points: [], cell: 3 })
  const [follow, setFollow] = useState(false)
  const { user } = useAuth()
  const toast = useToast()
  const [geo, setGeo] = useState(null)
  const [geoInfo, setGeoInfo] = useState(null)
  const [aligning, setAligning] = useState(false)
  const [hint, setHint] = useState(null) // null = zu, sonst { lat, lon }
  const [baseMode, setBaseMode] = useState(() => { try { return localStorage.getItem('r3e.map.base') || 'sat' } catch { return 'sat' } })
  const pickBase = (m) => { setBaseMode(m); st.current.layerKey = ''; try { localStorage.setItem('r3e.map.base', m) } catch { /* */ } }
  const [colorMode, setColorMode] = useState(() => { try { return localStorage.getItem('r3e.map.color') || 'driver' } catch { return 'driver' } })
  const [trackMode, setTrackMode] = useState(() => { try { return localStorage.getItem('r3e.map.track') } catch { return null } })
  const pickColor = (m) => { setColorMode(m); try { localStorage.setItem('r3e.map.color', m) } catch { /* */ } }
  const pickTrack = (m) => { setTrackMode(m); st.current.layerKey = ''; try { localStorage.setItem('r3e.map.track', m) } catch { /* */ } }
  const [rot, setRot] = useState(() => {
    try { return Number(localStorage.getItem(ROT_KEY + layoutId)) || 0 } catch { return 0 }
  })

  // Refs für die Render-Schleife (kein Re-Mount bei jeder Änderung)
  const st = useRef({
    w: 0, h: 0, dpr: 1,
    view: { cx: 0, cz: 0, scale: 0.2, manual: false },
    disp: new Map(),
    mouse: null,
    drag: null,
    layer: null, layerKey: '',
    hover: null,
  })
  const live = useRef({})
  live.current = { players, names, hist, serverId, selected, outline, follow, rot, reportMs, colorMode, trackMode, geo, baseMode }

  // Umriss laden und regelmäßig auffrischen
  useEffect(() => {
    if (!layoutId) return
    let stop = false
    const load = async () => {
      try {
        const d = await api(`/api/tracks/${layoutId}/outline`)
        if (!stop) { setOutline(d); st.current.layerKey = '' }
      } catch { /* still */ }
    }
    load()
    const iv = setInterval(load, 20000)
    return () => { stop = true; clearInterval(iv) }
  }, [layoutId])

  useEffect(() => {
    if (!layoutId) return
    let stop = false
    const load = () => api(`/api/tracks/${layoutId}/geo`).then((d) => { if (!stop) { setGeo(d.geo); setGeoInfo(d.auto); st.current.layerKey = '' } }).catch(() => {})
    load()
    const iv = setInterval(() => { if (!geo) load() }, 60000)
    return () => { stop = true; clearInterval(iv) }
  }, [layoutId])

  useEffect(() => {
    try { setRot(Number(localStorage.getItem(ROT_KEY + layoutId)) || 0) } catch { /* */ }
  }, [layoutId])

  const alignNow = async () => {
    setAligning(true)
    try {
      const body = hint && hint.lat && hint.lon ? { hint_lat: Number(hint.lat.replace(',', '.')), hint_lon: Number(hint.lon.replace(',', '.')) } : {}
      const r = await api(`/api/tracks/${layoutId}/geo/auto`, { method: 'POST', body })
      if (r.ok) {
        toast(`Karte ausgerichtet (${r.place}, Abweichung ${r.median_m} m)`, 'ok')
        const d = await api(`/api/tracks/${layoutId}/geo`)
        setGeo(d.geo); setGeoInfo(d.auto); st.current.layerKey = ''; setHint(null)
      } else {
        toast(`Ausrichten nicht möglich: ${r.reason}`, 'err')
        if (/Ort|nicht gefunden|keine/.test(r.reason || '')) setHint((h) => h || { lat: '', lon: '' })
      }
    } catch (e) { toast(e.message, 'err') } finally { setAligning(false) }
  }

  const rotateMap = () => {
    const r = (rot + 1) & 3
    setRot(r)
    st.current.view.manual = false
    st.current.layerKey = ''
    try { localStorage.setItem(ROT_KEY + layoutId, String(r)) } catch { /* */ }
  }

  const fit = useCallback(() => {
    st.current.view.manual = false
    setFollow(false)
  }, [])

  const zoomBy = useCallback((f, px, py) => {
    const s = st.current
    const v = s.view
    const ax = px ?? s.w / 2
    const ay = py ?? s.h / 2
    const wx = (ax - s.w / 2) / v.scale + v.cx
    const wz = -(ay - s.h / 2) / v.scale + v.cz
    v.scale = Math.min(8, Math.max(0.01, v.scale * f))
    v.cx = wx - (ax - s.w / 2) / v.scale
    v.cz = wz + (ay - s.h / 2) / v.scale
    v.manual = true
    s.layerKey = ''
  }, [])

  // Resize
  useEffect(() => {
    const wrap = wrapRef.current
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect()
      const s = st.current
      s.dpr = Math.min(2, window.devicePixelRatio || 1)
      s.w = r.width
      s.h = r.height
      const c = canvasRef.current
      c.width = Math.round(r.width * s.dpr)
      c.height = Math.round(r.height * s.dpr)
      c.style.width = r.width + 'px'
      c.style.height = r.height + 'px'
      s.layerKey = ''
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // Render-Schleife
  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dtf = Math.min(0.1, (now - last) / 1000)
      last = now
      const s = st.current
      const L = live.current
      const c = canvasRef.current
      if (!c || !s.w) return
      const ctx = c.getContext('2d')
      const { view } = s
      const r = L.rot
      const pts = L.outline.points || []
      const cell = L.outline.cell || 3
      const minN = pts.length > 400 ? 2 : 1
      const geo = L.geo
      const base = geo && L.baseMode !== 'none' ? L.baseMode : null
      const trackEff = L.trackMode ?? (base ? 'off' : 'road')
      const colorOf = (p) => (L.colorMode === 'class' && p.class ? classColor(p.class) : driverColor(p.user_id))

      // Fahrer-Zielpositionen (rotiert) und weiche Anzeige
      const cars = []
      for (const p of L.players || []) {
        const [tx, tz] = rotate(p.x, p.z, r)
        let d = s.disp.get(p.user_id)
        if (!d) { d = { x: tx, z: tz }; s.disp.set(p.user_id, d) }
        const tau = Math.max(0.12, (L.reportMs / 1000) * 0.5)
        const k = 1 - Math.exp(-dtf / tau)
        const jump = Math.hypot(tx - d.x, tz - d.z)
        if (jump > 400) { d.x = tx; d.z = tz } else { d.x += (tx - d.x) * k; d.z += (tz - d.z) * k }
        cars.push({ p, d, tx, tz })
      }
      for (const uid of [...s.disp.keys()]) if (!(L.players || []).some((p) => p.user_id === uid)) s.disp.delete(uid)

      // Auto-Fit
      if (!view.manual) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
        const add = (x, z) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z }
        for (const q of pts) if (q[2] >= minN) { const [x, z] = rotate(q[0] * cell, q[1] * cell, r); add(x, z) }
        for (const cr of cars) add(cr.d.x, cr.d.z)
        if (minX === Infinity && geo?.view) { const [a, b, c2, d2] = geo.view; for (const [x, z] of [[a, b], [a, d2], [c2, b], [c2, d2]]) { const [rx, rz] = rotate(x, z, r); add(rx, rz) } }
        if (minX === Infinity) { minX = -150; maxX = 150; minZ = -100; maxZ = 100 }
        const ex = Math.max(120, maxX - minX)
        const ez = Math.max(120, maxZ - minZ)
        const pad = 46
        const sc = Math.min((s.w - pad * 2) / ex, (s.h - pad * 2) / ez)
        const tcx = (minX + maxX) / 2
        const tcz = (minZ + maxZ) / 2
        view.cx += (tcx - view.cx) * 0.12
        view.cz += (tcz - view.cz) * 0.12
        view.scale += (sc - view.scale) * 0.12
        if (Math.abs(view.scale - sc) / sc > 0.003) s.layerKey = ''
      }
      if (L.follow && L.selected != null) {
        const cr = cars.find((x) => x.p.user_id === L.selected)
        if (cr) { view.cx += (cr.d.x - view.cx) * 0.15; view.cz += (cr.d.z - view.cz) * 0.15; view.manual = true }
      }

      const sx = (x) => (x - view.cx) * view.scale + s.w / 2
      const sy = (z) => s.h / 2 - (z - view.cz) * view.scale

      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
      ctx.clearRect(0, 0, s.w, s.h)

      // Umriss-Layer neu rendern, wenn sich Ansicht/Daten ändern
      const key = `${s.w}x${s.h}|${view.cx.toFixed(1)}|${view.cz.toFixed(1)}|${view.scale.toFixed(4)}|${r}|${pts.length}|${trackEff}|${base}|${geo ? 1 : 0}`
      if (key !== s.layerKey) {
        s.layerKey = key
        if (!s.layer) s.layer = document.createElement('canvas')
        s.layer.width = Math.round(s.w * s.dpr)
        s.layer.height = Math.round(s.h * s.dpr)
        const lc = s.layer.getContext('2d')
        lc.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
        if (base) {
          lc.fillStyle = '#0c0e12'
          lc.fillRect(0, 0, s.w, s.h)
          const kind = TILES[base]
          const cosLat = Math.cos((geo.lat0 * Math.PI) / 180)
          const inv = (4 - (r & 3)) & 3
          const cornersLL = [[0, 0], [s.w, 0], [0, s.h], [s.w, s.h]].map(([px, py]) => {
            const xr = (px - s.w / 2) / view.scale + view.cx
            const zr = -(py - s.h / 2) / view.scale + view.cz
            const [x, z] = rotate(xr, zr, inv)
            return worldToLL(geo, x, z)
          })
          let zoom = Math.max(12, Math.min(kind.maxZ, Math.round(Math.log2((156543.03392 * cosLat) * view.scale) + 0.4)))
          let x0, x1, y0, y1
          for (;;) {
            const ts = cornersLL.map(([la, lo]) => llToTile(la, lo, zoom))
            x0 = Math.floor(Math.min(...ts.map((t) => t[0]))); x1 = Math.floor(Math.max(...ts.map((t) => t[0])))
            y0 = Math.floor(Math.min(...ts.map((t) => t[1]))); y1 = Math.floor(Math.max(...ts.map((t) => t[1])))
            if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 100 || zoom <= 12) break
            zoom--
          }
          const reload = () => { s.layerKey = '' }
          const proj = (tx, ty) => {
            const [la, lo] = tileToLL(tx, ty, zoom)
            const [wx, wz] = llToWorld(geo, la, lo)
            const [xr, zr] = rotate(wx, wz, r)
            return [sx(xr), sy(zr)]
          }
          for (let ty = y0; ty <= y1; ty++) {
            for (let tx = x0; tx <= x1; tx++) {
              const img = getTile(base, zoom, tx, ty, reload)
              if (!img) continue
              const p00 = proj(tx, ty), p10 = proj(tx + 1, ty), p01 = proj(tx, ty + 1)
              lc.save()
              lc.transform((p10[0] - p00[0]) / 256, (p10[1] - p00[1]) / 256, (p01[0] - p00[0]) / 256, (p01[1] - p00[1]) / 256, p00[0], p00[1])
              lc.drawImage(img, -0.4, -0.4, 256.8, 256.8)
              lc.restore()
            }
          }
          if (base === 'sat') { lc.fillStyle = 'rgba(8,10,14,0.18)'; lc.fillRect(0, 0, s.w, s.h) }
        }
        const half = Math.max(2.2, cell * view.scale * 0.95)
        const vis = []
        if (trackEff !== 'off') for (const q of pts) {
          if (q[2] < minN) continue
          const [x, z] = rotate(q[0] * cell, q[1] * cell, r)
          const px = sx(x), py = sy(z)
          if (px < -12 || py < -12 || px > s.w + 12 || py > s.h + 12) continue
          vis.push([px, py, q[3]])
        }
        // 1) heller Fahrbahnrand, 2) Fahrbahn (Asphalt oder Tempo-Farbe) darüber -> durchgehende Straße
        lc.fillStyle = base ? 'rgba(255,255,255,0.55)' : 'rgba(150,162,186,0.95)'
        lc.beginPath()
        for (const v of vis) { lc.moveTo(v[0] + half + 1.6, v[1]); lc.arc(v[0], v[1], half + 1.6, 0, Math.PI * 2) }
        lc.fill()
        if (trackEff === 'speed') {
          for (const v of vis) { lc.fillStyle = speedColor(v[2]); lc.beginPath(); lc.arc(v[0], v[1], half, 0, Math.PI * 2); lc.fill() }
        } else {
          lc.fillStyle = '#2b313d'
          lc.beginPath()
          for (const v of vis) { lc.moveTo(v[0] + half, v[1]); lc.arc(v[0], v[1], half, 0, Math.PI * 2) }
          lc.fill()
        }
      }
      if (s.layer) ctx.drawImage(s.layer, 0, 0, s.w, s.h)

      // Schweife
      for (const cr of cars) {
        const arr = L.hist.current.get(`${L.serverId}:${cr.p.user_id}`)
        if (!arr || arr.length < 2) continue
        const col = colorOf(cr.p)
        const tail = arr.slice(-28)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        for (let i = 1; i < tail.length; i++) {
          const a = tail[i - 1], b = tail[i]
          if (Math.hypot(b.x - a.x, b.z - a.z) > 400) continue
          const [ax, az] = rotate(a.x, a.z, r)
          const [bx, bz] = rotate(b.x, b.z, r)
          ctx.strokeStyle = col
          ctx.globalAlpha = (i / tail.length) * 0.7
          ctx.lineWidth = 1 + (i / tail.length) * 2.5
          ctx.beginPath()
          ctx.moveTo(sx(ax), sy(az))
          ctx.lineTo(sx(bx), sy(bz))
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // Hover bestimmen
      let hover = null
      if (s.mouse) {
        let best = 18
        for (const cr of cars) {
          const dd = Math.hypot(sx(cr.d.x) - s.mouse.x, sy(cr.d.z) - s.mouse.y)
          if (dd < best) { best = dd; hover = cr.p.user_id }
        }
      }
      s.hover = hover

      // Fahrzeuge
      const many = cars.length > 8
      for (const cr of cars) {
        const { p, d } = cr
        const x = sx(d.x), y = sy(d.z)
        const col = colorOf(p)
        const isSel = L.selected === p.user_id
        const isHov = hover === p.user_id
        const moving = p.kmh > 5 && p.heading != null
        const rad = isSel ? 8.5 : 6.5

        if (isSel) {
          const pulse = (Math.sin(now / 280) + 1) / 2
          ctx.strokeStyle = col
          ctx.globalAlpha = 0.5 - pulse * 0.35
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, y, rad + 5 + pulse * 6, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        ctx.fillStyle = col
        ctx.strokeStyle = '#0c0e12'
        ctx.lineWidth = 2
        if (moving) {
          const hr = (p.heading * Math.PI) / 180
          const [vx, vz] = rotate(Math.sin(hr), Math.cos(hr), r)
          const ang = Math.atan2(-vz, vx)
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(ang)
          ctx.beginPath()
          ctx.moveTo(rad + 3, 0)
          ctx.lineTo(-rad, rad * 0.85)
          ctx.lineTo(-rad * 0.45, 0)
          ctx.lineTo(-rad, -rad * 0.85)
          ctx.closePath()
          ctx.stroke()
          ctx.fill()
          ctx.restore()
        } else {
          ctx.beginPath()
          ctx.arc(x, y, rad, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fill()
          if (p.kmh < 3) { ctx.fillStyle = '#0c0e12'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill() }
        }

        if (!many || isSel || isHov) {
          const nm = L.names?.[String(p.user_id)]?.name || `Fahrer ${p.user_id}`
          const text = isSel || isHov ? `${nm} · ${Math.round(p.kmh)} km/h` : nm
          ctx.font = '600 11px "Inter Variable", system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.lineWidth = 3.5
          ctx.strokeStyle = 'rgba(12,14,18,0.9)'
          ctx.strokeText(text, x, y - rad - 6)
          ctx.fillStyle = '#e8ecf4'
          ctx.fillText(text, x, y - rad - 6)
        }
      }

      // Tooltip
      const tip = tipRef.current
      if (tip) {
        const cr = hover != null ? cars.find((c2) => c2.p.user_id === hover) : null
        if (cr && s.mouse) {
          const nm = L.names?.[String(cr.p.user_id)]
          tip.style.display = 'block'
          tip.style.left = Math.min(s.w - 190, s.mouse.x + 14) + 'px'
          tip.style.top = Math.max(4, s.mouse.y - 8) + 'px'
          const lines = [
            [nm?.name || `Fahrer ${cr.p.user_id}`, '600', null],
            [cr.p.car || '', '400', '#9aa4ba'],
            [`${Math.round(cr.p.kmh)} km/h · ${Math.round(cr.p.ping)} ms`, '400', null],
          ]
          tip.replaceChildren(...lines.map(([t, w, c]) => { const d = document.createElement('div'); d.textContent = t; d.style.fontWeight = w; if (c) d.style.color = c; return d }))
        } else {
          tip.style.display = 'none'
        }
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Maus
  const onMove = (e) => {
    const b = canvasRef.current.getBoundingClientRect()
    const s = st.current
    s.mouse = { x: e.clientX - b.left, y: e.clientY - b.top }
    if (s.drag) {
      const dx = s.mouse.x - s.drag.x
      const dy = s.mouse.y - s.drag.y
      s.view.cx = s.drag.cx - dx / s.view.scale
      s.view.cz = s.drag.cz + dy / s.view.scale
      s.view.manual = true
      s.layerKey = ''
      s.drag.moved = s.drag.moved || Math.hypot(dx, dy) > 3
    }
  }
  const onDown = (e) => {
    const s = st.current
    const b = canvasRef.current.getBoundingClientRect()
    s.drag = { x: e.clientX - b.left, y: e.clientY - b.top, cx: s.view.cx, cz: s.view.cz, moved: false }
    canvasRef.current.setPointerCapture?.(e.pointerId)
  }
  const onUp = () => {
    const s = st.current
    if (s.drag && !s.drag.moved) onSelect?.(s.hover ?? null)
    s.drag = null
  }
  const onWheel = (e) => {
    e.preventDefault()
    const b = canvasRef.current.getBoundingClientRect()
    zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - b.left, e.clientY - b.top)
  }
  useEffect(() => {
    const c = canvasRef.current
    const h = (e) => onWheel(e)
    c.addEventListener('wheel', h, { passive: false })
    return () => c.removeEventListener('wheel', h)
  })

  const count = (outline.points || []).length
  return (
    <div ref={wrapRef} className="relative h-full min-h-[320px] w-full select-none overflow-hidden rounded-lg border border-ink-600 bg-ink-950/70">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={() => { st.current.mouse = null; st.current.drag = null }}
        onDoubleClick={fit}
      />
      <div ref={tipRef} className="pointer-events-none absolute z-10 hidden rounded-md border border-ink-500 bg-ink-800/95 px-2.5 py-1.5 text-xs shadow-xl" />
      {geo && baseMode !== 'none' && <div className="pointer-events-none absolute bottom-1.5 right-3 rounded bg-ink-900/70 px-1.5 py-0.5 text-[10px] text-ink-200">{TILES[baseMode].attr}</div>}
      <div className="pointer-events-none absolute left-3 top-3 text-[11px] text-ink-300">
        {!geo ? (
          <div className="pointer-events-auto max-w-xs rounded bg-ink-800/85 px-2 py-1.5">
            <div>
              {count === 0 ? 'Der Streckenumriss entsteht, sobald Fahrer Runden drehen. ' : `Umriss: ${count.toLocaleString('de-DE')} Punkte aus gefahrenen Runden. `}
              Die Satellitenkarte wird automatisch ausgerichtet, sobald genug Runden gefahren sind ({Math.min(geoInfo?.cells ?? count, 400)}/400 Punkte).
              {geoInfo?.last && !geoInfo.last.ok ? ` Letzter Versuch: ${geoInfo.last.note}` : ''}
            </div>
            {can(user, 'admin') && (
              <div className="mt-1.5 space-y-1.5">
                <button className="btn-ghost btn-sm" disabled={aligning || (geoInfo?.cells ?? count) < 300} onClick={alignNow}>{aligning ? 'Richte aus…' : 'Karte ausrichten'}</button>
                {hint && (
                  <div className="flex gap-1.5">
                    <input className="input !py-1 !text-xs" placeholder="Breite z. B. 29.1858" value={hint.lat} onChange={(e) => setHint({ ...hint, lat: e.target.value })} />
                    <input className="input !py-1 !text-xs" placeholder="Länge z. B. -81.0709" value={hint.lon} onChange={(e) => setHint({ ...hint, lon: e.target.value })} />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : geo && baseMode !== 'none' ? null : count === 0 ? (
          <span className="rounded bg-ink-800/80 px-2 py-1">Der Streckenumriss entsteht, sobald Fahrer Runden drehen.</span>
        ) : (
          <span className="rounded bg-ink-800/70 px-2 py-1">Umriss: {count.toLocaleString('de-DE')} Punkte aus gefahrenen Runden</span>
        )}
      </div>
      <div className="absolute bottom-3 left-3 flex flex-wrap items-end gap-2">
        {geo && (
          <div className="flex overflow-hidden rounded-lg border border-ink-500 bg-ink-800/90 text-[11px]">
            {[['sat', 'Satellit'], ['osm', 'Karte'], ['none', 'Aus']].map(([m, l]) => (
              <button key={m} className={`px-2.5 py-1.5 ${baseMode === m ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-600'}`} onClick={() => pickBase(m)}>{l}</button>
            ))}
          </div>
        )}
        <div className="flex overflow-hidden rounded-lg border border-ink-500 bg-ink-800/90 text-[11px]">
          {((geo && baseMode !== 'none') ? [['off', 'Spur aus'], ['road', 'Spur'], ['speed', 'Tempo']] : [['road', 'Straße'], ['speed', 'Tempo']]).map(([m, l]) => (
            <button key={m} className={`px-2.5 py-1.5 ${(trackMode ?? ((geo && baseMode !== 'none') ? 'off' : 'road')) === m ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-600'}`} onClick={() => pickTrack(m)}>{l}</button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-ink-500 bg-ink-800/90 text-[11px]">
          {[['driver', 'Fahrerfarbe'], ['class', 'Klassenfarbe']].map(([m, l]) => (
            <button key={m} className={`px-2.5 py-1.5 ${colorMode === m ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-600'}`} onClick={() => pickColor(m)}>{l}</button>
          ))}
        </div>
        {(trackMode ?? ((geo && baseMode !== 'none') ? 'off' : 'road')) === 'speed' && (
          <div className="rounded-lg border border-ink-500 bg-ink-800/90 px-2.5 py-1.5 text-[11px] text-ink-200">
            <div className="h-1.5 w-28 rounded" style={{ background: 'linear-gradient(90deg,hsl(225 85% 52%),hsl(150 85% 52%),hsl(60 85% 52%),hsl(0 85% 52%))' }} />
            <div className="mt-0.5 flex justify-between"><span>0</span><span>150</span><span>300 km/h</span></div>
          </div>
        )}
        {colorMode === 'class' && (() => {
          const cls = [...new Set((players || []).map((p) => p.class).filter(Boolean))]
          return cls.length ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-ink-500 bg-ink-800/90 px-2.5 py-1.5 text-[11px] text-ink-100">
              {cls.map((c) => <span key={c} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: classColor(c) }} />{c}</span>)}
            </div>
          ) : null
        })()}
      </div>
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button className="btn-ghost btn-sm !px-2" title="Hineinzoomen" onClick={() => zoomBy(1.3)}><Plus size={15} /></button>
        <button className="btn-ghost btn-sm !px-2" title="Herauszoomen" onClick={() => zoomBy(1 / 1.3)}><Minus size={15} /></button>
        <button className="btn-ghost btn-sm !px-2" title="Ansicht einpassen (Doppelklick)" onClick={fit}><Crosshair size={15} /></button>
        <button className="btn-ghost btn-sm !px-2" title="Karte um 90° drehen" onClick={rotateMap}><RotateCw size={15} /></button>
        <button className={`btn-sm !px-2 ${follow ? 'btn-primary' : 'btn-ghost'}`} title="Gewähltem Fahrer folgen" disabled={selected == null} onClick={() => setFollow((f) => !f)}><Navigation size={15} /></button>
      </div>
    </div>
  )
}
