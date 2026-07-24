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
  return runPowerShellHidden({
    title: 'Cost of Code — Setup',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps, '-Port', String(port)],
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

// ─── Unix functions (Linux + macOS) ────────────────────────────────────────────

// systemd user service name (Linux); launchd LaunchAgent label (macOS).
export const LINUX_SERVICE_NAME = 'claude-usage-tracker';
export const MAC_LAUNCHD_LABEL = 'com.claude.usage-tracker';

export async function runUnixInstall(extensionUri: vscode.Uri, port = 4318): Promise<number> {
  const sh = scriptPath(extensionUri, 'install.sh');
  const sourceDir = vscode.Uri.joinPath(extensionUri, 'collector').fsPath;
  return runBashHidden({
    title: 'Cost of Code — Setup',
    args: [sh, '--port', String(port), '--source-dir', sourceDir],
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

export async function runUnixUninstall(extensionUri: vscode.Uri, purge = false): Promise<number> {
  const sh = scriptPath(extensionUri, 'uninstall.sh');
  const args = [sh];
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

export async function runUnixStatus(extensionUri: vscode.Uri, port = 4318): Promise<number> {
  const sh = scriptPath(extensionUri, 'status.sh');
  return runBashHidden({
    title: 'Cost of Code — Status',
    args: [sh, '--port', String(port)],
    revealOnSuccess: true,
  });
}

export async function runUnixStart(): Promise<number> {
  const home = process.env.HOME || os.homedir();
  const collectorJs = path.join(home, '.claude', 'usage-tracker', 'bin', 'collector.js');
  const logsDir = path.join(home, '.claude', 'usage-tracker', 'logs');
  const plistPath = path.join(home, 'Library', 'LaunchAgents', `${MAC_LAUNCHD_LABEL}.plist`);
  const script = isMac()
    // load -w (re)activates the agent; if it was already loaded, `start` nudges it.
    ? `if [ -f "${plistPath}" ]; then\n` +
      `  launchctl load -w "${plistPath}" 2>/dev/null || launchctl start "${MAC_LAUNCHD_LABEL}" 2>/dev/null || true\n` +
      `  echo "Started launchd agent '${MAC_LAUNCHD_LABEL}'"\n` +
      `elif [ -f "${collectorJs}" ]; then\n` +
      `  mkdir -p "${logsDir}"\n` +
      `  nohup node "${collectorJs}" </dev/null >>"${logsDir}/collector.log" 2>&1 &\n` +
      `  echo "Spawned collector (pid=$!)"\n` +
      `else\n` +
      `  echo "Collector not found at ${collectorJs}. Run Setup first." >&2; exit 1\n` +
      `fi`
    : `if systemctl --user start ${LINUX_SERVICE_NAME} 2>/dev/null; then\n` +
      `  echo "Started systemd service '${LINUX_SERVICE_NAME}'"\n` +
      `elif [ -f "${collectorJs}" ]; then\n` +
      `  mkdir -p "${logsDir}"\n` +
      `  nohup node "${collectorJs}" </dev/null >>"${logsDir}/collector.log" 2>&1 &\n` +
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

export async function runUnixStop(): Promise<number> {
  const home = process.env.HOME || os.homedir();
  const plistPath = path.join(home, 'Library', 'LaunchAgents', `${MAC_LAUNCHD_LABEL}.plist`);
  // Unload (without -w) stops the job now but leaves it enabled for next login,
  // matching the Linux "stop but keep autostart" semantics.
  const stopAutostart = isMac()
    ? `launchctl unload "${plistPath}" 2>/dev/null || true\n`
    : `systemctl --user stop ${LINUX_SERVICE_NAME} 2>/dev/null || true\n`;
  const script =
    stopAutostart +
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

  channel.appendLine('');
  channel.appendLine(`=== ${title} @ ${new Date().toISOString()} ===`);
  channel.appendLine(`> node ${args.join(' ')}`);

  const exec = () => new Promise<number>((resolve) => {
    const proc = cp.spawn('node', args, { windowsHide: true, shell: false });
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
      `Historical import failed (exit ${code}). Is Node.js installed and on PATH?`,
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

export function isMac(): boolean {
  return process.platform === 'darwin';
}

// Linux and macOS share the same bash scripts (install/uninstall/status).
export function isUnix(): boolean {
  return isLinux() || isMac();
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
