import * as path from 'path';
import * as cp from 'child_process';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Cost of Code');
  }
  return outputChannel;
}

function scriptPath(extensionUri: vscode.Uri, name: string): string {
  return vscode.Uri.joinPath(extensionUri, 'scripts', name).fsPath;
}

// Resolves the Node.js-compatible runtime to use. Strategy:
//   1. Prefer a real `node` on PATH (Node >= 18). Standalone binaries are
//      smaller and survive VSCode updates/uninstalls.
//   2. Fall back to process.execPath — the host runtime. In the VSCode
//      extension host this is usually the Electron binary (Code.exe), which
//      behaves as pure Node.js when ELECTRON_RUN_AS_NODE=1 is set.
//   3. If neither responds to `--version`, throw — the caller surfaces a
//      user-facing error.
//
// ELECTRON_RUN_AS_NODE=1 is set unconditionally on spawn. The variable is
// ignored by a real node binary, so it is safe in both cases.
let cachedNodeExe: string | undefined;

function probeNodeMajor(exe: string, env: NodeJS.ProcessEnv): number | undefined {
  const v = cp.spawnSync(exe, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    env,
    timeout: 5000,
  });
  if (v.status !== 0 || !v.stdout) {
    return undefined;
  }
  const m = v.stdout.trim().match(/^v(\d+)/);
  if (!m) {
    return undefined;
  }
  const major = parseInt(m[1], 10);
  return Number.isFinite(major) ? major : undefined;
}

function findSystemNode(): string | undefined {
  const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
  const which = cp.spawnSync(cmd, ['node'], { encoding: 'utf8', windowsHide: true });
  if (which.status !== 0 || !which.stdout) {
    return undefined;
  }
  const first = which.stdout.split(/\r?\n/).map(s => s.trim()).find(s => s.length > 0);
  if (!first) {
    return undefined;
  }
  const major = probeNodeMajor(first, process.env);
  return major !== undefined && major >= 18 ? first : undefined;
}

function findHostNode(): string | undefined {
  const exe = process.execPath;
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  const major = probeNodeMajor(exe, env);
  return major !== undefined && major >= 18 ? exe : undefined;
}

function nodeExePath(): string {
  if (cachedNodeExe !== undefined) {
    return cachedNodeExe;
  }
  const channel = getChannel();
  const system = findSystemNode();
  if (system) {
    cachedNodeExe = system;
    channel.appendLine(`[node] using system Node.js at ${system}`);
    return cachedNodeExe;
  }
  const host = findHostNode();
  if (host) {
    cachedNodeExe = host;
    channel.appendLine(`[node] no Node >=18 on PATH; using host runtime ${host} (ELECTRON_RUN_AS_NODE=1)`);
    return cachedNodeExe;
  }
  throw new Error(
    'No Node.js 18+ runtime found. Install Node.js from https://nodejs.org and retry.',
  );
}

function nodeSpawnEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
}

async function resolveNodeOrShowError(title: string): Promise<string | undefined> {
  try {
    return nodeExePath();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    getChannel().appendLine(`[${title}] ${msg}`);
    await vscode.window.showErrorMessage(`${title}: ${msg}`);
    return undefined;
  }
}

interface RunOptions {
  title: string;
  args: string[];
  withProgress?: boolean;
  revealOnSuccess?: boolean;
  successMessage?: string;
  failureMessage?: string;
  successActions?: Array<{ title: string; run: () => void | Promise<void> }>;
}

