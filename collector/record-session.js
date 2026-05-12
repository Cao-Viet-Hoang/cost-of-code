#!/usr/bin/env node
/**
 * Claude Code SessionStart hook.
 *
 * Claude Code's OpenTelemetry payloads do not include the working directory
 * (workspace) where the session was started. This hook captures that info
 * separately so the dashboard can attribute cost/tokens to a repo.
 *
 * Claude Code invokes hooks with a JSON object on stdin:
 *   { session_id, transcript_path, cwd, hook_event_name, source }
 *
 * We append one line to ~/.claude/usage-tracker/session-meta.jsonl. The
 * UsageReader joins each api_request record back to its workspace by
 * session_id at read time.
 *
 * This script intentionally has no dependencies and never writes to stderr,
 * so it cannot accidentally pollute Claude Code's terminal output.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { buf += c; });
process.stdin.on('end', () => {
  try {
    const j = buf ? JSON.parse(buf) : {};
    const sessionId = j.session_id || j.sessionId;
    const cwd = j.cwd || j.workspace || j.workingDirectory;
    if (sessionId && cwd) {
      const dir = path.join(os.homedir(), '.claude', 'usage-tracker');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'session-meta.jsonl');
      const rec = {
        session_id: sessionId,
        workspace: cwd,
        started_at: new Date().toISOString(),
        source: j.source || null,
        hook_event_name: j.hook_event_name || 'SessionStart',
      };
      fs.appendFileSync(file, JSON.stringify(rec) + '\n', 'utf8');
    }
  } catch {
    // Swallow any error: a failing hook must never block Claude Code.
  }
  process.exit(0);
});

// If stdin closes without data (some shells), still exit cleanly after a short
// idle window.
setTimeout(() => process.exit(0), 2000).unref();
