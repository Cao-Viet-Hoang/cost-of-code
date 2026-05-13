'use strict';

// Shared normalizer for Claude Code OpenTelemetry payloads.
// Used by collector.js (write usage JSONL) and by the VSCode extension
// (re-parse raw OTLP files when needed). No external deps.

const SCHEMA_VERSION = 1;

function readAnyValue(v) {
  if (v == null) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(v, 'stringValue')) {
    return v.stringValue;
  }
  if (Object.prototype.hasOwnProperty.call(v, 'intValue')) {
    const n = v.intValue;
    return typeof n === 'string' ? Number(n) : n;
  }
  if (Object.prototype.hasOwnProperty.call(v, 'doubleValue')) {
    return v.doubleValue;
  }
  if (Object.prototype.hasOwnProperty.call(v, 'boolValue')) {
    return v.boolValue;
  }
  if (Object.prototype.hasOwnProperty.call(v, 'arrayValue')) {
    return (v.arrayValue.values || []).map(readAnyValue);
  }
  if (Object.prototype.hasOwnProperty.call(v, 'kvlistValue')) {
    return kvListToObject(v.kvlistValue.values || []);
  }
  if (Object.prototype.hasOwnProperty.call(v, 'bytesValue')) {
    return v.bytesValue;
  }
  return undefined;
}

function kvListToObject(kvList) {
  const out = {};
  for (const kv of kvList || []) {
    out[kv.key] = readAnyValue(kv.value);
  }
  return out;
}

function nanoToIso(nanoStr) {
  if (!nanoStr) {
    return null;
  }
  try {
    const ms = Number(BigInt(nanoStr) / 1000000n);
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function num(v) {
  if (v == null) {
    return 0;
  }
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function pickFirst(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
      return obj[k];
    }
  }
  return undefined;
}

// Build a stable id for dedup. Claude Code emits an event id sometimes;
// otherwise hash of session+request+ts+model.
function buildEventKey(usage) {
  if (usage.event_id) {
    return `eid:${usage.event_id}`;
  }
  return [
    usage.session_id || '',
    usage.request_id || '',
    usage.timestamp || '',
    usage.model || '',
    usage.input_tokens || 0,
    usage.output_tokens || 0,
  ].join('|');
}

// Convert one OTel LogRecord to a normalized usage record, or null if it is
// not a Claude Code usage event we care about.
function logRecordToUsage(logRecord, resourceAttrs, scope) {
  const attrs = kvListToObject(logRecord.attributes || []);
  const eventName =
    attrs['event.name'] ||
    (logRecord.body && readAnyValue(logRecord.body)) ||
    null;

  // Only api_request events carry token usage today.
  const isApiRequest =
    eventName === 'claude_code.api_request' ||
    attrs['input_tokens'] !== undefined ||
    attrs['output_tokens'] !== undefined;

  if (!isApiRequest) {
    return null;
  }

  const tsIso =
    nanoToIso(logRecord.timeUnixNano) ||
    nanoToIso(logRecord.observedTimeUnixNano) ||
    new Date().toISOString();

  const sessionId = pickFirst(attrs, [
    'session.id',
    'session_id',
  ]) || pickFirst(resourceAttrs, ['session.id', 'session_id']);

  const requestId = pickFirst(attrs, [
    'request.id',
    'request_id',
    'anthropic_request_id',
  ]);

  const model = pickFirst(attrs, ['model', 'gen_ai.request.model']);
  const inputTokens = num(pickFirst(attrs, ['input_tokens', 'gen_ai.usage.input_tokens']));
  const outputTokens = num(pickFirst(attrs, ['output_tokens', 'gen_ai.usage.output_tokens']));
  const cacheRead = num(
    pickFirst(attrs, [
      'cache_read_tokens',
      'cache_read_input_tokens',
      'gen_ai.usage.cache_read_input_tokens',
    ])
  );
  const cacheCreation = num(
    pickFirst(attrs, [
      'cache_creation_input_tokens',
      'cache_creation_tokens',
      'gen_ai.usage.cache_creation_input_tokens',
    ])
  );
  const cost = num(pickFirst(attrs, ['cost_usd', 'cost.usd']));
  const duration = num(pickFirst(attrs, ['duration_ms', 'request.duration_ms']));
  const querySource = pickFirst(attrs, ['query.source', 'query_source', 'source']);

  const totalNoCache = inputTokens + outputTokens;
  const totalWithCache = totalNoCache + cacheRead + cacheCreation;

  const usage = {
    schema_version: SCHEMA_VERSION,
    timestamp: tsIso,
    event_id: pickFirst(attrs, ['event.id', 'event_id']),
    session_id: sessionId,
    request_id: requestId,
    model,
    query_source: querySource,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheRead,
    cache_creation_tokens: cacheCreation,
    total_tokens_without_cache: totalNoCache,
    total_tokens_with_cache: totalWithCache,
    estimated_cost_usd: cost,
    duration_ms: duration,
    source_type: pickFirst(resourceAttrs, ['service.name']) || 'claude-code',
    workspace: pickFirst(attrs, ['workspace.path', 'project.path', 'cwd']),
    terminal_type: pickFirst(attrs, ['terminal.type']),
    user_type: pickFirst(attrs, ['user.account_uuid', 'user_type']),
    scope_name: scope ? scope.name : undefined,
  };

  usage.event_key = buildEventKey(usage);
  return usage;
}

// Walk an OTLP/JSON LogsData payload and yield normalized usage records.
function extractUsageFromLogsPayload(payload) {
  const out = [];
  const resourceLogs = payload && payload.resourceLogs ? payload.resourceLogs : [];
  for (const rl of resourceLogs) {
    const resAttrs = kvListToObject((rl.resource && rl.resource.attributes) || []);
    for (const sl of rl.scopeLogs || []) {
      const scope = sl.scope || null;
      for (const lr of sl.logRecords || []) {
        const usage = logRecordToUsage(lr, resAttrs, scope);
        if (usage) {
          out.push(usage);
        }
      }
    }
  }
  return out;
}

module.exports = {
  SCHEMA_VERSION,
  readAnyValue,
  kvListToObject,
  logRecordToUsage,
  extractUsageFromLogsPayload,
  buildEventKey,
};
