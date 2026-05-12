import * as vscode from 'vscode';
import { UsageReader } from './usageReader';
import { HealthCheckService } from './healthCheck';
import { ExportService, ExportFormat } from './exportService';
import { getPaths } from './paths';
import {
  runInstall, runUninstall, runStatus, runStartTask, runStopTask, isWindows,
} from './installer';
import type { FilterOptions } from './types';

export class DashboardPanel {
  public static current: DashboardPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly reader: UsageReader;
  private readonly health: HealthCheckService;
  private readonly exporter: ExportService;
  private autoRefreshTimer?: NodeJS.Timeout;

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

    this.startAutoRefresh();
    void this.refresh();
  }

  private startAutoRefresh() {
    this.stopAutoRefresh();
    const cfg = vscode.workspace.getConfiguration('claudeUsageTracker');
    const sec = cfg.get<number>('autoRefreshSeconds') ?? 15;
    if (sec > 0) {
      this.autoRefreshTimer = setInterval(() => void this.refresh(), sec * 1000);
    }
  }

  private stopAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = undefined;
    }
  }

  dispose() {
    DashboardPanel.current = undefined;
    this.stopAutoRefresh();
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
        case 'runInstall':
          await runInstall(this.extensionUri);
          await this.refresh();
          return;
        case 'runUninstall':
          await runUninstall(this.extensionUri);
          await this.refresh();
          return;
        case 'runStatus':
          await runStatus(this.extensionUri);
          return;
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
      const today = new Date().toISOString().slice(0, 10);
      const overviewTotals = this.reader.totals({ ...filter, startDate: today, endDate: today });
      const allTotals = this.reader.totals(filter);

      const [health, daily, sessions, models, cacheByDay, distinctModels, distinctSources] = await Promise.all([
        this.health.run(),
        Promise.resolve(this.reader.daily(filter)),
        Promise.resolve(this.reader.sessions(filter)),
        Promise.resolve(this.reader.models(filter)),
        Promise.resolve(this.reader.cacheByDay(filter)),
        Promise.resolve(this.reader.distinctValues('model')),
        Promise.resolve(this.reader.distinctValues('query_source')),
      ]);

      this.panel.webview.postMessage({
        type: 'data',
        payload: {
          today,
          overview: { ...overviewTotals, lastEventAt: health.lastEventAt },
          allTotals,
          daily,
          sessions,
          models,
          cacheByDay,
          health,
          filterOptions: {
            models: distinctModels,
            sources: distinctSources,
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
  <div class="app">
    <header class="header">
      <div class="header-left">
        <div class="brand">
          <div class="brand-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3v18h18"/>
              <path d="m7 14 4-4 4 4 5-5"/>
            </svg>
          </div>
          <div class="brand-text">
            <h1>Claude Code Usage</h1>
            <p>Local-first dashboard for tokens, cost &amp; sessions</p>
          </div>
        </div>
      </div>
      <div class="header-right">
        <div class="status-pill" id="statusPill" data-state="unknown">
          <span class="dot"></span>
          <span class="status-text">Checking…</span>
        </div>
        <span class="updated muted" id="updated">—</span>
        <button class="btn btn-ghost icon-btn" id="refreshBtn" title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M3 21v-5h5"/>
          </svg>
        </button>
        <button class="btn btn-primary" id="setupBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Setup
        </button>
      </div>
    </header>

    <nav class="tabs" role="tablist">
      <button class="tab active" data-tab="overview">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
        Overview
      </button>
      <button class="tab" data-tab="daily">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
        Daily
      </button>
      <button class="tab" data-tab="sessions">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Sessions
      </button>
      <button class="tab" data-tab="models">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
        Models
      </button>
      <button class="tab" data-tab="cache">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
        Cache
      </button>
      <button class="tab" data-tab="health">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.5.5 0 0 1-.96 0L8.59 2.18a.5.5 0 0 0-.96 0L5.28 10.54A2 2 0 0 1 3.35 12H2"/></svg>
        Health
      </button>
    </nav>

    <section class="filters card-surface" id="filters">
      <div class="filter-group">
        <label class="field">
          <span>From</span>
          <input type="date" id="filterStart" />
        </label>
        <label class="field">
          <span>To</span>
          <input type="date" id="filterEnd" />
        </label>
        <label class="field">
          <span>Model</span>
          <select id="filterModel"><option value="">All models</option></select>
        </label>
        <label class="field">
          <span>Source</span>
          <select id="filterSource"><option value="">All sources</option></select>
        </label>
        <label class="field grow">
          <span>Search</span>
          <div class="input-with-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" id="filterSearch" placeholder="Session id, request id…" />
          </div>
        </label>
      </div>
      <div class="filter-actions">
        <button class="btn btn-ghost" id="clearFilter">Clear</button>
        <button class="btn btn-primary" id="applyFilter">Apply filters</button>
      </div>
    </section>

    <main id="panels">
      <!-- OVERVIEW -->
      <section class="panel active" data-panel="overview">
        <div class="kpis" id="overviewCards"></div>

        <div class="grid-2">
          <div class="card chart-card" id="dailyTrendCard">
            <div class="card-header">
              <div>
                <h3 class="card-title">Cost trend</h3>
                <p class="card-desc">Last 30 days, all models</p>
              </div>
              <div class="legend" id="dailyTrendLegend"></div>
            </div>
            <div class="card-body">
              <svg id="dailyTrendSvg" class="chart"></svg>
              <div class="empty" id="dailyTrendEmpty" hidden>
                <div class="empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                </div>
                <p>Not enough data yet for a trend chart.</p>
              </div>
            </div>
          </div>

          <div class="card chart-card" id="modelMixCard">
            <div class="card-header">
              <div>
                <h3 class="card-title">Model mix</h3>
                <p class="card-desc">Cost split across models</p>
              </div>
            </div>
            <div class="card-body donut-row">
              <svg id="modelDonutSvg" class="chart" viewBox="0 0 200 200"></svg>
              <ul class="donut-legend" id="modelDonutLegend"></ul>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Recent sessions</h3>
              <p class="card-desc">Top 5 by cost</p>
            </div>
            <button class="btn btn-link" data-goto-tab="sessions">View all →</button>
          </div>
          <div class="card-body table-wrap">
            <table class="data" id="recentSessionsTable">
              <thead><tr>
                <th>Session</th>
                <th class="num">Cost</th>
                <th>Models</th>
                <th class="num">Tokens (cached)</th>
                <th class="num">Requests</th>
                <th>Started</th>
              </tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <div class="hint">
          <strong>Total tokens (without cache)</strong> = input + output.
          <strong>Total tokens (with cache)</strong> = input + output + cache read + cache creation.
        </div>
      </section>

      <!-- DAILY -->
      <section class="panel" data-panel="daily">
        <div class="card chart-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Daily cost</h3>
              <p class="card-desc">USD per day in the selected range</p>
            </div>
            <div class="legend">
              <span class="legend-item"><span class="swatch" style="background:hsl(var(--chart-1))"></span>Cost</span>
            </div>
          </div>
          <div class="card-body">
            <svg id="dailyCostSvg" class="chart"></svg>
            <div class="empty" id="dailyChartEmpty" hidden>
              <div class="empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V9"/><path d="M15 17v-4"/></svg>
              </div>
              <p>No daily data for the selected filter.</p>
            </div>
          </div>
        </div>

        <div class="card chart-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Token mix per day</h3>
              <p class="card-desc">Stacked: input, output, cache read, cache creation</p>
            </div>
            <div class="legend" id="tokenMixLegend"></div>
          </div>
          <div class="card-body">
            <svg id="dailyTokensSvg" class="chart"></svg>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Daily breakdown</h3>
              <p class="card-desc">Cost &amp; tokens by date</p>
            </div>
            <div class="card-actions">
              <button class="btn btn-ghost" data-export="daily-jsonl">Export JSONL</button>
              <button class="btn btn-ghost" data-export="daily-csv">Export CSV</button>
            </div>
          </div>
          <div class="card-body table-wrap">
            <table class="data" id="dailyTable">
              <thead><tr>
                <th>Date</th>
                <th class="num">Cost</th>
                <th class="num">Input</th>
                <th class="num">Output</th>
                <th class="num">Cache read</th>
                <th class="num">Cache create</th>
                <th class="num">Total (no cache)</th>
                <th class="num">Total (with cache)</th>
                <th class="num">Sessions</th>
                <th class="num">Requests</th>
              </tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- SESSIONS -->
      <section class="panel" data-panel="sessions">
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Sessions</h3>
              <p class="card-desc" id="sessionsSubtitle">All sessions in the selected filter</p>
            </div>
            <div class="card-actions">
              <button class="btn btn-ghost" data-export="sessions-jsonl">Export JSONL</button>
              <button class="btn btn-ghost" data-export="sessions-csv">Export CSV</button>
            </div>
          </div>
          <div class="card-body table-wrap">
            <table class="data" id="sessionsTable">
              <thead><tr>
                <th>Session</th>
                <th>Started</th>
                <th>Ended</th>
                <th class="num">Duration</th>
                <th class="num">Cost</th>
                <th>Models</th>
                <th class="num">Input</th>
                <th class="num">Output</th>
                <th class="num">Cache read</th>
                <th class="num">Cache create</th>
                <th class="num">Total (cached)</th>
                <th class="num">Requests</th>
              </tr></thead>
              <tbody></tbody>
            </table>
            <div class="empty" id="sessionsEmpty" hidden>
              <div class="empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              </div>
              <p>No sessions match the current filter.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- MODELS -->
      <section class="panel" data-panel="models">
        <div class="grid-2">
          <div class="card chart-card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Cost by model</h3>
                <p class="card-desc">Share of estimated USD spend</p>
              </div>
            </div>
            <div class="card-body donut-row">
              <svg id="modelCostDonut" class="chart" viewBox="0 0 200 200"></svg>
              <ul class="donut-legend" id="modelCostLegend"></ul>
            </div>
          </div>
          <div class="card chart-card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Requests by model</h3>
                <p class="card-desc">Share of API calls</p>
              </div>
            </div>
            <div class="card-body donut-row">
              <svg id="modelRequestsDonut" class="chart" viewBox="0 0 200 200"></svg>
              <ul class="donut-legend" id="modelRequestsLegend"></ul>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Models breakdown</h3>
              <p class="card-desc">Per-model cost &amp; tokens</p>
            </div>
          </div>
          <div class="card-body table-wrap">
            <table class="data" id="modelsTable">
              <thead><tr>
                <th>Model</th>
                <th class="num">Cost</th>
                <th class="num">Input</th>
                <th class="num">Output</th>
                <th class="num">Cache read</th>
                <th class="num">Cache create</th>
                <th class="num">Total (no cache)</th>
                <th class="num">Total (cached)</th>
                <th class="num">Requests</th>
                <th class="num">Avg duration</th>
              </tr></thead>
              <tbody></tbody>
            </table>
            <div class="empty" id="modelsEmpty" hidden>
              <div class="empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>
              </div>
              <p>No model data yet.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- CACHE -->
      <section class="panel" data-panel="cache">
        <div class="kpis" id="cacheCards"></div>

        <div class="card chart-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Cache ratio over time</h3>
              <p class="card-desc">(read + creation) / total tokens, per day</p>
            </div>
          </div>
          <div class="card-body">
            <svg id="cacheRatioSvg" class="chart"></svg>
            <div class="empty" id="cacheChartEmpty" hidden>
              <div class="empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/></svg>
              </div>
              <p>No cache data yet.</p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Cache by day</h3>
              <p class="card-desc">Read vs creation, per day</p>
            </div>
          </div>
          <div class="card-body table-wrap">
            <table class="data" id="cacheTable">
              <thead><tr>
                <th>Date</th>
                <th class="num">Cache read</th>
                <th class="num">Cache creation</th>
                <th class="num">Total (cached)</th>
                <th class="num">Cache ratio</th>
              </tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <div class="hint">
          Cache read and cache creation tokens are counted separately from regular
          input/output tokens. They are usually billed differently — see Anthropic's
          prompt caching documentation.
        </div>
      </section>

      <!-- HEALTH -->
      <section class="panel" data-panel="health">
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Collector status</h3>
              <p class="card-desc">Local OTLP collector and data folder checks</p>
            </div>
            <div id="healthSummary"></div>
          </div>
          <div class="card-body">
            <div class="health-grid" id="healthBody"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Actions</h3>
              <p class="card-desc">Install, start/stop and inspect data</p>
            </div>
          </div>
          <div class="card-body action-grid">
            <button class="btn btn-primary" id="installBtn">Run setup / install</button>
            <button class="btn btn-secondary" id="startBtn">Start collector</button>
            <button class="btn btn-secondary" id="stopBtn">Stop collector</button>
            <button class="btn btn-secondary" id="statusBtn">Show status</button>
            <button class="btn btn-secondary" id="dataBtn">Open data folder</button>
            <button class="btn btn-secondary" id="exportsBtn">Open exports folder</button>
            <button class="btn btn-destructive-ghost" id="uninstallBtn">Uninstall</button>
          </div>
        </div>
      </section>
    </main>

    <div id="toast" class="toast" hidden></div>
  </div>

  <script nonce="${nonce}">${DASHBOARD_JS}</script>
</body>
</html>`;
  }
}

const DASHBOARD_CSS = `
:root {
  --radius: 0.5rem;
  --radius-sm: 0.375rem;
  --radius-lg: 0.75rem;

  --chart-1: 217 91% 60%;
  --chart-2: 142 76% 45%;
  --chart-3: 38 92% 50%;
  --chart-4: 271 81% 66%;
  --chart-5: 0 84% 60%;
  --chart-6: 188 95% 43%;
  --chart-7: 322 81% 58%;
  --chart-8: 173 80% 40%;
}

body.theme {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --accent: 210 40% 96%;
  --accent-foreground: 222 47% 11%;
  --primary: 222 47% 11%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222 47% 11%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 210 40% 98%;
  --border: 214 32% 91%;
  --input: 214 32% 91%;
  --ring: 222 47% 11%;
  --success: 142 71% 45%;
  --warning: 38 92% 50%;
  --info: 199 89% 48%;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06);
}

body.vscode-dark {
  --background: 224 71% 4%;
  --foreground: 213 31% 91%;
  --card: 224 47% 8%;
  --card-foreground: 213 31% 91%;
  --muted: 217 32% 14%;
  --muted-foreground: 215 20% 65%;
  --accent: 217 32% 17%;
  --accent-foreground: 213 31% 91%;
  --primary: 210 40% 98%;
  --primary-foreground: 222 47% 11%;
  --secondary: 217 32% 14%;
  --secondary-foreground: 213 31% 91%;
  --destructive: 0 63% 45%;
  --destructive-foreground: 210 40% 98%;
  --border: 217 32% 18%;
  --input: 217 32% 18%;
  --ring: 213 31% 91%;
  --success: 142 71% 45%;
  --warning: 38 92% 55%;
  --info: 199 89% 55%;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.4);
  --shadow: 0 4px 12px -2px rgb(0 0 0 / 0.4);
}

body.vscode-high-contrast {
  --border: 0 0% 50%;
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
}

body {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
               Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif,
               "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  font-size: 13px;
  line-height: 1.5;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  -webkit-font-smoothing: antialiased;
}

.app {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px 28px 48px;
}

.muted { color: hsl(var(--muted-foreground)); }

/* HEADER */
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.header-left { min-width: 0; }
.brand { display: flex; gap: 12px; align-items: center; }
.brand-icon {
  width: 40px; height: 40px;
  border-radius: var(--radius);
  background: linear-gradient(135deg, hsl(var(--chart-1) / 0.15), hsl(var(--chart-4) / 0.15));
  color: hsl(var(--chart-1));
  display: flex; align-items: center; justify-content: center;
  border: 1px solid hsl(var(--border));
}
.brand-icon svg { width: 22px; height: 22px; }
.brand-text h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.brand-text p { margin: 2px 0 0; font-size: 12px; color: hsl(var(--muted-foreground)); }

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.updated {
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 999px;
  background: hsl(var(--card));
  font-size: 11.5px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}
.status-pill .dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: hsl(var(--muted-foreground));
}
.status-pill[data-state="ok"] {
  color: hsl(var(--success));
  border-color: hsl(var(--success) / 0.3);
  background: hsl(var(--success) / 0.08);
}
.status-pill[data-state="ok"] .dot {
  background: hsl(var(--success));
  box-shadow: 0 0 0 3px hsl(var(--success) / 0.2);
  animation: pulse 2s infinite;
}
.status-pill[data-state="bad"] {
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.3);
  background: hsl(var(--destructive) / 0.08);
}
.status-pill[data-state="bad"] .dot { background: hsl(var(--destructive)); }

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px hsl(var(--success) / 0.2); }
  50%      { box-shadow: 0 0 0 5px hsl(var(--success) / 0.05); }
}

