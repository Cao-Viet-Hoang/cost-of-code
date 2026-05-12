'use strict';

// Local OTLP/HTTP receiver for Claude Code usage telemetry.
// Zero external deps. Listens on 127.0.0.1:<port> and accepts
// OTLP/JSON requests (POST /v1/logs, /v1/metrics, /v1/traces).
//
// Writes:
//   ~/.claude/usage-tracker/raw/YYYY-MM-DD.otel.jsonl     (raw payloads)
//   ~/.claude/usage-tracker/usage/YYYY-MM-DD.usage.jsonl  (normalized)
//   ~/.claude/usage-tracker/logs/YYYY-MM-DD.collector.log (own logs)
//   ~/.claude/usage-tracker/status.json                   (heartbeat)

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const { extractUsageFromLogsPayload } = require('./normalizer');

const HOME = os.homedir();
const ROOT = process.env.USAGE_TRACKER_ROOT || path.join(HOME, '.claude', 'usage-tracker');
const RAW_DIR = path.join(ROOT, 'raw');
const USAGE_DIR = path.join(ROOT, 'usage');
const LOGS_DIR = path.join(ROOT, 'logs');
const CONFIG_DIR = path.join(ROOT, 'config');
const EXPORTS_DIR = path.join(ROOT, 'exports');
const STATUS_FILE = path.join(ROOT, 'status.json');

const HOST = process.env.COLLECTOR_HOST || '127.0.0.1';
const PORT = parseInt(process.env.COLLECTOR_PORT || '4318', 10);

const STARTED_AT = new Date().toISOString();
let lastEventAt = null;
let lastUsageAt = null;
let totalRequests = 0;
let totalLogPayloads = 0;
let totalMetricsPayloads = 0;
let totalTracesPayloads = 0;
let totalUsageRecords = 0;
let lastError = null;

// In-memory dedupe of recently-seen usage event keys (small ring buffer).
const RECENT_KEYS_MAX = 5000;
const recentKeys = new Map(); // key -> ts

