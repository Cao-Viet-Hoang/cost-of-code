import * as fs from 'fs';
import * as path from 'path';
import { getCodexSessionsRoot } from '../paths';
import { estimateCodexCostUsd, type CodexPricingOverrides } from './pricing';
import type { CodexHealth, UsageRecord } from '../types';

/**
 * Reads Codex Desktop session rollouts under `~/.codex/sessions/YYYY/MM/DD/`
 * and converts each `token_count` event into a `UsageRecord` tagged with
 * `tool: 'codex'`, so the rest of the dashboard's aggregation can operate on
 * one unified record type.
 *
 * No collector needed — Codex writes these files itself. We only read.
 *
 * File caching is keyed on (mtime, size) so historical sessions cost nothing
 * to re-scan on each dashboard refresh.
 */

const ROLLOUT_RE = /^rollout-.*\.jsonl$/;
const DATE_DIR_RE = /^\d{2}$/; // matches both MM and DD directories
const YEAR_DIR_RE = /^\d{4}$/;

interface CodexFileCache {
  mtimeMs: number;
  size: number;
  records: UsageRecord[];
  /** Bookkeeping for the Health snapshot. */
  lastWriteAt: string | null;
  sessionId: string | null;
  models: Set<string>;
  providers: Set<string>;
}

interface TurnContextState {
  model?: string;
  cwd?: string;
  /** Carried in once per session; per-turn copies can override. */
  modelProvider?: string;
}

export class CodexSessionReader {
  private readonly root: string;
  private readonly pricing: CodexPricingOverrides;
  private readonly fileCache = new Map<string, CodexFileCache>();

  constructor(rootOverride?: string, pricing?: CodexPricingOverrides) {
    this.root = getCodexSessionsRoot(rootOverride);
    this.pricing = pricing ?? {};
  }

  /** True if `~/.codex/sessions` exists. Cheap probe, no read. */
  rootExists(): boolean {
    try {
      const st = fs.statSync(this.root);
      return st.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Iterate every Codex `UsageRecord`. Cheap on repeat thanks to file cache.
   * Records arrive in arbitrary order — the consumer is expected to sort/group.
   */
  *iterateRecords(): Generator<UsageRecord> {
    for (const file of this.listSessionFiles()) {
      const cache = this.loadFile(file);
      if (!cache) { continue; }
      for (const rec of cache.records) {
        yield rec;
      }
    }
  }

  /** All records, materialized once. */
  readAll(): UsageRecord[] {
    return Array.from(this.iterateRecords());
  }

  /**
   * Lightweight snapshot for the Health tab. Does a full scan but reuses the
   * file cache, so subsequent calls are cheap.
   */
  health(enabled: boolean): CodexHealth {
    const root = this.root;
    const exists = this.rootExists();
    if (!enabled || !exists) {
      return {
        enabled,
        sessionsRoot: root,
        rootExists: exists,
        sessionFiles: 0,
        lastWriteAt: null,
        lastSessionId: null,
        models: [],
        providers: [],
      };
    }

    let count = 0;
    let lastWriteAt: string | null = null;
    let lastSessionId: string | null = null;
    const models = new Set<string>();
    const providers = new Set<string>();

    for (const file of this.listSessionFiles()) {
      count += 1;
      const cache = this.loadFile(file);
      if (!cache) { continue; }
      for (const m of cache.models) { models.add(m); }
      for (const p of cache.providers) { providers.add(p); }
      if (cache.lastWriteAt && (!lastWriteAt || cache.lastWriteAt > lastWriteAt)) {
        lastWriteAt = cache.lastWriteAt;
        lastSessionId = cache.sessionId;
      }
    }

    return {
      enabled,
      sessionsRoot: root,
      rootExists: true,
      sessionFiles: count,
      lastWriteAt,
      lastSessionId,
      models: Array.from(models).sort(),
      providers: Array.from(providers).sort(),
    };
  }

  /** Walks YYYY/MM/DD/*.jsonl. Tolerates a missing root. */
  private listSessionFiles(): string[] {
    if (!this.rootExists()) { return []; }
    const out: string[] = [];
    let years: string[];
    try {
      years = fs.readdirSync(this.root);
    } catch {
      return [];
    }
    for (const y of years) {
      if (!YEAR_DIR_RE.test(y)) { continue; }
      const yDir = path.join(this.root, y);
      let months: string[];
      try { months = fs.readdirSync(yDir); } catch { continue; }
      for (const m of months) {
        if (!DATE_DIR_RE.test(m)) { continue; }
        const mDir = path.join(yDir, m);
        let days: string[];
        try { days = fs.readdirSync(mDir); } catch { continue; }
        for (const d of days) {
          if (!DATE_DIR_RE.test(d)) { continue; }
          const dDir = path.join(mDir, d);
          let entries: string[];
          try { entries = fs.readdirSync(dDir); } catch { continue; }
          for (const e of entries) {
            if (ROLLOUT_RE.test(e)) {
              out.push(path.join(dDir, e));
            }
          }
        }
      }
    }
    return out;
  }

  private loadFile(file: string): CodexFileCache | null {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      this.fileCache.delete(file);
      return null;
    }
    const cached = this.fileCache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached;
    }
    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      return cached ?? null;
    }
    const parsed = parseRolloutFile(raw, this.pricing);
    const entry: CodexFileCache = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      records: parsed.records,
      lastWriteAt: parsed.lastWriteAt,
      sessionId: parsed.sessionId,
      models: parsed.models,
      providers: parsed.providers,
    };
    this.fileCache.set(file, entry);
    return entry;
  }
}

