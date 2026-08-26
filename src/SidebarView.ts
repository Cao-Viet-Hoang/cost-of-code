import * as vscode from 'vscode';
import { UsageReader } from './usageReader';
import { HealthCheckService } from './healthCheck';
import type { AggregatedTotals, FilterOptions, Tool, ToolBreakdown } from './types';
import type { CodexPricingOverrides } from './codex/pricing';
import { SIDEBAR_CSS, SIDEBAR_HTML, buildSidebarJs } from './webview/sidebar';

interface TopModel {
  model: string;
  cost: number;
}

interface SparkHour {
  /** Bucket start as a UTC ISO instant; the view formats it in local time. */
  time: string;
  cost: number;
  requests: number;
}

const HOUR_MS = 3600_000;

interface SidebarPayload {
  today: AggregatedTotals;
  yesterday: AggregatedTotals;
  todaySplit: ToolBreakdown;
  hourly: SparkHour[];
  topModels: TopModel[];
  /** Everything below the top N, folded into one slice so the donut sums to 100%. */
  otherModels: { cost: number; count: number };
  health: {
    collectorRunning: boolean;
    telemetryEnvConfigured: boolean;
    lastEventAt: string | null;
  };
  claudeConfigured: boolean;
  codexEnabled: boolean;
  codexRecords: boolean;
  /**
   * Newest usage activity across both tools. This is what the status stamp
   * shows — `updatedAt` below is stamped at read time, so rendering it as a
   * relative time always says "0s ago" and measures nothing.
   */
  lastActivityAt: string | null;
  updatedAt: string;
}

/**
 * Three slices plus "Other". The donut needs every pair of slices to be
 * distinguishable at once (all-pairs, not just adjacent), and the validated
 * categorical palette only clears that gate for its first three hues.
 */
const TOP_MODEL_COUNT = 3;

/**
 * Newer of two ISO instants, either of which may be absent. Compared as parsed
 * time, not lexically — the two sides come from different producers (the
 * collector status file and Codex rollout lines) and need not share a format.
 */
function newerInstant(a: string | null, b: string | null): string | null {
  if (!a) { return b; }
  if (!b) { return a; }
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta)) { return b; }
  if (Number.isNaN(tb)) { return a; }
  return ta >= tb ? a : b;
}

/** Shifts a `YYYY-MM-DD` string by whole days, staying in UTC. */
function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Compact "Cost of Code" section in the Explorer, alongside Timeline/Outline.
 * Shows today's spend and collector state; the full six-tab dashboard stays in
 * its own editor tab (`DashboardPanel`) because it needs the width.
 */
