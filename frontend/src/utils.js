export const PALETTE = ['#ff4d4d', '#4dc3ff', '#ffd166', '#7cf29a', '#c792ff', '#ff9f43', '#2dd4bf', '#f472b6', '#a3e635', '#60a5fa', '#fb7185', '#fde047']

export function driverColor(uid) {
  const n = Math.abs(Number(uid) || 0)
  return PALETTE[(n * 2654435761) % PALETTE.length >>> 0] || PALETTE[n % PALETTE.length]
}

export function classColor(name) {
  if (!name) return '#9aa4ba'
  let h = 7
  for (const c of name) h = (h * 33 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function speedColor(v) {
  if (!v || v <= 0) return '#3a4152'
  const t = Math.min(1, v / 300)
  return `hsl(${Math.round(225 - t * 225)} 85% 52%)`
}

export function fmtClock(ms) {
  if (ms == null || ms < 0) return '–'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export function relTime(tsSeconds, now = Date.now()) {
  const d = Math.max(0, Math.floor(now / 1000 - tsSeconds))
  if (d < 5) return 'gerade eben'
  if (d < 60) return `vor ${d} s`
  if (d < 3600) return `vor ${Math.floor(d / 60)} min`
  if (d < 86400) return `vor ${Math.floor(d / 3600)} h`
  return `vor ${Math.floor(d / 86400)} d`
}

export function timeHM(tsSeconds) {
  return new Date(tsSeconds * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function flagEmoji(code) {
  if (!code || code.length !== 2) return ''
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export const liveryImg = (id) => `https://game.raceroom.com/store/image_redirect?id=${id}&size=small`

export function randomPassword(len = 16) {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const a = new Uint32Array(len)
  crypto.getRandomValues(a)
  return [...a].map((v) => abc[v % abc.length]).join('')
}

export const INCIDENT_TYPES = [
  'Auto-Kollision', 'Kollision mit Streckenobjekt', 'Falsche Richtung', 'Neben der Strecke', 'Stillstand auf der Strecke',
  'Kontrollverlust', 'Ungültige Runde', 'Strafe nicht abgesessen', 'Aufgabe / Verbindungsabbruch', 'Rennstart verpasst',
]

export const SESSION_META = [
  { key: 'Practice', label: 'Training', short: 'T' },
  { key: 'Qualify', label: 'Qualifying', short: 'Q' },
  { key: 'Race1', label: 'Rennen 1', short: 'R1' },
  { key: 'Race2', label: 'Rennen 2', short: 'R2' },
  { key: 'Race3', label: 'Rennen 3', short: 'R3' },
]

export const TIME_OF_DAY = [
  { value: 0, label: 'Morgendämmerung' }, { value: 1, label: 'Morgen' }, { value: 2, label: 'Mittag' },
  { value: 3, label: 'Nachmittag' }, { value: 4, label: 'Sonnenuntergang' },
]

export const thumbSrc = (srv) => (!srv?.thumb ? null : srv.thumb.kind === 'url' ? srv.thumb.url : `/api/servers/${srv.id}/thumbnail?v=${srv.thumb.v}`)

/** Bild auf 460x160 zuschneiden (cover) und als Base64 (ohne Prefix) liefern */
export function imageToThumbnail(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const W = 460, H = 160
      const c = document.createElement('canvas')
      c.width = W; c.height = H
      const ctx = c.getContext('2d')
      const k = Math.max(W / img.width, H / img.height)
      const w = img.width * k, h = img.height * k
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
      URL.revokeObjectURL(url)
      let d = c.toDataURL('image/png')
      if (d.length > 380_000) d = c.toDataURL('image/jpeg', 0.85)
      resolve(d.replace(/^data:image\/\w+;base64,/, ''))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Datei ist kein lesbares Bild')) }
    img.src = url
  })
}

export function fmtDuration(sec) {
  if (!sec || sec < 60) return `${Math.round(sec || 0)} s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}
export const fmtKm = (m) => `${((m || 0) / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`
export const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–')
