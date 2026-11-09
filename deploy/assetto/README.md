# Assetto Corsa (AssettoServer) für das Racer Panel

Ein LXC/VM mit [AssettoServer](https://github.com/compujuckel/AssettoServer) und dem kleinen **Agenten** `agent.py`.
Das Panel spricht nur mit dem Agenten (HTTP, Token, nur im LAN); der Agent schreibt die Serverkonfiguration und startet/stoppt Dienste.

## Einrichtung
1. AssettoServer (Linux x64) nach `/opt/assettoserver` entpacken, Benutzer `ac` anlegen.
2. **Spielinhalte** (Autos/Strecken aus deiner Assetto-Corsa-Installation, `content/cars` und `content/tracks`) nach
   `/opt/assettoserver/content/` kopieren. Die Dateien sind urheberrechtlich geschützt und gehören nicht in dieses Repository.
3. `agent.py` nach `/opt/assettoserver/`, Dienste aus `systemd/` nach `/etc/systemd/system/`.
4. `/etc/ac-agent.env` (chmod 600): `AGENT_TOKEN=<langes Zufallstoken>`, `AGENT_BIND=<LAN-IP>`, `AGENT_PORT=8750`.
5. `systemctl enable --now ac-agent`; Spielports (UDP/TCP 9600 + 10 pro weiterem Server) in der Firewall/FritzBox freigeben.
6. Im Panel: `GAMES=raceroom,assetto`, `ASSETTO_AGENT_URL=http://<ac-host>:8750`, `ASSETTO_AGENT_TOKEN=<Token>`.

## Stand
Anlegen, Bearbeiten, Starten, Stoppen, Löschen sind mit einem Test-Agenten (`AGENT_FAKE=1`) geprüft. **Noch nicht geprüft:**
der echte Start von AssettoServer mit den erzeugten Dateien (`--preset`-Verzeichnisaufbau, Content-Pfad) und die Live-Daten
(Karte/Fahrer über das UDP-Plugin-Protokoll).
