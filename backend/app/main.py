"""Racer Panel — Backend (Kern).

Ein Panel für mehrere Rennspiel-Server. Login, Rollen, Audit, Live-Daten und Fahrer-Statistik
liegen hier; alles Spielspezifische steckt in den Plugins unter ``app/games/<spiel>/``.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel, Field, field_validator

DATA_DIR = Path(os.environ.get("DATA_DIR", "./data"))
STATIC_DIR = Path(os.environ.get("STATIC_DIR", "../frontend/dist"))
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "auto").lower()  # "1" immer, "0" nie, "auto" bei HTTPS
SESSION_HOURS = int(os.environ.get("SESSION_HOURS", "12"))
TRUSTED_PROXIES = {x.strip() for x in os.environ.get("TRUSTED_PROXIES", "").split(",") if x.strip()}

DATA_DIR.mkdir(parents=True, exist_ok=True)

ROLES = {"viewer": 1, "host": 2, "admin": 3}
CSRF_VALUES = ("racer-panel", "r3e-panel")  # alter Wert bleibt gültig (offene Browser-Tabs)


# --------------------------------------------------------------------------- DB
def _db_path() -> Path:
    return DATA_DIR / "panel.sqlite"


@contextmanager
def db():
    con = sqlite3.connect(_db_path())
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db() -> None:
    with db() as c:
        c.execute("CREATE TABLE IF NOT EXISTS track_geo(track_id INTEGER PRIMARY KEY, lat0 REAL NOT NULL, lon0 REAL NOT NULL, rot_deg REAL NOT NULL DEFAULT 0, mirror INTEGER NOT NULL DEFAULT 0, source TEXT, view TEXT)")
        seed = Path(__file__).with_name("geo_seed.json")
        if seed.exists():
            for tid, v in json.loads(seed.read_text(encoding="utf-8")).items():
                c.execute("INSERT OR IGNORE INTO track_geo(track_id,lat0,lon0,rot_deg,mirror,source,view) VALUES(?,?,?,?,?,?,?)",
                          (int(tid), v["lat0"], v["lon0"], v.get("rot_deg", 0), int(v.get("mirror", False)), v.get("source"), json.dumps(v.get("view"))))
        c.execute(
            """CREATE TABLE IF NOT EXISTS users(
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                 pw_hash TEXT NOT NULL,
                 role TEXT NOT NULL,
                 created INTEGER NOT NULL)"""
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS audit(
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 ts INTEGER NOT NULL, user TEXT NOT NULL,
                 action TEXT NOT NULL, detail TEXT)"""
        )


def audit(user: str, action: str, detail: str = "") -> None:
    with db() as c:
        c.execute("INSERT INTO audit(ts,user,action,detail) VALUES(?,?,?,?)", (int(time.time()), user, action, detail[:300]))


