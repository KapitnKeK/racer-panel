"""Registry der Spiel-Plugins.

Welche Spiele aktiv sind, steuert die Umgebungsvariable ``GAMES`` (kommagetrennt, Standard ``raceroom``).
Ein Plugin ist ein Unterpaket ``games/<key>/`` mit einer Klasse ``Adapter`` (siehe ``base.GameAdapter``).
"""
from __future__ import annotations

import importlib
import os
import re
from typing import Any

from fastapi import HTTPException

from .base import CAPS, GameAdapter, NotSupported, stable_int  # noqa: F401

_adapters: dict[str, GameAdapter] = {}
_KEY = re.compile(r"^[a-z][a-z0-9_]{1,30}$")


def load(d: dict[str, Any]) -> dict[str, GameAdapter]:
    keys = [k.strip() for k in os.environ.get("GAMES", "raceroom").split(",") if k.strip()]
    for key in keys:
        if not _KEY.match(key) or key.startswith("_"):
            raise RuntimeError(f"Ungültiger Spielname in GAMES: {key!r}")
        mod = importlib.import_module(f"{__name__}.{key}")
        _adapters[key] = mod.Adapter(d)
    return _adapters


def all_adapters() -> list[GameAdapter]:
    return list(_adapters.values())


def get(key: str) -> GameAdapter:
    a = _adapters.get(key)
    if not a:
        raise HTTPException(404, "Spiel nicht aktiv")
    return a


def default() -> GameAdapter:
    return next(iter(_adapters.values()))


def gid(game: str, native: Any) -> str:
    return f"{game}-{native}"


def resolve(sid: str) -> tuple[GameAdapter, str]:
    """``raceroom-512977`` → (Adapter, "512977"). Eine reine Zahl (alte Links) gilt als RaceRoom bzw. erstes Spiel."""
    sid = str(sid)
    if sid.isdigit():
        return (_adapters.get("raceroom") or default()), sid
    game, _, native = sid.partition("-")
    if not native:
        raise HTTPException(404, "Server nicht gefunden")
    return get(game), native


def need(a: GameAdapter, cap: str, what: str) -> None:
    if cap not in a.caps:
        raise NotSupported(what)
