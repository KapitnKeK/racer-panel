"""Benutzer per CLI verwalten:
  python -m app.cli list
  python -m app.cli add <name> <rolle> [--stdin-b64]
  python -m app.cli passwd <name> [--stdin-b64]
Mit --stdin-b64 wird das Passwort als Base64 (UTF-8) aus der ersten stdin-Zeile gelesen, sonst per getpass."""
import base64
import getpass
import sys
import time

from .main import db, hash_pw, init_db

init_db()
args = [a for a in sys.argv[1:] if a != "--stdin-b64"]
use_stdin = "--stdin-b64" in sys.argv


def read_pw() -> str:
    if use_stdin:
        pw = base64.b64decode(sys.stdin.readline().strip()).decode("utf-8")
    else:
        pw = getpass.getpass("Passwort (min. 10 Zeichen): ")
    if len(pw) < 10:
        sys.exit("Zu kurz (mindestens 10 Zeichen)")
    return pw


if len(args) >= 3 and args[0] == "add":
    name, role = args[1], args[2]
    if role not in ("viewer", "host", "admin"):
        sys.exit("Rolle: viewer | host | admin")
    pw = read_pw()
    with db() as c:
        if c.execute("SELECT 1 FROM users WHERE username=?", (name,)).fetchone():
            sys.exit("Benutzer existiert schon (Passwort aendern: passwd)")
        c.execute("INSERT INTO users(username,pw_hash,role,created) VALUES(?,?,?,?)", (name, hash_pw(pw), role, int(time.time())))
    print("angelegt:", name, role)
elif len(args) >= 2 and args[0] == "passwd":
    pw = read_pw()
    with db() as c:
        n = c.execute("UPDATE users SET pw_hash=? WHERE username=?", (hash_pw(pw), args[1])).rowcount
    sys.exit("Benutzer nicht gefunden") if n == 0 else print("Passwort geaendert:", args[1])
elif args[:1] == ["list"]:
    with db() as c:
        for r in c.execute("SELECT username,role FROM users"):
            print(r["username"], r["role"])
else:
    sys.exit(__doc__)
