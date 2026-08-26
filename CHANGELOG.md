# Change Log

All notable changes to the "cost-of-code" extension will be documented in this file.

## [Unreleased]

- Add a collapsible **Cost of Code** view in the Explorer (next to Timeline /
  Outline): today's cost with a vs-yesterday delta and an hour-by-hour trend
  line for today, a Claude-vs-Codex share bar, a donut of today's cost by model (top
  three plus "Other"), the cache hit ratio, and the collector state. It can be dragged to
  any side bar and has refresh / open-dashboard title actions plus the new
  `Cost of Code: Refresh Explorer View` command.
- Add OpenAI Codex Desktop support: dashboard now reads
  `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` directly (no collector
  needed) and merges Codex usage alongside Claude.
- Add `[All | Claude | Codex]` segmented control in the header for filtering
  the entire dashboard by AI tool.
- Add per-tool KPI breakdown on the Overview when "All" is selected, plus a
  tool badge column in the Sessions table and request drill-down.
- Add Codex sub-card on the Health tab with sessions folder, rollout file
  count, last write, and observed models / providers.
- Add new settings: `claudeUsageTracker.includeCodex` (default `true`),
  `claudeUsageTracker.codexSessionsFolder`, and
  `claudeUsageTracker.codexPricing` (overrides OpenAI list prices, useful
  for Azure billing).

## [0.1.4] - 2026-07-22

- Add macOS support for setup, uninstall, status, and collector start/stop.
  macOS registers a launchd LaunchAgent (`com.claude.usage-tracker`) in
  `~/Library/LaunchAgents` for autostart at login. The `install.sh`,
  `uninstall.sh`, and `status.sh` scripts now detect the OS (`uname`) and
  branch between systemd/cron (Linux) and launchd (macOS).

## [0.1.3] - 2026-07-08

- Optimize dashboard refresh: aggregate every metric in a single pass over the
  usage records (`snapshot()` / `distinctAll()`) instead of one pass per
  metric, cutting refresh time on large histories by ~3x.
- Fix Linux install failure caused by CRLF line endings in the shell scripts:
  add `.gitattributes` so `*.sh` is always checked out and packaged with LF.
- Harden repository hygiene and package metadata.
- Exclude development-only files from VSIX packaging.
- Add stricter compile and lint gates for local development.

## [0.1.0] - 2026-05-13

- Initial local-first Cost of Code dashboard for Claude Code usage.
- Added local OTLP/HTTP collector and JSONL usage storage.
- Added Windows setup, uninstall, status, and collector controls.
- Added Linux setup, uninstall, status, and collector controls.