interface ParseResult {
  records: UsageRecord[];
  sessionId: string | null;
  lastWriteAt: string | null;
  models: Set<string>;
  providers: Set<string>;
}

/**
 * Parse one rollout JSONL into a list of `UsageRecord`. Designed to be
 * defensive about schema drift — unknown record types are skipped silently.
 *
 * Exposed for unit testing if we ever add tests, but kept internal here.
 */
function parseRolloutFile(raw: string, pricing: CodexPricingOverrides): ParseResult {
  const records: UsageRecord[] = [];
  const models = new Set<string>();
  const providers = new Set<string>();

  let sessionId: string | null = null;
  let sessionStartTs: string | null = null;
  let sessionCwd: string | undefined;
  let sessionProvider: string | undefined;
  const currentTurn: TurnContextState = {};
  let currentTurnId: string | undefined;
  let lastWriteAt: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    if (!line) { continue; }
    let evt: unknown;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }
    if (!evt || typeof evt !== 'object') { continue; }
    const e = evt as RolloutLine;
    if (typeof e.timestamp === 'string') {
      lastWriteAt = e.timestamp;
    }
    switch (e.type) {
      case 'session_meta': {
        const p = e.payload;
        if (p && typeof p === 'object') {
          sessionId = typeof p.id === 'string' ? p.id : null;
          sessionStartTs = typeof p.timestamp === 'string' ? p.timestamp : (e.timestamp ?? null);
          sessionCwd = typeof p.cwd === 'string' ? p.cwd : undefined;
          sessionProvider = typeof p.model_provider === 'string' ? p.model_provider : undefined;
          if (sessionProvider) { providers.add(sessionProvider); }
        }
        break;
      }
      case 'turn_context': {
        const p = e.payload;
        if (p && typeof p === 'object') {
          if (typeof p.turn_id === 'string') { currentTurnId = p.turn_id; }
          if (typeof p.model === 'string') { currentTurn.model = p.model; models.add(p.model); }
          if (typeof p.cwd === 'string')   { currentTurn.cwd = p.cwd; }
        }
        break;
      }
      case 'event_msg': {
        const p = e.payload;
        if (!p || typeof p !== 'object') { break; }
        if (p.type === 'task_started' && typeof p.turn_id === 'string') {
          currentTurnId = p.turn_id;
        } else if (p.type === 'token_count') {
          const rec = buildRecord({
            eventTimestamp: e.timestamp,
            payload: p as TokenCountPayload,
            sessionId,
            sessionStartTs,
            sessionCwd,
            provider: sessionProvider,
            turn: currentTurn,
            turnId: currentTurnId,
            pricing,
          });
          if (rec) { records.push(rec); }
        }
        break;
      }
      default:
        break;
    }
  }

  return { records, sessionId, lastWriteAt, models, providers };
}