/* BUTTONS */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms, border-color 120ms, color 120ms, transform 80ms;
  user-select: none;
  white-space: nowrap;
}
.btn:hover { background: hsl(var(--accent)); }
.btn:active { transform: translateY(1px); }
.btn:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.btn svg { width: 14px; height: 14px; flex-shrink: 0; }

.btn-primary {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-color: hsl(var(--primary));
}
.btn-primary:hover { background: hsl(var(--primary) / 0.9); }

.btn-secondary {
  background: hsl(var(--secondary));
  color: hsl(var(--secondary-foreground));
  border-color: hsl(var(--border));
}
.btn-secondary:hover { background: hsl(var(--accent)); }

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: hsl(var(--muted-foreground));
}
.btn-ghost:hover {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

.btn-link {
  background: transparent;
  border-color: transparent;
  color: hsl(var(--foreground));
  height: auto;
  padding: 0;
  font-weight: 500;
}
.btn-link:hover { text-decoration: underline; background: transparent; }

.btn-destructive-ghost {
  background: transparent;
  border-color: transparent;
  color: hsl(var(--destructive));
}
.btn-destructive-ghost:hover {
  background: hsl(var(--destructive) / 0.1);
}

.icon-btn {
  width: 32px;
  padding: 0;
}

/* TABS */
.tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: hsl(var(--muted));
  border-radius: var(--radius-sm);
  margin-bottom: 16px;
  overflow-x: auto;
  max-width: 100%;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 120ms, color 120ms;
}
.tab svg { width: 14px; height: 14px; }
.tab:hover { color: hsl(var(--foreground)); }
.tab.active {
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  box-shadow: var(--shadow-sm);
}

