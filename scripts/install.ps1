<#
.SYNOPSIS
  Install the Claude Code Usage Tracker local collector and register it
  to start automatically when the current user logs in.

.DESCRIPTION
  - Copies collector.js + normalizer.js to %USERPROFILE%\.claude\usage-tracker\bin
  - Registers a Windows Scheduled Task "ClaudeCodeUsageTracker" that runs at
    logon (per-user, no admin required) and launches the collector hidden.
  - Sets the standard OpenTelemetry environment variables for the current
    user so Claude Code (CLI + VSCode terminal) exports to the local
    collector at http://127.0.0.1:4318 using OTLP/JSON.
  - Starts the collector immediately so the user does not have to log out.

.PARAMETER SourceDir
  Directory containing collector.js and normalizer.js. Defaults to ../collector
  relative to this script.

.PARAMETER Port
  Port the collector listens on. Default 4318.

.PARAMETER NoStart
  Do not start the collector immediately after install.

.PARAMETER NoEnv
  Do not set Claude Code OTel environment variables (advanced users who
  prefer to manage their own env).
#>

[CmdletBinding()]
param(
  [string]$SourceDir,
  [int]$Port = 4318,
  [switch]$NoStart,
  [switch]$NoEnv
)

$ErrorActionPreference = 'Stop'

$TaskName    = 'ClaudeCodeUsageTracker'
$InstallRoot = Join-Path $env:USERPROFILE '.claude\usage-tracker'
$BinDir      = Join-Path $InstallRoot 'bin'
$LogsDir     = Join-Path $InstallRoot 'logs'

if (-not $SourceDir) {
  $SourceDir = Join-Path $PSScriptRoot '..\collector'
}
$SourceDir = (Resolve-Path $SourceDir).Path

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Warn2($m)  { Write-Host "    !!  $m"   -ForegroundColor Yellow }

# 1. Locate node.exe
Write-Step 'Locating node.exe'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  throw 'node.exe not found on PATH. Install Node.js 18+ and try again.'
}
$NodeExe = $nodeCmd.Source
Write-OK "node = $NodeExe"

# 2. Create install dirs
Write-Step "Creating install directories under $InstallRoot"
foreach ($d in @($InstallRoot, $BinDir, $LogsDir,
                 (Join-Path $InstallRoot 'raw'),
                 (Join-Path $InstallRoot 'usage'),
                 (Join-Path $InstallRoot 'config'),
                 (Join-Path $InstallRoot 'exports'))) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}
Write-OK $InstallRoot

# 3. Copy collector files (including the VBScript launcher that hides the
# node.exe console window).
Write-Step "Copying collector from $SourceDir"
foreach ($f in @('collector.js', 'normalizer.js', 'package.json', 'run-collector.vbs')) {
  $src = Join-Path $SourceDir $f
  if (-not (Test-Path $src)) {
    throw "Missing source file: $src"
  }
  Copy-Item -Path $src -Destination (Join-Path $BinDir $f) -Force
}
Write-OK "Installed collector files"

# 4. Stop any existing collector before re-registering
Write-Step 'Stopping any existing collector'
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-OK 'Removed previous scheduled task'
} else {
  Write-OK 'No existing scheduled task'
}

