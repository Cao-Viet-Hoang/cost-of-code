#!/usr/bin/env bash
# Cost of Code — Unix installer (Linux + macOS)
set -euo pipefail

PORT=4318
SOURCE_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)       PORT="$2"; shift 2 ;;
    --source-dir) SOURCE_DIR="$2"; shift 2 ;;
    *)            echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$SOURCE_DIR" ]]; then
  echo "Error: --source-dir is required" >&2; exit 1
fi

INSTALL_ROOT="$HOME/.claude/usage-tracker"
BIN_DIR="$INSTALL_ROOT/bin"
LOGS_DIR="$INSTALL_ROOT/logs"
SERVICE_NAME="claude-usage-tracker"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

# macOS uses a launchd LaunchAgent instead of systemd/cron.
IS_MACOS=0
if [[ "$(uname -s)" == "Darwin" ]]; then IS_MACOS=1; fi
LAUNCHD_LABEL="com.claude.usage-tracker"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$LAUNCH_AGENTS_DIR/$LAUNCHD_LABEL.plist"

step() { echo "==> $1"; }
ok()   { echo "    OK  $1"; }
warn() { echo "    !!  $1"; }

# 1. Locate node
step "Locating node"
if ! NODE_CMD="$(command -v node 2>/dev/null)"; then
  echo "Error: node not found on PATH. Install Node.js 18+ and try again." >&2; exit 1
fi
ok "node = $NODE_CMD"

# 2. Create directories
step "Creating install directories under $INSTALL_ROOT"
mkdir -p "$BIN_DIR" "$LOGS_DIR" \
         "$INSTALL_ROOT/raw" "$INSTALL_ROOT/usage" \
         "$INSTALL_ROOT/config" "$INSTALL_ROOT/exports"
ok "$INSTALL_ROOT"

# 3. Copy collector files
step "Copying collector from $SOURCE_DIR"
for f in collector.js normalizer.js record-session.js package.json; do
  src="$SOURCE_DIR/$f"
  if [[ ! -f "$src" ]]; then
    echo "Error: Missing source file: $src" >&2; exit 1
  fi
  cp -f "$src" "$BIN_DIR/$f"
done
ok "Installed collector files"

# 4. Stop existing collector
step "Stopping any existing collector"
if [[ $IS_MACOS -eq 1 ]]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
elif command -v systemctl &>/dev/null; then
  systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
fi
pkill -f 'usage-tracker/bin/collector\.js' 2>/dev/null || true
ok "Cleared"

# 5. Register autostart
step "Registering autostart"
if [[ $IS_MACOS -eq 1 ]]; then
  mkdir -p "$LAUNCH_AGENTS_DIR"
  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LAUNCHD_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_CMD</string>
    <string>$BIN_DIR/collector.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>COLLECTOR_PORT</key>
    <string>$PORT</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOGS_DIR/collector.log</string>
  <key>StandardErrorPath</key>
  <string>$LOGS_DIR/collector.log</string>
</dict>
</plist>
EOF
  # -w clears any prior Disabled flag; RunAtLoad starts it immediately.
  # Guard the load: a launchd hiccup must not abort the install before the
  # settings.json step (set -e) — the collector can still be started manually.
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  if launchctl load -w "$PLIST_PATH"; then
    ok "Registered launchd agent: $LAUNCHD_LABEL"
  else
    warn "launchctl load failed — autostart NOT active. Use 'Start collector' after setup."
  fi
elif command -v systemctl &>/dev/null && systemctl --user show-environment &>/dev/null 2>&1; then
  mkdir -p "$SYSTEMD_USER_DIR"
  cat > "$SYSTEMD_USER_DIR/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Cost of Code collector

[Service]
Type=simple
ExecStart=$NODE_CMD $BIN_DIR/collector.js
Environment=COLLECTOR_PORT=$PORT
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable "$SERVICE_NAME"
  ok "Registered systemd user service: $SERVICE_NAME"
elif command -v crontab &>/dev/null; then
  # Fallback: cron @reboot entry
  CRON_CMD="@reboot $NODE_CMD $BIN_DIR/collector.js"
  (crontab -l 2>/dev/null | grep -v 'usage-tracker/bin/collector\.js'; echo "$CRON_CMD") | crontab -
  ok "Registered @reboot cron entry"
else
  warn "Neither systemd user manager nor cron found — autostart NOT registered."
  warn "You will need to run 'Start collector' manually after each login."
