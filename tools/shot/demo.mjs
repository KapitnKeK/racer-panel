// Simulierte Fahrer + Streckenumriss, um Karte/Fahrerliste ohne echte Fahrer zu prüfen
import puppeteer from 'puppeteer-core'
import fs from 'fs'

const base = process.env.R3E_URL || 'http://127.0.0.1:8123'
const pw = process.env.R3E_PW || ''
const user = process.env.R3E_USER || 'admin'
const serverId = process.env.R3E_SERVER || '1'
const out = process.env.R3E_OUT || './out'
fs.mkdirSync(out, { recursive: true })
const mobile = process.argv.includes('mobile')

// Rundkurs aus Geraden und Kurven (Meter)
function trackPoint(t) {
  // Stadion-Form: zwei Geraden (L) + zwei Halbkreise (R), plus leichte Welle
  const L = 900, R = 260
  const per = 2 * L + 2 * Math.PI * R
  let d = ((t % 1) + 1) % 1 * per
  let x, z, hx, hz
  if (d < L) { x = -L / 2 + d; z = -R; hx = 1; hz = 0 }
  else if (d < L + Math.PI * R) { const a = (d - L) / R - Math.PI / 2; x = L / 2 + R * Math.cos(a); z = R * Math.sin(a); hx = -Math.sin(a); hz = Math.cos(a) }
  else if (d < 2 * L + Math.PI * R) { const e = d - L - Math.PI * R; x = L / 2 - e; z = R; hx = -1; hz = 0 }
  else { const a = (d - 2 * L - Math.PI * R) / R + Math.PI / 2; x = -L / 2 + R * Math.cos(a); z = R * Math.sin(a); hx = -Math.sin(a); hz = Math.cos(a) }
  z += 60 * Math.sin(x / 140)
  return { x, z, hx, hz }
}
const cells = []
for (let i = 0; i < 3200; i++) { const p = trackPoint(i / 3200); cells.push([Math.round(p.x / 3), Math.round(p.z / 3), 3 + (i % 7)]) }

const drivers = [
  { id: 100230, name: 'Max Mustermann', team: 'Team Nordlicht', car: 'Audi R8 LMS GT3', cls: 'GTR 3', t: 0.02, kmh: 214 },
  { id: 100231, name: 'Lena Kraft', team: 'Nordkurve', car: 'BMW M4 GT3', cls: 'GTR 3', t: 0.09, kmh: 201 },
  { id: 100232, name: 'Tim Becker', team: '', car: 'Porsche 911 GT3 R', cls: 'GTR 3', t: 0.17, kmh: 187 },
  { id: 100233, name: 'Sofia Rossi', team: 'Scuderia Test', car: 'Mercedes-AMG GT3', cls: 'GTR 3', t: 0.31, kmh: 168 },
  { id: 100234, name: 'Jonas W.', team: '', car: 'Ford Mustang GT3', cls: 'GTR 3', t: 0.52, kmh: 95 },
  { id: 100235, name: 'Aylin Demir', team: 'Team Nordlicht', car: 'Lamborghini Huracan GT3', cls: 'GTR 3', t: 0.7, kmh: 232 },
]

const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/401/.test(m.text())) errors.push('console: ' + m.text()) })
await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true } : { width: 1440, height: 900 })

await page.goto(base + '/', { waitUntil: 'networkidle0' })
await page.type('input[autocomplete="username"]', user)
await page.type('input[type="password"]', pw)
await Promise.all([page.waitForSelector('header nav'), page.click('button.btn-primary')])
await new Promise((r) => setTimeout(r, 1500))

const real = await page.evaluate(async () => (await fetch('/api/live/snapshot')).json())

const frames = []
const names = {}
for (const d of drivers) names[String(d.id)] = { name: d.name, team: d.team, avatar: null, country: { code: 'DE', name: 'Deutschland' } }
for (let k = 0; k < 24; k++) {
  const snap = JSON.parse(JSON.stringify(real))
  const s = snap.servers[0]
  s.name = 'Demo-Server'
  s.state.running = true
  s.state_report_ms = 500
  s.state.session_label = 'Rennen 1'
  s.state.time_left = 14 * 60 * 1000 + 22000
  s.state.players = drivers.map((d, i) => {
    const t = d.t + k * 0.0009 * (d.kmh / 200)
    const p = trackPoint(t), q = trackPoint(t + 0.0006)
    const heading = (Math.atan2(q.x - p.x, q.z - p.z) * 180) / Math.PI
    return {
      user_id: d.id, x: p.x, z: p.z, kmh: d.kmh + Math.sin(k / 3 + i) * 6, heading, ping: [22, 41, 38, 96, 150, 63][i],
      livery_id: 13599 + i, car: d.car, car_id: 1, class: d.cls, livery: '#' + (i + 7), incident_points: [0, 2, 0, 6, 12, 0][i],
      incidents: i === 3 ? [{ type: 0, points: 4 }, { type: 3, points: 2 }] : i === 4 ? [{ type: 5, points: 6 }, { type: 0, points: 6 }] : i === 1 ? [{ type: 3, points: 2 }] : [],
    }
  })
  s.events = [
    { ts: Date.now() / 1000 - 300, kind: 'server', text: 'Server gestartet', user_id: null },
    { ts: Date.now() / 1000 - 240, kind: 'join', text: 'ist beigetreten', user_id: 100230 },
    { ts: Date.now() / 1000 - 200, kind: 'join', text: 'ist beigetreten', user_id: 100231 },
    { ts: Date.now() / 1000 - 90, kind: 'session', text: 'Neue Session: Rennen 1', user_id: null },
    { ts: Date.now() / 1000 - 40, kind: 'incident', text: '+4 Punkte', user_id: 100233, total: 6 },
    { ts: Date.now() / 1000 - 12, kind: 'leave', text: 'hat den Server verlassen', user_id: 100232 },
  ]
  s.chat = [
    { id: 1, ts: Date.now() / 1000 - 120, user: 'Max Mustermann', text: 'Viel Spaß, bitte fair fahren!' },
    { id: 2, ts: Date.now() / 1000 - 70, user: 'Lena Kraft', text: 'Bin bereit 🏁' },
  ]
  snap.names = names
  frames.push(snap)
}
const body = frames.map((f) => `event: snapshot\ndata: ${JSON.stringify(f)}\n\n`).join('')

await page.setRequestInterception(true)
page.on('request', (req) => {
  const u = req.url()
  if (u.endsWith('/api/live')) return req.respond({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, body })
  if (/\/api\/tracks\/\d+\/geo$/.test(u)) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ geo: null, auto: { cells: 3200, last: null } }) })
  if (/\/api\/tracks\/\d+\/outline$/.test(u)) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ cell: 3, layout_id: 8367, points: cells }) })
  req.continue()
})

await page.goto(base + '/server/' + serverId, { waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 3500))
await page.screenshot({ path: `${out}/demo-live${mobile ? '-mobile' : ''}.png`, fullPage: true })
console.log('shot demo-live')

if (!mobile) {
  // zweiten Fahrer wählen + Mausposition über ein Auto
  await page.click('tbody tr:nth-child(3)')
  await new Promise((r) => setTimeout(r, 1200))
  await page.screenshot({ path: `${out}/demo-live-selected.png`, clip: { x: 0, y: 330, width: 1440, height: 620 } })
  console.log('shot demo-live-selected')
}
console.log(errors.length ? 'FEHLER:\n' + [...new Set(errors)].join('\n') : 'keine Konsolenfehler')
await browser.close()
