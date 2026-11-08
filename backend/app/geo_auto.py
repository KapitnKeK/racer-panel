"""Automatische Ausrichtung gelernter Spiel-Streckenpunkte an OpenStreetMap.

Die Spielkoordinaten (X/Z) sind Ost/Nord-Meter mit einem streckenspezifischen Nullpunkt (an Daytona
nachgewiesen: Drehung 0,08 Grad, keine Spiegelung). Gesucht wird nur die Verschiebung, so dass die
gefahrenen Punkte auf den OSM-Rennstrecken-Linien (highway=raceway) liegen. Reines Python.
"""
from __future__ import annotations

import math
import re
import time
from typing import Optional

import httpx

M = 111320.0
UA = "r3e-panel/1.0 (self-hosted RaceRoom live panel)"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
NOMINATIM = "https://nominatim.openstreetmap.org/search"
GRID = 40.0


def clean_name(track: str) -> str:
    base = track.split(" - ")[0]
    base = re.sub(r"\(.*?\)", "", base).strip()
    return base


def _get_json(client: httpx.Client, url: str, params: dict) -> object:
    r = client.get(url, params=params, headers={"User-Agent": UA}, timeout=60)
    r.raise_for_status()
    return r.json()


def geocode(client: httpx.Client, track_name: str) -> list[tuple[float, float, str]]:
    out: list[tuple[float, float, str]] = []
    seen = set()
    for q in dict.fromkeys([clean_name(track_name), clean_name(track_name) + " circuit", clean_name(track_name) + " race track"]):
        try:
            res = _get_json(client, NOMINATIM, {"q": q, "format": "json", "limit": 3})
        except Exception:
            continue
        for x in res:  # type: ignore[union-attr]
            key = (round(float(x["lat"]), 2), round(float(x["lon"]), 2))
            if key not in seen:
                seen.add(key)
                out.append((float(x["lat"]), float(x["lon"]), x.get("display_name", "")[:80]))
        time.sleep(1.1)  # Nominatim-Nutzungsregel: höchstens 1 Anfrage pro Sekunde
        if len(out) >= 3:
            break
    return out


def fetch_raceways(client: httpx.Client, lat: float, lon: float, radius: int = 4500) -> list[list[tuple[float, float]]]:
    q = f'[out:json][timeout:50];(way["highway"="raceway"](around:{radius},{lat},{lon}););out geom;'
    last: Exception | None = None
    for url in OVERPASS:
        try:
            r = client.post(url, data={"data": q}, headers={"User-Agent": UA}, timeout=70)
            r.raise_for_status()
            ways = []
            for el in r.json().get("elements", []):
                g = el.get("geometry") or []
                if len(g) >= 2:
                    ways.append([(p["lat"], p["lon"]) for p in g])
            return ways
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"Overpass nicht erreichbar: {last}")


def _densify(ways: list[list[tuple[float, float]]], lat_c: float, lon_c: float, step: float = 4.0) -> list[tuple[float, float]]:
    cl = math.cos(math.radians(lat_c))
    pts: list[tuple[float, float]] = []
    for w in ways:
        enu = [((lo - lon_c) * M * cl, (la - lat_c) * M) for la, lo in w]
        for (e1, n1), (e2, n2) in zip(enu, enu[1:]):
            L = math.hypot(e2 - e1, n2 - n1)
            k = max(1, int(L / step))
            for i in range(k + 1):
                pts.append((e1 + (e2 - e1) * i / k, n1 + (n2 - n1) * i / k))
    return pts


