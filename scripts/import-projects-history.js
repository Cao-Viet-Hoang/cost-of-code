/**
 * Backfills historical usage data from Claude Code's conversation JSONL files
 * (~/.claude/projects/<project>/<session>.jsonl and nested subagents) into
 * usage-tracker. Skips any date already covered by OTEL/telemetry-derived
 * usage files (OTEL is the source of truth for those dates).
 *
 * Run:
 *   node scripts/import-projects-history.js --dry-run     # preview only
 *   node scripts/import-projects-history.js               # write files
 *
 * Trade-offs vs OTEL:
 *   - estimated_cost_usd is computed from src/pricing.ts (~0.1% off vs
 *     OTEL's reported cost).
 *   - query_source is inferred: isSidechain=true → "auxiliary", else "sdk".
 *   - duration_ms = 0 (jsonl doesn't carry it).
 *   - <synthetic> model records are excluded (no real API call).
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DRY_RUN = process.argv.includes('--dry-run');
const HOME = os.homedir();
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects');
const USAGE_DIR = path.join(HOME, '.claude', 'usage-tracker', 'usage');
const SESSION_META = path.join(HOME, '.claude', 'usage-tracker', 'session-meta.jsonl');

// Pricing table — mirrors src/pricing.ts. USD per 1M tokens.
// Order matters: more specific keys must come before generic ones.
const PRICING = [
  ['claude-opus-4',     { input: 15,   output: 75,   cacheRead: 1.5,   cacheCreate: 18.75 }],
  ['claude-sonnet-4',   { input: 3,    output: 15,   cacheRead: 0.3,   cacheCreate: 3.75 }],
  ['claude-haiku-4',    { input: 0.8,  output: 4,    cacheRead: 0.08,  cacheCreate: 1 }],
  ['claude-3-5-haiku',  { input: 0.8,  output: 4,    cacheRead: 0.08,  cacheCreate: 1 }],
  ['claude-3-5-sonnet', { input: 3,    output: 15,   cacheRead: 0.3,   cacheCreate: 3.75 }],
  ['claude-3-7-sonnet', { input: 3,    output: 15,   cacheRead: 0.3,   cacheCreate: 3.75 }],
  ['claude-3-opus',     { input: 15,   output: 75,   cacheRead: 1.5,   cacheCreate: 18.75 }],
  ['claude-3-sonnet',   { input: 3,    output: 15,   cacheRead: 0.3,   cacheCreate: 3.75 }],
  ['claude-3-haiku',    { input: 0.25, output: 1.25, cacheRead: 0.03,  cacheCreate: 0.3 }],
  ['opus',              { input: 15,   output: 75,   cacheRead: 1.5,   cacheCreate: 18.75 }],
  ['sonnet',            { input: 3,    output: 15,   cacheRead: 0.3,   cacheCreate: 3.75 }],
  ['haiku',             { input: 0.8,  output: 4,    cacheRead: 0.08,  cacheCreate: 1 }],
];
const GENERIC = { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 };

function priceFor(model) {
  const m = (model || '').toLowerCase();
  for (const [key, p] of PRICING) {
    if (m.includes(key)) return p;
  }
  return GENERIC;
}

function computeCost(model, input, output, cacheRead, cacheCreation) {
  const p = priceFor(model);
  return (input * p.input + output * p.output + cacheRead * p.cacheRead + cacheCreation * p.cacheCreate) / 1_000_000;
}

function normalizeWorkspace(ws) {
  if (!ws) return '';
  let s = String(ws).trim();
  if (!s) return '';
  if (/^[A-Za-z]:/.test(s)) {
    s = s.replace(/\//g, '\\').replace(/\\+$/, '');
    s = s[0].toLowerCase() + s.slice(1);
  } else {
    s = s.replace(/\/+$/, '');
  }
  return s;
}

function* walkJsonlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkJsonlFiles(full);
    } else if (e.isFile() && e.name.endsWith('.jsonl')) {
      yield full;
    }
  }
}

function loadCoveredDates() {
  const dates = new Set();
  if (!fs.existsSync(USAGE_DIR)) return dates;
  for (const f of fs.readdirSync(USAGE_DIR)) {
    const m = /^(\d{4}-\d{2}-\d{2})\.usage\.jsonl$/.exec(f);
    if (m) dates.add(m[1]);
  }
  return dates;
}

function loadExistingSessionIds() {
  const seen = new Set();
  if (!fs.existsSync(SESSION_META)) return seen;
  const raw = fs.readFileSync(SESSION_META, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    try {
      const j = JSON.parse(line);
      if (j.session_id) seen.add(j.session_id);
    } catch { /* skip */ }
  }
  return seen;
}