/* FILTERS */
.card-surface {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}
.filters {
  padding: 14px 16px;
  margin-bottom: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  justify-content: space-between;
}
.filter-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}
.filter-actions {
  display: flex;
  gap: 8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 130px;
}
.field.grow { flex: 1; min-width: 200px; }
.field > span {
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
input[type=date], input[type=search], input[type=text], select {
  height: 32px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: inherit;
  font-size: 12.5px;
  transition: border-color 120ms, box-shadow 120ms;
}
input:focus, select:focus {
  outline: none;
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 3px hsl(var(--ring) / 0.15);
}
.input-with-icon {
  position: relative;
}
.input-with-icon svg {
  position: absolute;
  left: 9px; top: 50%;
  transform: translateY(-50%);
  width: 14px; height: 14px;
  color: hsl(var(--muted-foreground));
  pointer-events: none;
}
.input-with-icon input {
  padding-left: 32px;
  width: 100%;
}

/* PANELS */
.panel { display: none; }
.panel.active { display: block; animation: fadeIn 200ms ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* KPIs */
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.kpi {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 16px;
  position: relative;
  transition: border-color 150ms, transform 150ms;
}
.kpi:hover {
  border-color: hsl(var(--ring) / 0.4);
}
.kpi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.kpi-label {
  font-size: 11.5px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}
.kpi-icon {
  width: 28px; height: 28px;
  border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}
.kpi-icon svg { width: 14px; height: 14px; }
.kpi-value {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.kpi-sub {
  margin-top: 4px;
  font-size: 11.5px;
  color: hsl(var(--muted-foreground));
  display: flex;
  align-items: center;
  gap: 4px;
}
.kpi.accent-1 .kpi-icon { color: hsl(var(--chart-1)); background: hsl(var(--chart-1) / 0.12); }
.kpi.accent-2 .kpi-icon { color: hsl(var(--chart-2)); background: hsl(var(--chart-2) / 0.12); }
.kpi.accent-3 .kpi-icon { color: hsl(var(--chart-3)); background: hsl(var(--chart-3) / 0.12); }
.kpi.accent-4 .kpi-icon { color: hsl(var(--chart-4)); background: hsl(var(--chart-4) / 0.12); }
.kpi.accent-5 .kpi-icon { color: hsl(var(--chart-5)); background: hsl(var(--chart-5) / 0.12); }

/* CARDS */
.card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  margin-bottom: 16px;
  overflow: hidden;
}
.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid hsl(var(--border));
  flex-wrap: wrap;
}
.card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.card-desc { margin: 2px 0 0; font-size: 12px; color: hsl(var(--muted-foreground)); }
.card-actions { display: flex; gap: 6px; }
.card-body { padding: 16px; }
.chart-card .card-body { padding: 12px 16px 16px; }

.grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
  margin-bottom: 0;
}
.grid-2 > .card { margin-bottom: 16px; }

/* CHART */
.chart {
  width: 100%;
  height: 240px;
  display: block;
  overflow: visible;
}
.chart text {
  font-size: 10.5px;
  fill: hsl(var(--muted-foreground));
}
.chart .grid-line {
  stroke: hsl(var(--border));
  stroke-dasharray: 3 3;
  stroke-width: 1;
}
.chart .axis-line {
  stroke: hsl(var(--border));
  stroke-width: 1;
}
.chart .point { transition: r 120ms; }
.chart .point:hover { r: 5; }

.donut-row {
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
}
.donut-row .chart {
  width: 200px;
  height: 200px;
  flex-shrink: 0;
}
.donut-legend {
  list-style: none;
  margin: 0; padding: 0;
  flex: 1;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.donut-legend li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}
.donut-legend .label { display: flex; align-items: center; gap: 8px; min-width: 0; }
.donut-legend .label-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.donut-legend .swatch {
  width: 10px; height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}
.donut-legend .value {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--muted-foreground));
}
.donut-center {
  font-size: 14px;
  font-weight: 600;
}

.legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: hsl(var(--muted-foreground));
}
.legend-item .swatch {
  width: 10px; height: 10px;
  border-radius: 3px;
}

