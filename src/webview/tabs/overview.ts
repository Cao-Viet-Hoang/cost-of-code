import { ICONS } from '../icons';

export const OVERVIEW_HTML = `
<section class="panel active" data-panel="overview">
  <div class="first-run" id="firstRun" hidden>
    <div class="empty-icon">${ICONS.activity}</div>
    <h3>Welcome to Cost of Code</h3>
    <p>No usage data yet. Let's get the local collector running.</p>
    <ol>
      <li>Click <strong>Run setup</strong> below — registers a scheduled task that starts the OTLP collector on logon and configures Claude Code's telemetry env vars.</li>
      <li>Use Claude Code (CLI or VS Code) as usual. If a session was already running, restart it so it re-reads <code>~/.claude/settings.json</code>.</li>
      <li>Come back to this dashboard — it auto-refreshes every 15 seconds.</li>
    </ol>
    <div class="btn-row">
      <button class="btn btn-primary" id="firstRunSetup">${ICONS.settings} Run setup</button>
      <button class="btn btn-ghost" data-goto-tab="health">Open health tab</button>
    </div>
  </div>

  <div class="kpis" id="overviewCards"></div>

  <div class="grid-2">
    <div class="card chart-card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Cost trend</h3>
          <p class="card-desc" id="overviewTrendDesc">Last 30 days · daily and cumulative</p>
        </div>
        <div class="legend">
          <span class="legend-item"><span class="swatch" style="background:hsl(var(--chart-2))"></span>Daily cost</span>
          <span class="legend-item"><span class="swatch" style="background:hsl(var(--chart-3));opacity:0.7;border-radius:1px"></span>Cumulative</span>
        </div>
      </div>
      <div class="card-body">
        <svg id="dailyTrendSvg" class="chart"></svg>
        <div class="empty" id="dailyTrendEmpty" hidden>
          <div class="empty-icon">${ICONS.trend}</div>
          <p>Not enough data yet for a trend chart.</p>
        </div>
      </div>
    </div>

    <div class="card chart-card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Cost by model</h3>
          <p class="card-desc">Share of estimated USD spend</p>
        </div>
      </div>
      <div class="card-body donut-row">
        <svg id="modelDonutSvg" class="chart" viewBox="0 0 200 200"></svg>
        <ul class="donut-legend" id="modelDonutLegend"></ul>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Top workspaces</h3>
          <p class="card-desc">By estimated cost in this range</p>
        </div>
        <button class="btn btn-link btn-sm" data-goto-tab="breakdown" data-goto-subtab="workspaces">View all →</button>
      </div>
      <div class="card-body" id="overviewWorkspaces"></div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Recent sessions</h3>
          <p class="card-desc">Top 5 by cost</p>
        </div>
        <button class="btn btn-link btn-sm" data-goto-tab="sessions">View all →</button>
      </div>
      <div class="card-body table-wrap">
        <table class="data" id="recentSessionsTable">
          <thead><tr>
            <th>Tool</th>
            <th>Session</th>
            <th>Workspace</th>
            <th class="num">Cost</th>
            <th>Models</th>
            <th class="num">Reqs</th>
            <th>Started</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </div>
</section>
`;