interface BuildArgs {
  eventTimestamp?: string;
  payload: TokenCountPayload;
  sessionId: string | null;
  sessionStartTs: string | null;
  sessionCwd?: string;
  provider?: string;
  turn: TurnContextState;
  turnId?: string;
  pricing: CodexPricingOverrides;
}

function buildRecord(args: BuildArgs): UsageRecord | null {
  const info = args.payload.info;
  if (!info || typeof info !== 'object') { return null; }
  const last = info.last_token_usage;
  if (!last || typeof last !== 'object') { return null; }

  const inputTokens = num(last.input_tokens);
  const cachedInput = num(last.cached_input_tokens);
  const outputTokens = num(last.output_tokens);
  const reasoningOutput = num(last.reasoning_output_tokens);
  const totalTokens = num(last.total_tokens);

  // No-op events (a heartbeat with all zeros) — skip rather than pollute counts.
  if (inputTokens === 0 && outputTokens === 0 && cachedInput === 0) {
    return null;
  }

  const freshInput = Math.max(0, inputTokens - cachedInput);

  const timestamp = args.eventTimestamp || args.sessionStartTs || new Date().toISOString();
  const sessionId = args.sessionId ?? undefined;
  const turnId = args.turnId;
  const eventKey = `codex|${sessionId ?? ''}|${turnId ?? ''}|${timestamp}`;

  const model = args.turn.model;
  const cost = estimateCodexCostUsd(model, inputTokens, cachedInput, outputTokens, args.pricing);

  return {
    schema_version: 1,
    tool: 'codex',
    timestamp,
    event_key: eventKey,
    session_id: sessionId,
    request_id: turnId,
    model,
    model_provider: args.provider,
    // Codex sessions don't have a "query_source" analogue; leave undefined so
    // the dashboard's Source filter naturally skips Codex when active.
    query_source: undefined,
    // Map Codex semantics onto Claude-shaped UsageRecord:
    //   input_tokens         := fresh (uncached) input
    //   cache_read_tokens    := cached_input_tokens (priced at discounted rate)
    //   cache_creation_tokens:= 0 (Codex doesn't model this separately)
    //   output_tokens        := output_tokens (includes reasoning)
    input_tokens: freshInput,
    output_tokens: outputTokens,
    cache_read_tokens: cachedInput,
    cache_creation_tokens: 0,
    total_tokens_without_cache: freshInput + outputTokens,
    total_tokens_with_cache: totalTokens || (freshInput + outputTokens + cachedInput),
    estimated_cost_usd: cost,
    duration_ms: 0,
    workspace: args.turn.cwd || args.sessionCwd,
    reasoning_output_tokens: reasoningOutput,
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/* ----- Narrow types for the JSONL shape ----- */

interface RolloutLine {
  timestamp?: string;
  type?: string;
  payload?: RolloutPayload;
}

interface RolloutPayload {
  // session_meta
  id?: string;
  timestamp?: string;
  cwd?: string;
  model_provider?: string;
  // turn_context
  turn_id?: string;
  model?: string;
  // event_msg
  type?: string;
  info?: TokenCountInfo;
}

interface TokenCountPayload {
  type: 'token_count';
  info?: TokenCountInfo;
}

interface TokenCountInfo {
  total_token_usage?: TokenCountUsage;
  last_token_usage?: TokenCountUsage;
  model_context_window?: number;
}

interface TokenCountUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}
