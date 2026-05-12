import * as path from 'path';
import * as cp from 'child_process';
import * as vscode from 'vscode';

// PowerShell script runner. Runs hidden (no terminal flicker) and streams
// stdout/stderr into a shared Output channel. Shows a single notification on
// completion: success → info toast; failure → error toast with "Show output".
//
// `runStatus` always reveals the output channel because its purpose is to
// show information.

let outputChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Claude Usage Tracker');
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
  // If true, reveal the Output channel even on success (e.g. status command).
  revealOnSuccess?: boolean;
  // Friendlier notification messages (success / failure).
  successMessage?: string;
  failureMessage?: string;
  // Optional buttons for the success notification.
  successActions?: Array<{ title: string; run: () => void | Promise<void> }>;
}

async function runPowerShellHidden(opts: RunOptions): Promise<number> {
  const channel = getChannel();
  channel.appendLine('');
  channel.appendLine(`=== ${opts.title} @ ${new Date().toISOString()} ===`);
  channel.appendLine(`> powershell ${opts.args.join(' ')}`);

  const exec = () => new Promise<number>((resolve) => {
    const proc = cp.spawn('powershell.exe', opts.args, {
      windowsHide: true,
      shell: false,
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

export async function runInstall(extensionUri: vscode.Uri, port = 4318): Promise<number> {
  const ps = scriptPath(extensionUri, 'install.ps1');
  return runPowerShellHidden({
    title: 'Claude Usage Tracker — Setup',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps, '-Port', String(port)],
    withProgress: true,
    successMessage:
      'Claude Usage Tracker installed. Collector is running and will autostart at logon. ' +
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
    title: 'Claude Usage Tracker — Uninstall',
    args,
    withProgress: true,
    successMessage: purge
      ? 'Claude Usage Tracker uninstalled and data deleted.'
      : 'Claude Usage Tracker uninstalled. Data preserved at ~/.claude/usage-tracker.',
    failureMessage: 'Uninstall failed. See output for details.',
  });
}

export async function runStatus(extensionUri: vscode.Uri): Promise<number> {
  const ps = scriptPath(extensionUri, 'status.ps1');
  return runPowerShellHidden({
    title: 'Claude Usage Tracker — Status',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps],
    revealOnSuccess: true,
    // No success toast — the output channel is the result.
  });
}

export async function runStartTask(): Promise<number> {
  // The scheduled task action is wscript.exe + run-collector.vbs, which
  // launches node detached. Start-ScheduledTask fires the action; wscript
  // exits immediately after spawning node, and the task state returns to
  // "Ready" while the collector keeps running in the background.
  return runPowerShellHidden({
    title: 'Claude Usage Tracker — Start',
    args: ['-NoProfile', '-Command', 'Start-ScheduledTask -TaskName ClaudeCodeUsageTracker'],
    successMessage: 'Collector started.',
    failureMessage: 'Could not start collector. Run Setup first?',
  });
}

// Because the scheduled task action exits immediately after launching node
// (the .vbs is a fire-and-forget wrapper), Stop-ScheduledTask cannot kill
// the running collector — instead, find the orphaned node process by its
// command line and terminate it directly.
const STOP_COMMAND =
  "$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | " +
  "Where-Object { $_.CommandLine -match 'usage-tracker[\\\\/]bin[\\\\/]collector\\.js' }; " +
  "if ($procs) { foreach ($p in $procs) { " +
  "Stop-Process -Id $p.ProcessId -Force; " +
  "Write-Host (\"Stopped pid=\" + $p.ProcessId) " +
  "} } else { Write-Host 'No collector process is running.' }";

export async function runStopTask(): Promise<number> {
  return runPowerShellHidden({
    title: 'Claude Usage Tracker — Stop',
    args: ['-NoProfile', '-Command', STOP_COMMAND],
    successMessage: 'Collector stopped.',
    failureMessage: 'Could not stop collector.',
  });
}

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function expectedInstallRoot(): string {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return path.join(home, '.claude', 'usage-tracker');
}
