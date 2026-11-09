"""RaceRoom Racing Experience – Plugin für den „RR Dedicated manager“ (RRRE_Dedicated.exe).

Die Manager-API antwortet nur mit Host-Header ``localhost:8088`` (sonst 400 Invalid Hostname).
Konfiguration: ``MANAGER_URL`` (Standard http://127.0.0.1:8088), ``MANAGER_HOST_HEADER``.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import os
import time
from typing import Any, Optional

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator

from ..base import GameAdapter

MANAGER_URL = os.environ.get("MANAGER_URL", "http://127.0.0.1:8088").rstrip("/")
MANAGER_HOST_HEADER = os.environ.get("MANAGER_HOST_HEADER", "localhost:8088")

SESSION_KEYS = ("Practice", "Qualify", "Race1", "Race2", "Race3")
SESSION_ORDER = ["Practice", "Qualify", "Warmup", "Race1", "Race2", "Race3"]
SESSION_LABEL = {"Practice": "Training", "Qualify": "Qualifying", "Warmup": "Warm-up", "Race1": "Rennen 1", "Race2": "Rennen 2", "Race3": "Rennen 3"}


# ------------------------------------------------------------------ Datenmodell
class SessionCfg(BaseModel):
    duration: int = Field(10, ge=0, le=600, description="Minuten")
    laps: int = Field(0, ge=0, le=500)
    time_of_day: Optional[int] = Field(None, ge=0, le=4)  # 0 Dawn .. 4 Sunset
    rolling_start: Optional[bool] = None


class ServerSettings(BaseModel):
    name: str = Field(..., min_length=1, max_length=40)
    password: str = Field("", max_length=40)
    experience: int
    layout_id: int
    car_ids: list[int] = Field(..., min_length=1, max_length=60)
    max_players: int = Field(12, ge=1, le=64)
    warmup: int = Field(0, ge=0, le=30)
    sessions: dict[str, SessionCfg] = {}
    time_multiplier: int = Field(0, ge=0, le=25)
    drive_assist_preset: int = Field(0, ge=0, le=3)
    assist_transmission: int = Field(-1, ge=-1, le=2)
    assist_esp: int = Field(-1, ge=-1, le=3)
    assist_steer: int = Field(-1, ge=-1, le=1)
    assist_brake: int = Field(-1, ge=-1, le=3)
    assist_traction: int = Field(-1, ge=-1, le=2)
    assist_raceline: int = Field(-1, ge=-1, le=2)
    assist_autopit: int = Field(-1, ge=-1, le=1)
    fuel_usage: int = Field(0, ge=0, le=4)
    tire_wear: int = Field(0, ge=0, le=4)
    tire_temperature: int = Field(0, ge=0, le=1)
    damage: int = Field(0, ge=0, le=2)
    flag_rules: int = Field(0, ge=0, le=3)
    cut_rules: int = Field(0, ge=0, le=3)
    mandatory_pitstop: int = Field(0, ge=0, le=2)
    prevent_false_start: int = Field(0, ge=0, le=1)
    wrecker_prevention: int = Field(0, ge=0, le=1)
    max_ping: int = Field(0, ge=0, le=450)
    state_report_interval: int = Field(500, ge=250, le=3000)
    race_finish_duration: int = Field(30, ge=30, le=600)
    reverse_start_order_places: int = Field(0, ge=0, le=100)
    stay_in_practice_if_empty: int = Field(0, ge=0, le=1)
    allow_join_in_qualifying: int = Field(0, ge=0, le=1)
    starting_grid_from_leaderboards: int = Field(0, ge=0, le=1)
    checkered_after_time: int = Field(0, ge=0, le=600)
    fixed_setup: int = Field(0, ge=0, le=1)
    max_incident_points: int = Field(0, ge=0, le=1000)
    min_rating: int = Field(0, ge=0, le=2100)
    max_rating: int = Field(0, ge=0, le=2100)
    min_reputation: int = Field(0, ge=0, le=100)
    max_reputation: int = Field(0, ge=0, le=100)
    non_ready_pitlane_start_delay: int = Field(0, ge=0, le=120)
    thumbnail: Optional[str] = Field(None, max_length=600_000)  # None = unverändert, "" = entfernen, sonst Base64 (PNG/JPEG)

    @field_validator("thumbnail")
    @classmethod
    def check_thumbnail(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return v
        try:
            raw = base64.b64decode(v, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("Bild ist kein gültiges Base64")
        if len(raw) > 400_000:
            raise ValueError("Bild ist zu groß (max. 400 KB)")
        if not (raw.startswith(b"\x89PNG\r\n\x1a\n") or raw.startswith(b"\xff\xd8\xff")):
            raise ValueError("Nur PNG oder JPEG erlaubt")
        return v

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name fehlt")
        return v

    @field_validator("sessions")
    @classmethod
    def known_sessions(cls, v: dict) -> dict:
        for k in v:
            if k not in SESSION_KEYS:
                raise ValueError(f"Unbekannte Session: {k}")
        return v


def validate(model: type[BaseModel], body: dict) -> Any:
    """Pydantic-Fehler im selben Format wie FastAPI zurückgeben (Frontend zeigt Feld + Meldung)."""
    try:
        return model(**(body or {}))
    except ValidationError as e:
        raise HTTPException(422, [{"loc": ["body", *e_["loc"]], "msg": e_["msg"]} for e_ in e.errors()])


def is_spectator(p: dict) -> bool:
    """Zuschauer (z. B. der Broadcast-Bot) stehen in der Spielerliste ohne Auto: Position exakt 0/0, kein Ping."""
    ping = p.get("LatestPingMilliSec")
    return p.get("X") == 0 and p.get("Z") == 0 and (ping is None or ping < 0)


def drivers_only(players: Optional[list]) -> list:
    return [p for p in (players or []) if not is_spectator(p)]


def liveries_for(cars: list[int], cdata: dict) -> list[int]:
    out: list[int] = []
    wanted = set(cars)
    for entry in cdata["Liveries"]:
        if entry["Car"]["Id"] in wanted:
            out += [l["Id"] for l in entry["Liveries"]]
    return out


def apply_settings(gs: dict, s: ServerSettings, cdata: dict) -> dict:
    """Schreibt die validierten Felder in ein (bestehendes) GameSetting."""
    if not any(l["Id"] == s.layout_id for t in cdata["Tracks"] for l in t["Layouts"]):
        raise HTTPException(422, "Unbekanntes Streckenlayout")
    known_cars = {e["Car"]["Id"] for e in cdata["Liveries"]}
    if any(c not in known_cars for c in s.car_ids):
        raise HTTPException(422, "Unbekanntes Auto")
    if s.experience not in {e["Id"] for e in cdata["Experiences"]}:
        raise HTTPException(422, "Unbekannte Experience")

    gs["Name"] = s.name
    gs["Password"] = s.password
    gs["Experience"] = s.experience
    gs["MaxNumOfPlayers"] = s.max_players
    gs["Cars"] = s.car_ids
    gs["Liveries"] = liveries_for(s.car_ids, cdata)
    for attr, key in FIELD_MAP:
        gs[key] = getattr(s, attr)
    if s.thumbnail is not None:
        gs["Thumbnail"] = s.thumbnail or None

    tl = gs["TrackLayouts"][0] if gs.get("TrackLayouts") else {"EventPackId": 0, "Sessions": {}, "TimeOfDayMultiplier": 0}
    tl["LayoutId"] = s.layout_id
    tl["TimeOfDayMultiplier"] = s.time_multiplier
    tl.setdefault("Sessions", {})
    tl["Sessions"]["WarmupDuration"] = s.warmup
    for key, cfg in s.sessions.items():
        cur = tl["Sessions"].get(key) or {"SessionType": 1, "Clouds": None}
        cur["Duration"] = cfg.duration
        cur["Laps"] = cfg.laps
        if cfg.time_of_day is not None:
            cur["TimeOfDay"] = cfg.time_of_day
        if cfg.rolling_start is not None:
            # Rennen: 1 = Standing, 0 = Rolling; Training/Quali: 0 = Standing, 1 = Rolling
            is_race = key.startswith("Race")
            cur["SessionType"] = (0 if cfg.rolling_start else 1) if is_race else (1 if cfg.rolling_start else 0)
        tl["Sessions"][key] = cur
    gs["TrackLayouts"] = [tl]
    return gs


# Panel-Feld -> GameSetting-Schlüssel (einfache 1:1-Felder), Standardwert für die Ansicht
FIELD_MAP = [
    ("drive_assist_preset", "DriveAssistPreset"), ("assist_transmission", "DriveAssistTransmission"), ("assist_esp", "DriveAssistEsp"),
    ("assist_steer", "DriveAssistSteer"), ("assist_brake", "DriveAssistBrake"), ("assist_traction", "DriveAssistTractionControl"),
    ("assist_raceline", "DriveAssistRaceline"), ("assist_autopit", "DriveAssistAutopit"), ("fuel_usage", "FuelUsage"), ("tire_wear", "TireWear"),
    ("tire_temperature", "TireTemperature"), ("damage", "Damage"), ("flag_rules", "FlagRules"), ("cut_rules", "CutRules"),
    ("mandatory_pitstop", "MandatoryPitstop"), ("prevent_false_start", "PreventFalseStart"), ("wrecker_prevention", "WreckerPrevention"),
    ("max_ping", "MaxPing"), ("state_report_interval", "StateReportInterval"), ("race_finish_duration", "RaceFinishDuration"),
    ("reverse_start_order_places", "ReverseStartOrderPlaces"), ("stay_in_practice_if_empty", "StayInPracticeSessionIfEmpty"),
    ("allow_join_in_qualifying", "AllowPlayersJoinInQualifying"), ("starting_grid_from_leaderboards", "StartingGridFromLeaderboards"),
    ("checkered_after_time", "CheckeredAfterTime"), ("fixed_setup", "FixedSetup"), ("max_incident_points", "MaxIncidentPoints"),
    ("min_rating", "MinRating"), ("max_rating", "MaxRating"), ("min_reputation", "MinReputation"), ("max_reputation", "MaxReputation"),
    ("non_ready_pitlane_start_delay", "NonReadyPitlaneStartDelay"),
]
VIEW_DEFAULTS = {"assist_transmission": -1, "assist_esp": -1, "assist_steer": -1, "assist_brake": -1, "assist_traction": -1,
                 "assist_raceline": -1, "assist_autopit": -1, "state_report_interval": 3000, "race_finish_duration": 30}


def to_view(item: dict, show_password: bool) -> dict:
    gs = item["GameSetting"]
    ps = item["ProcessState"]
    tl = (gs.get("TrackLayouts") or [{}])[0]
    sess = tl.get("Sessions", {})
    th = gs.get("Thumbnail")
    if isinstance(th, str) and th.startswith("https://"):
        thumb = {"kind": "url", "url": th}
    elif isinstance(th, str) and th:
        thumb = {"kind": "data", "v": hashlib.sha1(th.encode()).hexdigest()[:10]}
    else:
        thumb = None
    view = {
        "id": gs["Id"],
        "name": gs["Name"],
        "thumb": thumb,
        "has_password": bool(gs.get("Password")),
        "experience": gs["Experience"],
        "layout_id": tl.get("LayoutId"),
        "car_ids": gs.get("Cars", []),
        "max_players": gs["MaxNumOfPlayers"],
        "warmup": sess.get("WarmupDuration", 0),
        "sessions": {
            k: {
                "duration": sess[k]["Duration"],
                "laps": sess[k]["Laps"],
                "time_of_day": sess[k]["TimeOfDay"],
                "rolling_start": (sess[k].get("SessionType") == 0) if k.startswith("Race") else (sess[k].get("SessionType") == 1),
            }
            for k in SESSION_KEYS
            if k in sess
        },
        "time_multiplier": tl.get("TimeOfDayMultiplier", 0),
        "state": {
            "running": ps["Running"],
            "port": ps["Port"],
            "time_port": ps["TimePort"],
            "players_online": ps["PlayersOnServer"],
            "session": ps["CurrentSession"],
            "session_time": ps["SessionTime"],
            "session_time_left": ps["SessionTimeLeft"],
            "players": [
                {"name": p.get("Name") or p.get("UserName") or "?", "raw": p}
                for p in drivers_only(ps.get("Players"))
            ],
        },
    }
    for attr, key in FIELD_MAP:
        view[attr] = gs.get(key, VIEW_DEFAULTS.get(attr, 0))
    if show_password:
        view["password"] = gs.get("Password", "")
    return view


def session_label(gs: dict, idx: int) -> str:
    tl = (gs.get("TrackLayouts") or [{}])[0]
    sess = tl.get("Sessions", {})
    active = []
    for k in SESSION_ORDER:
        if k == "Warmup":
            if sess.get("WarmupDuration", 0) > 0:
                active.append(k)
        elif k in sess and (sess[k].get("Duration", 0) > 0 or sess[k].get("Laps", 0) > 0):
            active.append(k)
    if 0 <= idx < len(active):
        return SESSION_LABEL.get(active[idx], active[idx])
    return f"Session {idx + 1}"


# --------------------------------------------------------------------- Adapter
class Adapter(GameAdapter):
    key = "raceroom"
    name = "RaceRoom"
    short = "R3E"
    color = "#e4002b"
    editor = "raceroom"
    caps = {"create", "edit", "delete", "start", "stop", "thumbnail", "live", "chat", "chat_read", "session",
            "kick", "ban", "penalty", "bans", "motd", "whitelist", "bot"}

    def __init__(self, d: dict[str, Any]):
        super().__init__(d)
        self._client: Optional[httpx.AsyncClient] = None
        self._web = httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "racer-panel/1.0"}, follow_redirects=False)
        self._sem = asyncio.Semaphore(3)
        self._content: dict[str, Any] = {"ts": 0, "data": None}
        self._meta: dict[str, Any] = {"ts": 0.0, "data": None}
        self._idx_src: Any = None
        self.liv: dict[int, tuple[dict, str]] = {}
        self.classes: dict[int, str] = {}
        self.layouts: dict[int, tuple[str, str]] = {}

    # ------------------------------------------------------------ Manager-API
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=MANAGER_URL, headers={"Host": MANAGER_HOST_HEADER},
                                             timeout=httpx.Timeout(20.0, connect=5.0))
        return self._client

    async def mgr(self, method: str, path: str, json: Any = None) -> Any:
        try:
            r = await self.client().request(method, path, json=json)
        except httpx.HTTPError as e:
            raise HTTPException(502, f"RaceRoom-Manager nicht erreichbar ({type(e).__name__})")
        if r.status_code >= 400:
            raise HTTPException(502, f"RaceRoom-Manager meldet Fehler {r.status_code}")
        if not r.content:
            return None
        try:
            data = r.json()
        except Exception:
            raise HTTPException(502, "Ungültige Antwort vom RaceRoom-Manager")
        if isinstance(data, dict) and len(data) == 1 and data.get("Message") and not path.startswith("/motd"):
            raise HTTPException(502, f"RaceRoom-Manager: {data['Message']}")
        return data

    async def health(self) -> bool:
        try:
            r = await self.client().get("/")
            return r.status_code == 200
        except httpx.HTTPError:
            return False

    async def raw_content(self) -> dict:
        if self._content["data"] is None or time.time() - self._content["ts"] > 600:
            self._content["data"] = await self.mgr("GET", "/content/all")
            self._content["ts"] = time.time()
        cdata = self._content["data"]
        if self._idx_src is not cdata:
            self.liv = {l["Id"]: (e["Car"], l["Name"]) for e in cdata["Liveries"] for l in e["Liveries"]}
            self.classes = {c["Id"]: c["Name"] for c in cdata["CarClasses"]}
            self.layouts = {l["Id"]: (t["Name"], l["Name"]) for t in cdata["Tracks"] for l in t["Layouts"]}
            self._idx_src = cdata
        return cdata

    # --------------------------------------------------------------- Inhalte
    async def content(self) -> dict:
        c = await self.raw_content()
        return {
            "experiences": c["Experiences"],
            "car_classes": c["CarClasses"],
            "tracks": [
                {"id": t["Id"], "name": t["Name"], "layouts": [{"id": l["Id"], "name": l["Name"], "experiences": l["Experiences"], "max": l["MaxVehicles"]} for l in t["Layouts"]]}
                for t in sorted(c["Tracks"], key=lambda t: t["Name"].lower())
            ],
            "cars": [
                {"id": e["Car"]["Id"], "name": e["Car"]["Name"], "class": e["Car"]["Class"], "experiences": e["Car"]["Experiences"], "liveries": len(e["Liveries"])}
                for e in sorted(c["Liveries"], key=lambda e: e["Car"]["Name"].lower())
            ],
        }

    async def meta(self) -> dict:
        if self._meta["data"] is None or time.time() - self._meta["ts"] > 3600:
            raw = await self.mgr("GET", "/content/meta")
            self._meta["data"] = {k: [{"value": o["Value"], "label": o["Label"]} for o in v] for k, v in raw.items() if isinstance(v, list)}
            self._meta["ts"] = time.time()
        return self._meta["data"]

    async def tracks(self) -> dict[int, dict]:
        c = await self.raw_content()
        return {t["Id"]: {"name": t["Name"], "layouts": [l["Id"] for l in t["Layouts"]]} for t in c["Tracks"]}

    async def layout_names(self) -> dict[int, tuple[str, str]]:
        await self.raw_content()
        return self.layouts

    # --------------------------------------------------------- Serververwaltung
    async def _items(self) -> list[dict]:
        return await self.mgr("GET", "/dedi/")

    async def _item(self, native: str) -> dict:
        sid = int(native)
        cur = next((i for i in await self._items() if i["GameSetting"]["Id"] == sid), None)
        if not cur:
            raise HTTPException(404, "Server nicht gefunden")
        return cur

    async def list_servers(self, role: str) -> list[dict]:
        return [to_view(i, role != "viewer") for i in await self._items()]

    async def get_server(self, native: str, role: str) -> dict:
        return to_view(await self._item(native), role != "viewer")

    async def defaults(self) -> dict:
        d = await self.mgr("GET", "/dedi/default")
        c = await self.raw_content()
        first_car = c["Liveries"][0]["Car"]["Id"] if c["Liveries"] else None
        return {"max_players": d["GameSetting"]["MaxNumOfPlayers"], "experience": d["GameSetting"]["Experience"], "first_car": first_car}

    async def create(self, body: dict) -> str:
        s = validate(ServerSettings, body)
        base = (await self.mgr("GET", "/dedi/default"))["GameSetting"]
        gs = apply_settings(base, s, await self.raw_content())
        res = await self.mgr("POST", "/dedi/", {"GameSettings": gs})
        return str(res.get("ProcessId"))

    async def update(self, native: str, body: dict) -> dict:
        s = validate(ServerSettings, body)
        cur = await self._item(native)
        gs = apply_settings(cur["GameSetting"], s, await self.raw_content())
        gs["Id"] = int(native)
        await self.mgr("POST", "/dedi/", {"GameSettings": gs})
        return {"restart_needed": bool(cur["ProcessState"]["Running"]), "name": s.name}

    async def delete(self, native: str) -> None:
        cur = await self._item(native)
        if cur["ProcessState"]["Running"]:
            raise HTTPException(409, "Server läuft noch, bitte zuerst stoppen")
        await self.mgr("DELETE", f"/dedi/{int(native)}")

    async def start(self, native: str) -> Any:
        return await self.mgr("POST", "/dedi/start", {"ProcessId": int(native)})

    async def stop(self, native: str) -> Any:
        return await self.mgr("POST", "/dedi/stop", {"ProcessId": int(native)})

    async def thumbnail(self, native: str) -> Optional[tuple[bytes, str]]:
        th = (await self._item(native))["GameSetting"].get("Thumbnail")
        if isinstance(th, str) and th and not th.startswith("http"):
            try:
                raw = base64.b64decode(th)
            except Exception:
                return None
            return raw, ("image/png" if raw.startswith(b"\x89PNG") else "image/jpeg")
        return None

    async def _require_running(self, native: str) -> None:
        if not (await self._item(native))["ProcessState"]["Running"]:
            raise HTTPException(409, "Server läuft nicht")

    # ------------------------------------------------------------------ Live
    async def poll(self) -> list[dict]:
        items = await self._items()
        # Die Listenabfrage enthält keine Fahrer-Details; die gibt es nur pro Server
        for it in items:
            ps = it["ProcessState"]
            if ps.get("Running") and ps.get("PlayersOnServer"):
                try:
                    detail = await self.mgr("GET", f"/dedi/{it['GameSetting']['Id']}")
                    if isinstance(detail, dict) and "ProcessState" in detail:
                        it["ProcessState"] = detail["ProcessState"]
                except Exception:
                    pass
        await self.raw_content()
        out = []
        for it in items:
            gs, ps = it["GameSetting"], it["ProcessState"]
            tl = (gs.get("TrackLayouts") or [{}])[0]
            players = []
            for p in drivers_only(ps.get("Players")):
                car, livery_name = self.liv.get(p["CarLiveryId"], (None, None))
                incs = p.get("Incidents") or []
                players.append({
                    "uid": p["UserId"], "x": p["X"], "z": p["Z"], "ping": p.get("LatestPingMilliSec"), "kmh": None, "name": None,
                    "car_id": car["Id"] if car else None, "car": car["Name"] if car else None,
                    "class": self.classes.get(car["Class"]) if car else None,
                    "livery": livery_name, "livery_id": p["CarLiveryId"],
                    "incident_points": sum(i.get("Points", 0) for i in incs),
                    "incidents": [{"type": i.get("Type"), "points": i.get("Points")} for i in incs],
                })
            running = bool(ps["Running"])
            out.append({
                "id": gs["Id"], "view": to_view(it, False), "running": running, "server_name": gs.get("Name", "?"),
                "layout_id": tl.get("LayoutId"), "session": ps["CurrentSession"] if running else None,
                "session_label": session_label(gs, ps["CurrentSession"]) if running and ps["PlayersOnServer"] else None,
                "session_time_ms": ps["SessionTime"], "time_left": ps.get("TimeLeft") if running else None,
                "report_ms": gs.get("StateReportInterval") or 3000, "has_players": bool(ps["PlayersOnServer"]),
                "players": players,
            })
        return out

    async def poll_chat(self, native: str) -> Optional[list[dict]]:
        res = await self.mgr("GET", f"/chat/{int(native)}")
        msgs = res.get("messages", []) if isinstance(res, dict) else []
        return [{"id": m.get("Id"), "ts": m.get("CreatedAt"), "user": m.get("UserName"), "text": m.get("Message")} for m in msgs[-60:]]

    async def user_info(self, uid: int) -> Optional[dict]:
        async with self._sem:
            r = await self._web.get(f"https://game.raceroom.com/utils/user-info/{uid}")
        if r.status_code != 200:
            return None
        j = r.json()
        return {
            "name": j.get("name") or j.get("username") or f"Fahrer {uid}",
            "username": j.get("username"),
            "team": j.get("team") or "",
            "avatar": j.get("avatar"),
            "banner": j.get("banner"),
            "vip": bool(j.get("vip")),
            "country": j.get("country") if isinstance(j.get("country"), dict) else None,
            "ts": int(time.time()),
            "game": self.key,
        }

    def profile_url(self, info: dict) -> Optional[str]:
        return f"https://game.raceroom.com/users/{info['username']}" if info.get("username") else None

    # ------------------------------------------------------------- Steuerung
    async def chat(self, native: str, message: str) -> None:
        await self._require_running(native)
        await self.mgr("POST", f"/chat/{int(native)}/admin", {"Message": message})

    async def session_cmd(self, native: str, action: str) -> None:
        await self._require_running(native)
        await self.mgr("POST", f"/session/{int(native)}", {"Command": 1 if action == "restart" else 2})

    async def kick(self, native: str, uid: int) -> None:
        await self._require_running(native)
        await self.mgr("POST", "/user/kick", {"UserId": uid, "ProcessId": int(native)})

    async def ban(self, native: str, uid: int) -> None:
        await self._require_running(native)
        await self.mgr("POST", "/user/ban", {"UserId": uid, "ProcessId": int(native)})

    async def penalty(self, native: str, uid: int, ptype: int, duration: int) -> None:
        await self._require_running(native)
        payload: dict[str, Any] = {"UserId": uid, "ProcessId": int(native), "PenaltyType": ptype}
        if ptype == 0:
            payload["Duration"] = duration
        await self.mgr("POST", "/user/penalty", payload)

    async def bans(self) -> list:
        return await self.mgr("GET", "/ban") or []

    async def unban(self, uid: int) -> None:
        await self.mgr("DELETE", "/ban", {"UserId": uid})

    async def motd_get(self, native: str) -> str:
        res = await self.mgr("GET", f"/motd/{int(native)}")
        return (res or {}).get("Message") or ""

    async def motd_set(self, native: str, message: str) -> None:
        await self.mgr("POST", "/motd/", {"ProcessId": int(native), "Message": message})

    async def whitelist_get(self, native: str) -> list[int]:
        res = await self.mgr("GET", f"/spectator-whitelist/{int(native)}")
        return (res or {}).get("Users") or []

    async def whitelist_set(self, native: str, users: list[int]) -> None:
        await self.mgr("POST", "/spectator-whitelist", {"ProcessId": int(native), "Users": users})