# ------------------------------------------------------------------- Passwörter
def hash_pw(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${h.hex()}"


def verify_pw(pw: str, stored: str) -> bool:
    try:
        _, salt, h = stored.split("$")
        calc = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(calc.hex(), h)
    except Exception:
        return False


# ---------------------------------------------------------------------- Session
def _secret() -> str:
    f = DATA_DIR / "secret.key"
    if not f.exists():
        f.write_text(secrets.token_urlsafe(48))
        f.chmod(0o600)
    return f.read_text().strip()


serializer = URLSafeTimedSerializer(_secret(), salt="r3e-panel-session")
COOKIE = "racer_session"

_fails: dict[str, list[float]] = {}


def _rate_limited(key: str, limit: int = 5, window: int = 300) -> bool:
    now = time.time()
    _fails[key] = [t for t in _fails.get(key, []) if now - t < window]
    return len(_fails[key]) >= limit


class User(BaseModel):
    id: int
    username: str
    role: Literal["viewer", "host", "admin"]


def _pv(pw_hash: str) -> str:
    return hashlib.sha256(pw_hash.encode()).hexdigest()[:16]


def _cookie_secure(request: Request) -> bool:
    if COOKIE_SECURE in ("1", "true", "yes"):
        return True
    if COOKIE_SECURE in ("0", "false", "no"):
        return False
    peer = request.client.host if request.client else ""
    proto = request.headers.get("x-forwarded-proto", "") if peer in TRUSTED_PROXIES else ""
    return request.url.scheme == "https" or proto.split(",")[-1].strip() == "https"


def client_ip(request: Request) -> str:
    """Echte Client-IP: X-Forwarded-For zählt nur, wenn die Anfrage von einem vertrauten Proxy kommt."""
    peer = request.client.host if request.client else "?"
    if peer in TRUSTED_PROXIES:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[-1].strip() or peer
    return peer


def current_user(request: Request) -> User:
    tok = request.cookies.get(COOKIE)
    if not tok:
        raise HTTPException(401, "Nicht angemeldet")
    try:
        data = serializer.loads(tok, max_age=SESSION_HOURS * 3600)
    except (BadSignature, SignatureExpired):
        raise HTTPException(401, "Sitzung abgelaufen")
    with db() as c:
        row = c.execute("SELECT id,username,role,pw_hash FROM users WHERE id=?", (data["uid"],)).fetchone()
    if not row:
        raise HTTPException(401, "Benutzer existiert nicht mehr")
    if not hmac.compare_digest(data.get("pv", ""), _pv(row["pw_hash"])):
        raise HTTPException(401, "Sitzung abgelaufen")
    return User(id=row["id"], username=row["username"], role=row["role"])


def require(role: str):
    def dep(request: Request, user: User = Depends(current_user)) -> User:
        if ROLES[user.role] < ROLES[role]:
            raise HTTPException(403, "Dafür fehlt dir die Berechtigung")
        if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-requested-with") not in CSRF_VALUES:
            raise HTTPException(403, "Ungültige Anfrage")
        return user

    return dep



# ------------------------------------------------------------------ Spiele
from . import games  # noqa: E402

games.load({"db": db, "audit": audit})


# -------------------------------------------------------------------------- App
app = FastAPI(title="Racer Panel", docs_url=None, redoc_url=None, openapi_url=None)
init_db()


CSP = (
    "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; "
    "connect-src 'self'; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-src https://player.twitch.tv https://www.youtube-nocookie.com; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("Content-Security-Policy", CSP)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.url.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


@app.exception_handler(HTTPException)
async def http_exc(_: Request, exc: HTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


class LoginIn(BaseModel):
    username: str = Field(..., max_length=64)
    password: str = Field(..., max_length=256)


@app.post("/api/login")
def login(body: LoginIn, request: Request, response: Response):
    ip = client_ip(request)
    ukey = "u:" + body.username.strip().lower()
    if _rate_limited("ip:" + ip) or _rate_limited(ukey, limit=15, window=900):
        raise HTTPException(429, "Zu viele Versuche, bitte in einigen Minuten erneut probieren")
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE username=?", (body.username.strip(),)).fetchone()
    ok = bool(row) and verify_pw(body.password, row["pw_hash"])
    if not ok:
        _fails.setdefault("ip:" + ip, []).append(time.time())
        _fails.setdefault(ukey, []).append(time.time())
        if not row:  # Timing angleichen
            verify_pw(body.password, hash_pw("dummy"))
        raise HTTPException(401, "Benutzername oder Passwort falsch")
    tok = serializer.dumps({"uid": row["id"], "pv": _pv(row["pw_hash"])})
    response.set_cookie(COOKIE, tok, max_age=SESSION_HOURS * 3600, httponly=True, secure=_cookie_secure(request), samesite="lax", path="/")
    audit(row["username"], "login")
    return {"username": row["username"], "role": row["role"]}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return user


@app.get("/api/health")
async def health():
    out = {"panel": True, "games": {}}
    for a in games.all_adapters():
        out["games"][a.key] = await a.health()
    out["manager"] = all(out["games"].values())  # Abwärtskompatibel
    return out


# ------------------------------------------------------------------- Spiele
def wrap(a: games.GameAdapter, view: dict) -> dict:
    """Spiel-Ansicht um globale ID, Spiel und Fähigkeiten ergänzen."""
    native = view["id"]
    view["native_id"] = native
    view["id"] = games.gid(a.key, native)
    view["game"] = a.key
    view["caps"] = sorted(a.caps)
    return view


@app.get("/api/games")
def list_games(_: User = Depends(require("viewer"))):
    return [a.info() for a in games.all_adapters()]


@app.get("/api/games/{game}/content")
async def game_content(game: str, _: User = Depends(require("viewer"))):
    return await games.get(game).content()


@app.get("/api/games/{game}/meta")
async def game_meta(game: str, _: User = Depends(require("viewer"))):
    return await games.get(game).meta()


@app.get("/api/games/{game}/schema")
async def game_schema(game: str, _: User = Depends(require("host"))):
    return await games.get(game).settings_schema()


@app.get("/api/games/{game}/defaults")
async def game_defaults(game: str, _: User = Depends(require("host"))):
    return await games.get(game).defaults()


# Alte Pfade (RaceRoom-Panel) bleiben gültig
@app.get("/api/content")
async def get_content(_: User = Depends(require("viewer"))):
    return await games.resolve("0")[0].content()


@app.get("/api/defaults")
async def defaults(_: User = Depends(require("host"))):
    return await games.resolve("0")[0].defaults()


# ----------------------------------------------------------------- Strecken
async def layout_index() -> dict[int, tuple[int, str, list[int]]]:
    """{layout_id: (track_id, Streckenname, [alle layout_ids der Strecke])} über alle Spiele."""
    out: dict[int, tuple[int, str, list[int]]] = {}
    for a in games.all_adapters():
        try:
            for tid, t in (await a.tracks()).items():
                for lid in t["layouts"]:
                    out[lid] = (tid, t["name"], t["layouts"])
        except HTTPException:
            continue
    return out


@app.get("/api/tracks/{layout_id}/geo")
async def get_geo(layout_id: int, _: User = Depends(require("viewer"))):
    hit = (await layout_index()).get(layout_id)
    if not hit:
        raise HTTPException(404, "Unbekanntes Layout")
    tid, _name, lids = hit
    with db() as c:
        r = c.execute("SELECT * FROM track_geo WHERE track_id=?", (tid,)).fetchone()
        n = c.execute(f"SELECT COUNT(*) n FROM track_cells WHERE layout_id IN ({','.join(str(int(i)) for i in lids) or '0'})").fetchone()["n"]
        a = c.execute("SELECT ts,ok,note FROM geo_attempts WHERE track_id=?", (tid,)).fetchone()
    auto = {"cells": n, "last": dict(a) if a else None}
    if not r:
        return {"geo": None, "track_id": tid, "auto": auto}
    return {"track_id": tid, "auto": auto, "geo": {"lat0": r["lat0"], "lon0": r["lon0"], "rot_deg": r["rot_deg"], "mirror": bool(r["mirror"]), "source": r["source"], "view": json.loads(r["view"]) if r["view"] else None}}


class GeoIn(BaseModel):
    lat0: float = Field(..., ge=-85, le=85)
    lon0: float = Field(..., ge=-180, le=180)
    rot_deg: float = Field(0, ge=-360, le=360)
    mirror: bool = False


@app.put("/api/tracks/{layout_id}/geo")
async def put_geo(layout_id: int, body: GeoIn, user: User = Depends(require("admin"))):
    hit = (await layout_index()).get(layout_id)
    if not hit:
        raise HTTPException(404, "Unbekanntes Layout")
    tid = hit[0]
    with db() as c:
        c.execute("INSERT INTO track_geo(track_id,lat0,lon0,rot_deg,mirror,source) VALUES(?,?,?,?,?,?) ON CONFLICT(track_id) DO UPDATE SET lat0=excluded.lat0, lon0=excluded.lon0, rot_deg=excluded.rot_deg, mirror=excluded.mirror, source=excluded.source",
                  (tid, body.lat0, body.lon0, body.rot_deg, int(body.mirror), f"manuell von {user.username}"))
    audit(user.username, "geo.set", f"track={tid}")
    return {"ok": True}


# ------------------------------------------------------------------- Server
@app.get("/api/servers")
async def list_servers(user: User = Depends(require("viewer"))):
    out = []
    for a in games.all_adapters():
        try:
            out += [wrap(a, v) for v in await a.list_servers(user.role)]
        except HTTPException:
            continue  # ein Spiel-Host offline darf die Liste nicht leeren
    return out


@app.get("/api/servers/{sid}/thumbnail")
async def get_thumbnail(sid: str, _: User = Depends(require("viewer"))):
    a, native = games.resolve(sid)
    res = await a.thumbnail(native)
    if not res:
        raise HTTPException(404, "Kein Bild")
    raw, mt = res
    return Response(raw, media_type=mt, headers={"Cache-Control": "private, max-age=86400"})


@app.get("/api/servers/{sid}")
async def get_server(sid: str, user: User = Depends(require("viewer"))):
    a, native = games.resolve(sid)
    return wrap(a, await a.get_server(native, user.role))


@app.post("/api/servers")
async def create_server(body: dict, user: User = Depends(require("host"))):
    key = body.pop("game", None) or games.default().key
    a = games.get(str(key))
    games.need(a, "create", "Anlegen")
    native = await a.create(body)
    sid = games.gid(a.key, native)
    audit(user.username, "server.create", f"{str(body.get('name', ''))[:40]} id={sid}")
    return {"id": sid}


@app.put("/api/servers/{sid}")
async def update_server(sid: str, body: dict, user: User = Depends(require("host"))):
    a, native = games.resolve(sid)
    games.need(a, "edit", "Bearbeiten")
    body.pop("game", None)
    res = await a.update(native, body)
    gid = games.gid(a.key, native)
    audit(user.username, "server.update", f"{res.get('name', '')} id={gid}")
    return {"id": gid, "restart_needed": res.get("restart_needed", False)}


@app.post("/api/servers/{sid}/start")
async def start_server(sid: str, user: User = Depends(require("host"))):
    a, native = games.resolve(sid)
    games.need(a, "start", "Starten")
    res = await a.start(native)
    audit(user.username, "server.start", f"id={games.gid(a.key, native)}")
    return res


@app.post("/api/servers/{sid}/stop")
async def stop_server(sid: str, user: User = Depends(require("host"))):
    a, native = games.resolve(sid)
    games.need(a, "stop", "Stoppen")
    res = await a.stop(native)
    audit(user.username, "server.stop", f"id={games.gid(a.key, native)}")
    return res


@app.delete("/api/servers/{sid}")
async def delete_server(sid: str, user: User = Depends(require("admin"))):
    a, native = games.resolve(sid)
    games.need(a, "delete", "Löschen")
    await a.delete(native)
    audit(user.username, "server.delete", f"id={games.gid(a.key, native)}")
    return {"ok": True}


# ------------------------------------------------------------------- Benutzer
class UserIn(BaseModel):
    username: str = Field(..., min_length=2, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(..., min_length=10, max_length=128)
    role: Literal["viewer", "host", "admin"] = "host"


class UserPatch(BaseModel):
    password: Optional[str] = Field(None, min_length=10, max_length=128)
    role: Optional[Literal["viewer", "host", "admin"]] = None


@app.get("/api/users")
def list_users(_: User = Depends(require("admin"))):
    with db() as c:
        return [dict(r) for r in c.execute("SELECT id,username,role,created FROM users ORDER BY username")]


@app.post("/api/users")
def create_user(body: UserIn, admin: User = Depends(require("admin"))):
    with db() as c:
        if c.execute("SELECT 1 FROM users WHERE username=?", (body.username,)).fetchone():
            raise HTTPException(409, "Benutzername schon vergeben")
        c.execute("INSERT INTO users(username,pw_hash,role,created) VALUES(?,?,?,?)", (body.username, hash_pw(body.password), body.role, int(time.time())))
    audit(admin.username, "user.create", f"{body.username} ({body.role})")
    return {"ok": True}


@app.patch("/api/users/{uid}")
def patch_user(uid: int, body: UserPatch, admin: User = Depends(require("admin"))):
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, "Benutzer nicht gefunden")
        if body.role and row["role"] == "admin" and body.role != "admin":
            if c.execute("SELECT COUNT(*) n FROM users WHERE role='admin'").fetchone()["n"] <= 1:
                raise HTTPException(409, "Der letzte Admin kann nicht herabgestuft werden")
        if body.role:
            c.execute("UPDATE users SET role=? WHERE id=?", (body.role, uid))
        if body.password:
            c.execute("UPDATE users SET pw_hash=? WHERE id=?", (hash_pw(body.password), uid))
    audit(admin.username, "user.update", row["username"])
    return {"ok": True}


@app.delete("/api/users/{uid}")
def delete_user(uid: int, admin: User = Depends(require("admin"))):
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, "Benutzer nicht gefunden")
        if row["id"] == admin.id:
            raise HTTPException(409, "Du kannst dich nicht selbst löschen")
        if row["role"] == "admin" and c.execute("SELECT COUNT(*) n FROM users WHERE role='admin'").fetchone()["n"] <= 1:
            raise HTTPException(409, "Der letzte Admin kann nicht gelöscht werden")
        c.execute("DELETE FROM users WHERE id=?", (uid,))
    audit(admin.username, "user.delete", row["username"])
    return {"ok": True}


@app.get("/api/audit")
def get_audit(_: User = Depends(require("admin"))):
    with db() as c:
        return [dict(r) for r in c.execute("SELECT ts,user,action,detail FROM audit ORDER BY id DESC LIMIT 100")]


# ------------------------------------------------------------------ Live-Modul
from . import live as _live  # noqa: E402

hub = _live.setup(app, {"db": db, "require": require, "audit": audit, "wrap": wrap})


# ------------------------------------------------------------------- Frontend
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Nicht gefunden")
        f = (STATIC_DIR / path).resolve()
        if path and f.is_file() and STATIC_DIR.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(STATIC_DIR / "index.html")