/* TABLE */
.table-wrap {
  overflow-x: auto;
  padding: 0;
}
table.data {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}
table.data th, table.data td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid hsl(var(--border));
  white-space: nowrap;
}
table.data th {
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: hsl(var(--muted) / 0.5);
  position: sticky;
  top: 0;
}
table.data th.num, table.data td.num { text-align: right; }
table.data tbody tr { transition: background 120ms; }
table.data tbody tr:hover { background: hsl(var(--accent) / 0.5); }
table.data tbody tr:last-child td { border-bottom: 0; }
.session-id {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: hsl(var(--muted-foreground));
}
.bar-cell {
  position: relative;
}
.bar-cell .bar {
  position: absolute;
  left: 0; right: 0; bottom: 0; height: 2px;
  background: hsl(var(--chart-1) / 0.7);
}

/* HEALTH */
.health-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
@media (min-width: 640px) {
  .health-grid { grid-template-columns: 1fr 1fr; }
}
.health-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: hsl(var(--muted) / 0.5);
  border-radius: var(--radius-sm);
  font-size: 12.5px;
}
.health-key { color: hsl(var(--muted-foreground)); }
.health-value {
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
}
.badge.ok {
  background: hsl(var(--success) / 0.12);
  color: hsl(var(--success));
  border-color: hsl(var(--success) / 0.25);
}
.badge.bad {
  background: hsl(var(--destructive) / 0.12);
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.25);
}
.badge .dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

/* HINT */
.hint {
  background: hsl(var(--muted) / 0.6);
  border-left: 3px solid hsl(var(--info));
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-top: 8px;
}
.hint strong { color: hsl(var(--foreground)); font-weight: 500; }

/* EMPTY */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 36px 20px;
  text-align: center;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}
.empty p { margin: 0; }
.empty-icon {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: hsl(var(--muted));
  display: flex; align-items: center; justify-content: center;
}
.empty-icon svg { width: 22px; height: 22px; }

/* TOAST */
.toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--destructive) / 0.4);
  color: hsl(var(--destructive));
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 12.5px;
  max-width: 380px;
  box-shadow: var(--shadow);
  animation: slideUp 200ms ease-out;
}
@keyframes slideUp {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: none; opacity: 1; }
}

/* SVG GRADIENT for area chart */
.chart-gradient-stop-start { stop-color: hsl(var(--chart-1)); stop-opacity: 0.3; }
.chart-gradient-stop-end   { stop-color: hsl(var(--chart-1)); stop-opacity: 0.0; }

/* TOOLTIP */
.svg-tooltip {
  pointer-events: none;
}
.svg-tooltip rect {
  fill: hsl(var(--card));
  stroke: hsl(var(--border));
  rx: 6;
}
.svg-tooltip text { fill: hsl(var(--foreground)); }
.svg-tooltip .label { fill: hsl(var(--muted-foreground)); font-size: 10px; }
`;

const DASHBOARD_JS = `
const vscode = acquireVsCodeApi();
const SVG_NS = 'http://www.w3.org/2000/svg';

const fmt = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (typeof n !== 'number') return String(n);
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
const fmtFull = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (typeof n !== 'number') return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
};
const fmtCost = (n) => '$' + (n || 0).toFixed(4);
const fmtCostShort = (n) => {
  const v = n || 0;
  if (v >= 100) return '$' + v.toFixed(0);
  if (v >= 1)   return '$' + v.toFixed(2);
  return '$' + v.toFixed(4);
};
const fmtMs = (n) => {
  if (!n) return '—';
  if (n < 1000) return n.toFixed(0) + ' ms';
  if (n < 60_000) return (n / 1000).toFixed(1) + ' s';
  return (n / 60_000).toFixed(1) + ' min';
};
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
const fmtPct = (r) => (r * 100).toFixed(1) + '%';
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const CHART_VARS = ['--chart-1','--chart-2','--chart-3','--chart-4','--chart-5','--chart-6','--chart-7','--chart-8'];
const colorFor = (i) => 'hsl(var(' + CHART_VARS[i % CHART_VARS.length] + '))';

let lastData = null;

/* ----- ICONS ----- */
const ICONS = {
  dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  q:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

/* ----- TABS ----- */
function activeTab() {
  const el = document.querySelector('.tab.active');
  return el ? el.getAttribute('data-tab') : 'overview';
}
function setActiveTab(tab) {
  document.querySelectorAll('.tab').forEach(el =>
    el.classList.toggle('active', el.getAttribute('data-tab') === tab));
  document.querySelectorAll('.panel').forEach(el =>
    el.classList.toggle('active', el.getAttribute('data-panel') === tab));
  if (lastData) requestAnimationFrame(() => render(lastData));
}
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => setActiveTab(t.getAttribute('data-tab')));
});
document.querySelectorAll('[data-goto-tab]').forEach(b => {
  b.addEventListener('click', () => setActiveTab(b.getAttribute('data-goto-tab')));
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (lastData) render(lastData);
  }, 120);
});

/* ----- FILTERS ----- */
function readFilter() {
  const f = {};
  const s = document.getElementById('filterStart').value;
  const e = document.getElementById('filterEnd').value;
  const m = document.getElementById('filterModel').value;
  const src = document.getElementById('filterSource').value;
  const q = document.getElementById('filterSearch').value;
  if (s) f.startDate = s;
  if (e) f.endDate = e;
  if (m) f.model = m;
  if (src) f.querySource = src;
  if (q) f.search = q;
  return f;
}
function refresh() {
  vscode.postMessage({ type: 'refresh', payload: { filter: readFilter() } });
}

document.getElementById('refreshBtn').addEventListener('click', refresh);
document.getElementById('applyFilter').addEventListener('click', refresh);
document.getElementById('clearFilter').addEventListener('click', () => {
  for (const id of ['filterStart','filterEnd','filterSearch']) document.getElementById(id).value = '';
  document.getElementById('filterModel').value = '';
  document.getElementById('filterSource').value = '';
  refresh();
});
document.getElementById('setupBtn').addEventListener('click', () => {
  vscode.postMessage({ type: 'runInstall' });
});

/* health-tab buttons */
document.getElementById('installBtn').addEventListener('click', () => vscode.postMessage({ type: 'runInstall' }));
document.getElementById('startBtn').addEventListener('click', () => vscode.postMessage({ type: 'startCollector' }));
document.getElementById('stopBtn').addEventListener('click', () => vscode.postMessage({ type: 'stopCollector' }));
document.getElementById('statusBtn').addEventListener('click', () => vscode.postMessage({ type: 'runStatus' }));
document.getElementById('dataBtn').addEventListener('click', () => vscode.postMessage({ type: 'openDataFolder' }));
document.getElementById('exportsBtn').addEventListener('click', () => vscode.postMessage({ type: 'openExports' }));
document.getElementById('uninstallBtn').addEventListener('click', () => vscode.postMessage({ type: 'runUninstall' }));

/* exports */
document.querySelectorAll('button[data-export]').forEach(btn => {
  btn.addEventListener('click', () => {
    const [scope, format] = btn.getAttribute('data-export').split('-');
    vscode.postMessage({
      type: 'export',
      payload: { filter: readFilter(), format, label: scope },
    });
  });
});

/* enter key in filters triggers apply */
document.getElementById('filters').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') refresh();
});

/* ----- MESSAGES ----- */
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'data') {
    lastData = msg.payload;
    render(msg.payload);
    document.getElementById('toast').hidden = true;
  } else if (msg.type === 'error') {
    const t = document.getElementById('toast');
    t.textContent = msg.payload.message;
    t.hidden = false;
    setTimeout(() => { t.hidden = true; }, 6000);
  }
});

