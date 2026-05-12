import * as vscode from 'vscode';
import { DashboardPanel } from './DashboardPanel';
import {
  runInstall, runUninstall, runStatus, runStartTask, runStopTask, isWindows,
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
  );
}

export function deactivate() {
  DashboardPanel.current?.dispose();
}