class _Index:
    def __init__(self, pts: list[tuple[float, float]]):
        self.g: dict[tuple[int, int], list[tuple[float, float]]] = {}
        for p in pts:
            self.g.setdefault((int(p[0] // GRID), int(p[1] // GRID)), []).append(p)

    def nearest(self, x: float, y: float, maxd: float = 160.0) -> float:
        cx, cy = int(x // GRID), int(y // GRID)
        best = maxd * maxd
        for ring in range(0, int(maxd // GRID) + 1):
            for ix in range(cx - ring, cx + ring + 1):
                for iy in range(cy - ring, cy + ring + 1):
                    if max(abs(ix - cx), abs(iy - cy)) != ring:
                        continue
                    for px, py in self.g.get((ix, iy), ()):
                        d = (px - x) ** 2 + (py - y) ** 2
                        if d < best:
                            best = d
            if best <= (ring * GRID) ** 2:
                break
        return math.sqrt(best)


def _trim_mean(vals: list[float], keep: float = 0.8) -> float:
    s = sorted(vals)
    k = max(1, int(len(s) * keep))
    return sum(s[:k]) / k


def fit_translation(cells: list[tuple[float, float]], ways: list[list[tuple[float, float]]], lat_c: float, lon_c: float) -> dict:
    """cells: Spielkoordinaten in Metern. Rückgabe: Ursprung (lat0/lon0) und Gütewerte."""
    pts = _densify(ways, lat_c, lon_c)
    if len(pts) < 50 or len(cells) < 100:
        return {"ok": False, "reason": "zu wenig Daten"}
    idx = _Index(pts)
    n = len(cells)
    step = max(1, n // 110)
    sample = cells[::step]
    cx = sum(c[0] for c in cells) / n
    cz = sum(c[1] for c in cells) / n
    ox0 = min(p[0] for p in pts) - cx; ox1 = max(p[0] for p in pts) - cx
    oz0 = min(p[1] for p in pts) - cz; oz1 = max(p[1] for p in pts) - cz

    def score(te: float, tn: float, smp=sample) -> float:
        return _trim_mean([idx.nearest(c[0] + te, c[1] + tn) for c in smp])

    # grobe Suche
    cand = []
    te = ox0
    while te <= ox1:
        tn = oz0
        while tn <= oz1:
            cand.append((score(te, tn), te, tn))
            tn += 50
        te += 50
    cand.sort()
    peaks: list[tuple[float, float, float]] = []
    for sc, te, tn in cand:
        if all(math.hypot(te - p[1], tn - p[2]) > 150 for p in peaks):
            peaks.append((sc, te, tn))
        if len(peaks) >= 6:
            break
    # Verfeinerung der besten Gipfel
    refined = []
    for sc, te, tn in peaks:
        best = (sc, te, tn)
        for st in (20, 6, 2, 0.7):
            improved = True
            while improved:
                improved = False
                for dx in (-st, 0, st):
                    for dy in (-st, 0, st):
                        if dx == 0 and dy == 0:
                            continue
                        s2 = score(best[1] + dx, best[2] + dy)
                        if s2 < best[0] - 1e-6:
                            best = (s2, best[1] + dx, best[2] + dy); improved = True
        refined.append(best)
    refined.sort()
    sc, te, tn = refined[0]
    d_all = sorted(idx.nearest(c[0] + te, c[1] + tn) for c in cells)
    med = d_all[len(d_all) // 2]
    p90 = d_all[int(len(d_all) * 0.9)]
    second = next((r[0] for r in refined[1:] if math.hypot(r[1] - te, r[2] - tn) > 150), None)
    ratio = (second / sc) if second else 99.0
    cl = math.cos(math.radians(lat_c))
    return {
        "ok": med <= 8.0 and p90 <= 28.0 and ratio >= 1.25,
        "lat0": lat_c + tn / M, "lon0": lon_c + te / (M * cl),
        "median_m": round(med, 1), "p90_m": round(p90, 1), "ambiguity": round(ratio, 2),
        "reason": None if (med <= 8.0 and p90 <= 28.0 and ratio >= 1.25) else (
            "mehrdeutig (mehrere ähnliche Positionen), bitte mehr Runden fahren" if ratio < 1.25 else f"passt nicht gut genug (Median {med:.1f} m)"),
    }


def auto_align(track_name: str, cells: list[tuple[float, float]], hint: Optional[tuple[float, float]] = None) -> dict:
    """Komplette Pipeline: Name -> Ort -> OSM-Streckenlinien -> Abgleich. Blockierend (in Thread aufrufen)."""
    if len(cells) < 300:
        return {"ok": False, "reason": f"erst {len(cells)} Punkte, benötigt werden mindestens 300 (ein paar volle Runden)"}
    xs = [c[0] for c in cells]; zs = [c[1] for c in cells]
    if max(xs) - min(xs) < 250 and max(zs) - min(zs) < 250:
        return {"ok": False, "reason": "gefahrene Punkte decken zu wenig von der Strecke ab"}
    with httpx.Client() as client:
        places = [(hint[0], hint[1], "Hinweis des Admins")] if hint else geocode(client, track_name)
        if not places:
            return {"ok": False, "reason": f"Ort zu „{clean_name(track_name)}“ nicht gefunden (Admin kann Koordinaten als Hinweis angeben)"}
        best: dict | None = None
        notes = []
        for lat, lon, label in places:
            try:
                ways = fetch_raceways(client, lat, lon)
            except Exception as e:  # noqa: BLE001
                notes.append(str(e)[:80]); continue
            if not ways:
                notes.append(f"keine Rennstrecken-Linien bei {label}"); continue
            r = fit_translation(cells, ways, lat, lon)
            r["place"] = label
            if r.get("lat0") is not None and (best is None or r["median_m"] < best["median_m"]):
                best = r
            if r.get("ok"):
                break
            time.sleep(1.0)
        if best is None:
            return {"ok": False, "reason": "; ".join(notes) or "keine passende OSM-Strecke gefunden"}
        return best