/* ----- RENDER ----- */
function render(d) {
  document.getElementById('updated').textContent = 'Updated ' + fmtTime(d.updatedAt);

  const pill = document.getElementById('statusPill');
  if (d.health.collectorRunning) {
    pill.dataset.state = 'ok';
    pill.querySelector('.status-text').textContent = 'Collector running';
  } else {
    pill.dataset.state = 'bad';
    pill.querySelector('.status-text').textContent = 'Collector down';
  }

  // filter selects (preserve user choices)
  const ms = document.getElementById('filterModel');
  const ss = document.getElementById('filterSource');
  const cur = { m: ms.value, s: ss.value };
  ms.innerHTML = '<option value="">All models</option>' +
    d.filterOptions.models.map(m => '<option>' + escapeHtml(m) + '</option>').join('');
  ss.innerHTML = '<option value="">All sources</option>' +
    d.filterOptions.sources.map(s => '<option>' + escapeHtml(s) + '</option>').join('');
  ms.value = cur.m;
  ss.value = cur.s;

  renderOverview(d);
  renderDaily(d);
  renderSessions(d);
  renderModels(d);
  renderCache(d);
  renderHealth(d);
}

function kpi(opts) {
  const sub = opts.sub ? '<div class="kpi-sub">' + opts.sub + '</div>' : '';
  const icon = opts.icon ? '<div class="kpi-icon">' + opts.icon + '</div>' : '';
  return (
    '<div class="kpi ' + (opts.accent || '') + '">' +
      '<div class="kpi-header">' +
        '<div class="kpi-label">' + opts.label + '</div>' +
        icon +
      '</div>' +
      '<div class="kpi-value" title="' + (opts.title || '') + '">' + opts.value + '</div>' +
      sub +
    '</div>'
  );
}

/* ----- OVERVIEW ----- */
function renderOverview(d) {
  const t = d.overview;
  const all = d.allTotals;
  const wrap = document.getElementById('overviewCards');

  const cacheRatio = t.totalTokensWithCache > 0
    ? (t.cacheReadTokens + t.cacheCreationTokens) / t.totalTokensWithCache
    : 0;

  wrap.innerHTML = [
    kpi({
      label: 'Today\\'s cost',
      value: fmtCostShort(t.cost),
      title: fmtCost(t.cost),
      sub: 'across ' + fmt(t.requests) + ' requests',
      icon: ICONS.dollar,
      accent: 'accent-2',
    }),
    kpi({
      label: 'Tokens today',
      value: fmt(t.totalTokensWithCache),
      title: t.totalTokensWithCache + ' tokens (with cache)',
      sub: fmt(t.inputTokens) + ' in · ' + fmt(t.outputTokens) + ' out',
      icon: ICONS.layers,
      accent: 'accent-1',
    }),
    kpi({
      label: 'Cache ratio (today)',
      value: t.totalTokensWithCache ? fmtPct(cacheRatio) : '—',
      sub: fmt(t.cacheReadTokens) + ' read · ' + fmt(t.cacheCreationTokens) + ' create',
      icon: ICONS.database,
      accent: 'accent-3',
    }),
    kpi({
      label: 'Range total',
      value: fmtCostShort(all.cost),
      title: fmtCost(all.cost),
      sub: fmt(all.requests) + ' requests · ' + fmt(all.totalTokensWithCache) + ' tokens',
      icon: ICONS.hash,
      accent: 'accent-4',
    }),
  ].join('');

  // daily trend: cost
  const trendData = d.daily.slice(-30);
  const trendEmpty = document.getElementById('dailyTrendEmpty');
  const trendSvg = document.getElementById('dailyTrendSvg');
  if (trendData.length < 2) {
    trendEmpty.hidden = false;
    trendSvg.style.display = 'none';
  } else {
    trendEmpty.hidden = true;
    trendSvg.style.display = '';
    drawAreaChart(trendSvg, trendData, r => r.cost, r => fmtDate(r.date), {
      valueFmt: fmtCost,
      colorVar: '--chart-2',
    });
  }

  // model donut (overview)
  const topModels = d.models.slice(0, 8);
  drawDonutChart(
    document.getElementById('modelDonutSvg'),
    document.getElementById('modelDonutLegend'),
    topModels,
    m => m.cost,
    m => m.model,
    fmtCostShort,
  );

  // recent sessions
  const tbody = document.querySelector('#recentSessionsTable tbody');
  const top = (d.sessions || []).slice(0, 5);
  if (top.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="empty-icon">' + ICONS.q + '</div><p>No sessions yet.</p></div></td></tr>';
  } else {
    tbody.innerHTML = top.map(s => (
      '<tr>' +
        '<td><span class="session-id">' + escapeHtml((s.sessionId || '').slice(0, 8)) + '…</span></td>' +
        '<td class="num">' + fmtCost(s.cost) + '</td>' +
        '<td>' + escapeHtml((s.models || []).join(', ')) + '</td>' +
        '<td class="num">' + fmt(s.totalTokensWithCache) + '</td>' +
        '<td class="num">' + fmt(s.requests) + '</td>' +
        '<td>' + fmtTime(s.startTime) + '</td>' +
      '</tr>'
    )).join('');
  }
}

/* ----- DAILY ----- */
function renderDaily(d) {
  const tbody = document.querySelector('#dailyTable tbody');
  const empty = document.getElementById('dailyChartEmpty');
  const costSvg = document.getElementById('dailyCostSvg');
  const tokensSvg = document.getElementById('dailyTokensSvg');

  if (!d.daily.length) {
    empty.hidden = false;
    costSvg.style.display = 'none';
    tokensSvg.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty"><div class="empty-icon">' + ICONS.q + '</div><p>No daily data for the selected filter.</p></div></td></tr>';
    document.getElementById('tokenMixLegend').innerHTML = '';
    return;
  }
  empty.hidden = true;
  costSvg.style.display = '';

  drawAreaChart(costSvg, d.daily, r => r.cost, r => fmtDate(r.date), {
    valueFmt: fmtCost,
    colorVar: '--chart-1',
  });

  const tokenSeries = [
    { key: 'inputTokens',          label: 'Input',         colorVar: '--chart-1' },
    { key: 'outputTokens',         label: 'Output',        colorVar: '--chart-2' },
    { key: 'cacheReadTokens',      label: 'Cache read',    colorVar: '--chart-3' },
    { key: 'cacheCreationTokens',  label: 'Cache create',  colorVar: '--chart-4' },
  ];
  drawStackedBars(tokensSvg, d.daily, tokenSeries, r => fmtDate(r.date), {
    valueFmt: fmt,
  });
  document.getElementById('tokenMixLegend').innerHTML =
    tokenSeries.map(s =>
      '<span class="legend-item"><span class="swatch" style="background:hsl(var(' + s.colorVar + '))"></span>' + s.label + '</span>'
    ).join('');

  const max = Math.max(1, ...d.daily.map(r => r.cost));
  tbody.innerHTML = d.daily.map(r => {
    const pct = (r.cost / max) * 100;
    return (
      '<tr>' +
        '<td>' + escapeHtml(r.date) + '</td>' +
        '<td class="num bar-cell">' + fmtCost(r.cost) +
          '<span class="bar" style="width:' + pct + '%"></span>' +
        '</td>' +
        '<td class="num">' + fmt(r.inputTokens) + '</td>' +
        '<td class="num">' + fmt(r.outputTokens) + '</td>' +
        '<td class="num">' + fmt(r.cacheReadTokens) + '</td>' +
        '<td class="num">' + fmt(r.cacheCreationTokens) + '</td>' +
        '<td class="num">' + fmt(r.totalTokensWithoutCache) + '</td>' +
        '<td class="num">' + fmt(r.totalTokensWithCache) + '</td>' +
        '<td class="num">' + fmt(r.sessions) + '</td>' +
        '<td class="num">' + fmt(r.requests) + '</td>' +
      '</tr>'
    );
  }).join('');
}

