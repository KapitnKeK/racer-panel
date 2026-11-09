#!/usr/bin/env python3
"""Racer-Panel-Agent für Assetto Corsa (AssettoServer). Läuft als root im AC-Container, nur im LAN, Token-geschützt.

Der Agent verwaltet Server-Definitionen unter DATA/servers/<id>/definition.json, erzeugt daraus die
AssettoServer-Konfiguration (presets/<id>/cfg/server_cfg.ini, entry_list.ini, extra_cfg.yml) und startet/stoppt
den systemd-Dienst ac-server@<id>. Nur Python-Standardbibliothek.

Umgebung: AGENT_TOKEN (Pflicht), AGENT_BIND (127.0.0.1), AGENT_PORT (8750), AC_ROOT (/opt/assettoserver),
AGENT_FAKE=1 (Test: kein systemctl, Laufzustand nur als Datei).
"""
from __future__ import annotations

import hmac
import json
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(os.environ.get("AC_ROOT", "/opt/assettoserver"))
CONTENT = ROOT / "content"
SERVERS = ROOT / "servers"
PRESETS = ROOT / "presets"
TOKEN = os.environ.get("AGENT_TOKEN", "")
FAKE = os.environ.get("AGENT_FAKE") == "1"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,30}$")
BASE_PORT = 9600

DEFAULTS = {
    "name": "Racer Panel AC", "password": "", "admin_password": "", "max_clients": 12,
    "track": "", "track_config": "", "cars": [],
    "practice_minutes": 10, "qualify_minutes": 0, "race_laps": 5, "race_wait_seconds": 60,
    "sun_angle": 16, "weather": "3_clear", "temperature_ambient": 20, "temperature_road": 26,
    "abs": 1, "tc": 1, "stability": 0, "auto_clutch": 1, "damage_multiplier": 100,
    "fuel_rate": 100, "tyre_wear_rate": 100, "allowed_tyres_out": 2, "friction": 100,
    "register_to_lobby": 0, "welcome_message": "",
}


def sh(*cmd: str) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=30)


# ------------------------------------------------------------------ Inhalte
def read_json(p: Path) -> dict:
    try:
        return json.loads(p.read_text(encoding="utf-8", errors="replace"), strict=False)
    except Exception:
        return {}


def scan_content() -> dict:
    tracks, cars = [], []
    for t in sorted((CONTENT / "tracks").glob("*")) if (CONTENT / "tracks").is_dir() else []:
        if not t.is_dir():
            continue
        layouts = []
        if (t / "ui" / "ui_track.json").exists():
            layouts.append({"id": "", "name": read_json(t / "ui" / "ui_track.json").get("name") or t.name,
                            "pits": read_json(t / "ui" / "ui_track.json").get("pitboxes")})
        for sub in sorted(t.glob("ui/*")):
            if sub.is_dir() and (sub / "ui_track.json").exists():
                j = read_json(sub / "ui_track.json")
                layouts.append({"id": sub.name, "name": j.get("name") or sub.name, "pits": j.get("pitboxes")})
        if layouts:
            tracks.append({"id": t.name, "name": read_json(t / "ui" / "ui_track.json").get("name") or t.name, "layouts": layouts})
    for c in sorted((CONTENT / "cars").glob("*")) if (CONTENT / "cars").is_dir() else []:
        if not c.is_dir():
            continue
        j = read_json(c / "ui" / "ui_car.json")
        skins = sorted(s.name for s in (c / "skins").glob("*") if s.is_dir()) if (c / "skins").is_dir() else []
        cars.append({"id": c.name, "name": j.get("name") or c.name, "class": j.get("class") or "", "skins": skins})
    return {"tracks": tracks, "cars": cars}


# --------------------------------------------------------------- Definitionen
def sdir(sid: str) -> Path:
    if not ID_RE.match(sid):
        raise ValueError("Ungültige Server-ID")
    return SERVERS / sid


def load(sid: str) -> dict:
    p = sdir(sid) / "definition.json"
    if not p.exists():
        raise FileNotFoundError(sid)
    return json.loads(p.read_text(encoding="utf-8"))


def ports(index: int) -> dict:
    n = BASE_PORT + index * 10
    return {"udp": n, "tcp": n, "http": n - 1519 if n - 1519 > 1024 else 8081 + index}


