import * as fs from 'fs';
import * as path from 'path';
import { getPaths } from './paths';
import { savedByCacheRead, hypotheticalInputCost, type PricingOverrides } from './pricing';
import type {
  UsageRecord,
  DailyAggregate,
  SessionAggregate,
  ModelAggregate,
  WorkspaceAggregate,
  SourceAggregate,
  HourlyBucket,
  HourlyPoint,
  RequestDetail,
  AggregatedTotals,
  FilterOptions,
  CacheBreakdownByDay,
  CacheSavingsSummary,
  DashboardSnapshot,
  DistinctFilterValues,
} from './types';

const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.usage\.jsonl$/;

/**
 * Canonicalize a workspace path so the same directory always groups under one
 * key. On Windows the same folder can show up with different drive-letter
 * casing or path-separator style depending on where `cwd` is captured (the
 * SessionStart hook gets it from Claude Code, which inherits from the parent
 * shell — VS Code lowercases the drive, Explorer/PowerShell often uppercase).
 * Without this, "C:\\foo" and "c:\\foo" become two rows in Top workspaces.
 */
export function normalizeWorkspace(ws: string | undefined | null): string | undefined {
  if (!ws) { return undefined; }
  let s = String(ws).trim();
  if (!s) { return undefined; }
  if (/^[A-Za-z]:/.test(s)) {
    // Windows path: unify separators to backslash, strip trailing, lowercase drive.
    s = s.replace(/\//g, '\\').replace(/\\+$/, '');
    s = s[0].toLowerCase() + s.slice(1);
  } else {
    s = s.replace(/\/+$/, '');
  }
  return s;
}

function emptyTotals(): AggregatedTotals {
  return {
    cost: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokensWithoutCache: 0,
    totalTokensWithCache: 0,
    requests: 0,
  };
}

function add(totals: AggregatedTotals, r: UsageRecord) {
  totals.cost += r.estimated_cost_usd || 0;
  totals.inputTokens += r.input_tokens || 0;
  totals.outputTokens += r.output_tokens || 0;
  totals.cacheReadTokens += r.cache_read_tokens || 0;
  totals.cacheCreationTokens += r.cache_creation_tokens || 0;
  totals.totalTokensWithoutCache += r.total_tokens_without_cache || 0;
  totals.totalTokensWithCache += r.total_tokens_with_cache || 0;
  totals.requests += 1;
}

function recordPasses(r: UsageRecord, f: FilterOptions): boolean {
  if (f.startDate && r.timestamp.slice(0, 10) < f.startDate) {
    return false;
  }
  if (f.endDate && r.timestamp.slice(0, 10) > f.endDate) {
    return false;
  }
  if (f.sessionId && r.session_id !== f.sessionId) {
    return false;
  }
  if (f.model && r.model !== f.model) {
    return false;
  }
  if (f.querySource && r.query_source !== f.querySource) {
    return false;
  }
  if (f.workspace && r.workspace !== f.workspace) {
    return false;
  }
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = [
      r.session_id ?? '',
      r.request_id ?? '',
      r.model ?? '',
      r.workspace ?? '',
    ].join(' ').toLowerCase();
    if (!hay.includes(q)) {
      return false;
    }
  }
  return true;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) { return 0; }
  if (sorted.length === 1) { return sorted[0]; }
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) { return sorted[lo]; }
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

interface FileCacheEntry {
  mtimeMs: number;
  size: number;
  records: UsageRecord[];
}

export class UsageReader {
  private readonly usageDir: string;
  private readonly sessionMetaFile: string;
  private readonly fileCache = new Map<string, FileCacheEntry>();
  /** Cache of session-meta.jsonl: session_id → workspace. */
  private sessionMetaCache: Map<string, string> | null = null;
  private sessionMetaMtime = 0;
  private sessionMetaSize = 0;

  constructor(rootOverride?: string) {
    const p = getPaths(rootOverride);
    this.usageDir = p.usage;
    this.sessionMetaFile = p.sessionMeta;
  }

