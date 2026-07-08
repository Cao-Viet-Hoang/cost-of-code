/**
 * Which AI coding tool produced this record. Used as the top-level discriminator
 * in the dashboard (segmented "All / Claude / Codex" control) and to gate
 * Claude-specific UI like the Cache tab.
 *
 * Kept deliberately separate from `source_type` (Claude OTLP source category)
 * and `query_source` (Claude OTLP query origin) to avoid overloading.
 */
export type Tool = 'claude' | 'codex';

export interface UsageRecord {
  schema_version: number;
  /** AI coding tool that emitted this record. Defaults to 'claude' for legacy records. */
  tool?: Tool;
  timestamp: string;
  event_id?: string;
  event_key?: string;
  session_id?: string;
  request_id?: string;
  model?: string;
  query_source?: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens_without_cache: number;
  total_tokens_with_cache: number;
  estimated_cost_usd: number;
  duration_ms: number;
  source_type?: string;
  workspace?: string;
  terminal_type?: string;
  user_type?: string;
  scope_name?: string;
  /** Codex-only: provider behind the model (e.g. "azure", "openai"). */
  model_provider?: string;
  /** Codex-only: reasoning tokens (a subset of output_tokens). */
  reasoning_output_tokens?: number;
}

export interface CollectorStatus {
  pid?: number;
  startedAt?: string;
  now?: string;
  host?: string;
  port?: number;
  rootDir?: string;
  lastEventAt?: string | null;
  lastUsageAt?: string | null;
  totalRequests?: number;
  totalLogPayloads?: number;
  totalMetricsPayloads?: number;
  totalTracesPayloads?: number;
  totalUsageRecords?: number;
  lastError?: string | null;
  schemaVersion?: number;
}

export interface AggregatedTotals {
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokensWithoutCache: number;
  totalTokensWithCache: number;
  requests: number;
}

export interface DailyAggregate extends AggregatedTotals {
  date: string;
  sessions: number;
}

export interface SessionAggregate extends AggregatedTotals {
  sessionId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  models: string[];
  workspace?: string;
  /** Set of tools this session contains. Almost always one element. */
  tools: Tool[];
}

export interface ModelAggregate extends AggregatedTotals {
  model: string;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
}

export interface WorkspaceAggregate extends AggregatedTotals {
  workspace: string;
  sessions: number;
  models: string[];
}

export interface SourceAggregate extends AggregatedTotals {
  source: string;
}

/** Per-tool aggregate (Claude vs Codex). */
export interface ToolAggregate extends AggregatedTotals {
  tool: Tool;
}

/** Compact split used for KPI tooltips and the header chip. */
export interface ToolBreakdown {
  claude: AggregatedTotals;
  codex: AggregatedTotals;
}

export interface HourlyBucket {
  /** 0 = Sunday … 6 = Saturday (local time). */
  weekday: number;
  /** 0..23 (local time). */
  hour: number;
  cost: number;
  requests: number;
  totalTokens: number;
}

export interface RequestDetail {
  timestamp: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokensWithCache: number;
  cost: number;
  durationMs: number;
  requestId?: string;
  querySource?: string;
  tool?: Tool;
  reasoningOutputTokens?: number;
}

export interface OverviewSnapshot extends AggregatedTotals {
  date: string;
  lastEventAt: string | null;
  collectorRunning: boolean;
  collectorStatus: CollectorStatus | null;
}

export interface ScheduledTaskDetail {
  registered: boolean;
  state: string | null;
  lastRunTime: string | null;
  lastTaskResult: number | null;
  nextRunTime: string | null;
}

export interface TelemetryEnvEntry {
  name: string;
  value: string | null;
}

export interface StatusDetail {
  endpoint: string;
  scheduledTask: ScheduledTaskDetail | null;
  collectorHttp: {
    responded: boolean;
    status: CollectorStatus | null;
  };
  statusFile: {
    path: string;
    exists: boolean;
    status: CollectorStatus | null;
  };
  telemetryEnv: {
    settingsPath: string;
    settingsExists: boolean;
    entries: TelemetryEnvEntry[];
  };
}

export interface HealthReport {
  collectorRunning: boolean;
  collectorRespondedHttp: boolean;
  rootDirExists: boolean;
  rawDirExists: boolean;
  usageDirExists: boolean;
  newRecordsBeingWritten: boolean;
  lastEventAt: string | null;
  lastUsageAt: string | null;
  telemetryEnvConfigured: boolean;
  scheduledTaskRegistered: boolean | null;
  hasUsageRecords: boolean;
  totalLogPayloads: number;
  totalUsageRecords: number;
  totalRequests: number;
  errors: string[];
  notes: string[];
  endpoint: string;
}

export interface CacheBreakdownByDay {
  date: string;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokensWithCache: number;
  cacheRatio: number;
  /** Estimated USD saved by serving cache_read instead of fresh input. */
  estimatedSavedUsd: number;
}

export interface CacheSavingsSummary {
  totalReadTokens: number;
  totalCreateTokens: number;
  totalSavedUsd: number;
  /** Hypothetical cost if every cache_read had been a fresh input. */
  hypotheticalUncachedCost: number;
}

export interface FilterOptions {
  startDate?: string;
  endDate?: string;
  sessionId?: string;
  model?: string;
  querySource?: string;
  workspace?: string;
  search?: string;
  /** Limit the result set to records emitted by one tool. Omit for "All". */
  tool?: Tool;
}

/**
 * Snapshot of the local Codex sessions folder so the Health tab can report
 * presence/freshness without spinning up a collector.
 */
export interface CodexHealth {
  enabled: boolean;
  sessionsRoot: string;
  rootExists: boolean;
  sessionFiles: number;
  lastWriteAt: string | null;
  lastSessionId: string | null;
  /** Distinct models observed across parsed records. */
  models: string[];
  /** Distinct providers observed (e.g. "azure", "openai"). */
  providers: string[];
}

/**
 * Every metric a dashboard refresh needs for a given filter, computed from a
 * single pass over the matching records instead of one pass per metric.
 */
export interface DashboardSnapshot {
  totals: AggregatedTotals;
  daily: DailyAggregate[];
  sessions: SessionAggregate[];
  models: ModelAggregate[];
  workspaces: WorkspaceAggregate[];
  sources: SourceAggregate[];
  hourly: HourlyBucket[];
  cacheByDay: CacheBreakdownByDay[];
  cacheSavings: CacheSavingsSummary;
  toolBreakdown: ToolBreakdown;
}

/** Distinct filter dropdown values, computed from a single unfiltered pass. */
export interface DistinctFilterValues {
  models: string[];
  querySources: string[];
  workspaces: string[];
}
