#Requires -Version 5.1
# Run all k6 scenarios in order. Stops everything if smoke fails.
# Usage: .\run-all.ps1 [-BaseUrl http://192.168.184.138:8082] [-OutDir results]
param(
  [string]$BaseUrl = $env:K6_BASE_URL,
  [string]$OutDir = "results"
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) { Write-Error "k6 not found. Install: winget install k6"; exit 1 }
if (-not $BaseUrl) { $BaseUrl = $env:K6_BASE_URL }
if (-not $BaseUrl) { $BaseUrl = $env:BASE_URL }
if (-not $BaseUrl) { $BaseUrl = 'http://192.168.184.138:8082' }
$LoadDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not [IO.Path]::IsPathRooted($OutDir)) { $OutDir = Join-Path $LoadDir $OutDir }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$failed = @()

function Invoke-Scenario($script, $extraArgs) {
  $base = [IO.Path]::GetFileNameWithoutExtension($script)
  $json = Join-Path $OutDir "$base-$stamp.json"
  $summary = Join-Path $OutDir "$base-$stamp.summary.json"
  $path = Join-Path $LoadDir $script
  Write-Host "`n=== $script ==="
  $k6args = @('run', '--out', "json=$json", '--summary-export', $summary) + $extraArgs + @($path)
  if ($BaseUrl -ne 'http://192.168.184.138:8082') { $k6args = @('-e', "BASE_URL=$BaseUrl") + $k6args }
  & k6 $k6args
  if ($LASTEXITCODE -ne 0) { $failed += $script }
}

# Smoke first: abort the whole pipeline when the flow itself is broken.
Invoke-Scenario 'smoke.js' @()
if ($failed.Count -gt 0) { Write-Error "smoke FAILED - aborting pipeline."; exit 1 }

foreach ($s in @('reads.js','booking.js','race.js','stepped.js','spike.js','auth.js','admin-reads.js','ratelimit.js')) {
  Invoke-Scenario $s @()
  Start-Sleep -Seconds 30   # let server-side rate limiters refill before next scenario
}
# Parked (valid but non-essential): booking-ops.js combo.js soak.js events.js — run individually.

Write-Host "`nResults in $OutDir (one JSON per scenario)."
if ($failed.Count -gt 0) { Write-Warning "FAILED: $($failed -join ', ')"; exit 1 }
Write-Host 'All scenarios done. Remember cleanup on Rocky:'
Write-Host '  docker exec -i cp-postgres psql -U postgres -d cinema < load/cleanup.sql'
