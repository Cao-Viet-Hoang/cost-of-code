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
