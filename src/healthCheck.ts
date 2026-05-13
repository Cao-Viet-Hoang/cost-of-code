import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getPaths } from './paths';
import { UsageReader } from './usageReader';
import type {
  CollectorStatus,
  HealthReport,
  ScheduledTaskDetail,
  StatusDetail,
  TelemetryEnvEntry,
} from './types';

const execFileP = promisify(execFile);
const TASK_NAME = 'ClaudeCodeUsageTracker';

interface ClaudeSettings {
  env?: Record<string, string | number | boolean>;
  [k: string]: unknown;
}

function readClaudeSettings(): ClaudeSettings | null {
  const file = path.join(os.homedir(), '.claude', 'settings.json');
  try {
    let text = fs.readFileSync(file, 'utf8');
    // Windows PowerShell 5.1's `Set-Content -Encoding UTF8` (and some other
    // editors on Windows) prepend a BOM, which JSON.parse rejects.
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class HealthCheckService {
  constructor(
    private readonly rootOverride?: string,
    private readonly endpoint = 'http://127.0.0.1:4318',
  ) {}

  async readStatusFile(): Promise<CollectorStatus | null> {
    const { status } = getPaths(this.rootOverride);
    try {
      const text = await fs.promises.readFile(status, 'utf8');
      return JSON.parse(text) as CollectorStatus;
    } catch {
      return null;
    }
  }

  async pingCollector(timeoutMs = 1500): Promise<CollectorStatus | null> {
    return new Promise((resolve) => {
      const url = new URL('/status', this.endpoint);
      const req = http.get({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        timeout: timeoutMs,
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            resolve(null);
          }
        });
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    });
  }

  async scheduledTaskRegistered(): Promise<boolean | null> {
    if (process.platform !== 'win32') { return null; }
    try {
      await execFileP('schtasks.exe', ['/Query', '/TN', TASK_NAME], { windowsHide: true });
      return true;
    } catch (err: unknown) {
      const msg = (err as { stderr?: string; message?: string }).stderr
        ?? (err as Error).message
        ?? '';
      if (msg.includes('cannot find') || msg.includes('không thể tìm')) {
        return false;
      }
      return false;
    }
  }

  async scheduledTaskDetail(): Promise<ScheduledTaskDetail | null> {
    if (process.platform !== 'win32') { return null; }
    // Use PowerShell to query Get-ScheduledTask + Get-ScheduledTaskInfo and
    // emit JSON. Falls back to "not registered" if the cmdlet errors.
    const cmd =
      "$ErrorActionPreference='SilentlyContinue';" +
      `$t = Get-ScheduledTask -TaskName '${TASK_NAME}';` +
      'if (-not $t) { \'{"registered":false}\' | Write-Output; return };' +
      `$i = Get-ScheduledTaskInfo -TaskName '${TASK_NAME}';` +
      '$o = [ordered]@{' +
      ' registered=$true;' +
      ' state=$t.State.ToString();' +
      ' lastRunTime= if ($i.LastRunTime) { $i.LastRunTime.ToString(\'o\') } else { $null };' +
      ' lastTaskResult=$i.LastTaskResult;' +
      ' nextRunTime= if ($i.NextRunTime) { $i.NextRunTime.ToString(\'o\') } else { $null }' +
      '};' +
      '$o | ConvertTo-Json -Compress';
    try {
      const { stdout } = await execFileP(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', cmd],
        { windowsHide: true },
      );
      const text = stdout.trim();
      if (!text) {
        return { registered: false, state: null, lastRunTime: null, lastTaskResult: null, nextRunTime: null };
      }
      const parsed = JSON.parse(text) as Partial<ScheduledTaskDetail>;
      return {
        registered: !!parsed.registered,
        state: parsed.state ?? null,
        lastRunTime: parsed.lastRunTime ?? null,
        lastTaskResult: typeof parsed.lastTaskResult === 'number' ? parsed.lastTaskResult : null,
        nextRunTime: parsed.nextRunTime ?? null,
      };
    } catch {
      return { registered: false, state: null, lastRunTime: null, lastTaskResult: null, nextRunTime: null };
    }
  }

  telemetryEnvEntries(): { settingsPath: string; settingsExists: boolean; entries: TelemetryEnvEntry[] } {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const settings = readClaudeSettings();
    const settingsExists = fs.existsSync(settingsPath);
    const names = [
      'CLAUDE_CODE_ENABLE_TELEMETRY',
      'OTEL_LOGS_EXPORTER',
      'OTEL_METRICS_EXPORTER',
      'OTEL_TRACES_EXPORTER',
      'OTEL_EXPORTER_OTLP_PROTOCOL',
      'OTEL_EXPORTER_OTLP_ENDPOINT',
    ];
    const env = (settings?.env ?? {}) as Record<string, unknown>;
    const entries: TelemetryEnvEntry[] = names.map((name) => {
      const raw = env[name];
      return { name, value: raw === undefined || raw === null ? null : String(raw) };
    });
    return { settingsPath, settingsExists, entries };
  }

  async gatherStatusDetail(): Promise<StatusDetail> {
    const paths = getPaths(this.rootOverride);
    const [taskDetail, httpStatus, fileStatus] = await Promise.all([
      this.scheduledTaskDetail(),
      this.pingCollector(),
      this.readStatusFile(),
    ]);
    return {
      endpoint: this.endpoint,
      scheduledTask: taskDetail,
      collectorHttp: { responded: httpStatus !== null, status: httpStatus },
      statusFile: { path: paths.status, exists: fs.existsSync(paths.status), status: fileStatus },
      telemetryEnv: this.telemetryEnvEntries(),
    };
  }

  telemetryEnvConfigured(): boolean {
    const settings = readClaudeSettings();
    const env = settings?.env ?? {};
    const enabled = env.CLAUDE_CODE_ENABLE_TELEMETRY;
    const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
    return !!(enabled && endpoint);
  }

  async run(): Promise<HealthReport> {
    const paths = getPaths(this.rootOverride);
    const errors: string[] = [];
    const notes: string[] = [];

    const rootDirExists = fs.existsSync(paths.root);
    const rawDirExists = fs.existsSync(paths.raw);
    const usageDirExists = fs.existsSync(paths.usage);

    const [statusFromFile, statusFromHttp, taskRegistered] = await Promise.all([
      this.readStatusFile(),
      this.pingCollector(),
      this.scheduledTaskRegistered(),
    ]);

    const collectorRespondedHttp = statusFromHttp !== null;
    // Trust HTTP first (proves the server is alive), fall back to status file.
    const collectorRunning = collectorRespondedHttp || (() => {
      if (!statusFromFile?.now) { return false; }
      const ageMs = Date.now() - new Date(statusFromFile.now).getTime();
      return ageMs < 60_000; // file written within last minute
    })();

    const reader = new UsageReader(this.rootOverride);
    const lastUsage = reader.lastEventAt();
    const hasUsageRecords = lastUsage !== null;

    // "New records being written" means: a usage record landed in the JSONL
    // recently. 10 minutes is a reasonable "live" window for a developer
    // dashboard.
    const FRESHNESS_MS = 10 * 60 * 1000;
    const lastUsageAtCombined =
      statusFromHttp?.lastUsageAt ?? statusFromFile?.lastUsageAt ?? lastUsage;
    let newRecordsBeingWritten = false;
    if (lastUsageAtCombined) {
      const ageMs = Date.now() - new Date(lastUsageAtCombined).getTime();
      newRecordsBeingWritten = ageMs < FRESHNESS_MS;
    }

    const totalLogPayloads = statusFromHttp?.totalLogPayloads ?? statusFromFile?.totalLogPayloads ?? 0;
    const totalUsageRecords = statusFromHttp?.totalUsageRecords ?? statusFromFile?.totalUsageRecords ?? 0;
    const totalRequests = statusFromHttp?.totalRequests ?? statusFromFile?.totalRequests ?? 0;

    if (!rootDirExists) {
      errors.push(`Data folder missing: ${paths.root} - run setup.`);
    }
    if (!collectorRunning) {
      errors.push('Collector is not responding. Run setup or "Start collector".');
    }
    if (!this.telemetryEnvConfigured()) {
      notes.push(
        'Claude Code telemetry is not configured in ~/.claude/settings.json. Run setup.'
      );
    }
    if (taskRegistered === false) {
      notes.push('No scheduled task registered. The collector will not start automatically at logon.');
    }
    // The most useful diagnostic: collector is alive, but Claude Code has
    // never sent a log payload to it.
    if (collectorRunning && totalLogPayloads === 0) {
      notes.push(
        'Collector is running but has not received any OpenTelemetry log payloads from Claude Code yet. ' +
        'Most common cause: the running Claude Code session was started before telemetry was configured. ' +
        'Fix: close all Claude Code sessions (CLI and VSCode), then start Claude Code again so it re-reads ~/.claude/settings.json.'
      );
    } else if (collectorRunning && totalLogPayloads > 0 && totalUsageRecords === 0) {
      notes.push(
        `Collector received ${totalLogPayloads} log payload(s) but none contained a recognized ` +
        '"claude_code.api_request" event. Either no API call has been made yet, or the event schema ' +
        'has changed. See the raw/ folder for the full payloads.'
      );
    } else if (rootDirExists && !hasUsageRecords && !collectorRunning) {
      notes.push('No usage events received and the collector is not running.');
    }

    return {
      collectorRunning,
      collectorRespondedHttp,
      rootDirExists,
      rawDirExists,
      usageDirExists,
      newRecordsBeingWritten,
      lastEventAt: statusFromHttp?.lastEventAt ?? statusFromFile?.lastEventAt ?? null,
      lastUsageAt: lastUsageAtCombined,
      telemetryEnvConfigured: this.telemetryEnvConfigured(),
      scheduledTaskRegistered: taskRegistered,
      hasUsageRecords,
      totalLogPayloads,
      totalUsageRecords,
      totalRequests,
      errors,
      notes,
      endpoint: this.endpoint,
    };
  }
}