fi

# 6. Configure ~/.claude/settings.json via inline Node.js
step "Configuring Claude Code OpenTelemetry env in ~/.claude/settings.json"
mkdir -p "$HOME/.claude"

SETTINGS_FILE="$HOME/.claude/settings.json" \
HOOK_JS="$BIN_DIR/record-session.js" \
COLLECTOR_PORT="$PORT" \
node - <<'NODEJS'
const fs = require('fs');
const settingsPath = process.env.SETTINGS_FILE;
const hookJs = process.env.HOOK_JS;
const port = process.env.COLLECTOR_PORT;

let settings = {};
if (fs.existsSync(settingsPath)) {
  try {
    let text = fs.readFileSync(settingsPath, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); }
    settings = JSON.parse(text);
  } catch (e) {
    const backup = settingsPath + '.bak.' + Date.now();
    process.stderr.write('    !! Could not parse settings.json — backed up to ' + backup + '\n');
    fs.copyFileSync(settingsPath, backup);
    settings = {};
  }
}

if (!settings.env || typeof settings.env !== 'object') { settings.env = {}; }

const envVars = {
  CLAUDE_CODE_ENABLE_TELEMETRY: '1',
  OTEL_METRICS_EXPORTER: 'otlp',
  OTEL_LOGS_EXPORTER: 'otlp',
  OTEL_TRACES_EXPORTER: 'otlp',
  OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:' + port,
  OTEL_METRIC_EXPORT_INTERVAL: '10000',
  OTEL_LOGS_EXPORT_INTERVAL: '5000',
};
for (const [k, v] of Object.entries(envVars)) {
  settings.env[k] = v;
  process.stdout.write('    OK  env.' + k + ' = ' + v + '\n');
}

if (!settings.hooks || typeof settings.hooks !== 'object') { settings.hooks = {}; }
if (!Array.isArray(settings.hooks.SessionStart)) { settings.hooks.SessionStart = []; }

const hookCmd = 'node "' + hookJs + '"';
let found = false;
for (const entry of settings.hooks.SessionStart) {
  if (entry && Array.isArray(entry.hooks)) {
    for (const h of entry.hooks) {
      if (h && typeof h.command === 'string' && h.command.includes('record-session.js')) {
        h.command = hookCmd;
        found = true;
      }
    }
  }
}
if (!found) {
  settings.hooks.SessionStart.push({ hooks: [{ type: 'command', command: hookCmd }] });
}
process.stdout.write('    OK  hooks.SessionStart -> ' + hookCmd + '\n');

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
process.stdout.write('    OK  Updated ' + settingsPath + '\n');
NODEJS

# 7. Start the collector now
step "Starting collector now"
if [[ $IS_MACOS -eq 1 ]]; then
  # RunAtLoad already started it during step 5; nudge it in case it was loaded.
  launchctl start "$LAUNCHD_LABEL" 2>/dev/null || true
  ok "launchd agent loaded and started"
elif command -v systemctl &>/dev/null && systemctl --user is-enabled "$SERVICE_NAME" &>/dev/null 2>&1; then
  systemctl --user start "$SERVICE_NAME"
  sleep 1
  if systemctl --user is-active "$SERVICE_NAME" &>/dev/null 2>&1; then
    ok "Service is active"
  else
    warn "Service may not have started — check: journalctl --user -u $SERVICE_NAME"
  fi
else
  nohup "$NODE_CMD" "$BIN_DIR/collector.js" </dev/null >>"$LOGS_DIR/collector.log" 2>&1 &
  COLLECTOR_PID=$!
  ok "Spawned collector directly (pid=$COLLECTOR_PID)"
fi

sleep 0.5
if command -v curl &>/dev/null; then
  if curl -sf --max-time 3 "http://127.0.0.1:$PORT/status" &>/dev/null; then
    ok "Collector responding on http://127.0.0.1:$PORT"
  else
    warn "Collector did not respond on /status yet — check $LOGS_DIR"
  fi
fi

echo ""
echo "Install complete."
echo "  Install root : $INSTALL_ROOT"
echo "  Collector    : $BIN_DIR/collector.js"
echo "  Endpoint     : http://127.0.0.1:$PORT"
echo ""
echo "Next steps:"
echo "  1. Open a new terminal so Claude Code picks up the updated settings.json."
echo "  2. Run 'claude' or use Claude Code in VSCode normally."
echo "  3. Open the Cost of Code dashboard in VSCode."
