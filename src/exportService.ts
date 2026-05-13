import * as fs from 'fs';
import * as path from 'path';
import { getPaths } from './paths';
import { UsageReader } from './usageReader';
import type { FilterOptions, UsageRecord } from './types';

export type ExportFormat = 'jsonl' | 'csv';

const CSV_COLUMNS: (keyof UsageRecord)[] = [
  'timestamp',
  'session_id',
  'request_id',
  'model',
  'query_source',
  'input_tokens',
  'output_tokens',
  'cache_read_tokens',
  'cache_creation_tokens',
  'total_tokens_without_cache',
  'total_tokens_with_cache',
  'estimated_cost_usd',
  'duration_ms',
  'workspace',
  'source_type',
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) { return ''; }
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export class ExportService {
  constructor(private readonly rootOverride?: string) {}

  exportsDir(): string {
    return getPaths(this.rootOverride).exports;
  }

  export(filter: FilterOptions, format: ExportFormat, label?: string): string {
    const reader = new UsageReader(this.rootOverride);
    const records = reader.readAll(filter);
    const dir = this.exportsDir();
    fs.mkdirSync(dir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeLabel = (label ?? 'usage')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);
    const filename = `${stamp}_${safeLabel}.${format}`;
    const file = path.join(dir, filename);

    if (format === 'jsonl') {
      const body = records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
      fs.writeFileSync(file, body, 'utf8');
    } else {
      const header = CSV_COLUMNS.join(',');
      const rows = records.map(r =>
        CSV_COLUMNS.map(c => csvCell(r[c])).join(',')
      );
      fs.writeFileSync(file, [header, ...rows].join('\n') + '\n', 'utf8');
    }
    return file;
  }
}
