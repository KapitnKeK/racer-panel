RaceRoom Panel - Installation auf Windows (offline)
==================================================

1. Paket (r3e-panel-win.zip) z. B. nach C:\R3EPanel-setup entpacken.
2. Normale PowerShell (nicht ISE) als Administrator:
       cd C:\R3EPanel-setup
       Set-ExecutionPolicy -Scope Process Bypass -Force
       .\install.ps1 [-TrustedProxies <IP des Reverse Proxys>] [-AllowFrom <Netz, z. B. 10.0.0.0/24>] [-Port 8180]
3. Beim ersten Mal werden Benutzername und Passwort (2x) des ersten Admins abgefragt.
4. Test im LAN:  http://<IP-dieses-Rechners>:8180
5. Fuer Zugriff aus dem Internet einen Reverse Proxy mit HTTPS davorsetzen (z. B. Nginx Proxy Manager)
   und dessen IP bei der Installation als -TrustedProxies angeben.

Update: neues Paket entpacken und install.ps1 erneut ausfuehren. Die Einstellungen von der ersten
Installation (C:\R3EPanel\install-config.json) sowie Benutzer und Daten (C:\R3EPanel\data) bleiben erhalten.

Entfernen: .\uninstall.ps1   (mit -RemoveData auch Benutzer und Daten loeschen)
Passwort zuruecksetzen: in C:\R3EPanel:  python\python.exe -m app.cli passwd <name>

Dienst:   geplante Aufgabe "R3E-Panel" (SYSTEM, beim Systemstart, Neustart bei Fehler)
Log:      C:\R3EPanel\logs\panel.log
Manager:  http://127.0.0.1:8088 (RaceRoom Dedicated Manager auf demselben Rechner)
