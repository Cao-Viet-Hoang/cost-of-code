import * as vscode from 'vscode';
import { DashboardPanel } from './DashboardPanel';
import {
  runInstall, runUninstall, runStatus, runStartTask, runStopTask,
  runImportHistorical, isWindows,
} from './installer';

export function activate(context: vscode.ExtensionContext) {
  const ext = context.extensionUri;

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeUsageTracker.openDashboard', () => {
      DashboardPanel.show(ext);
    }),
    vscode.commands.registerCommand('claudeUsageTracker.runSetup', () => {
      if (!isWindows()) {
        vscode.window.showWarningMessage(
          'Setup script targets Windows. Run install.ps1 manually on this platform.',
        );
        return;
      }
      runInstall(ext);
    }),
    vscode.commands.registerCommand('claudeUsageTracker.uninstall', async () => {
      if (!isWindows()) { return; }
      const choice = await vscode.window.showWarningMessage(
        'Stop the collector and unregister the scheduled task? Your usage data is preserved.',
        { modal: true },
        'Uninstall',
        'Uninstall and delete data',
      );
      if (choice === 'Uninstall') { runUninstall(ext); }
      else if (choice === 'Uninstall and delete data') { runUninstall(ext, true); }
    }),
    vscode.commands.registerCommand('claudeUsageTracker.startCollector', () => {
      if (isWindows()) { runStartTask(); }
    }),
    vscode.commands.registerCommand('claudeUsageTracker.stopCollector', () => {
      if (isWindows()) { runStopTask(); }
    }),
    vscode.commands.registerCommand('claudeUsageTracker.showStatus', () => {
      if (isWindows()) { runStatus(ext); }
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
