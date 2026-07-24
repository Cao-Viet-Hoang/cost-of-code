#!/usr/bin/env bash
# Cost of Code — Unix status reporter (Linux + macOS)

PORT=4318
NODE_EXE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)     PORT="$2"; shift 2 ;;
    --node-exe) NODE_EXE="$2"; shift 2 ;;
    *)          echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# Prefer the provided node-compatible runtime (VSCode extension supplies one);
# fall back to PATH; tolerate absence — only one section needs node.
if [[ -n "$NODE_EXE" && ( -x "$NODE_EXE" || -f "$NODE_EXE" ) ]]; then
  NODE_CMD="$NODE_EXE"
elif NODE_CMD="$(command -v node 2>/dev/null)"; then
  :
else
  NODE_CMD=""
fi

SERVICE_NAME="claude-usage-tracker"
INSTALL_ROOT="$HOME/.claude/usage-tracker"
STATUS_FILE="$INSTALL_ROOT/status.json"

IS_MACOS=0
if [[ "$(uname -s)" == "Darwin" ]]; then IS_MACOS=1; fi
LAUNCHD_LABEL="com.claude.usage-tracker"
PLIST_PATH="$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist"

echo "== Autostart =="
if [[ $IS_MACOS -eq 1 ]]; then
  if [[ -f "$PLIST_PATH" ]]; then
    echo "  LaunchAgent registered: $PLIST_PATH"
    if launchctl list "$LAUNCHD_LABEL" &>/dev/null; then
      echo "  launchd job '$LAUNCHD_LABEL' is loaded."
    else
      echo "  launchd job '$LAUNCHD_LABEL' is not loaded (stopped). Run 'Start collector'."
    fi
  else
    echo "  LaunchAgent '$LAUNCHD_LABEL' is not registered. Run Setup to install."
  fi
elif command -v systemctl &>/dev/null; then
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
if [[ -f "$SETTINGS" && -n "$NODE_CMD" ]]; then
  SETTINGS_FILE="$SETTINGS" ELECTRON_RUN_AS_NODE=1 "$NODE_CMD" - <<'NODEJS'
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
elif [[ ! -f "$SETTINGS" ]]; then
  echo "  Missing: $SETTINGS"
else
  echo "  No node runtime available — cannot parse settings.json"
fi
