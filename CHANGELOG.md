# Change Log

All notable changes to the "cost-of-code" extension will be documented in this file.

## [Unreleased]

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
- Harden repository hygiene and package metadata.
- Exclude development-only files from VSIX packaging.
- Add stricter compile and lint gates for local development.

## [0.1.0] - 2026-05-13

- Initial local-first Cost of Code dashboard for Claude Code usage.
- Added local OTLP/HTTP collector and JSONL usage storage.
- Added Windows setup, uninstall, status, and collector controls.
- Added Linux setup, uninstall, status, and collector controls.
