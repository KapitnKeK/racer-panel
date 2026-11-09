# Neues Spiel hinzufügen

Jedes Spiel ist ein Plugin unter `backend/app/games/<spiel>/` mit einer Klasse `Adapter` (Basis: `games/base.py`).
Das Panel selbst (Login, Rollen, Live-Karte, Fahrer-Statistik, Verlauf) bleibt unverändert.

## Die 5 Schritte
1. `cp -r backend/app/games/_template backend/app/games/meinspiel`
2. In `__init__.py` `key`, `name`, `short`, `color` setzen und in `caps` eintragen, was das Spiel kann.
3. Die Methoden dazu überschreiben. Alles, was nicht in `caps` steht, blendet das Panel aus und beantwortet die API mit HTTP 501.
4. Konfiguration über Umgebungsvariablen lesen (nie Zugangsdaten in den Code).
5. Aktivieren: `GAMES=raceroom,meinspiel` in der Umgebung des Panels, Dienst neu starten.

## Fähigkeiten (`caps`)
| Fähigkeit | Bedeutung | Methoden |
|---|---|---|
| `create` `edit` `delete` | Server im Panel anlegen/ändern/löschen | `create`, `update`, `delete`, `settings_schema` |
| `start` `stop` | Start/Stopp | `start`, `stop` |
| `live` | Fahrer mit Position auf der Karte, Statistik | `poll` (normalisierte Spieler, siehe `base.py`) |
| `chat` `chat_read` | Chat senden/lesen | `chat`, `poll_chat` |
| `session` `kick` `ban` `penalty` | Steuerung im Rennen | `session_cmd`, `kick`, `ban`, `penalty` |
| `bans` `motd` `whitelist` | Sperrliste, Begrüßung, Zuschauer-Whitelist | `bans`/`unban`, `motd_get/set`, `whitelist_get/set` |
| `bot` | Zuschauer-Bot mit Kamera und Video | (RaceRoom-spezifisch) |

## Editor ohne React-Code
Mit `editor = "schema"` baut das Panel den Server-Editor aus `settings_schema()`. Ein Feld:
`{"key": "max_clients", "label": "Maximale Fahrer", "type": "number", "min": 1, "max": 40, "group": "Allgemein", "default": 12}`
Typen: `text`, `password`, `number`, `select`, `multiselect`, `bool`, `textarea`; bei `select`/`multiselect` mit `options: [{value, label}]`.

## IDs
Server-IDs im Panel sind `"<spiel>-<native id>"`. Strecken-Layouts und Fahrer müssen für Karte und Statistik Ganzzahlen sein;
für Text-IDs gibt es `stable_int(spiel, text)` (Bereich ab 1 Mrd., kollidiert nicht mit RaceRoom).

## Was Plugins nicht dürfen
Keine Shell-Befehle aus Benutzereingaben, keine Pfade aus Eingaben ohne Prüfung (`..`, `/`), keine Zugangsdaten in Antworten
an Zuschauer (`role == "viewer"`). Der Assetto-Agent (`deploy/assetto/agent.py`) ist ein Beispiel für Eingabeprüfung.
