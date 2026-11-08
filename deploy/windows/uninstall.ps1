<#
  RaceRoom Panel entfernen (als Administrator ausfuehren).
  -RemoveData loescht zusaetzlich Benutzer, Streckenumrisse und Audit-Log unter C:\R3EPanel\data.
#>
param([string]$Root = 'C:\R3EPanel', [switch]$RemoveData)
$ErrorActionPreference = 'Stop'
Stop-ScheduledTask -TaskName 'R3E-Panel' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'R3E-Panel' -Confirm:$false -ErrorAction SilentlyContinue
Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Root\python\*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Get-NetFirewallRule -DisplayName 'R3E-Panel' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
foreach ($d in 'app', 'static', 'python', 'logs') { if (Test-Path "$Root\$d") { Remove-Item -Recurse -Force "$Root\$d" } }
Remove-Item -Force "$Root\run-panel.cmd" -ErrorAction SilentlyContinue
if ($RemoveData -and (Test-Path "$Root\data")) { Remove-Item -Recurse -Force "$Root\data" }
Write-Host 'Entfernt.' -ForegroundColor Green