// Shared runner: spawns `executable` with `opts.args`, streams stdout/stderr
// to the Output channel, and shows a notification on completion.
async function runProcessHidden(
  executable: string,
  opts: RunOptions,
  spawnOpts: cp.SpawnOptions,
): Promise<number> {
  const channel = getChannel();
  channel.appendLine('');
  channel.appendLine(`=== ${opts.title} @ ${new Date().toISOString()} ===`);
  channel.appendLine(`> ${executable} ${opts.args.join(' ')}`);

  const exec = () => new Promise<number>((resolve) => {
    const proc = cp.spawn(executable, opts.args, spawnOpts);
    proc.stdout!.on('data', (d) => channel.append(d.toString()));
    proc.stderr!.on('data', (d) => channel.append(d.toString()));
    proc.on('error', (err) => {
      channel.appendLine(`\n[spawn error] ${err.message}`);
      resolve(-1);
    });
    proc.on('close', (code) => {
      channel.appendLine(`\n[exit ${code ?? '?'}]`);
      resolve(code ?? -1);
    });
  });

  const code = opts.withProgress
    ? await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: opts.title, cancellable: false },
        () => exec(),
      )
    : await exec();

  if (code === 0) {
    if (opts.revealOnSuccess) {
      channel.show(true);
    }
    if (opts.successMessage) {
      const actions = opts.successActions ?? [];
      const titles = actions.map(a => a.title);
      const choice = await vscode.window.showInformationMessage(
        opts.successMessage,
        ...titles,
      );
      const picked = actions.find(a => a.title === choice);
      if (picked) { await picked.run(); }
    }
  } else {
    channel.show(true);
    const fallback = opts.failureMessage ?? `${opts.title} failed (exit ${code})`;
    const choice = await vscode.window.showErrorMessage(fallback, 'Show output');
    if (choice === 'Show output') { channel.show(true); }
  }
  return code;
}

function runPowerShellHidden(opts: RunOptions): Promise<number> {
  return runProcessHidden('powershell.exe', opts, { windowsHide: true, shell: false });
}

function runBashHidden(opts: RunOptions): Promise<number> {
  return runProcessHidden('bash', opts, { shell: false });
}

// ─── Windows functions ────────────────────────────────────────────────────────

export async function runInstall(extensionUri: vscode.Uri, port = 4318): Promise<number> {
  const ps = scriptPath(extensionUri, 'install.ps1');
  const nodeExe = await resolveNodeOrShowError('Cost of Code — Setup');
  if (!nodeExe) { return -1; }
  return runPowerShellHidden({
    title: 'Cost of Code — Setup',
    args: [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps,
      '-Port', String(port),
      '-NodeExe', nodeExe,
    ],
    withProgress: true,
    successMessage:
      'Cost of Code installed. Collector is running and will autostart at logon. ' +
      'OpenTelemetry settings were written to ~/.claude/settings.json — restart any active Claude Code session to pick them up.',
    failureMessage: 'Setup failed. See output for details.',
    successActions: [
      {
        title: 'Open Dashboard',
        run: async () => {
          await vscode.commands.executeCommand('claudeUsageTracker.openDashboard');
        },
      },
      {
        title: 'Show output',
        run: () => getChannel().show(true),
      },
    ],
  });
}

export async function runUninstall(extensionUri: vscode.Uri, purge = false): Promise<number> {
  const ps = scriptPath(extensionUri, 'uninstall.ps1');
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps];
  if (purge) { args.push('-PurgeData'); }
  return runPowerShellHidden({
    title: 'Cost of Code — Uninstall',
    args,
    withProgress: true,
    successMessage: purge
      ? 'Cost of Code uninstalled and data deleted.'
      : 'Cost of Code uninstalled. Data preserved at ~/.claude/usage-tracker.',
    failureMessage: 'Uninstall failed. See output for details.',
  });
}

export async function runStatus(extensionUri: vscode.Uri): Promise<number> {
  const ps = scriptPath(extensionUri, 'status.ps1');
  return runPowerShellHidden({
    title: 'Cost of Code — Status',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps],
    revealOnSuccess: true,
  });
}

export async function runStartTask(): Promise<number> {
  return runPowerShellHidden({
    title: 'Cost of Code — Start',
    args: ['-NoProfile', '-Command', 'Start-ScheduledTask -TaskName ClaudeCodeUsageTracker'],
    successMessage: 'Collector started.',
    failureMessage: 'Could not start collector. Run Setup first?',
  });
}

const STOP_COMMAND =
  "$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | " +
  "Where-Object { $_.CommandLine -match 'usage-tracker[\\\\/]bin[\\\\/]collector\\.js' }; " +
  "if ($procs) { foreach ($p in $procs) { " +
  "Stop-Process -Id $p.ProcessId -Force; " +
  "Write-Host (\"Stopped pid=\" + $p.ProcessId) " +
  "} } else { Write-Host 'No collector process is running.' }";

export async function runStopTask(): Promise<number> {
  return runPowerShellHidden({
    title: 'Cost of Code — Stop',
    args: ['-NoProfile', '-Command', STOP_COMMAND],
    successMessage: 'Collector stopped.',
    failureMessage: 'Could not stop collector.',
  });
}

// ─── Linux functions ──────────────────────────────────────────────────────────

