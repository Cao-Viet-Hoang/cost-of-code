#!/usr/bin/env bash
# Cost of Code — Linux status reporter

PORT=4318
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    *)      echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

SERVICE_NAME="claude-usage-tracker"
INSTALL_ROOT="$HOME/.claude/usage-tracker"
STATUS_FILE="$INSTALL_ROOT/status.json"

echo "== Autostart =="
if command -v systemctl &>/dev/null; then
  if systemctl --user is-enabled "$SERVICE_NAME" &>/dev/null 2>&1; then
    systemctl --user status "$SERVICE_NAME" --no-pager 2>&1 | head -15 | sed 's/^/  /'
  else
    echo "  Service '$SERVICE_NAME' is not registered. Run Setup to install."
  fi
elif command -v crontab &>/dev/null; then
  CRON_ENTRIES="$(crontab -l 2>/dev/null | grep 'collector\.js' || true)"
  if [[ -n "$CRON_ENTRIES" ]]; then
    echo "  Cron entry found:"
    echo "$CRON_ENTRIES" | sed 's/^/  /'
  else
    echo "  No cron entry found. Run Setup to install."
  fi
else
  echo "  Neither systemctl nor crontab found."
fi

echo ""
echo "== Status File =="
if [[ -f "$STATUS_FILE" ]]; then
  cat "$STATUS_FILE"
else
  echo "  Missing: $STATUS_FILE"
fi

echo ""
echo "== HTTP /status =="
if command -v curl &>/dev/null; then
  RESP="$(curl -sf --max-time 2 "http://127.0.0.1:$PORT/status" 2>/dev/null || true)"
  if [[ -n "$RESP" ]]; then
    echo "$RESP"
  else
    echo "  Not responding on http://127.0.0.1:$PORT"
  fi
else
  echo "  curl not available; cannot probe HTTP status"
fi

echo ""
echo "== Claude Code settings.json (env block) =="
SETTINGS="$HOME/.claude/settings.json"
if [[ -f "$SETTINGS" ]]; then
  SETTINGS_FILE="$SETTINGS" node - <<'NODEJS'
const fs = require('fs');
const settingsPath = process.env.SETTINGS_FILE;
try {
  let text = fs.readFileSync(settingsPath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); }
  const s = JSON.parse(text);
  const env = (s && s.env) || {};
  const names = [
    'CLAUDE_CODE_ENABLE_TELEMETRY',
    'OTEL_LOGS_EXPORTER',
    'OTEL_METRICS_EXPORTER',
    'OTEL_TRACES_EXPORTER',
    'OTEL_EXPORTER_OTLP_PROTOCOL',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
  ];
  for (const n of names) {
    const v = env[n] !== undefined ? String(env[n]) : '<not set>';
    process.stdout.write('  ' + n.padEnd(36) + ' = ' + v + '\n');
  }
} catch (e) {
  process.stderr.write('  Could not parse settings.json: ' + e.message + '\n');
}
NODEJS
else
  echo "  Missing: $SETTINGS"
fi
