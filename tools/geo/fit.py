"""Richtet gelernte Spiel-Streckenpunkte (X/Z in m) an OSM-Streckengeometrie aus (Drehung, Spiegelung, Verschiebung, Maßstab fix 1)."""
import json, math, sqlite3, sys
import numpy as np

LAYOUT = int(sys.argv[1]) if len(sys.argv) > 1 else 8367
OSM = sys.argv[2] if len(sys.argv) > 2 else 'osm-daytona.json'
DB = sys.argv[3] if len(sys.argv) > 3 else 'data/panel.sqlite'  # Pfad zur Panel-Datenbank

osm = json.load(open(OSM))['elements']
lat0 = np.mean([p['lat'] for w in osm for p in w['geometry']]); lon0 = np.mean([p['lon'] for w in osm for p in w['geometry']])
M = 111320.0
def ll2en(lat, lon): return (lon - lon0) * M * math.cos(math.radians(lat0)), (lat - lat0) * M
pts = []
for w in osm:
    g = w['geometry']
    for a, b in zip(g, g[1:]):
        (e1, n1), (e2, n2) = ll2en(a['lat'], a['lon']), ll2en(b['lat'], b['lon'])
        L = math.hypot(e2 - e1, n2 - n1); k = max(1, int(L / 3))
        for i in range(k + 1): pts.append((e1 + (e2 - e1) * i / k, n1 + (n2 - n1) * i / k))
O = np.array(pts)
cells = sqlite3.connect(DB).execute('select gx,gz,n from track_cells where layout_id=?', (LAYOUT,)).fetchall()
W = np.array([(c[0] * 3.0, c[1] * 3.0) for c in cells if c[2] >= 1])
print(f'OSM-Punkte {len(O)} | Spielpunkte {len(W)} | Zentrum lat0={lat0:.5f} lon0={lon0:.5f}')

def transform(W, th, mirror, t):
    z = -W[:, 1] if mirror else W[:, 1]
    c, s = math.cos(th), math.sin(th)
    return np.stack([W[:, 0] * c - z * s + t[0], W[:, 0] * s + z * c + t[1]], 1)

def nearest(P):
    d = np.empty(len(P)); idx = np.empty(len(P), int)
    for i in range(0, len(P), 300):
        D = ((P[i:i+300, None, :] - O[None, :, :]) ** 2).sum(2)
        j = D.argmin(1); idx[i:i+300] = j; d[i:i+300] = np.sqrt(D[np.arange(len(j)), j])
    return d, idx

def score(d): return np.sort(d)[: int(len(d) * 0.8)].mean()
Wc = W - W.mean(0)
best = None
sub = Wc[:: max(1, len(Wc) // 250)]
for mirror in (False, True):
    for deg in range(0, 360, 3):
        th = math.radians(deg)
        for tx in range(-900, 901, 150):
            for ty in range(-900, 901, 150):
                P = transform(sub, th, mirror, (tx, ty))
                D = ((P[:, None, :] - O[None, ::4, :]) ** 2).sum(2).min(1)
                sc = np.sort(np.sqrt(D))[: int(len(P) * 0.8)].mean()
                if best is None or sc < best[0]: best = (sc, mirror, th, (tx, ty))
print('Grobsuche:', best[0], 'mirror', best[1], 'deg', math.degrees(best[2]), 't', best[3])
sc, mirror, th, t = best
# ICP-Verfeinerung (Rotation+Translation, trimmed)
for it in range(60):
    P = transform(Wc, th, mirror, t); d, idx = nearest(P)
    keep = d <= np.sort(d)[int(len(d) * 0.8) - 1]
    A = P[keep]; B = O[idx[keep]]
    ca, cb = A.mean(0), B.mean(0)
    H = (A - ca).T @ (B - cb); dth = math.atan2(H[0, 1] - H[1, 0], H[0, 0] + H[1, 1])
    th += dth
    c, s = math.cos(dth), math.sin(dth)
    t = (c * (t[0] - ca[0]) - s * (t[1] - ca[1]) + cb[0], s * (t[0] - ca[0]) + c * (t[1] - ca[1]) + cb[1]) if False else (t[0] + (cb[0] - ca[0]), t[1] + (cb[1] - ca[1]))
P = transform(Wc, th, mirror, t); d, _ = nearest(P)
print(f'Ergebnis: mirror={mirror} rot={math.degrees(th)%360:.2f} deg | Abstand (getrimmt 80%) mean={score(d):.1f} m, Median={np.median(d):.1f} m, 90%={np.percentile(d,90):.1f} m, max={d.max():.0f} m')
# Welt-Ursprung (0,0) -> lat/lon: world = Wc + mean ; (e,n)=R*(x,±z)+t  with x,z of Wc => origin offset
mu = W.mean(0)
o = transform(np.array([[-mu[0], -mu[1]]]), th, mirror, t)[0]
lat = lat0 + o[1] / M; lon = lon0 + o[0] / (M * math.cos(math.radians(lat0)))
res = {'layout_id': LAYOUT, 'lat0': lat, 'lon0': lon, 'rot_deg': math.degrees(th) % 360, 'mirror': mirror, 'rms_m': float(score(d)), 'median_m': float(np.median(d)), 'p90_m': float(np.percentile(d, 90))}
print(json.dumps(res)); json.dump(res, open(f'georef-{LAYOUT}.json', 'w'))
