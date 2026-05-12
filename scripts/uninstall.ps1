<#
.SYNOPSIS
  Stop the local collector, remove the scheduled task, and (optionally)
  unset Claude Code OpenTelemetry env vars.

.PARAMETER KeepEnv
  Do not unset OTEL_* / CLAUDE_CODE_ENABLE_TELEMETRY user env vars.

.PARAMETER KeepData
  Do not delete usage data under %USERPROFILE%\.claude\usage-tracker.
  This is the default - uninstall NEVER deletes data unless -PurgeData is
  specified.

.PARAMETER PurgeData
  Delete the entire %USERPROFILE%\.claude\usage-tracker directory
  (raw, usage, logs, exports, config, bin). USE WITH CAUTION.
#>

[CmdletBinding()]
param(
  [switch]$KeepEnv,
  [switch]$PurgeData
)

$ErrorActionPreference = 'Stop'

$TaskName    = 'ClaudeCodeUsageTracker'
$InstallRoot = Join-Path $env:USERPROFILE '.claude\usage-tracker'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Warn2($m)  { Write-Host "    !!  $m"   -ForegroundColor Yellow }

# 1. Stop and remove scheduled task
Write-Step "Removing scheduled task '$TaskName'"
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-OK 'Removed'
} else {
  Write-OK 'No task registered (already gone)'
}

# 2. Kill any lingering collector processes
Write-Step 'Stopping any running collector processes'
try {
  $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
           Where-Object { $_.CommandLine -match 'usage-tracker[\\/]bin[\\/]collector\.js' }
  foreach ($p in $procs) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    Write-OK "Stopped pid=$($p.ProcessId)"
  }
  if (-not $procs) { Write-OK 'None running' }
} catch {
  Write-Warn2 "Could not enumerate processes: $_"
}

# 3. Remove OpenTelemetry keys we set in ~/.claude/settings.json. Other keys
# are preserved (and so are any env keys we did not add).
$ourEnvKeys = @(
  'CLAUDE_CODE_ENABLE_TELEMETRY',
  'OTEL_METRICS_EXPORTER',
  'OTEL_LOGS_EXPORTER',
  'OTEL_TRACES_EXPORTER',
  'OTEL_EXPORTER_OTLP_PROTOCOL',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_METRIC_EXPORT_INTERVAL',
  'OTEL_LOGS_EXPORT_INTERVAL'
)

if (-not $KeepEnv) {
  Write-Step 'Removing OpenTelemetry keys from ~/.claude/settings.json'
  $settingsPath = Join-Path $env:USERPROFILE '.claude\settings.json'
  if (Test-Path $settingsPath) {
    try {
      $settings = Get-Content -Raw -Path $settingsPath | ConvertFrom-Json
      if ($settings -and $settings.PSObject.Properties.Match('env').Count -and $settings.env -is [psobject]) {
        foreach ($k in $ourEnvKeys) {
          if ($settings.env.PSObject.Properties.Match($k).Count) {
            $settings.env.PSObject.Properties.Remove($k)
            Write-OK "Removed env.$k"
          }
        }
        # If env became empty, drop it entirely to keep the file tidy.
        if ($settings.env.PSObject.Properties.Count -eq 0) {
          $settings.PSObject.Properties.Remove('env')
          Write-OK 'Removed empty env block'
        }
      } else {
        Write-OK 'settings.json has no env block - nothing to clean'
      }

      # Also strip out our SessionStart hook entry (matched by the
      # 'record-session.js' command substring). Other hooks the user added
      # are preserved.
      if ($settings -and $settings.PSObject.Properties.Match('hooks').Count -and
          $settings.hooks -is [psobject] -and
          $settings.hooks.PSObject.Properties.Match('SessionStart').Count) {
        $kept = @()
        foreach ($entry in @($settings.hooks.SessionStart)) {
          $mine = $false
          if ($null -ne $entry -and $entry.PSObject.Properties.Match('hooks').Count) {
            foreach ($h in @($entry.hooks)) {
              if ($null -ne $h -and $h.PSObject.Properties.Match('command').Count -and
                  $h.command -is [string] -and $h.command -match 'record-session\.js') {
                $mine = $true; break
              }
            }
          }
          if (-not $mine) { $kept += $entry }
        }
        if ($kept.Count -ne (@($settings.hooks.SessionStart)).Count) {
          Write-OK 'Removed SessionStart workspace hook'
        }
        if ($kept.Count -eq 0) {
          $settings.hooks.PSObject.Properties.Remove('SessionStart')
        } else {
          $settings.hooks.SessionStart = $kept
        }
        if ($settings.hooks.PSObject.Properties.Count -eq 0) {
          $settings.PSObject.Properties.Remove('hooks')
          Write-OK 'Removed empty hooks block'
        }
      }

      $json = $settings | ConvertTo-Json -Depth 20
      $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
      [System.IO.File]::WriteAllText($settingsPath, $json, $utf8NoBom)
    } catch {
      Write-Warn2 "Could not parse $settingsPath; leaving it unchanged. ($_)"
    }
  } else {
    Write-OK "$settingsPath does not exist - nothing to clean"
  }

  # Best-effort: also clean up any legacy Windows User-scope env vars set by
  # an older version of this installer. Harmless no-op if they were never set.
  Write-Step 'Clearing legacy Windows User env vars (if any)'
  foreach ($n in $ourEnvKeys) {
    $existing = [Environment]::GetEnvironmentVariable($n, 'User')
    if ($null -ne $existing) {
      [Environment]::SetEnvironmentVariable($n, $null, 'User')
      Write-OK "Unset legacy User env $n"
    }
  }
} else {
  Write-Warn2 '-KeepEnv specified; settings.json is unchanged.'
}

# 4. Optionally delete data
if ($PurgeData) {
  Write-Step "Deleting data folder $InstallRoot"
  if (Test-Path $InstallRoot) {
    Remove-Item -Path $InstallRoot -Recurse -Force
    Write-OK 'Removed'
  } else {
    Write-OK 'Already absent'
  }
} else {
  Write-OK "Data preserved at $InstallRoot (use -PurgeData to delete)"
}

Write-Host ''
Write-Host 'Uninstall complete.' -ForegroundColor Green
