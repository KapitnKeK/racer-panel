"""Assetto Corsa – Plugin für AssettoServer über den Racer-Panel-Agenten (deploy/assetto/agent.py).

Konfiguration: ASSETTO_AGENT_URL (z. B. http://192.0.2.30:8750) und ASSETTO_AGENT_TOKEN.
Stand: Anlegen, Bearbeiten, Starten, Stoppen, Löschen. Live-Daten (Karte, Fahrer) folgen über das UDP-Plugin-Protokoll.
"""
from __future__ import annotations

import os
import time
from typing import Any, Optional

import httpx
from fastapi import HTTPException

from ..base import GameAdapter, stable_int

AGENT_URL = os.environ.get("ASSETTO_AGENT_URL", "").rstrip("/")
AGENT_TOKEN = os.environ.get("ASSETTO_AGENT_TOKEN", "")

WEATHER = [("3_clear", "Klar"), ("4_light_clouds", "Leicht bewölkt"), ("5_mid_clouds", "Bewölkt"), ("6_heavy_clouds", "Stark bewölkt"),
           ("7_fog", "Nebel"), ("8_light_rain", "Leichter Regen")]


class Adapter(GameAdapter):
    key = "assetto"
    name = "Assetto Corsa"
    short = "AC"
    color = "#f5a300"
    editor = "schema"
    caps = {"create", "edit", "delete", "start", "stop"}

    def __init__(self, d: dict[str, Any]):
        super().__init__(d)
        self._c: Optional[httpx.AsyncClient] = None
        self._content: dict[str, Any] = {"ts": 0.0, "data": None}

    # --------------------------------------------------------------- Agent
    def _client(self) -> httpx.AsyncClient:
        if self._c is None:
            if not AGENT_URL or not AGENT_TOKEN:
                raise HTTPException(503, "Assetto-Corsa-Agent ist nicht konfiguriert")
            self._c = httpx.AsyncClient(base_url=AGENT_URL, headers={"X-Agent-Token": AGENT_TOKEN}, timeout=httpx.Timeout(20.0, connect=4.0))
        return self._c

    async def agent(self, method: str, path: str, json: Any = None) -> Any:
        try:
            r = await self._client().request(method, path, json=json)
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Assetto-Corsa-Agent nicht erreichbar ({type(e).__name__})")
        try:
            data = r.json()
        except Exception:
            raise HTTPException(502, "Ungültige Antwort vom Assetto-Corsa-Agent")
        if r.status_code >= 400:
            raise HTTPException(r.status_code if r.status_code in (404, 409, 422) else 502, data.get("detail", f"Agent-Fehler {r.status_code}"))
        return data

    async def health(self) -> bool:
        try:
            return bool((await self.agent("GET", "/health")).get("ok"))
        except HTTPException:
            return False

    async def raw_content(self) -> dict:
        if self._content["data"] is None or time.time() - self._content["ts"] > 60:
            self._content["data"] = await self.agent("GET", "/content")
            self._content["ts"] = time.time()
        return self._content["data"]

    # --------------------------------------------------------------- Inhalte
    async def content(self) -> dict:
        c = await self.raw_content()
        return {"tracks": c["tracks"], "cars": c["cars"]}

    async def tracks(self) -> dict[int, dict]:
        out = {}
        for t in (await self.raw_content())["tracks"]:
            out[stable_int(self.key, t["id"])] = {"name": t["name"], "layouts": [stable_int(self.key, f"{t['id']}/{l['id']}") for l in t["layouts"]]}
        return out

    async def layout_names(self) -> dict[int, tuple[str, str]]:
        return {stable_int(self.key, f"{t['id']}/{l['id']}"): (t["name"], l["name"] or "Standard") for t in (await self.raw_content())["tracks"] for l in t["layouts"]}

    async def settings_schema(self) -> list[dict]:
        c = await self.raw_content()
        combos = [{"value": f"{t['id']}|{l['id']}", "label": t["name"] + (f" · {l['name']}" if len(t["layouts"]) > 1 else "")} for t in c["tracks"] for l in t["layouts"]]
        cars = [{"value": x["id"], "label": x["name"]} for x in c["cars"]]
        return [
            {"key": "name", "label": "Servername", "type": "text", "group": "Allgemein", "default": "Racer Panel AC"},
            {"key": "password", "label": "Passwort", "type": "password", "group": "Allgemein", "hint": "Leer = offener Server"},
            {"key": "admin_password", "label": "Admin-Passwort (im Spiel /admin)", "type": "password", "group": "Allgemein"},
            {"key": "max_clients", "label": "Maximale Fahrer", "type": "number", "min": 1, "max": 40, "group": "Allgemein", "default": 12},
            {"key": "welcome_message", "label": "Begrüßungsnachricht", "type": "textarea", "group": "Allgemein"},
            {"key": "track_layout", "label": "Strecke", "type": "select", "options": combos, "group": "Strecke & Autos", "default": combos[0]["value"] if combos else ""},
            {"key": "cars", "label": "Autos", "type": "multiselect", "options": cars, "group": "Strecke & Autos", "hint": "Mindestens eins wählen"},
            {"key": "practice_minutes", "label": "Training (Minuten, 0 = aus)", "type": "number", "min": 0, "max": 600, "group": "Sessions", "default": 10},
            {"key": "qualify_minutes", "label": "Qualifying (Minuten, 0 = aus)", "type": "number", "min": 0, "max": 600, "group": "Sessions", "default": 0},
            {"key": "race_laps", "label": "Rennen (Runden, 0 = aus)", "type": "number", "min": 0, "max": 500, "group": "Sessions", "default": 5},
            {"key": "race_wait_seconds", "label": "Wartezeit vor dem Rennen (s)", "type": "number", "min": 0, "max": 600, "group": "Sessions", "default": 60},
            {"key": "sun_angle", "label": "Tageszeit (Sonnenwinkel, -80 bis 80)", "type": "number", "min": -80, "max": 80, "group": "Wetter", "default": 16},
            {"key": "weather", "label": "Wetter", "type": "select", "options": [{"value": v, "label": l} for v, l in WEATHER], "group": "Wetter", "default": "3_clear"},
            {"key": "temperature_ambient", "label": "Lufttemperatur (°C)", "type": "number", "min": 0, "max": 40, "group": "Wetter", "default": 20},
            {"key": "temperature_road", "label": "Streckentemperatur (°C)", "type": "number", "min": 0, "max": 60, "group": "Wetter", "default": 26},
            {"key": "abs", "label": "ABS", "type": "select", "options": [{"value": 0, "label": "Aus"}, {"value": 1, "label": "Werkseinstellung"}, {"value": 2, "label": "Erzwungen"}], "group": "Fahrhilfen", "default": 1},
            {"key": "tc", "label": "Traktionskontrolle", "type": "select", "options": [{"value": 0, "label": "Aus"}, {"value": 1, "label": "Werkseinstellung"}, {"value": 2, "label": "Erzwungen"}], "group": "Fahrhilfen", "default": 1},
            {"key": "stability", "label": "Stabilitätskontrolle", "type": "bool", "group": "Fahrhilfen"},
            {"key": "auto_clutch", "label": "Automatische Kupplung erlaubt", "type": "bool", "group": "Fahrhilfen", "default": True},
            {"key": "damage_multiplier", "label": "Schaden (%)", "type": "number", "min": 0, "max": 100, "group": "Realismus", "default": 100},
            {"key": "fuel_rate", "label": "Spritverbrauch (%)", "type": "number", "min": 0, "max": 500, "group": "Realismus", "default": 100},
            {"key": "tyre_wear_rate", "label": "Reifenverschleiß (%)", "type": "number", "min": 0, "max": 500, "group": "Realismus", "default": 100},
            {"key": "allowed_tyres_out", "label": "Erlaubte Räder außerhalb der Strecke", "type": "number", "min": -1, "max": 4, "group": "Realismus", "default": 2},
        ]

    # ------------------------------------------------- Abbildung Panel <-> Agent
    @staticmethod
    def _to_cfg(body: dict) -> dict:
        cfg = {k: v for k, v in body.items() if k not in ("track_layout", "game")}
        tl = str(body.get("track_layout", ""))
        track, _, layout = tl.partition("|")
        cfg["track"], cfg["track_config"] = track, layout
        for b in ("stability", "auto_clutch"):
            if b in cfg:
                cfg[b] = 1 if cfg[b] else 0
        return cfg

    def _view(self, a: dict) -> dict:
        c = a["config"]
        lid = stable_int(self.key, f"{c['track']}/{c['track_config']}")
        v = {k: v for k, v in c.items() if k not in ("password", "admin_password")}
        v.update({
            "id": a["id"], "name": c["name"], "thumb": None, "has_password": bool(c.get("password")),
            "track_layout": f"{c['track']}|{c['track_config']}", "layout_id": lid, "max_players": c["max_clients"],
            "stability": bool(c.get("stability")), "auto_clutch": bool(c.get("auto_clutch")),
            "state": {"running": a["running"], "port": a["ports"]["udp"], "time_port": a["ports"]["http"], "players_online": 0, "players": [],
                      "session": 0, "session_time": 0, "session_time_left": 0},
        })
        return v

    # --------------------------------------------------------- Serververwaltung
    async def list_servers(self, role: str) -> list[dict]:
        out = []
        for a in await self.agent("GET", "/servers"):
            v = self._view(a)
            if role != "viewer":
                v["password"] = a["config"].get("password", ""); v["admin_password"] = a["config"].get("admin_password", "")
            out.append(v)
        return out

    async def get_server(self, native: str, role: str) -> dict:
        a = await self.agent("GET", f"/servers/{native}")
        v = self._view(a)
        if role != "viewer":
            v["password"] = a["config"].get("password", ""); v["admin_password"] = a["config"].get("admin_password", "")
        return v

    async def create(self, body: dict) -> str:
        return (await self.agent("POST", "/servers", self._to_cfg(body)))["id"]

    async def update(self, native: str, body: dict) -> dict:
        r = await self.agent("PUT", f"/servers/{native}", self._to_cfg(body))
        return {"restart_needed": r.get("restart_needed", False), "name": body.get("name", "")}

    async def delete(self, native: str) -> None:
        await self.agent("DELETE", f"/servers/{native}")

    async def start(self, native: str) -> Any:
        return await self.agent("POST", f"/servers/{native}/start")

    async def stop(self, native: str) -> Any:
        return await self.agent("POST", f"/servers/{native}/stop")

    # ------------------------------------------------------------------ Live
    async def poll(self) -> list[dict]:
        out = []
        for a in await self.agent("GET", "/servers"):
            v = self._view(a)
            out.append({"id": a["id"], "view": v, "running": bool(a["running"]), "server_name": a["config"]["name"], "layout_id": v["layout_id"],
                        "session": 0 if a["running"] else None, "session_label": None, "session_time_ms": None, "time_left": None,
                        "report_ms": 1000, "has_players": False, "players": []})
        return out
