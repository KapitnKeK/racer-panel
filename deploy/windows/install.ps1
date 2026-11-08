<#
  RaceRoom Panel - Installation auf Windows Server (komplett offline)

  Aufruf in einer PowerShell als Administrator:
      cd C:\R3EPanel-setup
      .\install.ps1

  Was passiert: Python (embeddable) und alle Bibliotheken werden aus diesem Ordner nach C:\R3EPanel
  entpackt, ein Dienst (geplante Aufgabe "R3E-Panel", laeuft als SYSTEM beim Systemstart) und eine
  Firewall-Regel werden angelegt und der erste Admin wird abgefragt. Es wird nichts aus dem
  Internet geladen. Erneutes Ausfuehren = Update (Daten und Benutzer bleiben erhalten).
#>
[CmdletBinding()]
param(
  [string]$Root = 'C:\R3EPanel',
  [int]$Port = 8180,
  [string]$ManagerUrl,
  [string]$TrustedProxies,   # IP(s) des Reverse Proxys, z. B. '10.0.0.5' (Komma-getrennt). Leer = keiner.
  [string]$AllowFrom          # Wer den Panel-Port erreichen darf, z. B. '10.0.0.0/24'. Standard: LocalSubnet
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Lokale Einstellungen merken (liegt nur auf diesem Rechner, nicht im Paket)
$cfgFile = Join-Path $Root 'install-config.json'
$cfg = @{}
if (Test-Path $cfgFile) { (Get-Content $cfgFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $cfg[$_.Name] = $_.Value } }
if (-not $PSBoundParameters.ContainsKey('Port') -and $cfg.Port) { $Port = [int]$cfg.Port }
if (-not $ManagerUrl) { $ManagerUrl = if ($cfg.ManagerUrl) { $cfg.ManagerUrl } else { 'http://127.0.0.1:8088' } }
if (-not $PSBoundParameters.ContainsKey('TrustedProxies')) { $TrustedProxies = if ($cfg.TrustedProxies) { $cfg.TrustedProxies } else { '' } }
if (-not $AllowFrom) { $AllowFrom = if ($cfg.AllowFrom) { $cfg.AllowFrom } else { 'LocalSubnet' } }

function Step([string]$t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Bitte diese PowerShell als Administrator starten.' }

foreach ($f in 'python-embed.zip', 'wheels', 'app', 'static') {
  if (-not (Test-Path (Join-Path $here $f))) { throw "Im Paket fehlt: $f" }
}

Step 'Laufende Instanz anhalten (falls vorhanden)'
Stop-ScheduledTask -TaskName 'R3E-Panel' -ErrorAction SilentlyContinue
Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Root\python\*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Step "Dateien nach $Root kopieren"
New-Item -ItemType Directory -Force -Path $Root, "$Root\data", "$Root\logs" | Out-Null
foreach ($d in 'app', 'static') {
  if (Test-Path "$Root\$d") { Remove-Item -Recurse -Force "$Root\$d" }
  Copy-Item -Recurse -Force (Join-Path $here $d) "$Root\$d"
}

Step 'Python entpacken'
if (-not (Test-Path "$Root\python\python.exe")) {
  Expand-Archive -Path (Join-Path $here 'python-embed.zip') -DestinationPath "$Root\python" -Force
}
$pth = Get-ChildItem "$Root\python\python*._pth" | Select-Object -First 1
$stem = [IO.Path]::GetFileNameWithoutExtension($pth.Name)
Set-Content -Path $pth.FullName -Value @("$stem.zip", '.', 'Lib\site-packages', '..', 'import site') -Encoding ASCII

Step 'Bibliotheken entpacken (offline)'
$sp = "$Root\python\Lib\site-packages"
New-Item -ItemType Directory -Force -Path $sp | Out-Null
$tmp = Join-Path $env:TEMP 'r3e-wheels'
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
foreach ($w in Get-ChildItem (Join-Path $here 'wheels') -Filter *.whl) {
  $z = Join-Path $tmp ($w.BaseName + '.zip')
  Copy-Item $w.FullName $z
  Expand-Archive -Path $z -DestinationPath $sp -Force
}
Remove-Item -Recurse -Force $tmp

Step 'Startskript schreiben'
$cmd = @"
@echo off
rem RaceRoom Panel - wird von der geplanten Aufgabe R3E-Panel gestartet (keine Geheimnisse in dieser Datei)
set DATA_DIR=$Root\data
set STATIC_DIR=$Root\static
set MANAGER_URL=$ManagerUrl
set TRUSTED_PROXIES=$TrustedProxies
set COOKIE_SECURE=auto
cd /d $Root
"$Root\python\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port $Port --no-proxy-headers --no-access-log --log-level warning >> "$Root\logs\panel.log" 2>&1
"@
Set-Content -Path "$Root\run-panel.cmd" -Value $cmd -Encoding ASCII

Step 'Datenordner absichern (nur SYSTEM und Administratoren)'
& icacls "$Root\data" /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null

Step 'Ersten Admin anlegen (falls noch keiner existiert)'
$env:DATA_DIR = "$Root\data"; $env:STATIC_DIR = "$Root\static"; $env:MANAGER_URL = $ManagerUrl
Push-Location $Root
$existing = (& "$Root\python\python.exe" -m app.cli list) 2>&1
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Benutzerliste nicht lesbar: $existing" }
if (-not ($existing | Where-Object { $_ -match ' admin\s*$' })) {
  $name = Read-Host 'Benutzername fuer den ersten Admin'
  $created = $false
  for ($try = 1; $try -le 5 -and -not $created; $try++) {
    $s1 = Read-Host 'Passwort (mindestens 10 Zeichen, Eingabe bleibt unsichtbar)' -AsSecureString
    $s2 = Read-Host 'Passwort wiederholen' -AsSecureString
    $p1 = (New-Object System.Net.NetworkCredential('', $s1)).Password
    $p2 = (New-Object System.Net.NetworkCredential('', $s2)).Password
    if ($p1 -ne $p2) { Write-Host 'Die beiden Eingaben sind verschieden.' -ForegroundColor Yellow; continue }
    if ($p1.Length -lt 10) { Write-Host 'Zu kurz (mindestens 10 Zeichen).' -ForegroundColor Yellow; continue }
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($p1))
    $b64 | & "$Root\python\python.exe" -m app.cli add $name admin --stdin-b64
    if ($LASTEXITCODE -eq 0) { $created = $true } else { Write-Host 'Anlegen fehlgeschlagen, bitte erneut versuchen.' -ForegroundColor Yellow }
  }
  if (-not $created) { Pop-Location; throw 'Admin konnte nicht angelegt werden.' }
} else {
  Write-Host 'Es gibt bereits einen Admin, ueberspringe.'
}
Pop-Location

@{ Port = $Port; ManagerUrl = $ManagerUrl; TrustedProxies = $TrustedProxies; AllowFrom = $AllowFrom } | ConvertTo-Json | Set-Content -Path $cfgFile -Encoding UTF8

Step 'Firewall-Regel'
Get-NetFirewallRule -DisplayName 'R3E-Panel' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'R3E-Panel' -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress $AllowFrom -Action Allow -Profile Any | Out-Null

Step 'Dienst (geplante Aufgabe R3E-Panel) anlegen und starten'
$act = New-ScheduledTaskAction -Execute "$Root\run-panel.cmd"
$trg = New-ScheduledTaskTrigger -AtStartup
$set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName 'R3E-Panel' -Action $act -Trigger $trg -Settings $set -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName 'R3E-Panel'

Step 'Selbsttest'
$ok = $false
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep -Seconds 1
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
    $ok = $true; break
  } catch { }
}
if ($ok) {
  Write-Host ("Panel laeuft. Manager erreichbar: {0}" -f $h.manager) -ForegroundColor Green
  Write-Host ""
  Write-Host "Test im LAN:   http://<IP-dieses-Rechners>:$Port" -ForegroundColor Green
  Write-Host "Fuer Zugriff von aussen einen Reverse Proxy mit HTTPS davor setzen und dessen IP als -TrustedProxies angeben."
} else {
  Write-Host "Panel antwortet nicht. Log: $Root\logs\panel.log" -ForegroundColor Red
  if (Test-Path "$Root\logs\panel.log") { Get-Content "$Root\logs\panel.log" -Tail 25 }
  exit 1
}
