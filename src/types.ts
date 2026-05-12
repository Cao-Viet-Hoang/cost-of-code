export interface UsageRecord {
  schema_version: number;
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
}

export interface OverviewSnapshot extends AggregatedTotals {
  date: string;
  lastEventAt: string | null;
  collectorRunning: boolean;
  collectorStatus: CollectorStatus | null;
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
}