export const LINUX_SERVICE_NAME = 'claude-usage-tracker';

export async function runLinuxInstall(extensionUri: vscode.Uri, port = 4318): Promise<number> {
  const sh = scriptPath(extensionUri, 'install.sh');
  const sourceDir = vscode.Uri.joinPath(extensionUri, 'collector').fsPath;
  const nodeExe = await resolveNodeOrShowError('Cost of Code — Setup');
  if (!nodeExe) { return -1; }
  return runBashHidden({
    title: 'Cost of Code — Setup',
    args: [
      sh,
      '--port', String(port),
      '--source-dir', sourceDir,
      '--node-exe', nodeExe,
    ],
    withProgress: true,
    successMessage:
      'Cost of Code installed. Collector is running and will autostart at login. ' +
      'OpenTelemetry settings were written to ~/.claude/settings.json — restart any active Claude Code session to pick them up.',
    failureMessage: 'Setup failed. See output for details.',
    successActions: [
      {
        title: 'Open Dashboard',
        run: async () => {
          await vscode.commands.executeCommand('claudeUsageTracker.openDashboard');
        },
      },
      {
        title: 'Show output',
        run: () => getChannel().show(true),
      },
    ],
  });
}

export async function runLinuxUninstall(extensionUri: vscode.Uri, purge = false): Promise<number> {
  const sh = scriptPath(extensionUri, 'uninstall.sh');
  // Uninstall is tolerant of a missing node runtime (it only needs one for
  // the best-effort settings.json clean step), so don't gate the whole flow
  // on resolution success here.
  const args = [sh];
  try {
    args.push('--node-exe', nodeExePath());
  } catch {
    // ignore — uninstall.sh will skip the settings.json step.
  }
  if (purge) { args.push('--purge-data'); }
  return runBashHidden({
    title: 'Cost of Code — Uninstall',
    args,
    withProgress: true,
    successMessage: purge
      ? 'Cost of Code uninstalled and data deleted.'
      : 'Cost of Code uninstalled. Data preserved at ~/.claude/usage-tracker.',
    failureMessage: 'Uninstall failed. See output for details.',
  });
}

export async function runLinuxStatus(extensionUri: vscode.Uri, port = 4318): Promise<number> {
  const sh = scriptPath(extensionUri, 'status.sh');
  // Status is also tolerant of a missing node runtime — settings.json parse
  // is the only thing that needs it. Pass the path if we can find one.
  const args = [sh, '--port', String(port)];
  try {
    args.push('--node-exe', nodeExePath());
  } catch {
    // ignore
  }
  return runBashHidden({
    title: 'Cost of Code — Status',
    args,
    revealOnSuccess: true,
  });
}

export async function runLinuxStart(): Promise<number> {
  const home = process.env.HOME || os.homedir();
  const collectorJs = path.join(home, '.claude', 'usage-tracker', 'bin', 'collector.js');
  const runNodeSh = path.join(home, '.claude', 'usage-tracker', 'bin', 'run-node.sh');
  const logsDir = path.join(home, '.claude', 'usage-tracker', 'logs');
  // Manual fallback uses the run-node.sh wrapper that install.sh wrote,
  // so the right runtime + ELECTRON_RUN_AS_NODE=1 are picked up automatically.
  const script =
    `if systemctl --user start ${LINUX_SERVICE_NAME} 2>/dev/null; then\n` +
    `  echo "Started systemd service '${LINUX_SERVICE_NAME}'"\n` +
    `elif [ -x "${runNodeSh}" ] && [ -f "${collectorJs}" ]; then\n` +
    `  mkdir -p "${logsDir}"\n` +
    `  nohup "${runNodeSh}" "${collectorJs}" </dev/null >>"${logsDir}/collector.log" 2>&1 &\n` +
    `  echo "Spawned collector (pid=$!)"\n` +
    `else\n` +
    `  echo "Collector not found at ${collectorJs}. Run Setup first." >&2; exit 1\n` +
    `fi`;
  return runBashHidden({
    title: 'Cost of Code — Start',
    args: ['-c', script],
    successMessage: 'Collector started.',
    failureMessage: 'Could not start collector. Run Setup first?',
  });
}

