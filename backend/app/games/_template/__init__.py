"""Vorlage für ein neues Spiel-Plugin.

So geht's (Details: docs/NEUES-SPIEL.md):
  1. Ordner kopieren:  cp -r games/_template games/meinspiel
  2. Unten key/name/short/color setzen und in ``caps`` eintragen, was das Spiel kann.
  3. Die passenden Methoden überschreiben (alles andere antwortet automatisch mit „nicht unterstützt“).
  4. Aktivieren:  GAMES=raceroom,meinspiel   (Umgebungsvariable des Panels)

Das Panel zeigt Knöpfe nur, wenn die Fähigkeit in ``caps`` steht. Ein Spiel ohne Live-Daten braucht nur
list_servers/start/stop (+ create/update/delete und settings_schema, wenn das Panel die Konfiguration schreiben soll).
"""
from __future__ import annotations

from typing import Any

from ..base import GameAdapter


class Adapter(GameAdapter):
    key = "meinspiel"            # technischer Name, Teil der Server-ID ("meinspiel-<id>")
    name = "Mein Spiel"          # Anzeigename
    short = "MS"                 # Kürzel im Badge
    color = "#3b82f6"            # Akzentfarbe
    editor = "schema"            # "schema" = Editor wird aus settings_schema() erzeugt
    caps = {"start", "stop"}     # create edit delete start stop live chat chat_read session kick ban penalty bans motd whitelist bot thumbnail

    async def health(self) -> bool:
        return True              # ist der Spiel-Host erreichbar?

    async def list_servers(self, role: str) -> list[dict]:
        """Mindestens: id, name, state.running (+ state.players, max_players, layout_id für die Karte)."""
        return [{"id": "demo", "name": "Demo-Server", "thumb": None, "has_password": False, "max_players": 8, "layout_id": None,
                 "state": {"running": False, "port": 0, "players_online": 0, "players": [], "session": 0, "session_time": 0, "session_time_left": 0}}]

    async def start(self, native: str) -> Any:
        ...

    async def stop(self, native: str) -> Any:
        ...

    # Live-Daten (Karte, Fahrerliste, Statistik): poll() liefert pro Server die normalisierten Spieler, siehe base.py
    # async def poll(self) -> list[dict]: ...

    # Editor aus Feldbeschreibung: [{key,label,type(text|password|number|select|multiselect|bool|textarea),group,hint,min,max,options,default}]
    # async def settings_schema(self) -> list[dict]: ...
