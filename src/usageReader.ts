import * as fs from 'fs';
import * as path from 'path';
import { getPaths } from './paths';
import type {
  UsageRecord,
  DailyAggregate,
  SessionAggregate,
  ModelAggregate,
  AggregatedTotals,
  FilterOptions,
  CacheBreakdownByDay,
} from './types';

const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.usage\.jsonl$/;

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

interface FileCacheEntry {
  mtimeMs: number;
  size: number;
  records: UsageRecord[];
}

export class UsageReader {
  private readonly usageDir: string;
  private readonly fileCache = new Map<string, FileCacheEntry>();

  constructor(rootOverride?: string) {
    this.usageDir = getPaths(rootOverride).usage;
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
  // files cost nothing to re-read across polls. If a past day's file gets
  // appended (e.g. a backfilled or late-flushed event), the signature
  // changes and that single file is re-parsed.
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
    const startD = filter.startDate;
    const endD = filter.endDate;
    const seen = new Set<string>();

    for (const d of dates) {
      if (startD && d < startD) { continue; }
      if (endD && d > endD) { continue; }

      const records = this.loadFileRecords(d);
      for (const rec of records) {
        // Dedupe across reads.
        const key = rec.event_key || `${rec.session_id || ''}|${rec.request_id || ''}|${rec.timestamp}`;
        if (seen.has(key)) { continue; }
        seen.add(key);

        if (!recordPasses(rec, filter)) { continue; }
        yield rec;
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

  models(filter: FilterOptions = {}): ModelAggregate[] {
    interface Acc extends AggregatedTotals {
      model: string;
      _durSum: number;
      _durCount: number;
    }
    const map = new Map<string, Acc>();
    for (const r of this.iterateRecords(filter)) {
      const m = r.model || '<unknown>';
      let acc = map.get(m);
      if (!acc) {
        acc = { model: m, _durSum: 0, _durCount: 0, ...emptyTotals() };
        map.set(m, acc);
      }
      add(acc, r);
      if (r.duration_ms) {
        acc._durSum += r.duration_ms;
        acc._durCount += 1;
      }
    }
    return Array.from(map.values())
      .map(({ _durSum, _durCount, ...rest }) => ({
        ...rest,
        averageDurationMs: _durCount ? _durSum / _durCount : 0,
      }))
      .sort((a, b) => b.cost - a.cost);
  }

  totals(filter: FilterOptions = {}): AggregatedTotals {
    const t = emptyTotals();
    for (const r of this.iterateRecords(filter)) {
      add(t, r);
    }
    return t;
  }

  cacheByDay(filter: FilterOptions = {}): CacheBreakdownByDay[] {
    return this.daily(filter).map(d => ({
      date: d.date,
      cacheReadTokens: d.cacheReadTokens,
      cacheCreationTokens: d.cacheCreationTokens,
      totalTokensWithCache: d.totalTokensWithCache,
      cacheRatio: d.totalTokensWithCache > 0
        ? (d.cacheReadTokens + d.cacheCreationTokens) / d.totalTokensWithCache
        : 0,
    }));
  }

  distinctValues(field: 'model' | 'session_id' | 'query_source' | 'workspace'): string[] {
    const set = new Set<string>();
    for (const r of this.iterateRecords()) {
      const v = r[field];
      if (v) { set.add(v); }
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