/* ----- SESSIONS ----- */
function renderSessions(d) {
  const tbody = document.querySelector('#sessionsTable tbody');
  const empty = document.getElementById('sessionsEmpty');
  const subtitle = document.getElementById('sessionsSubtitle');

  if (!d.sessions.length) {
    empty.hidden = false;
    tbody.innerHTML = '';
    subtitle.textContent = 'No sessions in the selected filter';
    return;
  }
  empty.hidden = true;
  subtitle.textContent = d.sessions.length + ' session' + (d.sessions.length === 1 ? '' : 's') + ' in the selected filter';

  tbody.innerHTML = d.sessions.map(s => (
    '<tr>' +
      '<td><span class="session-id" title="' + escapeHtml(s.workspace || s.sessionId || '') + '">' +
        escapeHtml((s.sessionId || '').slice(0, 8)) + '…</span></td>' +
      '<td>' + fmtTime(s.startTime) + '</td>' +
      '<td>' + fmtTime(s.endTime) + '</td>' +
      '<td class="num">' + fmtMs(s.durationMs) + '</td>' +
      '<td class="num">' + fmtCost(s.cost) + '</td>' +
      '<td>' + escapeHtml((s.models || []).join(', ')) + '</td>' +
      '<td class="num">' + fmt(s.inputTokens) + '</td>' +
      '<td class="num">' + fmt(s.outputTokens) + '</td>' +
      '<td class="num">' + fmt(s.cacheReadTokens) + '</td>' +
      '<td class="num">' + fmt(s.cacheCreationTokens) + '</td>' +
      '<td class="num">' + fmt(s.totalTokensWithCache) + '</td>' +
      '<td class="num">' + fmt(s.requests) + '</td>' +
    '</tr>'
  )).join('');
}

/* ----- MODELS ----- */
function renderModels(d) {
  const tbody = document.querySelector('#modelsTable tbody');
  const empty = document.getElementById('modelsEmpty');

  if (!d.models.length) {
    empty.hidden = false;
    tbody.innerHTML = '';
    drawDonutChart(document.getElementById('modelCostDonut'), document.getElementById('modelCostLegend'), [], () => 0, () => '', () => '');
    drawDonutChart(document.getElementById('modelRequestsDonut'), document.getElementById('modelRequestsLegend'), [], () => 0, () => '', () => '');
    return;
  }
  empty.hidden = true;

  drawDonutChart(
    document.getElementById('modelCostDonut'),
    document.getElementById('modelCostLegend'),
    d.models, m => m.cost, m => m.model, fmtCostShort,
  );
  drawDonutChart(
    document.getElementById('modelRequestsDonut'),
    document.getElementById('modelRequestsLegend'),
    d.models, m => m.requests, m => m.model, fmt,
  );

  const max = Math.max(1, ...d.models.map(m => m.cost));
  tbody.innerHTML = d.models.map(m => {
    const pct = (m.cost / max) * 100;
    return (
      '<tr>' +
        '<td>' + escapeHtml(m.model) + '</td>' +
        '<td class="num bar-cell">' + fmtCost(m.cost) +
          '<span class="bar" style="width:' + pct + '%"></span>' +
        '</td>' +
        '<td class="num">' + fmt(m.inputTokens) + '</td>' +
        '<td class="num">' + fmt(m.outputTokens) + '</td>' +
        '<td class="num">' + fmt(m.cacheReadTokens) + '</td>' +
        '<td class="num">' + fmt(m.cacheCreationTokens) + '</td>' +
        '<td class="num">' + fmt(m.totalTokensWithoutCache) + '</td>' +
        '<td class="num">' + fmt(m.totalTokensWithCache) + '</td>' +
        '<td class="num">' + fmt(m.requests) + '</td>' +
        '<td class="num">' + (m.averageDurationMs ? fmtMs(m.averageDurationMs) : '—') + '</td>' +
      '</tr>'
    );
  }).join('');
}

/* ----- CACHE ----- */
function renderCache(d) {
  const tbody = document.querySelector('#cacheTable tbody');
  const empty = document.getElementById('cacheChartEmpty');
  const cards = document.getElementById('cacheCards');
  const svg = document.getElementById('cacheRatioSvg');

  const totals = (d.cacheByDay || []).reduce((acc, r) => {
    acc.read += r.cacheReadTokens;
    acc.create += r.cacheCreationTokens;
    acc.total += r.totalTokensWithCache;
    return acc;
  }, { read: 0, create: 0, total: 0 });

  cards.innerHTML = [
    kpi({
      label: 'Cache read',
      value: fmt(totals.read),
      title: totals.read + ' tokens',
      sub: 'tokens served from cache',
      icon: ICONS.arrowDown,
      accent: 'accent-3',
    }),
    kpi({
      label: 'Cache creation',
      value: fmt(totals.create),
      title: totals.create + ' tokens',
      sub: 'tokens written to cache',
      icon: ICONS.arrowUp,
      accent: 'accent-5',
    }),
    kpi({
      label: 'Cache ratio',
      value: totals.total ? fmtPct((totals.read + totals.create) / totals.total) : '—',
      sub: '(read + create) / total tokens',
      icon: ICONS.database,
      accent: 'accent-4',
    }),
  ].join('');

  if (!d.cacheByDay.length) {
    empty.hidden = false;
    svg.style.display = 'none';
    tbody.innerHTML = '';
    return;
  }
  empty.hidden = true;
  svg.style.display = '';

  drawAreaChart(svg, d.cacheByDay, r => r.cacheRatio, r => fmtDate(r.date), {
    valueFmt: fmtPct,
    colorVar: '--chart-3',
    yMax: 1,
    yMin: 0,
  });

  tbody.innerHTML = d.cacheByDay.map(r => (
    '<tr>' +
      '<td>' + escapeHtml(r.date) + '</td>' +
      '<td class="num">' + fmt(r.cacheReadTokens) + '</td>' +
      '<td class="num">' + fmt(r.cacheCreationTokens) + '</td>' +
      '<td class="num">' + fmt(r.totalTokensWithCache) + '</td>' +
      '<td class="num">' + fmtPct(r.cacheRatio) + '</td>' +
    '</tr>'
  )).join('');
}