def clean(cfg: dict) -> dict:
    out = dict(DEFAULTS)
    for k, v in (cfg or {}).items():
        if k not in DEFAULTS:
            continue
        d = DEFAULTS[k]
        if isinstance(d, int):
            v = int(v)
        elif isinstance(d, list):
            v = [str(x) for x in v][:60]
        else:
            v = str(v)
        out[k] = v
    out["max_clients"] = max(1, min(out["max_clients"], 40))
    if not out["track"]:
        raise ValueError("Strecke fehlt")
    if not out["cars"]:
        raise ValueError("Mindestens ein Auto wählen")
    for k in (out["track"], out["track_config"], *out["cars"]):
        # nur Ordnernamen: keine Pfadtrenner, kein "..", kein führender Punkt
        if k and (not re.match(r"^[A-Za-z0-9_\-][A-Za-z0-9_.\-]*$", k) or ".." in k):
            raise ValueError(f"Ungültiger Name: {k!r}")
    out["name"] = re.sub(r"[\r\n=]", " ", out["name"])[:60] or DEFAULTS["name"]
    return out


def write_preset(sid: str, cfg: dict, index: int) -> None:
    pr = PRESETS / sid / "cfg"
    pr.mkdir(parents=True, exist_ok=True)
    pt = ports(index)
    sess = []
    if cfg["practice_minutes"] > 0:
        sess.append(f"[PRACTICE]\nNAME=Practice\nTIME={cfg['practice_minutes']}\nIS_OPEN=1\n")
    if cfg["qualify_minutes"] > 0:
        sess.append(f"[QUALIFY]\nNAME=Qualify\nTIME={cfg['qualify_minutes']}\nIS_OPEN=1\n")
    if cfg["race_laps"] > 0:
        sess.append(f"[RACE]\nNAME=Race\nLAPS={cfg['race_laps']}\nWAIT_TIME={cfg['race_wait_seconds']}\nIS_OPEN=1\n")
    ini = f"""[SERVER]
NAME={cfg['name']}
CARS={';'.join(cfg['cars'])}
TRACK={cfg['track']}
CONFIG_TRACK={cfg['track_config']}
SUN_ANGLE={cfg['sun_angle']}
PASSWORD={cfg['password']}
ADMIN_PASSWORD={cfg['admin_password']}
UDP_PORT={pt['udp']}
TCP_PORT={pt['tcp']}
HTTP_PORT={pt['http']}
MAX_CLIENTS={cfg['max_clients']}
REGISTER_TO_LOBBY={cfg['register_to_lobby']}
PICKUP_MODE_ENABLED=1
LOOP_MODE=1
ABS_ALLOWED={cfg['abs']}
TC_ALLOWED={cfg['tc']}
STABILITY_ALLOWED={cfg['stability']}
AUTOCLUTCH_ALLOWED={cfg['auto_clutch']}
DAMAGE_MULTIPLIER={cfg['damage_multiplier']}
FUEL_RATE={cfg['fuel_rate']}
TYRE_WEAR_RATE={cfg['tyre_wear_rate']}
ALLOWED_TYRES_OUT={cfg['allowed_tyres_out']}
WELCOME_MESSAGE=
UDP_PLUGIN_LOCAL_PORT=0
UDP_PLUGIN_ADDRESS=

""" + "\n".join(sess) + f"""
[DYNAMIC_TRACK]
SESSION_START=100
RANDOMNESS=0
SESSION_TRANSFER=100
LAP_GAIN=1

[WEATHER_0]
GRAPHICS={cfg['weather']}
BASE_TEMPERATURE_AMBIENT={cfg['temperature_ambient']}
BASE_TEMPERATURE_ROAD={cfg['temperature_road']}
VARIATION_AMBIENT=0
VARIATION_ROAD=0
WIND_BASE_SPEED_MIN=0
WIND_BASE_SPEED_MAX=0
WIND_BASE_DIRECTION=0
WIND_VARIATION_DIRECTION=0
"""
    (pr / "server_cfg.ini").write_text(ini, encoding="utf-8")
    entries = []
    for i in range(cfg["max_clients"]):
        entries.append(f"[CAR_{i}]\nMODEL={cfg['cars'][i % len(cfg['cars'])]}\nSKIN=\nSPECTATOR_MODE=0\nDRIVERNAME=\nTEAM=\nGUID=\nBALLAST=0\nRESTRICTOR=0\n")
    (pr / "entry_list.ini").write_text("\n".join(entries), encoding="utf-8")
    (pr / "extra_cfg.yml").write_text(f"""---
EnableClientMessages: true
EnableRealTime: true
EnableAi: false
WelcomeMessage: |
  {cfg['welcome_message'] or 'Willkommen auf dem Racer-Panel-Server'}
""", encoding="utf-8")