export class SidebarView implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeUsageTracker.sidebar';

  private view: vscode.WebviewView | undefined;
  private reader: UsageReader | undefined;
  private health: HealthCheckService | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('claudeUsageTracker')) { return; }
        this.reader = undefined;
        this.health = undefined;
        if (this.view) {
          this.view.webview.html = this.getHtml();
        }
      }),
    );
  }

  dispose() {
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    view.webview.html = this.getHtml();

    view.webview.onDidReceiveMessage(
      (msg: { type?: string }) => this.handleMessage(msg),
      null,
      this.disposables,
    );
    view.onDidChangeVisibility(
      () => { if (view.visible) { void this.refresh(); } },
      null,
      this.disposables,
    );
    view.onDidDispose(
      () => { this.view = undefined; },
      null,
      this.disposables,
    );
  }

  /** Re-reads the data and pushes it to the view, if the view is alive. */
  async refresh() {
    const view = this.view;
    if (!view) { return; }
    try {
      const reader = this.getReader();
      const todayDate = new Date().toISOString().slice(0, 10);
      const yesterdayDate = shiftDate(todayDate, -1);
      const today: FilterOptions = { startDate: todayDate, endDate: todayDate };

      const cfg = vscode.workspace.getConfiguration('claudeUsageTracker');
      const codexEnabled = cfg.get<boolean>('includeCodex') ?? true;

      const health = await this.getHealth().run();
      const codexHealth = reader.codexHealth();

      const models = this.rankedModels(reader, today);
      const rest = models.slice(TOP_MODEL_COUNT);

      const payload: SidebarPayload = {
        today: reader.totals(today),
        yesterday: reader.totals({ startDate: yesterdayDate, endDate: yesterdayDate }),
        todaySplit: reader.toolBreakdown(today),
        hourly: this.sparkHours(reader, todayDate),
        topModels: models.slice(0, TOP_MODEL_COUNT),
        otherModels: {
          cost: rest.reduce((s, m) => s + m.cost, 0),
          count: rest.length,
        },
        health: {
          collectorRunning: health.collectorRunning,
          telemetryEnvConfigured: health.telemetryEnvConfigured,
          lastEventAt: health.lastEventAt,
        },
        claudeConfigured: health.telemetryEnvConfigured || health.hasUsageRecords,
        codexEnabled,
        codexRecords: codexHealth.sessionFiles > 0,
        // Both sides are already computed above, so this costs no extra scan:
        // `lastUsageAt` covers Claude, `lastWriteAt` covers Codex.
        lastActivityAt: newerInstant(
          health.lastUsageAt,
          codexEnabled ? codexHealth.lastWriteAt : null,
        ),
        updatedAt: new Date().toISOString(),
      };
      void view.webview.postMessage({ type: 'data', payload });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void view.webview.postMessage({ type: 'error', payload: { message } });
    }
  }

  /**
   * Today's cost hour by hour, gap-filled — an idle hour has to be a zero point,
   * otherwise the line silently closes the gap and overstates it. The axis stops
   * at the hour in progress: the rest of the day is unknown, not zero, and
   * plotting it would draw a cliff that is missing data rather than a drop.
   */
  private sparkHours(reader: UsageReader, date: string): SparkHour[] {
    const byHour = new Map(
      reader.hourlyTimeline({ startDate: date, endDate: date }).map((h) => [h.time, h]),
    );
    // Hours run on the same UTC clock as the date filter above, so they sum
    // back to the Today figure they sit under. Labels are localized in the view.
    const start = Date.parse(`${date}T00:00:00.000Z`);
    const currentHour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    const out: SparkHour[] = [];
    for (let t = start; t <= currentHour; t += HOUR_MS) {
      const time = new Date(t).toISOString();
      const h = byHour.get(time);
      out.push({ time, cost: h?.cost ?? 0, requests: h?.requests ?? 0 });
    }
    return out;
  }

  /**
   * Every model that ran in the range, most expensive first. The caller splits
   * this into the donut's own slices and the folded-away remainder.
   */
  private rankedModels(reader: UsageReader, filter: FilterOptions): TopModel[] {
    const tools: Tool[] = ['claude', 'codex'];
    return tools
      .flatMap((tool) => reader.models({ ...filter, tool }).map((m) => ({
        model: m.model,
        cost: m.cost,
      })))
      .sort((a, b) => b.cost - a.cost);
  }

  private handleMessage(msg: { type?: string }) {
    switch (msg.type) {
      case 'ready':
      case 'refresh':
        void this.refresh();
        return;
      case 'openDashboard':
        void vscode.commands.executeCommand('claudeUsageTracker.openDashboard');
        return;
      case 'runSetup':
        void vscode.commands.executeCommand('claudeUsageTracker.runSetup');
        return;
    }
  }

  private getReader(): UsageReader {
    if (!this.reader) {
      const cfg = vscode.workspace.getConfiguration('claudeUsageTracker');
      this.reader = new UsageReader(cfg.get<string>('dataFolder') || undefined, {
        enabled: cfg.get<boolean>('includeCodex') ?? true,
        sessionsRoot: cfg.get<string>('codexSessionsFolder') || undefined,
        pricing: cfg.get<CodexPricingOverrides>('codexPricing') ?? {},
      });
    }
    return this.reader;
  }

  private getHealth(): HealthCheckService {
    if (!this.health) {
      const cfg = vscode.workspace.getConfiguration('claudeUsageTracker');
      const port = cfg.get<number>('collectorPort') ?? 4318;
      this.health = new HealthCheckService(
        cfg.get<string>('dataFolder') || undefined,
        `http://127.0.0.1:${port}`,
      );
    }
    return this.health;
  }

  private getHtml(): string {
    const cfg = vscode.workspace.getConfiguration('claudeUsageTracker');
    const autoRefreshSeconds = cfg.get<number>('autoRefreshSeconds') ?? 15;
    const nonce = Buffer.from(Math.random().toString()).toString('base64').slice(0, 16);
    const csp = [
      "default-src 'none'",
      `style-src 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>Cost of Code</title>
<style>${SIDEBAR_CSS}</style>
</head>
<body>
${SIDEBAR_HTML}
<script nonce="${nonce}">${buildSidebarJs(autoRefreshSeconds)}</script>
</body>
</html>`;
  }
}