/* ----- HEALTH ----- */
function renderHealth(d) {
  const h = d.health;
  const okBadge = (label) => '<span class="badge ok"><span class="dot"></span>' + label + '</span>';
  const badBadge = (label) => '<span class="badge bad"><span class="dot"></span>' + label + '</span>';
  const unkBadge = '<span class="badge"><span class="dot"></span>unknown</span>';
  const yn = (b) => b ? okBadge('yes') : badBadge('no');

  const summary = h.collectorRunning
    ? '<span class="badge ok"><span class="dot"></span>Healthy</span>'
    : '<span class="badge bad"><span class="dot"></span>Issues found</span>';
  document.getElementById('healthSummary').innerHTML = summary;

  const rows = [
    ['Collector running',                    yn(h.collectorRunning)],
    ['Collector responding (HTTP)',          yn(h.collectorRespondedHttp)],
    ['Endpoint',                             '<span class="health-value">' + escapeHtml(h.endpoint) + '</span>'],
    ['Data root exists',                     yn(h.rootDirExists)],
    ['Raw folder exists',                    yn(h.rawDirExists)],
    ['Usage folder exists',                  yn(h.usageDirExists)],
    ['New records being written (10m)',      yn(h.newRecordsBeingWritten)],
    ['Last received event',                  '<span class="health-value">' + fmtTime(h.lastEventAt) + '</span>'],
    ['Last usage record',                    '<span class="health-value">' + fmtTime(h.lastUsageAt) + '</span>'],
    ['Telemetry env configured',             yn(h.telemetryEnvConfigured)],
    ['Scheduled task registered',            h.scheduledTaskRegistered === null ? unkBadge : yn(h.scheduledTaskRegistered)],
    ['Has any usage records',                yn(h.hasUsageRecords)],
    ['OTLP requests received',               '<span class="health-value">' + fmt(h.totalRequests) + '</span>'],
    ['OTLP log payloads received',           '<span class="health-value">' + fmt(h.totalLogPayloads) + '</span>'],
    ['Usage records written',                '<span class="health-value">' + fmt(h.totalUsageRecords) + '</span>'],
  ];

  const errs = (h.errors && h.errors.length)
    ? '<div class="hint" style="border-left-color:hsl(var(--destructive)); margin-top:12px"><strong>Errors:</strong><ul>' +
        h.errors.map(e => '<li>' + escapeHtml(e) + '</li>').join('') +
      '</ul></div>'
    : '';
  const notes = (h.notes && h.notes.length)
    ? '<div class="hint" style="margin-top:12px"><strong>Notes:</strong><ul>' +
        h.notes.map(e => '<li>' + escapeHtml(e) + '</li>').join('') +
      '</ul></div>'
    : '';

  document.getElementById('healthBody').innerHTML =
    rows.map(([k, v]) =>
      '<div class="health-row"><span class="health-key">' + escapeHtml(k) + '</span><span class="health-value">' + v + '</span></div>'
    ).join('') + errs + notes;
}

/* =====================================================================
 *  CHART PRIMITIVES
 * ==================================================================== */

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function niceTicks(min, max, count) {
  const range = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(range / count)));
  const err = (count / range) * step;
  const niceStep =
    err <= 0.15 ? step * 10 :
    err <= 0.35 ? step * 5  :
    err <= 0.75 ? step * 2  :
    step;
  const start = Math.floor(min / niceStep) * niceStep;
  const end   = Math.ceil(max / niceStep) * niceStep;
  const ticks = [];
  for (let v = start; v <= end + niceStep / 2; v += niceStep) ticks.push(+v.toFixed(10));
  return ticks;
}

/**
 * Area / line chart with smooth gradient fill.
 */