export async function runLinuxStop(): Promise<number> {
  const script =
    `systemctl --user stop ${LINUX_SERVICE_NAME} 2>/dev/null || true\n` +
    `pkill -f 'usage-tracker/bin/collector\\.js' 2>/dev/null && echo "Stopped collector process(es)" || echo "No collector process was running"`;
  return runBashHidden({
    title: 'Cost of Code — Stop',
    args: ['-c', script],
    successMessage: 'Collector stopped.',
    failureMessage: 'Could not stop collector.',
  });
}

// ─── Cross-platform utilities ─────────────────────────────────────────────────

// Spawns `node scripts/import-projects-history.js` to backfill historical
// usage from ~/.claude/projects JSONL transcripts. Cross-platform.
export async function runImportHistorical(
  extensionUri: vscode.Uri,
  opts: { dryRun?: boolean } = {},
): Promise<number> {
  const channel = getChannel();
  const js = scriptPath(extensionUri, 'import-projects-history.js');
  const title = opts.dryRun
    ? 'Cost of Code — Import historical (dry run)'
    : 'Cost of Code — Import historical';
  const args = [js];
  if (opts.dryRun) { args.push('--dry-run'); }

  const nodeExe = await resolveNodeOrShowError(title);
  if (!nodeExe) { return -1; }
  channel.appendLine('');
  channel.appendLine(`=== ${title} @ ${new Date().toISOString()} ===`);
  channel.appendLine(`> ${nodeExe} ${args.join(' ')}`);

  const exec = () => new Promise<number>((resolve) => {
    const proc = cp.spawn(nodeExe, args, {
      windowsHide: true,
      shell: false,
      env: nodeSpawnEnv(),
    });
    proc.stdout.on('data', (d) => channel.append(d.toString()));
    proc.stderr.on('data', (d) => channel.append(d.toString()));
    proc.on('error', (err) => {
      channel.appendLine(`\n[spawn error] ${err.message}`);
      resolve(-1);
    });
    proc.on('close', (code) => {
      channel.appendLine(`\n[exit ${code ?? '?'}]`);
      resolve(code ?? -1);
    });
  });

  const code = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: false },
    () => exec(),
  );

  if (code === 0) {
    const successMsg = opts.dryRun
      ? 'Dry run complete. See output for what would be imported.'
      : 'Historical import complete. Dashboard will refresh.';
    const choice = await vscode.window.showInformationMessage(successMsg, 'Show output');
    if (choice === 'Show output') { channel.show(true); }
  } else {
    channel.show(true);
    const choice = await vscode.window.showErrorMessage(
      `Historical import failed (exit ${code}). See output for details.`,
      'Show output',
    );
    if (choice === 'Show output') { channel.show(true); }
  }
  return code;
}

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function isLinux(): boolean {
  return process.platform === 'linux';
}

export function expectedInstallRoot(): string {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return path.join(home, '.claude', 'usage-tracker');
}

export type PortStatus = 'free' | 'in-use-by-tracker' | 'in-use-by-other' | 'error';
export interface PortCheckResult {
  port: number;
  status: PortStatus;
  message: string;
}

function pingIsOurCollector(port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: '127.0.0.1', port, path: '/status', timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(false); return; }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(j && typeof j === 'object'
            && ('totalRequests' in j || 'totalLogPayloads' in j));
        } catch { resolve(false); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function tryBind(port: number): Promise<{ free: true } | { free: false; code: string }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      resolve({ free: false, code: err.code ?? 'EUNKNOWN' });
    });
    server.once('listening', () => {
      server.close(() => resolve({ free: true }));
    });
    server.listen(port, '127.0.0.1');
  });
}

export async function checkPort(port: number): Promise<PortCheckResult> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { port, status: 'error', message: 'Port must be an integer between 1 and 65535.' };
  }
  const bind = await tryBind(port);
  if (bind.free) {
    return { port, status: 'free', message: `Port ${port} is available.` };
  }
  if (bind.code === 'EADDRINUSE') {
    const ours = await pingIsOurCollector(port);
    if (ours) {
      return {
        port,
        status: 'in-use-by-tracker',
        message: `Port ${port} is in use by the current Cost of Code collector. Setup will restart it.`,
      };
    }
    return {
      port,
      status: 'in-use-by-other',
      message: `Port ${port} is in use by another process. Stop that process or pick a different port.`,
    };
  }
  if (bind.code === 'EACCES') {
    return { port, status: 'error', message: `Access denied binding port ${port}. Try a port above 1024.` };
  }
  return { port, status: 'error', message: `Could not check port ${port}: ${bind.code}` };
}