  /**
   * Reads ~/.claude/usage-tracker/session-meta.jsonl (written by the
   * SessionStart hook) and returns a session_id → workspace map.
   * Cached by (mtime, size) so polling is cheap.
   */
  private loadSessionMeta(): Map<string, string> {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.sessionMetaFile);
    } catch {
      this.sessionMetaCache = new Map();
      this.sessionMetaMtime = 0;
      this.sessionMetaSize = 0;
      return this.sessionMetaCache;
    }
    if (
      this.sessionMetaCache &&
      this.sessionMetaMtime === stat.mtimeMs &&
      this.sessionMetaSize === stat.size
    ) {
      return this.sessionMetaCache;
    }
    const map = new Map<string, string>();
    try {
      const raw = fs.readFileSync(this.sessionMetaFile, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        if (!line) { continue; }
        try {
          const j = JSON.parse(line) as { session_id?: string; workspace?: string };
          const ws = normalizeWorkspace(j.workspace);
          if (j.session_id && ws) {
            // Last-write-wins: a session_id seen multiple times keeps the
            // most recent workspace (cd'd into a different repo mid-session
            // is a rare case and we want the latest signal).
            map.set(j.session_id, ws);
          }
        } catch {
          // skip malformed line
        }
      }
    } catch {
      // file unreadable — fall through with empty map
    }
    this.sessionMetaCache = map;
    this.sessionMetaMtime = stat.mtimeMs;
    this.sessionMetaSize = stat.size;
    return map;
  }

  listAvailableDates(): string[] {
    if (!fs.existsSync(this.usageDir)) {
      return [];
    }
    const entries = fs.readdirSync(this.usageDir);
    const dates = new Set<string>();
    for (const e of entries) {
      const m = DATE_RE.exec(e);
      if (m) { dates.add(m[1]); }
    }
    return Array.from(dates).sort();
  }

  // Reuses parsed records when (mtimeMs, size) is unchanged, so historical
  // files cost nothing to re-read across polls.
  private loadFileRecords(date: string): UsageRecord[] {
    const file = path.join(this.usageDir, `${date}.usage.jsonl`);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      this.fileCache.delete(file);
      return [];
    }

    const cached = this.fileCache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.records;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      return cached?.records ?? [];
    }

    const records: UsageRecord[] = [];
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (!line) { continue; }
      try {
        records.push(JSON.parse(line) as UsageRecord);
      } catch {
        // partial / malformed line — skip
      }
    }

    this.fileCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, records });
    return records;
  }

  private evictMissingFiles(validDates: string[]) {
    const validFiles = new Set(
      validDates.map(d => path.join(this.usageDir, `${d}.usage.jsonl`)),
    );
    for (const file of Array.from(this.fileCache.keys())) {
      if (!validFiles.has(file)) {
        this.fileCache.delete(file);
      }
    }
  }

  *iterateRecords(filter: FilterOptions = {}): Generator<UsageRecord> {
    const dates = this.listAvailableDates();
    this.evictMissingFiles(dates);
    const sessionMeta = this.loadSessionMeta();
    const startD = filter.startDate;
    const endD = filter.endDate;
    const seen = new Set<string>();

    // Normalize the workspace filter once so it can compare equal to the
    // normalized workspace we attach to each record below.
    const normalizedFilter: FilterOptions = filter.workspace
      ? { ...filter, workspace: normalizeWorkspace(filter.workspace) }
      : filter;

    for (const d of dates) {
      if (startD && d < startD) { continue; }
      if (endD && d > endD) { continue; }

      const records = this.loadFileRecords(d);
      for (const rec of records) {
        const key = rec.event_key || `${rec.session_id || ''}|${rec.request_id || ''}|${rec.timestamp}`;
        if (seen.has(key)) { continue; }
        seen.add(key);

        // Backfill workspace from the SessionStart-hook side file when the
        // record itself doesn't carry one (Claude Code's OTLP currently does
        // not include cwd). Filtering by workspace happens AFTER backfill so
        // the workspace dropdown actually works.
        //
        // Whatever source the workspace comes from, run it through
        // normalizeWorkspace so downstream aggregations see one canonical key
        // per directory (e.g. "C:\foo" and "c:\foo" collapse).
        let effective = rec;
        const rawWs = rec.workspace || (rec.session_id ? sessionMeta.get(rec.session_id) : undefined);
        const ws = normalizeWorkspace(rawWs);
        if (ws !== rec.workspace) {
          effective = { ...rec, workspace: ws };
        }

        if (!recordPasses(effective, normalizedFilter)) { continue; }
        yield effective;
      }
    }
  }

  readAll(filter: FilterOptions = {}): UsageRecord[] {
    return Array.from(this.iterateRecords(filter));
  }

  daily(filter: FilterOptions = {}): DailyAggregate[] {
    const map = new Map<string, DailyAggregate & { _sessions: Set<string> }>();
    for (const r of this.iterateRecords(filter)) {
      const date = r.timestamp.slice(0, 10);
      let agg = map.get(date);
      if (!agg) {
        agg = { date, _sessions: new Set(), sessions: 0, ...emptyTotals() };
        map.set(date, agg);
      }
      add(agg, r);
      if (r.session_id) { agg._sessions.add(r.session_id); }
    }
    return Array.from(map.values())
      .map(({ _sessions, ...rest }) => ({ ...rest, sessions: _sessions.size }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  sessions(filter: FilterOptions = {}): SessionAggregate[] {
    interface Acc extends AggregatedTotals {
      sessionId: string;
      startTime: string;
      endTime: string;
      _models: Set<string>;
      workspace?: string;
    }
    const map = new Map<string, Acc>();
    for (const r of this.iterateRecords(filter)) {
      const id = r.session_id || '<unknown>';
      let acc = map.get(id);
      if (!acc) {
        acc = {
          sessionId: id,
          startTime: r.timestamp,
          endTime: r.timestamp,
          _models: new Set(),
          workspace: r.workspace,
          ...emptyTotals(),
        };
        map.set(id, acc);
      }
      add(acc, r);
      if (r.model) { acc._models.add(r.model); }
      if (r.timestamp < acc.startTime) { acc.startTime = r.timestamp; }
      if (r.timestamp > acc.endTime)   { acc.endTime = r.timestamp; }
      if (!acc.workspace && r.workspace) { acc.workspace = r.workspace; }
    }
    return Array.from(map.values())
      .map(({ _models, ...rest }) => ({
        ...rest,
        models: Array.from(_models),
        durationMs: new Date(rest.endTime).getTime() - new Date(rest.startTime).getTime(),
      }))
      .sort((a, b) => b.endTime.localeCompare(a.endTime));
  }

  /** Per-request detail for a single session — for drill-down. */
  sessionRequests(sessionId: string): RequestDetail[] {
    const out: RequestDetail[] = [];
    for (const r of this.iterateRecords({ sessionId })) {
      out.push({
        timestamp: r.timestamp,
        model: r.model,
        inputTokens: r.input_tokens || 0,
        outputTokens: r.output_tokens || 0,
        cacheReadTokens: r.cache_read_tokens || 0,
        cacheCreationTokens: r.cache_creation_tokens || 0,
        totalTokensWithCache: r.total_tokens_with_cache || 0,
        cost: r.estimated_cost_usd || 0,
        durationMs: r.duration_ms || 0,
        requestId: r.request_id,
        querySource: r.query_source,
      });
    }
    return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  models(filter: FilterOptions = {}): ModelAggregate[] {
    interface Acc extends AggregatedTotals {
      model: string;
      _durs: number[];
    }
    const map = new Map<string, Acc>();
    for (const r of this.iterateRecords(filter)) {
      const m = r.model || '<unknown>';
      let acc = map.get(m);
      if (!acc) {
        acc = { model: m, _durs: [], ...emptyTotals() };
        map.set(m, acc);
      }
      add(acc, r);
      if (r.duration_ms && r.duration_ms > 0) {
        acc._durs.push(r.duration_ms);
      }
    }
    return Array.from(map.values())
      .map(({ _durs, ...rest }) => {
        const sorted = _durs.slice().sort((a, b) => a - b);
        const avg = sorted.length
          ? sorted.reduce((s, v) => s + v, 0) / sorted.length
          : 0;
        return {
          ...rest,
          averageDurationMs: avg,
          p50DurationMs: percentile(sorted, 0.5),
          p95DurationMs: percentile(sorted, 0.95),
        };
      })
      .sort((a, b) => b.cost - a.cost);
  }

  workspaces(filter: FilterOptions = {}): WorkspaceAggregate[] {
    interface Acc extends AggregatedTotals {
      workspace: string;
      _sessions: Set<string>;
      _models: Set<string>;
    }
    const map = new Map<string, Acc>();
    for (const r of this.iterateRecords(filter)) {
      const w = r.workspace || '<unknown>';
      let acc = map.get(w);
      if (!acc) {
        acc = { workspace: w, _sessions: new Set(), _models: new Set(), ...emptyTotals() };
        map.set(w, acc);
      }
      add(acc, r);
      if (r.session_id) { acc._sessions.add(r.session_id); }
      if (r.model) { acc._models.add(r.model); }
    }
    return Array.from(map.values())
      .map(({ _sessions, _models, ...rest }) => ({
        ...rest,
        sessions: _sessions.size,
        models: Array.from(_models),
      }))
      .sort((a, b) => b.cost - a.cost);
  }

  sources(filter: FilterOptions = {}): SourceAggregate[] {
    const map = new Map<string, SourceAggregate>();
    for (const r of this.iterateRecords(filter)) {
      const s = r.query_source || '<unknown>';
      let acc = map.get(s);
      if (!acc) {
        acc = { source: s, ...emptyTotals() };
        map.set(s, acc);
      }
      add(acc, r);
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }

  /**
   * 24×7 hourly cost buckets (local time). Useful for heatmap visualisation.
   */
  hourly(filter: FilterOptions = {}): HourlyBucket[] {
    const buckets = new Map<string, HourlyBucket>();
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        buckets.set(`${d}|${h}`, { weekday: d, hour: h, cost: 0, requests: 0, totalTokens: 0 });
      }
    }
    for (const r of this.iterateRecords(filter)) {
      const dt = new Date(r.timestamp);
      if (Number.isNaN(dt.getTime())) { continue; }
      const b = buckets.get(`${dt.getDay()}|${dt.getHours()}`)!;
      b.cost += r.estimated_cost_usd || 0;
      b.requests += 1;
      b.totalTokens += r.total_tokens_with_cache || 0;
    }
    return Array.from(buckets.values());
  }

  /**
   * Per-hour buckets in chronological order, keyed by the UTC hour each record
   * falls in — the same clock the date filter uses, so a range's hours always
   * sum back to that range's totals. Only hours that saw traffic are returned;
   * gap-filling is the caller's job, because only the caller knows how far the
   * axis should run.
   */
  hourlyTimeline(filter: FilterOptions = {}): HourlyPoint[] {
    const map = new Map<string, HourlyPoint>();
    for (const r of this.iterateRecords(filter)) {
      const key = r.timestamp.slice(0, 13);
      if (key.length < 13) { continue; }
      let acc = map.get(key);
      if (!acc) {
        acc = { time: `${key}:00:00.000Z`, cost: 0, requests: 0, totalTokens: 0 };
        map.set(key, acc);
      }
      acc.cost += r.estimated_cost_usd || 0;
      acc.requests += 1;
      acc.totalTokens += r.total_tokens_with_cache || 0;
    }
    return Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time));
  }

  totals(filter: FilterOptions = {}): AggregatedTotals {
    const t = emptyTotals();
    for (const r of this.iterateRecords(filter)) {
      add(t, r);
    }
    return t;
  }

  /**
   * Returns the AggregatedTotals separately for each provided date range.
   * Useful for computing "vs previous period" deltas.
   */
  totalsForRanges(ranges: FilterOptions[]): AggregatedTotals[] {
    return ranges.map(f => this.totals(f));
  }

  cacheByDay(filter: FilterOptions = {}, pricing?: PricingOverrides): CacheBreakdownByDay[] {
    interface DaySavings {
      date: string;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      totalTokensWithCache: number;
      saved: number;
    }
    const map = new Map<string, DaySavings>();
    for (const r of this.iterateRecords(filter)) {
      const d = r.timestamp.slice(0, 10);
      let acc = map.get(d);
      if (!acc) {
        acc = { date: d, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokensWithCache: 0, saved: 0 };
        map.set(d, acc);
      }
      acc.cacheReadTokens += r.cache_read_tokens || 0;
      acc.cacheCreationTokens += r.cache_creation_tokens || 0;
      acc.totalTokensWithCache += r.total_tokens_with_cache || 0;
      acc.saved += savedByCacheRead(r.model, r.cache_read_tokens || 0, pricing);
    }
    return Array.from(map.values())
      .map(d => ({
        date: d.date,
        cacheReadTokens: d.cacheReadTokens,
        cacheCreationTokens: d.cacheCreationTokens,
        totalTokensWithCache: d.totalTokensWithCache,
        cacheRatio: d.totalTokensWithCache > 0
          ? (d.cacheReadTokens + d.cacheCreationTokens) / d.totalTokensWithCache
          : 0,
        cacheHitRatio: (d.cacheReadTokens + d.cacheCreationTokens) > 0
          ? d.cacheReadTokens / (d.cacheReadTokens + d.cacheCreationTokens)
          : 0,
        estimatedSavedUsd: d.saved,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  cacheSavingsSummary(filter: FilterOptions = {}, pricing?: PricingOverrides): CacheSavingsSummary {
    let totalReadTokens = 0;
    let totalCreateTokens = 0;
    let totalSavedUsd = 0;
    let hypothetical = 0;
    for (const r of this.iterateRecords(filter)) {
      const read = r.cache_read_tokens || 0;
      const create = r.cache_creation_tokens || 0;
      totalReadTokens += read;
      totalCreateTokens += create;
      totalSavedUsd += savedByCacheRead(r.model, read, pricing);
      hypothetical += hypotheticalInputCost(r.model, read, pricing);
    }
    return {
      totalReadTokens,
      totalCreateTokens,
      totalSavedUsd,
      hypotheticalUncachedCost: hypothetical,
    };
  }

  /**
   * Computes every metric a dashboard refresh needs in a single pass over
   * `iterateRecords(filter)`, instead of one independent pass per metric
   * (which is what calling daily/sessions/models/... separately does). This
   * is the only aggregation path used in production (see DashboardPanel).
   *
   * NOTE: the per-metric methods below (daily/sessions/models/workspaces/
   * sources/hourly/cacheByDay/cacheSavingsSummary) are intentionally NOT
   * called from here — they are retained as the independent reference
   * implementation that `usageReader.test.ts` diffs this method against
   * (and as the "slow path" baseline for the performance regression test).
   * If you change an aggregation rule or add a usage field, update it in
   * BOTH places; the equivalence test will fail loudly if they drift.
   */
  snapshot(filter: FilterOptions = {}, pricing?: PricingOverrides): DashboardSnapshot {
    const totals = emptyTotals();

    interface DailyAcc extends AggregatedTotals { date: string; _sessions: Set<string> }
    interface SessionAcc extends AggregatedTotals {
      sessionId: string; startTime: string; endTime: string; _models: Set<string>; workspace?: string;
    }
    interface ModelAcc extends AggregatedTotals { model: string; _durs: number[] }
    interface WorkspaceAcc extends AggregatedTotals {
      workspace: string; _sessions: Set<string>; _models: Set<string>;
    }
    interface CacheDayAcc {
      date: string; cacheReadTokens: number; cacheCreationTokens: number;
      totalTokensWithCache: number; saved: number;
    }

    const dailyMap = new Map<string, DailyAcc>();
    const sessionMap = new Map<string, SessionAcc>();
    const modelMap = new Map<string, ModelAcc>();
    const workspaceMap = new Map<string, WorkspaceAcc>();
    const sourceMap = new Map<string, SourceAggregate>();
    const cacheDayMap = new Map<string, CacheDayAcc>();
    const hourlyBuckets = new Map<string, HourlyBucket>();
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        hourlyBuckets.set(`${d}|${h}`, { weekday: d, hour: h, cost: 0, requests: 0, totalTokens: 0 });
      }
    }
    let cacheTotalRead = 0;
    let cacheTotalCreate = 0;
    let cacheTotalSaved = 0;
    let cacheHypothetical = 0;

    for (const r of this.iterateRecords(filter)) {
      add(totals, r);
      const date = r.timestamp.slice(0, 10);

      let dAcc = dailyMap.get(date);
      if (!dAcc) {
        dAcc = { date, _sessions: new Set(), ...emptyTotals() };
        dailyMap.set(date, dAcc);
      }
      add(dAcc, r);
      if (r.session_id) { dAcc._sessions.add(r.session_id); }

      const sid = r.session_id || '<unknown>';
      let sAcc = sessionMap.get(sid);
      if (!sAcc) {
        sAcc = {
          sessionId: sid, startTime: r.timestamp, endTime: r.timestamp,
          _models: new Set(), workspace: r.workspace, ...emptyTotals(),
        };
        sessionMap.set(sid, sAcc);
      }
      add(sAcc, r);
      if (r.model) { sAcc._models.add(r.model); }
      if (r.timestamp < sAcc.startTime) { sAcc.startTime = r.timestamp; }
      if (r.timestamp > sAcc.endTime) { sAcc.endTime = r.timestamp; }
      if (!sAcc.workspace && r.workspace) { sAcc.workspace = r.workspace; }

      const m = r.model || '<unknown>';
      let mAcc = modelMap.get(m);
      if (!mAcc) {
        mAcc = { model: m, _durs: [], ...emptyTotals() };
        modelMap.set(m, mAcc);
      }
      add(mAcc, r);
      if (r.duration_ms && r.duration_ms > 0) { mAcc._durs.push(r.duration_ms); }

      const w = r.workspace || '<unknown>';
      let wAcc = workspaceMap.get(w);
      if (!wAcc) {
        wAcc = { workspace: w, _sessions: new Set(), _models: new Set(), ...emptyTotals() };
        workspaceMap.set(w, wAcc);
      }
      add(wAcc, r);
      if (r.session_id) { wAcc._sessions.add(r.session_id); }
      if (r.model) { wAcc._models.add(r.model); }

      const s = r.query_source || '<unknown>';
      let srcAcc = sourceMap.get(s);
      if (!srcAcc) {
        srcAcc = { source: s, ...emptyTotals() };
        sourceMap.set(s, srcAcc);
      }
      add(srcAcc, r);

      const dt = new Date(r.timestamp);
      if (!Number.isNaN(dt.getTime())) {
        const b = hourlyBuckets.get(`${dt.getDay()}|${dt.getHours()}`)!;
        b.cost += r.estimated_cost_usd || 0;
        b.requests += 1;
        b.totalTokens += r.total_tokens_with_cache || 0;
      }

      const read = r.cache_read_tokens || 0;
      const create = r.cache_creation_tokens || 0;
      let cAcc = cacheDayMap.get(date);
      if (!cAcc) {
        cAcc = { date, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokensWithCache: 0, saved: 0 };
        cacheDayMap.set(date, cAcc);
      }
      cAcc.cacheReadTokens += read;
      cAcc.cacheCreationTokens += create;
      cAcc.totalTokensWithCache += r.total_tokens_with_cache || 0;
      const saved = savedByCacheRead(r.model, read, pricing);
      cAcc.saved += saved;
      cacheTotalRead += read;
      cacheTotalCreate += create;
      cacheTotalSaved += saved;
      cacheHypothetical += hypotheticalInputCost(r.model, read, pricing);
    }

    const daily = Array.from(dailyMap.values())
      .map(({ _sessions, ...rest }) => ({ ...rest, sessions: _sessions.size }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const sessions = Array.from(sessionMap.values())
      .map(({ _models, ...rest }) => ({
        ...rest,
        models: Array.from(_models),
        durationMs: new Date(rest.endTime).getTime() - new Date(rest.startTime).getTime(),
      }))
      .sort((a, b) => b.endTime.localeCompare(a.endTime));

    const models = Array.from(modelMap.values())
      .map(({ _durs, ...rest }) => {
        const sorted = _durs.slice().sort((a, b) => a - b);
        const avg = sorted.length
          ? sorted.reduce((s, v) => s + v, 0) / sorted.length
          : 0;
        return {
          ...rest,
          averageDurationMs: avg,
          p50DurationMs: percentile(sorted, 0.5),
          p95DurationMs: percentile(sorted, 0.95),
        };
      })
      .sort((a, b) => b.cost - a.cost);

    const workspaces = Array.from(workspaceMap.values())
      .map(({ _sessions, _models, ...rest }) => ({
        ...rest,
        sessions: _sessions.size,
        models: Array.from(_models),
      }))
      .sort((a, b) => b.cost - a.cost);

    const sources = Array.from(sourceMap.values()).sort((a, b) => b.cost - a.cost);

    const hourly = Array.from(hourlyBuckets.values());

    const cacheByDay = Array.from(cacheDayMap.values())
      .map(d => ({
        date: d.date,
        cacheReadTokens: d.cacheReadTokens,
        cacheCreationTokens: d.cacheCreationTokens,
        totalTokensWithCache: d.totalTokensWithCache,
        cacheRatio: d.totalTokensWithCache > 0
          ? (d.cacheReadTokens + d.cacheCreationTokens) / d.totalTokensWithCache
          : 0,
        cacheHitRatio: (d.cacheReadTokens + d.cacheCreationTokens) > 0
          ? d.cacheReadTokens / (d.cacheReadTokens + d.cacheCreationTokens)
          : 0,
        estimatedSavedUsd: d.saved,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const cacheSavings: CacheSavingsSummary = {
      totalReadTokens: cacheTotalRead,
      totalCreateTokens: cacheTotalCreate,
      totalSavedUsd: cacheTotalSaved,
      hypotheticalUncachedCost: cacheHypothetical,
    };

    return { totals, daily, sessions, models, workspaces, sources, hourly, cacheByDay, cacheSavings };
  }

  /** Distinct filter dropdown values (model/query_source/workspace), one unfiltered pass. */
  distinctAll(): DistinctFilterValues {
    const models = new Set<string>();
    const querySources = new Set<string>();
    const workspaces = new Set<string>();
    for (const r of this.iterateRecords()) {
      if (r.model) { models.add(r.model); }
      if (r.query_source) { querySources.add(r.query_source); }
      if (r.workspace) { workspaces.add(r.workspace); }
    }
    // Also union in any workspaces we know from the SessionStart hook, even
    // if their session_id hasn't produced an api_request yet.
    for (const ws of this.loadSessionMeta().values()) { workspaces.add(ws); }
    return {
      models: Array.from(models).sort(),
      querySources: Array.from(querySources).sort(),
      workspaces: Array.from(workspaces).sort(),
    };
  }

  distinctValues(field: 'model' | 'session_id' | 'query_source' | 'workspace'): string[] {
    const set = new Set<string>();
    for (const r of this.iterateRecords()) {
      const v = r[field];
      if (v) { set.add(v); }
    }
    if (field === 'workspace') {
      // Also union in any workspaces we know from the SessionStart hook,
      // even if their session_id hasn't produced an api_request yet.
      for (const ws of this.loadSessionMeta().values()) { set.add(ws); }
    }
    return Array.from(set).sort();
  }

  lastEventAt(): string | null {
    let last: string | null = null;
    for (const r of this.iterateRecords()) {
      if (!last || r.timestamp > last) { last = r.timestamp; }
    }
    return last;
  }
}