function buildUsageRecord(rec) {
  const u = rec.message && rec.message.usage;
  if (!u) return null;
  const model = rec.message.model;
  if (!model || model === '<synthetic>') return null;

  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  const cacheCreation = u.cache_creation_input_tokens || 0;

  const querySource = rec.isSidechain ? 'auxiliary' : 'sdk';
  const cost = computeCost(model, input, output, cacheRead, cacheCreation);

  return {
    schema_version: 1,
    timestamp: rec.timestamp,
    session_id: rec.sessionId,
    request_id: rec.requestId,
    model,
    query_source: querySource,
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: cacheRead,
    cache_creation_tokens: cacheCreation,
    total_tokens_without_cache: input + output,
    total_tokens_with_cache: input + output + cacheRead + cacheCreation,
    estimated_cost_usd: cost,
    duration_ms: 0,
    source_type: 'claude-code',
    terminal_type: rec.entrypoint,
    scope_name: 'projects-jsonl',
    event_key: `proj|${rec.sessionId}|${rec.requestId}|${rec.timestamp}`,
  };
}

function main() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    console.error(`Projects dir not found: ${PROJECTS_DIR}`);
    process.exit(1);
  }
  if (!DRY_RUN && !fs.existsSync(USAGE_DIR)) {
    fs.mkdirSync(USAGE_DIR, { recursive: true });
  }

  const coveredDates = loadCoveredDates();
  const existingSessionIds = loadExistingSessionIds();
  console.log(`Skipping dates already in usage/: ${[...coveredDates].sort().join(', ') || '(none)'}`);

  /** date → UsageRecord[] */
  const byDate = new Map();
  /** session_id → workspace (first seen wins) */
  const sessionWorkspace = new Map();
  /** session_id → earliest timestamp seen */
  const sessionStartedAt = new Map();
  /** session_id → entrypoint (first seen) */
  const sessionEntrypoint = new Map();

  let filesScanned = 0;
  let recordsScanned = 0;
  let recordsSkipped_synthetic = 0;
  let recordsSkipped_coveredDate = 0;
  let recordsSkipped_missingFields = 0;
  let recordsKept = 0;

  for (const file of walkJsonlFiles(PROJECTS_DIR)) {
    filesScanned++;
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      if (!line || !line.includes('"type":"assistant"')) continue;
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      if (r.type !== 'assistant') continue;
      recordsScanned++;

      const sid = r.sessionId;
      const cwd = normalizeWorkspace(r.cwd);
      // Session-meta info is collected regardless of date filter,
      // because workspace is orthogonal to usage records.
      if (sid && cwd) {
        if (!sessionWorkspace.has(sid)) sessionWorkspace.set(sid, cwd);
        const ts = r.timestamp;
        const prev = sessionStartedAt.get(sid);
        if (ts && (!prev || ts < prev)) sessionStartedAt.set(sid, ts);
        if (r.entrypoint && !sessionEntrypoint.has(sid)) {
          sessionEntrypoint.set(sid, r.entrypoint);
        }
      }

      const model = r.message && r.message.model;
      if (model === '<synthetic>') { recordsSkipped_synthetic++; continue; }
      if (!r.timestamp || !r.requestId || !r.sessionId) {
        recordsSkipped_missingFields++;
        continue;
      }
      const date = r.timestamp.slice(0, 10);
      if (coveredDates.has(date)) { recordsSkipped_coveredDate++; continue; }

      const rec = buildUsageRecord(r);
      if (!rec) { recordsSkipped_missingFields++; continue; }

      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(rec);
      recordsKept++;
    }
  }

  // Sort each date's records by timestamp.
  for (const arr of byDate.values()) {
    arr.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  // Build session-meta entries.
  const sessionMetaLines = [];
  let sessionsNew = 0, sessionsBackfill = 0;
  for (const [sid, ws] of sessionWorkspace) {
    const entry = {
      session_id: sid,
      workspace: ws,
      started_at: sessionStartedAt.get(sid) || '',
      source: 'imported-from-projects',
      hook_event_name: 'SessionStart',
    };
    sessionMetaLines.push(JSON.stringify(entry));
    if (existingSessionIds.has(sid)) sessionsBackfill++;
    else sessionsNew++;
  }

  // Report.
  console.log(`\nFiles scanned: ${filesScanned}`);
  console.log(`Assistant records seen: ${recordsScanned}`);
  console.log(`  → kept:                 ${recordsKept}`);
  console.log(`  → skipped (covered date): ${recordsSkipped_coveredDate}`);
  console.log(`  → skipped (<synthetic>):  ${recordsSkipped_synthetic}`);
  console.log(`  → skipped (missing fields): ${recordsSkipped_missingFields}`);
  console.log(`Dates to write: ${byDate.size}`);
  for (const date of [...byDate.keys()].sort()) {
    console.log(`  ${date}.usage.jsonl: ${byDate.get(date).length} records`);
  }
  console.log(`\nSession-meta updates: ${sessionMetaLines.length} total`);
  console.log(`  → new sessions:        ${sessionsNew}`);
  console.log(`  → workspace backfill:  ${sessionsBackfill}`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] No files written.');
    return;
  }

  // Write usage files.
  for (const [date, recs] of byDate) {
    const outFile = path.join(USAGE_DIR, `${date}.usage.jsonl`);
    const payload = recs.map(r => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(outFile, payload, 'utf8');
  }

  // Append session-meta.
  if (sessionMetaLines.length) {
    fs.appendFileSync(SESSION_META, sessionMetaLines.join('\n') + '\n', 'utf8');
  }

  console.log('\nDone.');
}

main();
