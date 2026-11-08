"""Synthetischer Test der Auto-Ausrichtung: simuliert gefahrene Punkte aus OSM mit zufällig verschobenem Nullpunkt."""
import math, random, sys, time, json
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__file__), '..', '..', 'backend'))
import httpx
from app import geo_auto as G

TRACKS = ["Circuit de Spa-Francorchamps - Modern", "Autodromo di Monza", "Hockenheimring - Modern", "WeatherTech Raceway Laguna Seca - Modern",
          "Silverstone Circuit - Modern", "Nürburgring - Grand Prix", "Red Bull Ring Spielberg", "Circuit Zandvoort - Modern",
          "Suzuka International Racing Course", "Road America", "Watkins Glen International", "Brands Hatch Circuit - Grand Prix",
          "Donington Park", "Mount Panorama Circuit", "RaceRoom Raceway"]
sel = sys.argv[1:] or TRACKS
random.seed(7)
out = []
for name in sel:
    t0 = time.time()
    row = {"track": name}
    try:
        with httpx.Client() as c:
            places = G.geocode(c, name)
            if not places: row.update(ok=False, why="Geocoding ohne Treffer"); print(row, flush=True); out.append(row); continue
            lat_c, lon_c, label = places[0]
            ways = G.fetch_raceways(c, lat_c, lon_c)
        if not ways: row.update(ok=False, why="keine OSM-Rennstrecke", place=label); print(row, flush=True); out.append(row); continue
        ways.sort(key=lambda w: -len(w))
        pts = G._densify(ways[:4], lat_c, lon_c, step=3.0)  # die längsten Linien = Hauptstrecke
        te, tn = random.uniform(-2500, 2500), random.uniform(-2500, 2500)
        cells = set()
        for e, n in pts:
            x = e - te + random.gauss(0, 2.0); z = n - tn + random.gauss(0, 2.0)
            cells.add((round(x / 3) * 3.0, round(z / 3) * 3.0))
        # Teil der Strecke weglassen (nur ~70 % gefahren)
        cells = sorted(cells); cells = [c for i, c in enumerate(cells) if (i // 40) % 10 < 7]
        res = G.auto_align(name, cells)
        row.update(place=label[:40], cells=len(cells), ok=res.get("ok"), median=res.get("median_m"), p90=res.get("p90_m"), amb=res.get("ambiguity"), why=res.get("reason"))
        if res.get("lat0") is not None:
            exp_lat = lat_c + tn / G.M; exp_lon = lon_c + te / (G.M * math.cos(math.radians(lat_c)))
            err = math.hypot((res["lat0"] - exp_lat) * G.M, (res["lon0"] - exp_lon) * G.M * math.cos(math.radians(lat_c)))
            row["origin_error_m"] = round(err, 1)
    except Exception as e:
        row.update(ok=False, why=f"Fehler: {type(e).__name__}: {str(e)[:80]}")
    row["sek"] = round(time.time() - t0)
    print(json.dumps(row, ensure_ascii=False), flush=True); out.append(row)
json.dump(out, open('validate-result.json', 'w'), ensure_ascii=False, indent=1)