# Best-effort: kill any stale collector process bound to our port.
try {
  $existingProc = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
                  Where-Object { $_.CommandLine -match 'usage-tracker[\\/]bin[\\/]collector\.js' }
  foreach ($p in $existingProc) {
    Write-Warn2 "Stopping stale collector pid=$($p.ProcessId)"
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
} catch {}

# 5. Register the scheduled task. We launch via wscript.exe + run-collector.vbs
# because node.exe is a console app and would otherwise pop a visible console
# window (the task's -Hidden setting only hides the task entry in Task
# Scheduler, not the spawned process's window). wscript itself has no console,
# and the .vbs uses WScript.Shell.Run with windowStyle=0 to start node detached
# and invisible.
Write-Step 'Registering scheduled task at logon'

$collectorJs = Join-Path $BinDir 'collector.js'
$vbsLauncher = Join-Path $BinDir 'run-collector.vbs'
$wscriptExe  = Join-Path $env:SystemRoot 'System32\wscript.exe'
$taskArgs    = "`"$vbsLauncher`" `"$NodeExe`" `"$collectorJs`""

$action = New-ScheduledTaskAction -Execute $wscriptExe -Argument $taskArgs -WorkingDirectory $BinDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -Hidden `
  -ExecutionTimeLimit (New-TimeSpan -Days 0) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)
# 0 days = no time limit, run forever.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Claude Code Usage Tracker - local OpenTelemetry collector' | Out-Null
Write-OK "Task '$TaskName' registered"

# 6. Configure Claude Code OpenTelemetry settings via ~/.claude/settings.json.
# We merge into the existing settings.json (preserving any other keys) under
# the `env` field. Claude Code injects this `env` map into its own process
# at startup, so we don't need to pollute the global Windows user env.
if (-not $NoEnv) {
  Write-Step 'Configuring Claude Code OpenTelemetry env in ~/.claude/settings.json'

  $envVars = [ordered]@{
    'CLAUDE_CODE_ENABLE_TELEMETRY' = '1'
    'OTEL_METRICS_EXPORTER'        = 'otlp'
    'OTEL_LOGS_EXPORTER'           = 'otlp'
    'OTEL_TRACES_EXPORTER'         = 'otlp'
    'OTEL_EXPORTER_OTLP_PROTOCOL'  = 'http/json'
    'OTEL_EXPORTER_OTLP_ENDPOINT'  = "http://127.0.0.1:$Port"
    'OTEL_METRIC_EXPORT_INTERVAL'  = '10000'
    'OTEL_LOGS_EXPORT_INTERVAL'    = '5000'
  }

  $settingsPath = Join-Path $env:USERPROFILE '.claude\settings.json'
  $claudeDir    = Split-Path -Parent $settingsPath
  New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null

  # Load or create the settings object (keep as PSCustomObject so we can
  # round-trip unknown keys we don't manage).
  $settings = $null
  if (Test-Path $settingsPath) {
    try {
      $settings = Get-Content -Raw -Path $settingsPath | ConvertFrom-Json
    } catch {
      $backup = "$settingsPath.bak.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
      Write-Warn2 "Could not parse $settingsPath. Backed up to $backup"
      Copy-Item -Path $settingsPath -Destination $backup -Force
      $settings = $null
    }
  }
  if (-not $settings) {
    $settings = New-Object PSObject
  }

  if (-not ($settings.PSObject.Properties.Match('env').Count)) {
    $settings | Add-Member -MemberType NoteProperty -Name 'env' -Value (New-Object PSObject)
  }
  # If env was something other than an object (e.g. null), reset it.
  if ($null -eq $settings.env -or $settings.env -isnot [psobject]) {
    $settings.env = New-Object PSObject
  }

  foreach ($k in $envVars.Keys) {
    if ($settings.env.PSObject.Properties.Match($k).Count) {
      $settings.env.$k = $envVars[$k]
    } else {
      $settings.env | Add-Member -MemberType NoteProperty -Name $k -Value $envVars[$k]
    }
    Write-OK "env.$k = $($envVars[$k])"
  }

  $json = $settings | ConvertTo-Json -Depth 20
  # WriteAllText with a no-BOM UTF-8 encoder. Windows PowerShell 5.1's
  # `Set-Content -Encoding UTF8` writes a BOM, which breaks any JSON parser
  # that doesn't strip it (including Node's JSON.parse, used by the dashboard).
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($settingsPath, $json, $utf8NoBom)
  Write-OK "Updated $settingsPath"
} else {
  Write-Warn2 '-NoEnv specified; skipping settings.json configuration.'
}

# 7. Start the collector now (so the user does not need to log out/in)
if (-not $NoStart) {
  Write-Step 'Starting collector now'
  try {
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Milliseconds 800
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-OK "Last run result = $($info.LastTaskResult)"
  } catch {
    Write-Warn2 "Could not start scheduled task: $_"
    Write-Warn2 "Falling back to direct hidden launch via wscript"
    Start-Process -FilePath $wscriptExe -ArgumentList $taskArgs -WindowStyle Hidden -WorkingDirectory $BinDir | Out-Null
  }

  # Wait briefly and probe /status
  Start-Sleep -Milliseconds 600
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/status" -TimeoutSec 3
    if ($resp.StatusCode -eq 200) {
      Write-OK "Collector responding on http://127.0.0.1:$Port"
    }
  } catch {
    Write-Warn2 "Collector did not respond on /status yet: $_"
    Write-Warn2 "Check logs at $LogsDir"
  }
}

Write-Host ''
Write-Host 'Install complete.' -ForegroundColor Green
Write-Host "  Install root : $InstallRoot"
Write-Host "  Collector    : $collectorJs"
Write-Host "  Endpoint     : http://127.0.0.1:$Port"
Write-Host "  Task name    : $TaskName"
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Cyan
Write-Host '  1. Open a new terminal (so the env vars are visible to Claude Code).'
Write-Host '  2. Run "claude" or use Claude Code in VSCode normally.'
Write-Host '  3. Open the Claude Code Usage Tracker dashboard in VSCode.'