def is_running(sid: str) -> bool:
    if FAKE:
        return (sdir(sid) / "running").exists()
    return sh("systemctl", "is-active", f"ac-server@{sid}").stdout.strip() == "active"


def all_ids() -> list[str]:
    return sorted(p.name for p in SERVERS.glob("*") if (p / "definition.json").exists()) if SERVERS.is_dir() else []


def view(sid: str) -> dict:
    d = load(sid)
    return {"id": sid, "config": d["config"], "index": d["index"], "ports": ports(d["index"]), "running": is_running(sid)}


def save(sid: str, cfg: dict, index: int | None = None) -> None:
    if index is None:
        used = {load(i)["index"] for i in all_ids()}
        index = next(n for n in range(200) if n not in used)
    sdir(sid).mkdir(parents=True, exist_ok=True)
    (sdir(sid) / "definition.json").write_text(json.dumps({"config": cfg, "index": index}, indent=1), encoding="utf-8")
    write_preset(sid, cfg, index)


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:20] or "server"
    base, n = s, 1
    while sdir(s).exists():
        n += 1; s = f"{base}-{n}"
    return s


# ---------------------------------------------------------------------- HTTP
class H(BaseHTTPRequestHandler):
    server_version = "r3agent/1"

    def log_message(self, *a):  # ruhig
        pass

    def _send(self, code: int, obj) -> None:
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def _auth(self) -> bool:
        if not TOKEN or not hmac.compare_digest(self.headers.get("X-Agent-Token", ""), TOKEN):
            self._send(403, {"detail": "Token falsch"}); return False
        return True

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if 0 < n < 200_000 else {}

    def _route(self, method: str) -> None:
        if not self._auth():
            return
        parts = [p for p in self.path.split("?")[0].split("/") if p]
        try:
            if parts == ["health"]:
                return self._send(200, {"ok": True, "fake": FAKE})
            if parts == ["content"] and method == "GET":
                return self._send(200, scan_content())
            if parts == ["servers"] and method == "GET":
                return self._send(200, [view(i) for i in all_ids()])
            if parts == ["servers"] and method == "POST":
                cfg = clean(self._body()); sid = slug(cfg["name"]); save(sid, cfg)
                return self._send(200, {"id": sid})
            if len(parts) >= 2 and parts[0] == "servers":
                sid = parts[1]
                if len(parts) == 2 and method == "GET":
                    return self._send(200, view(sid))
                if len(parts) == 2 and method == "PUT":
                    old = load(sid); save(sid, clean(self._body()), old["index"])
                    return self._send(200, {"restart_needed": is_running(sid)})
                if len(parts) == 2 and method == "DELETE":
                    if is_running(sid):
                        return self._send(409, {"detail": "Server läuft noch"})
                    import shutil
                    shutil.rmtree(sdir(sid), ignore_errors=True); shutil.rmtree(PRESETS / sid, ignore_errors=True)
                    return self._send(200, {"ok": True})
                if len(parts) == 3 and parts[2] in ("start", "stop") and method == "POST":
                    load(sid)
                    if FAKE:
                        f = sdir(sid) / "running"
                        f.touch() if parts[2] == "start" else f.unlink(missing_ok=True)
                    else:
                        r = sh("systemctl", parts[2], f"ac-server@{sid}")
                        if r.returncode:
                            return self._send(500, {"detail": r.stderr.strip()[:200]})
                    return self._send(200, {"ok": True})
                if len(parts) == 3 and parts[2] == "log" and method == "GET":
                    r = sh("journalctl", "-u", f"ac-server@{sid}", "-n", "60", "--no-pager", "-o", "cat") if not FAKE else None
                    return self._send(200, {"log": r.stdout[-6000:] if r else ""})
            self._send(404, {"detail": "Nicht gefunden"})
        except FileNotFoundError:
            self._send(404, {"detail": "Server nicht gefunden"})
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as e:
            self._send(422, {"detail": str(e)[:200]})

    def do_GET(self): self._route("GET")
    def do_POST(self): self._route("POST")
    def do_PUT(self): self._route("PUT")
    def do_DELETE(self): self._route("DELETE")


if __name__ == "__main__":
    if not TOKEN:
        sys.exit("AGENT_TOKEN fehlt")
    SERVERS.mkdir(parents=True, exist_ok=True); PRESETS.mkdir(parents=True, exist_ok=True)
    ThreadingHTTPServer((os.environ.get("AGENT_BIND", "127.0.0.1"), int(os.environ.get("AGENT_PORT", "8750"))), H).serve_forever()
