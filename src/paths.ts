import * as os from 'os';
import * as path from 'path';

export interface TrackerPaths {
  root: string;
  raw: string;
  usage: string;
  logs: string;
  config: string;
  exports: string;
  bin: string;
  status: string;
  sessionMeta: string;
}

export function getPaths(rootOverride?: string): TrackerPaths {
  const root = rootOverride && rootOverride.length > 0
    ? rootOverride
    : path.join(os.homedir(), '.claude', 'usage-tracker');

  return {
    root,
    raw: path.join(root, 'raw'),
    usage: path.join(root, 'usage'),
    logs: path.join(root, 'logs'),
    config: path.join(root, 'config'),
    exports: path.join(root, 'exports'),
    bin: path.join(root, 'bin'),
    status: path.join(root, 'status.json'),
    sessionMeta: path.join(root, 'session-meta.jsonl'),
  };
}

export function todayDateStr(d?: Date): string {
  return (d ?? new Date()).toISOString().slice(0, 10);
}

/**
 * Where Codex Desktop writes its session JSONL rollouts. Each session is a
 * separate `YYYY/MM/DD/rollout-<timestamp>-<session-id>.jsonl` file, appended
 * to in real time. We never write here — the reader is read-only.
 */
export function getCodexSessionsRoot(override?: string): string {
  if (override && override.length > 0) {
    return override;
  }
  return path.join(os.homedir(), '.codex', 'sessions');
}