export const OVERVIEW_JS = `
function renderOverview(d) {
  const firstRun = document.getElementById('firstRun');
  const noData = (!d.allTotals || d.allTotals.requests === 0);
  const collectorMissing = !d.health.collectorRunning && d.health.totalUsageRecords === 0;
  firstRun.hidden = !(noData && collectorMissing);

  const t = d.today;
  const all = d.allTotals;

  const cacheHitRatio = (t.cacheReadTokens + t.cacheCreationTokens) > 0
    ? t.cacheReadTokens / (t.cacheReadTokens + t.cacheCreationTokens)
    : 0;

  // delta vs 7-day average (excluding today)
  const recent = (d.daily || []).slice(-8); // last up to 8 days
  const todayKey = d.todayDate;
  const prev = recent.filter(r => r.date !== todayKey);
  const prevAvgCost = prev.length ? prev.reduce((s, r) => s + r.cost, 0) / prev.length : 0;
  const prevAvgTokens = prev.length ? prev.reduce((s, r) => s + r.totalTokensWithCache, 0) / prev.length : 0;
  const prevAvgReqs = prev.length ? prev.reduce((s, r) => s + r.requests, 0) / prev.length : 0;
  const costPct = prevAvgCost > 0 ? ((t.cost - prevAvgCost) / prevAvgCost) * 100 : NaN;
  const tokenPct = prevAvgTokens > 0 ? ((t.totalTokensWithCache - prevAvgTokens) / prevAvgTokens) * 100 : NaN;

  const sparkCost   = recent.map(r => r.cost);
  const sparkTokens = recent.map(r => r.totalTokensWithCache);
  const sparkReqs   = recent.map(r => r.requests);

  const costPerReq = t.requests > 0 ? t.cost / t.requests : 0;
  const tokensPerReq = t.requests > 0 ? t.totalTokensWithCache / t.requests : 0;

  // Per-tool breakdown — only rendered when "All" is selected and both tools
  // actually have data, so the KPI cards don't grow taller for single-tool users.
  const todayBrk = d.todayToolBreakdown;
  const rangeBrk = d.toolBreakdown;
  const showSplit = (toolFilter === '') && todayBrk && rangeBrk &&
    (todayBrk.codex.requests > 0 || rangeBrk.codex.requests > 0) &&
    (todayBrk.claude.requests > 0 || rangeBrk.claude.requests > 0);

  const todayCostSplit = showSplit ? [
    { tool: 'claude', label: 'Claude', value: fmtCostShort(todayBrk.claude.cost), title: fmtCost(todayBrk.claude.cost) },
    { tool: 'codex',  label: 'Codex',  value: fmtCostShort(todayBrk.codex.cost),  title: fmtCost(todayBrk.codex.cost) + ' · estimated from OpenAI list price' },
  ] : null;
  const rangeCostSplit = showSplit ? [
    { tool: 'claude', label: 'Claude', value: fmtCostShort(rangeBrk.claude.cost), title: fmtCost(rangeBrk.claude.cost) },
    { tool: 'codex',  label: 'Codex',  value: fmtCostShort(rangeBrk.codex.cost),  title: fmtCost(rangeBrk.codex.cost) + ' · estimated from OpenAI list price' },
  ] : null;
  const todayTokenSplit = showSplit ? [
    { tool: 'claude', label: 'Claude', value: fmt(todayBrk.claude.totalTokensWithCache) },
    { tool: 'codex',  label: 'Codex',  value: fmt(todayBrk.codex.totalTokensWithCache) },
  ] : null;

  const cards = [
    kpi({
      label: "Today's cost",
      value: fmtCostShort(t.cost),
      title: fmtCost(t.cost),
      sub: 'across ' + fmt(t.requests) + ' requests · ' + fmtCostShort(costPerReq) + '/req',
      icon: ICONS.activity,
      accent: 'accent-2',
      colorVar: '--chart-2',
      sparkline: sparkCost.length > 1 ? sparkCost : null,
      delta: Number.isFinite(costPct) ? { pct: costPct, dir: costPct > 1 ? 'up' : costPct < -1 ? 'down' : 'flat', tooltip: 'vs 7-day avg: ' + fmtCost(prevAvgCost), invertColor: true } : null,
      breakdown: todayCostSplit,
    }),
    kpi({
      label: 'Tokens today',
      value: fmt(t.totalTokensWithCache),
      title: t.totalTokensWithCache + ' tokens (with cache)',
      sub: fmt(t.inputTokens) + ' in · ' + fmt(t.outputTokens) + ' out · ' + fmt(Math.round(tokensPerReq)) + '/req',
      icon: ICONS.database,
      accent: 'accent-1',
      colorVar: '--chart-1',
      sparkline: sparkTokens.length > 1 ? sparkTokens : null,
      delta: Number.isFinite(tokenPct) ? { pct: tokenPct, dir: tokenPct > 1 ? 'up' : tokenPct < -1 ? 'down' : 'flat', tooltip: 'vs 7-day avg: ' + fmt(prevAvgTokens) } : null,
      breakdown: todayTokenSplit,
    }),
    kpi({
      label: 'Cache hit ratio (today)',
      value: (t.cacheReadTokens + t.cacheCreationTokens) ? fmtPct(cacheHitRatio) : '—',
      sub: fmt(t.cacheReadTokens) + ' read · ' + fmt(t.cacheCreationTokens) + ' create',
      icon: ICONS.database,
      accent: 'accent-3',
      colorVar: '--chart-3',
      sparkline: recent.length > 1 ? recent.map(r => (r.cacheReadTokens + r.cacheCreationTokens) > 0 ? r.cacheReadTokens / (r.cacheReadTokens + r.cacheCreationTokens) : 0) : null,
    }),
    kpi({
      label: rangeLabel(d),
      value: fmtCostShort(all.cost),
      title: fmtCost(all.cost),
      sub: fmt(all.requests) + ' req · ' + fmt(all.totalTokensWithCache) + ' tk · saved ~' + fmtCostShort(d.cacheSavings.totalSavedUsd) + ' from cache',
      icon: ICONS.activity,
      accent: 'accent-4',
      colorVar: '--chart-4',
      sparkline: sparkReqs.length > 1 ? sparkReqs : null,
      breakdown: rangeCostSplit,
    }),
  ];
  renderKpis('overviewCards', cards);

  // Trend chart
  const trendData = (d.daily || []).slice(-30);
  const trendEmpty = document.getElementById('dailyTrendEmpty');
  const trendSvg = document.getElementById('dailyTrendSvg');
  if (trendData.length < 2) {
    trendEmpty.hidden = false;
    trendSvg.style.display = 'none';
  } else {
    trendEmpty.hidden = true;
    trendSvg.style.display = '';
    // build cumulative
    let acc = 0;
    const cum = trendData.map(r => (acc += r.cost, acc));
    drawAreaChart(trendSvg, trendData, r => r.cost, r => fmtDate(r.date), {
      valueFmt: fmtCostShort,
      colorVar: '--chart-2',
      cumulative: { getValue: (_r, i) => cum[i], fmt: fmtCostShort },
    });
  }

  // Donut
  drawDonutChart(
    document.getElementById('modelDonutSvg'),
    document.getElementById('modelDonutLegend'),
    (d.models || []).slice(0, 8),
    m => m.cost,
    m => m.model,
    fmtCostShort,
  );

  // Top workspaces
  const ws = (d.workspaces || []).slice(0, 5);
  renderHBars(
    document.getElementById('overviewWorkspaces'),
    ws,
    w => shortenWorkspace(w.workspace),
    w => w.cost,
    fmtCostShort,
    { colorByIndex: true },
  );

  // Recent sessions
  const tbody = document.querySelector('#recentSessionsTable tbody');
  const top = (d.sessions || []).slice(0, 5);
  if (top.length === 0) {
    tbody.innerHTML = emptyCell(7, 'No sessions yet.', 'users');
  } else {
    tbody.innerHTML = top.map(s => {
      const tools = (s.tools && s.tools.length > 0) ? s.tools : ['claude'];
      return (
      '<tr>' +
        '<td>' + tools.map(t => toolBadge(t)).join(' ') + '</td>' +
        '<td><span class="session-id" title="' + escapeHtml(s.sessionId || '') + '">' +
          escapeHtml((s.sessionId || '').slice(0, 8)) + '…</span>' +
          ' <button class="copy-btn" data-copy="' + escapeHtml(s.sessionId || '') + '" title="Copy id">' + ICONS.copy + '</button>' +
        '</td>' +
        '<td>' + escapeHtml(shortenWorkspace(s.workspace)) + '</td>' +
        '<td class="num">' + fmtCost(s.cost) + '</td>' +
        '<td>' + escapeHtml((s.models || []).join(', ')) + '</td>' +
        '<td class="num">' + fmt(s.requests) + '</td>' +
        '<td title="' + escapeHtml(fmtTimeFull(s.startTime)) + '">' + fmtRel(s.startTime) + '</td>' +
      '</tr>'
      );
    }).join('');
  }
  attachCopyHandlers();
}

function rangeLabel(d) {
  const f = d.appliedFilter || {};
  if (currentPreset === 'today') return "Today's range";
  if (currentPreset === '7d')    return 'Last 7 days';
  if (currentPreset === '30d')   return 'Last 30 days';
  if (currentPreset === 'mtd')   return 'Month to date';
  if (currentPreset === 'all')   return 'All time';
  if (f.startDate && f.endDate)  return f.startDate + ' → ' + f.endDate;
  return 'Range total';
}
`;
