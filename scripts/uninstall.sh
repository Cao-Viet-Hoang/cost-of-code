#!/usr/bin/env bash
# Claude Code Usage Tracker — Linux uninstaller
set -euo pipefail

PURGE_DATA=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge-data) PURGE_DATA=1; shift ;;
    *)            echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

SERVICE_NAME="claude-usage-tracker"
INSTALL_ROOT="$HOME/.claude/usage-tracker"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

step() { echo "==> $1"; }
ok()   { echo "    OK  $1"; }
warn() { echo "    !!  $1"; }

# 1. Stop and disable autostart
step "Removing autostart"
if command -v systemctl &>/dev/null; then
  systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$SYSTEMD_USER_DIR/$SERVICE_NAME.service"
  systemctl --user daemon-reload 2>/dev/null || true
  ok "Removed systemd service"
fi
if command -v crontab &>/dev/null; then
  # Only modify crontab if our entry actually exists — avoids accidentally
  # rewriting the user's crontab when they had none to begin with.
  EXISTING_CRON="$(crontab -l 2>/dev/null || true)"
  if echo "$EXISTING_CRON" | grep -q 'usage-tracker/bin/collector\.js'; then
    echo "$EXISTING_CRON" | grep -v 'usage-tracker/bin/collector\.js' | crontab -
    ok "Removed cron entry"
  else
    ok "No cron entry to remove"
  fi
fi

# 2. Kill lingering collector processes
step "Stopping any running collector processes"
if pkill -f 'usage-tracker/bin/collector\.js' 2>/dev/null; then
  ok "Stopped collector process(es)"
else
  ok "None running"
fi

# 3. Remove OTEL keys and hooks from ~/.claude/settings.json
step "Removing OpenTelemetry keys from ~/.claude/settings.json"
SETTINGS_FILE="$HOME/.claude/settings.json"
if [[ -f "$SETTINGS_FILE" ]]; then
  SETTINGS_FILE="$SETTINGS_FILE" node - <<'NODEJS'
const fs = require('fs');
const settingsPath = process.env.SETTINGS_FILE;
const OUR_KEYS = [
  'CLAUDE_CODE_ENABLE_TELEMETRY',
  'OTEL_METRICS_EXPORTER',
  'OTEL_LOGS_EXPORTER',
  'OTEL_TRACES_EXPORTER',
  'OTEL_EXPORTER_OTLP_PROTOCOL',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_METRIC_EXPORT_INTERVAL',
  'OTEL_LOGS_EXPORT_INTERVAL',
];

let settings;
try {
  let text = fs.readFileSync(settingsPath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); }
  settings = JSON.parse(text);
} catch (e) {
  process.stderr.write('    !! Could not parse settings.json — leaving unchanged\n');
  process.exit(0);
}

if (settings.env && typeof settings.env === 'object') {
  for (const k of OUR_KEYS) {
    if (k in settings.env) {
      delete settings.env[k];
      process.stdout.write('    OK  Removed env.' + k + '\n');
    }
  }
  if (Object.keys(settings.env).length === 0) {
    delete settings.env;
    process.stdout.write('    OK  Removed empty env block\n');
  }
}

if (settings.hooks && Array.isArray(settings.hooks.SessionStart)) {
  const before = settings.hooks.SessionStart.length;
  settings.hooks.SessionStart = settings.hooks.SessionStart.filter(entry => {
    if (!entry || !Array.isArray(entry.hooks)) { return true; }
    return !entry.hooks.some(
      h => h && typeof h.command === 'string' && h.command.includes('record-session.js')
    );
  });
  if (settings.hooks.SessionStart.length < before) {
    process.stdout.write('    OK  Removed SessionStart workspace hook\n');
  }
  if (settings.hooks.SessionStart.length === 0) { delete settings.hooks.SessionStart; }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
    process.stdout.write('    OK  Removed empty hooks block\n');
  }
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
process.stdout.write('    OK  Updated ' + settingsPath + '\n');
NODEJS
else
  ok "settings.json not found — nothing to clean"
fi

# 4. Optionally purge data
if [[ $PURGE_DATA -eq 1 ]]; then
  step "Deleting data folder $INSTALL_ROOT"
  if [[ -d "$INSTALL_ROOT" ]]; then
    rm -rf "$INSTALL_ROOT"
    ok "Removed"
  else
    ok "Already absent"
  fi
else
  ok "Data preserved at $INSTALL_ROOT (pass --purge-data to delete)"
fi

echo ""
echo "Uninstall complete."