function drawAreaChart(svg, data, getValue, getLabel, opts) {
  if (!svg) return;
  clearSvg(svg);
  if (!data || data.length === 0) return;

  const W = Math.max(280, Math.round(svg.getBoundingClientRect().width || 800));
  const H = 240;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const margin = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const values = data.map(getValue);
  let yMin = opts.yMin !== undefined ? opts.yMin : Math.min(0, ...values);
  let yMax = opts.yMax !== undefined ? opts.yMax : Math.max(...values, 0.0001);
  if (yMin === yMax) yMax = yMin + 1;

  const ticks = niceTicks(yMin, yMax, 4);
  yMin = ticks[0];
  yMax = ticks[ticks.length - 1];

  const x = (i) => margin.left + (data.length === 1 ? innerW / 2 : (innerW / (data.length - 1)) * i);
  const y = (v) => margin.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const gradId = 'grad-' + Math.random().toString(36).slice(2);
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(svgEl('stop', { offset: '0%',  'stop-color': 'hsl(var(' + opts.colorVar + '))', 'stop-opacity': '0.35' }));
  grad.appendChild(svgEl('stop', { offset: '100%','stop-color': 'hsl(var(' + opts.colorVar + '))', 'stop-opacity': '0' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // grid + y-axis labels
  const gridG = svgEl('g');
  ticks.forEach(t => {
    const yy = y(t);
    gridG.appendChild(svgEl('line', { x1: margin.left, y1: yy, x2: margin.left + innerW, y2: yy, class: 'grid-line' }));
    const text = svgEl('text', { x: margin.left - 8, y: yy + 3, 'text-anchor': 'end' });
    text.textContent = opts.valueFmt(t);
    gridG.appendChild(text);
  });
  svg.appendChild(gridG);

  // x-axis labels (sample)
  const labelStep = Math.ceil(data.length / 8);
  const xLabelG = svgEl('g');
  data.forEach((d, i) => {
    if (i % labelStep !== 0 && i !== data.length - 1) return;
    const text = svgEl('text', { x: x(i), y: margin.top + innerH + 18, 'text-anchor': 'middle' });
    text.textContent = getLabel(d, i);
    xLabelG.appendChild(text);
  });
  svg.appendChild(xLabelG);

  // area path
  const areaPts = data.map((d, i) => x(i) + ',' + y(values[i])).join(' L ');
  const baselineY = y(Math.max(yMin, 0));
  const areaD = 'M ' + x(0) + ',' + baselineY + ' L ' + areaPts + ' L ' + x(data.length - 1) + ',' + baselineY + ' Z';
  svg.appendChild(svgEl('path', { d: areaD, fill: 'url(#' + gradId + ')' }));

  // line
  svg.appendChild(svgEl('polyline', {
    points: data.map((d, i) => x(i) + ',' + y(values[i])).join(' '),
    fill: 'none',
    stroke: 'hsl(var(' + opts.colorVar + '))',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }));

  // points + tooltip-on-hover invisible bands
  const tipG = svgEl('g', { class: 'svg-tooltip' });
  tipG.style.display = 'none';
  const tipRect = svgEl('rect', { width: 130, height: 38, fill: 'hsl(var(--card))', stroke: 'hsl(var(--border))', rx: 6 });
  const tipLabel = svgEl('text', { x: 8, y: 14, class: 'label' });
  const tipValue = svgEl('text', { x: 8, y: 30, 'font-weight': '600', 'font-size': '12' });
  tipG.appendChild(tipRect); tipG.appendChild(tipLabel); tipG.appendChild(tipValue);

  data.forEach((d, i) => {
    svg.appendChild(svgEl('circle', {
      cx: x(i), cy: y(values[i]), r: 3.5,
      fill: 'hsl(var(--background))',
      stroke: 'hsl(var(' + opts.colorVar + '))',
      'stroke-width': 1.8,
      class: 'point',
    }));
  });

  // hover bands
  const hoverG = svgEl('g');
  data.forEach((d, i) => {
    const bandX = i === 0 ? margin.left : (x(i - 1) + x(i)) / 2;
    const bandEnd = i === data.length - 1 ? margin.left + innerW : (x(i) + x(i + 1)) / 2;
    const hit = svgEl('rect', {
      x: bandX, y: margin.top, width: Math.max(0, bandEnd - bandX), height: innerH,
      fill: 'transparent',
    });
    hit.addEventListener('mouseenter', () => {
      tipG.style.display = '';
      tipLabel.textContent = getLabel(d, i);
      tipValue.textContent = opts.valueFmt(values[i]);
      const tx = Math.min(W - 138, Math.max(margin.left, x(i) - 65));
      const ty = Math.max(margin.top, y(values[i]) - 50);
      tipG.setAttribute('transform', 'translate(' + tx + ',' + ty + ')');
    });
    hit.addEventListener('mouseleave', () => { tipG.style.display = 'none'; });
    hoverG.appendChild(hit);
  });
  svg.appendChild(hoverG);
  svg.appendChild(tipG);
}

/**
 * Stacked bar chart for token mix.
 * series: [{ key, label, colorVar }]
 */
function drawStackedBars(svg, data, series, getLabel, opts) {
  if (!svg) return;
  clearSvg(svg);
  if (!data || data.length === 0) return;

  const W = Math.max(280, Math.round(svg.getBoundingClientRect().width || 800));
  const H = 240;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const margin = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const totals = data.map(d => series.reduce((s, sr) => s + (d[sr.key] || 0), 0));
  let yMax = Math.max(...totals, 1);
  const ticks = niceTicks(0, yMax, 4);
  yMax = ticks[ticks.length - 1];

  const bandW = innerW / data.length;
  const barW = Math.max(2, bandW * 0.6);

  const y = (v) => margin.top + innerH - (v / yMax) * innerH;

  // grid
  const gridG = svgEl('g');
  ticks.forEach(t => {
    const yy = y(t);
    gridG.appendChild(svgEl('line', { x1: margin.left, y1: yy, x2: margin.left + innerW, y2: yy, class: 'grid-line' }));
    const text = svgEl('text', { x: margin.left - 8, y: yy + 3, 'text-anchor': 'end' });
    text.textContent = opts.valueFmt(t);
    gridG.appendChild(text);
  });
  svg.appendChild(gridG);

  // x labels
  const labelStep = Math.ceil(data.length / 10);
  const xLabelG = svgEl('g');
  data.forEach((d, i) => {
    if (i % labelStep !== 0 && i !== data.length - 1) return;
    const cx = margin.left + i * bandW + bandW / 2;
    const text = svgEl('text', { x: cx, y: margin.top + innerH + 18, 'text-anchor': 'middle' });
    text.textContent = getLabel(d, i);
    xLabelG.appendChild(text);
  });
  svg.appendChild(xLabelG);

  // tooltip
  const tipG = svgEl('g', { class: 'svg-tooltip' });
  tipG.style.display = 'none';
  const tipRect = svgEl('rect', { width: 160, height: 18 + series.length * 14, fill: 'hsl(var(--card))', stroke: 'hsl(var(--border))', rx: 6 });
  const tipTitle = svgEl('text', { x: 8, y: 14, 'font-weight': '600', 'font-size': '11' });
  tipG.appendChild(tipRect); tipG.appendChild(tipTitle);
  const tipLines = series.map((s, i) => {
    const sw = svgEl('rect', { x: 8, y: 22 + i * 14, width: 8, height: 8, fill: 'hsl(var(' + s.colorVar + '))', rx: 2 });
    const t = svgEl('text', { x: 22, y: 30 + i * 14, 'font-size': '11', fill: 'hsl(var(--foreground))' });
    tipG.appendChild(sw); tipG.appendChild(t);
    return t;
  });

  data.forEach((d, i) => {
    let yCursor = margin.top + innerH;
    const bx = margin.left + i * bandW + (bandW - barW) / 2;
    series.forEach(sr => {
      const v = d[sr.key] || 0;
      const h = (v / yMax) * innerH;
      if (h > 0.1) {
        yCursor -= h;
        svg.appendChild(svgEl('rect', {
          x: bx, y: yCursor, width: barW, height: h,
          fill: 'hsl(var(' + sr.colorVar + '))',
          rx: 1,
        }));
      }
    });

    // hit area
    const hit = svgEl('rect', {
      x: margin.left + i * bandW, y: margin.top, width: bandW, height: innerH,
      fill: 'transparent',
    });
    hit.addEventListener('mouseenter', () => {
      tipG.style.display = '';
      tipTitle.textContent = getLabel(d, i);
      series.forEach((sr, k) => {
        tipLines[k].textContent = sr.label + ': ' + opts.valueFmt(d[sr.key] || 0);
      });
      const tx = Math.min(W - 168, Math.max(margin.left, margin.left + i * bandW + bandW / 2 - 80));
      const ty = Math.max(margin.top, margin.top + innerH - (totals[i] / yMax) * innerH - (24 + series.length * 14));
      tipG.setAttribute('transform', 'translate(' + tx + ',' + Math.max(2, ty) + ')');
    });
    hit.addEventListener('mouseleave', () => { tipG.style.display = 'none'; });
    svg.appendChild(hit);
  });
  svg.appendChild(tipG);
}

/**
 * Donut chart with side legend.
 */
function drawDonutChart(svg, legendEl, data, getValue, getLabel, valueFmt) {
  if (!svg) return;
  clearSvg(svg);
  if (legendEl) legendEl.innerHTML = '';
  if (!data || data.length === 0) {
    if (legendEl) legendEl.innerHTML = '<li class="muted" style="font-size:12px">No data</li>';
    return;
  }

  const cx = 100, cy = 100, rOuter = 80, rInner = 50;
  const total = data.reduce((s, d) => s + (getValue(d) || 0), 0);
  if (total <= 0) {
    svg.appendChild(svgEl('circle', { cx, cy, r: rOuter, fill: 'hsl(var(--muted))' }));
    svg.appendChild(svgEl('circle', { cx, cy, r: rInner, fill: 'hsl(var(--card))' }));
    if (legendEl) legendEl.innerHTML = '<li class="muted" style="font-size:12px">No data</li>';
    return;
  }

  let start = -Math.PI / 2;
  data.forEach((d, i) => {
    const v = getValue(d) || 0;
    if (v <= 0) return;
    const slice = (v / total) * 2 * Math.PI;
    const end = start + slice;
    const large = slice > Math.PI ? 1 : 0;
    const x1 = cx + rOuter * Math.cos(start);
    const y1 = cy + rOuter * Math.sin(start);
    const x2 = cx + rOuter * Math.cos(end);
    const y2 = cy + rOuter * Math.sin(end);
    const x3 = cx + rInner * Math.cos(end);
    const y3 = cy + rInner * Math.sin(end);
    const x4 = cx + rInner * Math.cos(start);
    const y4 = cy + rInner * Math.sin(start);

    const path = svgEl('path', {
      d:
        'M ' + x1 + ' ' + y1 + ' ' +
        'A ' + rOuter + ' ' + rOuter + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 + ' ' +
        'L ' + x3 + ' ' + y3 + ' ' +
        'A ' + rInner + ' ' + rInner + ' 0 ' + large + ' 0 ' + x4 + ' ' + y4 + ' Z',
      fill: colorFor(i),
    });
    svg.appendChild(path);
    start = end;
  });

  // center label
  const center = svgEl('text', {
    x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'donut-center', fill: 'hsl(var(--foreground))',
    'font-size': '14', 'font-weight': '600',
  });
  center.textContent = valueFmt(total);
  svg.appendChild(center);

  const sub = svgEl('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', fill: 'hsl(var(--muted-foreground))', 'font-size': '10' });
  sub.textContent = 'Total';
  svg.appendChild(sub);

  if (legendEl) {
    legendEl.innerHTML = data.map((d, i) => {
      const v = getValue(d) || 0;
      const pct = total ? ((v / total) * 100).toFixed(1) + '%' : '0%';
      return (
        '<li>' +
          '<span class="label">' +
            '<span class="swatch" style="background:' + colorFor(i) + '"></span>' +
            '<span class="label-text" title="' + escapeHtml(getLabel(d)) + '">' + escapeHtml(getLabel(d)) + '</span>' +
          '</span>' +
          '<span class="value">' + valueFmt(v) + ' · ' + pct + '</span>' +
        '</li>'
      );
    }).join('');
  }
}

/* initial */
refresh();
`;
