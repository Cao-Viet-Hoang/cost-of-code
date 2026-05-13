import * as vscode from 'vscode';
import { UsageReader } from './usageReader';
import { HealthCheckService } from './healthCheck';
import { ExportService, ExportFormat } from './exportService';
import { getPaths } from './paths';
import {
  runInstall, runUninstall, runStartTask, runStopTask,
  runImportHistorical, isWindows,
} from './installer';
import type { FilterOptions } from './types';
import type { PricingOverrides } from './pricing';
import { DASHBOARD_CSS } from './webview/styles';
import { buildBodyHtml } from './webview/markup';
import { buildClientJs } from './webview/client';

export class DashboardPanel {
  public static current: DashboardPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly reader: UsageReader;
  private readonly health: HealthCheckService;
  private readonly exporter: ExportService;
  private readonly pricingOverrides: PricingOverrides;
  private readonly autoRefreshSeconds: number;

  static show(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (DashboardPanel.current) {
      DashboardPanel.current.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'claudeUsageTracker.dashboard',
      'Claude Code Usage',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.png');
    DashboardPanel.current = new DashboardPanel(panel, extensionUri);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.panel = panel;
    const cfg = vscode.workspace.getConfiguration('claudeUsageTracker');
    const root = cfg.get<string>('dataFolder') || undefined;
    const port = cfg.get<number>('collectorPort') ?? 4318;
    this.autoRefreshSeconds = cfg.get<number>('autoRefreshSeconds') ?? 15;
    this.pricingOverrides = cfg.get<PricingOverrides>('pricing') ?? {};

    this.reader = new UsageReader(root);
    this.health = new HealthCheckService(root, `http://127.0.0.1:${port}`);
    this.exporter = new ExportService(root);

    panel.webview.html = this.getHtml();

    panel.onDidDispose(() => this.dispose(), null, this.disposables);
    panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );
  }

  dispose() {
    DashboardPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private async handleMessage(msg: { type: string; payload?: unknown }) {
    try {
      switch (msg.type) {
        case 'refresh':
          await this.refresh((msg.payload as { filter?: FilterOptions } | undefined)?.filter);
          return;
        case 'getSessionDetail': {
          const sid = (msg.payload as { sessionId?: string } | undefined)?.sessionId;
          if (sid) {
            const requests = this.reader.sessionRequests(sid);
            this.panel.webview.postMessage({
              type: 'sessionDetail',
              payload: { sessionId: sid, requests },
            });
          }
          return;
        }
        case 'runInstall':
          await runInstall(this.extensionUri);
          await this.refresh();
          return;
        case 'runUninstall':
          await runUninstall(this.extensionUri);
          await this.refresh();
          return;
        case 'runStatus': {
          const detail = await this.health.gatherStatusDetail();
          this.panel.webview.postMessage({ type: 'statusDetail', payload: detail });
          return;
        }
        case 'startCollector':
          if (isWindows()) {
            await runStartTask();
            await this.refresh();
          }
          return;
        case 'stopCollector':
          if (isWindows()) {
            await runStopTask();
            await this.refresh();
          }
          return;
        case 'openExports': {
          const dir = this.exporter.exportsDir();
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
          return;
        }
        case 'openDataFolder': {
          const root = getPaths().root;
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(root));
          return;
        }
        case 'importHistorical': {
          const dryRun = !!(msg.payload as { dryRun?: boolean } | undefined)?.dryRun;
          const code = await runImportHistorical(this.extensionUri, { dryRun });
          if (code === 0 && !dryRun) { await this.refresh(); }
          return;
        }
        case 'export': {
          const p = msg.payload as { filter: FilterOptions; format: ExportFormat; label?: string };
          const file = this.exporter.export(p.filter, p.format, p.label);
          const choice = await vscode.window.showInformationMessage(
            `Exported to ${file}`, 'Open file', 'Open folder',
          );
          if (choice === 'Open file') {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
          } else if (choice === 'Open folder') {
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(file));
          }
          return;
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Dashboard error: ${m}`);
    }
  }

  private async refresh(filter: FilterOptions = {}) {
    try {
      const todayDate = new Date().toISOString().slice(0, 10);
      const todayFilter: FilterOptions = { ...filter, startDate: todayDate, endDate: todayDate };

      const [
        health,
        today,
        allTotals,
        daily,
        sessions,
        models,
        workspaces,
        sources,
        hourly,
        cacheByDay,
        cacheSavings,
        distinctModels,
        distinctSources,
        distinctWorkspaces,
      ] = await Promise.all([
        this.health.run(),
        Promise.resolve(this.reader.totals(todayFilter)),
        Promise.resolve(this.reader.totals(filter)),
        Promise.resolve(this.reader.daily(filter)),
        Promise.resolve(this.reader.sessions(filter)),
        Promise.resolve(this.reader.models(filter)),
        Promise.resolve(this.reader.workspaces(filter)),
        Promise.resolve(this.reader.sources(filter)),
        Promise.resolve(this.reader.hourly(filter)),
        Promise.resolve(this.reader.cacheByDay(filter, this.pricingOverrides)),
        Promise.resolve(this.reader.cacheSavingsSummary(filter, this.pricingOverrides)),
        Promise.resolve(this.reader.distinctValues('model')),
        Promise.resolve(this.reader.distinctValues('query_source')),
        Promise.resolve(this.reader.distinctValues('workspace')),
      ]);

      this.panel.webview.postMessage({
        type: 'data',
        payload: {
          todayDate,
          today,
          allTotals,
          daily,
          sessions,
          models,
          workspaces,
          sources,
          hourly,
          cacheByDay,
          cacheSavings,
          health,
          filterOptions: {
            models: distinctModels,
            sources: distinctSources,
            workspaces: distinctWorkspaces,
          },
          appliedFilter: filter,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.panel.webview.postMessage({ type: 'error', payload: { message: m } });
    }
  }

  private getHtml(): string {
    const nonce = Buffer.from(Math.random().toString()).toString('base64').slice(0, 16);
    const csp = [
      "default-src 'none'",
      `style-src 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      "img-src data:",
      "font-src data:",
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>Claude Code Usage</title>
<style>${DASHBOARD_CSS}</style>
</head>
<body class="theme">
${buildBodyHtml()}
<script nonce="${nonce}">${buildClientJs(this.autoRefreshSeconds)}</script>
</body>
</html>`;
  }
}