function ensureDirs() {
  for (const d of [ROOT, RAW_DIR, USAGE_DIR, LOGS_DIR, CONFIG_DIR, EXPORTS_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function todayDateStr(d) {
  const dt = d || new Date();
  return dt.toISOString().slice(0, 10);
}

function logLine(level, msg) {
  const line = `${new Date().toISOString()} ${level} ${msg}\n`;
  try {
    fs.appendFileSync(path.join(LOGS_DIR, `${todayDateStr()}.collector.log`), line);
  } catch {
    // best-effort
  }
  // Also stderr so the scheduled task transcript captures it.
  process.stderr.write(line);
}

function appendJsonl(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}

function rememberKey(key) {
  if (!key) {
    return false;
  }
  if (recentKeys.has(key)) {
    return false;
  }
  recentKeys.set(key, Date.now());
  if (recentKeys.size > RECENT_KEYS_MAX) {
    const firstKey = recentKeys.keys().next().value;
    recentKeys.delete(firstKey);
  }
  return true;
}

function writeStatus() {
  const status = {
    pid: process.pid,
    startedAt: STARTED_AT,
    now: new Date().toISOString(),
    host: HOST,
    port: PORT,
    rootDir: ROOT,
    lastEventAt,
    lastUsageAt,
    totalRequests,
    totalLogPayloads,
    totalMetricsPayloads,
    totalTracesPayloads,
    totalUsageRecords,
    lastError,
    schemaVersion: 1,
  };
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  } catch (err) {
    // ignore
  }
}

function decodeBody(req, raw) {
  const enc = (req.headers['content-encoding'] || '').toLowerCase();
  if (enc === 'gzip') {
    return zlib.gunzipSync(raw);
  }
  if (enc === 'deflate') {
    return zlib.inflateSync(raw);
  }
  return raw;
}

function parseJsonBody(buf, contentType) {
  // We only support OTLP/JSON. Anything else is rejected with a clear error.
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('protobuf') || ct.includes('x-protobuf')) {
    const err = new Error(
      'OTLP/protobuf is not supported by this collector. Set OTEL_EXPORTER_OTLP_PROTOCOL=http/json'
    );
    err.statusCode = 415;
    throw err;
  }
  if (buf.length === 0) {
    return {};
  }
  return JSON.parse(buf.toString('utf8'));
}

function handleLogs(payload, receivedAt) {
  totalLogPayloads += 1;
  appendJsonl(path.join(RAW_DIR, `${todayDateStr()}.otel.jsonl`), {
    type: 'logs',
    receivedAt,
    payload,
  });
  const records = extractUsageFromLogsPayload(payload);
  let written = 0;
  for (const rec of records) {
    if (!rememberKey(rec.event_key)) {
      continue;
    }
    appendJsonl(
      path.join(USAGE_DIR, `${todayDateStr(new Date(rec.timestamp))}.usage.jsonl`),
      rec
    );
    written += 1;
  }
  totalUsageRecords += written;
  if (written > 0) {
    lastUsageAt = new Date().toISOString();
  }
  return { records: records.length, written };
}

function handleMetrics(payload, receivedAt) {
  totalMetricsPayloads += 1;
  appendJsonl(path.join(RAW_DIR, `${todayDateStr()}.otel.jsonl`), {
    type: 'metrics',
    receivedAt,
    payload,
  });
}

function handleTraces(payload, receivedAt) {
  totalTracesPayloads += 1;
  appendJsonl(path.join(RAW_DIR, `${todayDateStr()}.otel.jsonl`), {
    type: 'traces',
    receivedAt,
    payload,
  });
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function handleStatus(res) {
  const body = {
    pid: process.pid,
    startedAt: STARTED_AT,
    now: new Date().toISOString(),
    lastEventAt,
    lastUsageAt,
    totalRequests,
    totalLogPayloads,
    totalMetricsPayloads,
    totalTracesPayloads,
    totalUsageRecords,
    rootDir: ROOT,
    host: HOST,
    port: PORT,
    lastError,
  };
  sendJson(res, 200, body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  totalRequests += 1;
  lastEventAt = new Date().toISOString();
  const url = req.url || '/';
  const method = req.method || 'GET';

  try {
    if (method === 'GET' && url === '/health') {
      return handleStatus(res);
    }
    if (method === 'GET' && url === '/status') {
      return handleStatus(res);
    }
    if (method !== 'POST') {
      res.writeHead(405);
      return res.end();
    }

    const raw = await readBody(req);
    const decoded = decodeBody(req, raw);
    const payload = parseJsonBody(decoded, req.headers['content-type']);
    const receivedAt = new Date().toISOString();

    let result;
    if (url === '/v1/logs') {
      result = handleLogs(payload, receivedAt);
    } else if (url === '/v1/metrics') {
      handleMetrics(payload, receivedAt);
      result = { ok: true };
    } else if (url === '/v1/traces') {
      handleTraces(payload, receivedAt);
      result = { ok: true };
    } else {
      res.writeHead(404);
      return res.end();
    }

    // Per OTLP spec, success returns 200 with empty ExportResponse.
    sendJson(res, 200, { partialSuccess: {} });
    if (result && result.written) {
      logLine('INFO', `received ${url} → ${result.written} usage record(s)`);
    }
  } catch (err) {
    lastError = `${new Date().toISOString()} ${err.message}`;
    logLine('ERROR', `${url}: ${err.stack || err.message}`);
    sendJson(res, err.statusCode || 500, { error: err.message });
  }
});

server.on('listening', () => {
  logLine('INFO', `collector listening on http://${HOST}:${PORT}`);
  writeStatus();
});

server.on('error', (err) => {
  lastError = `${new Date().toISOString()} server error: ${err.message}`;
  logLine('ERROR', `server error: ${err.stack || err.message}`);
  writeStatus();
  if (err.code === 'EADDRINUSE') {
    // Don't crash-loop: exit so the user sees and can fix.
    process.exit(2);
  }
});

ensureDirs();
server.listen(PORT, HOST);

// Heartbeat status file.
const heartbeat = setInterval(writeStatus, 15000);
heartbeat.unref();

function shutdown(reason) {
  logLine('INFO', `shutting down: ${reason}`);
  writeStatus();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  lastError = `${new Date().toISOString()} uncaught: ${err.message}`;
  logLine('ERROR', `uncaught: ${err.stack || err.message}`);
  writeStatus();
});
