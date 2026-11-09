"""Schnittstelle für Spiel-Plugins.

Jedes Spiel (RaceRoom, Assetto Corsa, …) ist ein Adapter, der dieselben Grundfunktionen anbietet.
Was ein Spiel nicht kann, steht nicht in ``caps`` – das Panel blendet die passenden Knöpfe dann aus
und die Endpunkte antworten mit 501.

Server-IDs im Panel sind global: ``"<spiel>-<native id>"`` (z. B. ``raceroom-512977``).

Streckenlayouts und Fahrer werden als Ganzzahlen geführt (Datenbank, Karte, Statistik). Spiele mit
Text-IDs (z. B. AC: ``ks_monza66/layout``) bilden sie mit :func:`stable_int` in einen eigenen
Zahlenbereich ab, damit sie sich nicht mit RaceRoom-IDs überschneiden.
"""
from __future__ import annotations

import zlib
from typing import Any, Optional

from fastapi import HTTPException

# Fähigkeiten, die ein Adapter anbieten kann
CAPS = {
    "create", "edit", "delete", "start", "stop",       # Serververwaltung
    "thumbnail",                                       # Server-Bild
    "live",                                            # Positionen/Fahrer live (Karte, Statistik)
    "chat", "chat_read", "session", "kick", "ban", "penalty", "bans", "motd", "whitelist",
    "bot",                                             # Zuschauer-Bot / Kamera
}


class NotSupported(HTTPException):
    def __init__(self, what: str = "Funktion"):
        super().__init__(501, f"{what} wird von diesem Spiel nicht unterstützt")


def stable_int(game: str, key: str, base: int = 1_000_000_000) -> int:
    """Stabile Ganzzahl für Text-IDs anderer Spiele (ab 1 Mrd., RaceRoom-IDs liegen weit darunter)."""
    return base + (zlib.crc32(f"{game}:{key}".encode()) & 0x3FFFFFFF)


class GameAdapter:
    """Basisklasse. Ein Plugin überschreibt, was das Spiel kann, und trägt es in ``caps`` ein."""

    key: str = "base"            # technischer Name, Teil der Server-ID
    name: str = "Spiel"          # Anzeigename
    short: str = "?"             # Kürzel für Badges
    color: str = "#888888"       # Akzentfarbe im Frontend
    caps: set[str] = set()
    editor: str = "schema"      # "raceroom" = eigener Editor im Frontend, "schema" = aus settings_schema()

    def __init__(self, d: dict[str, Any]):
        self.d = d  # Panel-Dienste: db, audit, …

    # ------------------------------------------------------------ Beschreibung
    def info(self) -> dict:
        return {"key": self.key, "name": self.name, "short": self.short, "color": self.color,
                "caps": sorted(self.caps), "editor": self.editor}

    async def health(self) -> bool:
        return True

    # --------------------------------------------------------------- Inhalte
    async def content(self) -> dict:
        """Strecken/Autos im Format des Spiel-Editors."""
        raise NotSupported("Inhalte")

    async def meta(self) -> dict:
        return {}

    async def tracks(self) -> dict[int, dict]:
        """{track_id: {"name": str, "layouts": [layout_id, …]}} – für Karte und Auto-Ausrichtung."""
        return {}

    async def layout_names(self) -> dict[int, tuple[str, str]]:
        """{layout_id: (Strecke, Layout)}"""
        return {}

    def settings_schema(self) -> list[dict]:
        """Feldbeschreibung für den generischen Editor (nur bei editor == "schema")."""
        return []

    # --------------------------------------------------------- Serververwaltung
    async def list_servers(self, role: str) -> list[dict]:
        """Server-Ansichten (ohne Live-Daten). Jede Ansicht hat mindestens id (native), name, state.running."""
        return []

    async def get_server(self, native: str, role: str) -> dict:
        for v in await self.list_servers(role):
            if str(v["id"]) == str(native):
                return v
        raise HTTPException(404, "Server nicht gefunden")

    async def defaults(self) -> dict:
        return {}

    async def create(self, body: dict) -> str:
        raise NotSupported("Anlegen")

    async def update(self, native: str, body: dict) -> dict:
        raise NotSupported("Bearbeiten")

    async def delete(self, native: str) -> None:
        raise NotSupported("Löschen")

    async def start(self, native: str) -> Any:
        raise NotSupported("Starten")

    async def stop(self, native: str) -> Any:
        raise NotSupported("Stoppen")

    async def thumbnail(self, native: str) -> Optional[tuple[bytes, str]]:
        return None

    # ------------------------------------------------------------------ Live
    async def poll(self) -> list[dict]:
        """Live-Zustand aller Server, normalisiert:

        {"id": native, "view": <Ansicht wie list_servers>, "running": bool, "server_name": str,
         "layout_id": int|None, "session": int|None, "session_label": str|None, "session_time_ms": int|None,
         "time_left": int|None, "report_ms": int,
         "players": [{"uid": int, "x": float, "z": float, "ping": float|None, "kmh": float|None (falls vom Spiel),
                      "name": str|None, "car_id": int|None, "car": str|None, "class": str|None,
                      "livery": str|None, "livery_id": int|None, "incident_points": int, "incidents": list}]}
        """
        return []

    async def poll_chat(self, native: str) -> Optional[list[dict]]:
        return None

    async def user_info(self, uid: int) -> Optional[dict]:
        """Fahrerprofil (Name, Avatar, Land …); None = unbekannt."""
        return None

    def profile_url(self, info: dict) -> Optional[str]:
        return None

    # ------------------------------------------------------------- Steuerung
    async def chat(self, native: str, message: str) -> None:
        raise NotSupported("Chat")

    async def session_cmd(self, native: str, action: str) -> None:
        raise NotSupported("Session-Steuerung")

    async def kick(self, native: str, uid: int) -> None:
        raise NotSupported("Kicken")

    async def ban(self, native: str, uid: int) -> None:
        raise NotSupported("Sperren")

    async def penalty(self, native: str, uid: int, ptype: int, duration: int) -> None:
        raise NotSupported("Strafen")

    async def bans(self) -> list:
        raise NotSupported("Sperrliste")

    async def unban(self, uid: int) -> None:
        raise NotSupported("Sperrliste")

    async def motd_get(self, native: str) -> str:
        raise NotSupported("Begrüßungsnachricht")

    async def motd_set(self, native: str, message: str) -> None:
        raise NotSupported("Begrüßungsnachricht")

    async def whitelist_get(self, native: str) -> list[int]:
        raise NotSupported("Zuschauer-Whitelist")

    async def whitelist_set(self, native: str, users: list[int]) -> None:
        raise NotSupported("Zuschauer-Whitelist")
