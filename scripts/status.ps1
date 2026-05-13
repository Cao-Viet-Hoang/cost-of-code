<#
.SYNOPSIS
  Show status of the Cost of Code collector and scheduled task.
#>

[CmdletBinding()]
param(
  [int]$Port = 4318
)

$TaskName    = 'ClaudeCodeUsageTracker'
$InstallRoot = Join-Path $env:USERPROFILE '.claude\usage-tracker'
$StatusFile  = Join-Path $InstallRoot 'status.json'

Write-Host '== Scheduled Task ==' -ForegroundColor Cyan
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "  State          : $($task.State)"
  Write-Host "  LastRunTime    : $($info.LastRunTime)"
  Write-Host "  LastTaskResult : $($info.LastTaskResult)"
  Write-Host "  NextRunTime    : $($info.NextRunTime)"
} else {
  Write-Host '  Not registered.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '== Status File ==' -ForegroundColor Cyan
if (Test-Path $StatusFile) {
  Get-Content -Path $StatusFile -Raw | Write-Host
} else {
  Write-Host "  Missing: $StatusFile" -ForegroundColor Yellow
}

Write-Host ''
Write-Host '== HTTP /status ==' -ForegroundColor Cyan
try {
  $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/status" -TimeoutSec 2
  Write-Host "  HTTP $($resp.StatusCode)"
  Write-Host $resp.Content
} catch {
  Write-Host "  Not responding on http://127.0.0.1:$Port - $_" -ForegroundColor Yellow
}

Write-Host ''
Write-Host '== Claude Code settings.json (env block) ==' -ForegroundColor Cyan
$settingsPath = Join-Path $env:USERPROFILE '.claude\settings.json'
if (Test-Path $settingsPath) {
  try {
    $settings = Get-Content -Raw -Path $settingsPath | ConvertFrom-Json
    if ($settings -and $settings.PSObject.Properties.Match('env').Count -and $settings.env -is [psobject]) {
      foreach ($n in @('CLAUDE_CODE_ENABLE_TELEMETRY',
                       'OTEL_LOGS_EXPORTER',
                       'OTEL_METRICS_EXPORTER',
                       'OTEL_TRACES_EXPORTER',
                       'OTEL_EXPORTER_OTLP_PROTOCOL',
                       'OTEL_EXPORTER_OTLP_ENDPOINT')) {
        $v = if ($settings.env.PSObject.Properties.Match($n).Count) { $settings.env.$n } else { '<not set>' }
        Write-Host ("  {0,-32} = {1}" -f $n, $v)
      }
    } else {
      Write-Host '  No env block in settings.json' -ForegroundColor Yellow
    }
  } catch {
    Write-Host "  Could not parse $settingsPath" -ForegroundColor Yellow
  }
} else {
  Write-Host "  Missing: $settingsPath" -ForegroundColor Yellow
}
