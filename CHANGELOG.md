# Change Log

All notable changes to the "cost-of-code" extension will be documented in this file.

## [Unreleased]

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
