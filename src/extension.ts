import * as vscode from 'vscode';
import { DashboardPanel } from './DashboardPanel';
import {
  runInstall, runUninstall, runStatus, runStartTask, runStopTask,
  runLinuxInstall, runLinuxUninstall, runLinuxStatus, runLinuxStart, runLinuxStop,
  runImportHistorical, isWindows, isLinux,
} from './installer';

export function activate(context: vscode.ExtensionContext) {
  const ext = context.extensionUri;

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeUsageTracker.openDashboard', () => {
      DashboardPanel.show(ext);
    }),

    vscode.commands.registerCommand('claudeUsageTracker.runSetup', () => {
      if (isWindows()) { runInstall(ext); }
      else if (isLinux()) { runLinuxInstall(ext); }
      else {
        vscode.window.showWarningMessage(
          'Setup is supported on Windows and Linux. On macOS, run install.sh manually.',
        );
      }
    }),

    vscode.commands.registerCommand('claudeUsageTracker.uninstall', async () => {
      if (!isWindows() && !isLinux()) { return; }
      const choice = await vscode.window.showWarningMessage(
        'Stop the collector and remove the autostart entry? Your usage data is preserved.',
        { modal: true },
        'Uninstall',
        'Uninstall and delete data',
      );
      if (choice === 'Uninstall') {
        isWindows() ? runUninstall(ext) : runLinuxUninstall(ext);
      } else if (choice === 'Uninstall and delete data') {
        isWindows() ? runUninstall(ext, true) : runLinuxUninstall(ext, true);
      }
    }),

    vscode.commands.registerCommand('claudeUsageTracker.startCollector', () => {
      if (isWindows()) { runStartTask(); }
      else if (isLinux()) { runLinuxStart(); }
    }),

    vscode.commands.registerCommand('claudeUsageTracker.stopCollector', () => {
      if (isWindows()) { runStopTask(); }
      else if (isLinux()) { runLinuxStop(); }
    }),

    vscode.commands.registerCommand('claudeUsageTracker.showStatus', () => {
      if (isWindows()) { runStatus(ext); }
      else if (isLinux()) { runLinuxStatus(ext); }
    }),

    vscode.commands.registerCommand('claudeUsageTracker.importHistorical', async () => {
      const choice = await vscode.window.showInformationMessage(
        'Backfill historical usage from ~/.claude/projects transcripts? Dates already covered by OTEL are skipped.',
        { modal: true },
        'Import',
        'Dry run',
      );
      if (choice === 'Import') { await runImportHistorical(ext); }
      else if (choice === 'Dry run') { await runImportHistorical(ext, { dryRun: true }); }
    }),
  );
}

export function deactivate() {
  DashboardPanel.current?.dispose();
}
