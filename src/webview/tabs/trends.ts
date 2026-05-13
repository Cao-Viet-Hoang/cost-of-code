import { ICONS } from '../icons';

export const TRENDS_HTML = `
<section class="panel" data-panel="trends">
  <div class="card chart-card">
    <div class="card-header">
      <div>
        <h3 class="card-title">Daily cost</h3>
        <p class="card-desc">USD per day · with running cumulative</p>
      </div>
      <div class="legend">
        <span class="legend-item"><span class="swatch" style="background:hsl(var(--chart-1))"></span>Daily</span>
        <span class="legend-item"><span class="swatch" style="background:hsl(var(--chart-3));opacity:0.7;border-radius:1px"></span>Cumulative</span>
      </div>
    </div>
    <div class="card-body">
      <svg id="dailyCostSvg" class="chart"></svg>
      <div class="empty" id="dailyChartEmpty" hidden>
        <div class="empty-icon">${ICONS.trend}</div>
        <p>No daily data for the selected filter.</p>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card chart-card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Token mix per day</h3>
          <p class="card-desc">Stacked: input, output, cache read, cache create</p>
        </div>
        <div class="legend" id="tokenMixLegend"></div>
      </div>
      <div class="card-body">
        <svg id="dailyTokensSvg" class="chart"></svg>
      </div>
    </div>

    <div class="card chart-card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Activity heatmap</h3>
          <p class="card-desc">Cost by hour of day × day of week (local time)</p>
        </div>
      </div>
      <div class="card-body">
        <div id="hourlyHeatmap" class="heatmap"></div>
        <div class="heatmap-legend">
          <span class="heatmap-legend-label">Less</span>
          <span class="heatmap-legend-bar"></span>
          <span class="heatmap-legend-label">More</span>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div>
        <h3 class="card-title">Daily breakdown</h3>
        <p class="card-desc">Sortable · click a column header</p>
      </div>
      <div class="card-actions">
        <button class="btn btn-ghost btn-sm" data-export="daily-jsonl">${ICONS.download} JSONL</button>
        <button class="btn btn-ghost btn-sm" data-export="daily-csv">${ICONS.download} CSV</button>
      </div>
    </div>
    <div class="card-body table-wrap">
      <table class="data" id="dailyTable"><thead id="dailyThead"></thead><tbody></tbody></table>
    </div>
  </div>
</section>
`;

export const TRENDS_JS = `
function renderTrends(d) {
  const empty = document.getElementById('dailyChartEmpty');
  const costSvg = document.getElementById('dailyCostSvg');
  const tokensSvg = document.getElementById('dailyTokensSvg');
  const tbody = document.querySelector('#dailyTable tbody');
  const theadEl = document.getElementById('dailyThead');

  // Header (sortable)
  theadEl.innerHTML = '<tr>' +
    sortableHeader('daily', 'date',                   'Date') +
    sortableHeader('daily', 'cost',                   'Cost',           { num: true }) +
    sortableHeader('daily', 'inputTokens',            'Input',          { num: true }) +
    sortableHeader('daily', 'outputTokens',           'Output',         { num: true }) +
    sortableHeader('daily', 'cacheReadTokens',        'Cache read',     { num: true }) +
    sortableHeader('daily', 'cacheCreationTokens',    'Cache create',   { num: true }) +
    sortableHeader('daily', 'totalTokensWithoutCache','Total no-cache', { num: true }) +
    sortableHeader('daily', 'totalTokensWithCache',   'Total cached',   { num: true }) +
    sortableHeader('daily', 'sessions',               'Sessions',       { num: true }) +
    sortableHeader('daily', 'requests',               'Requests',       { num: true }) +
  '</tr>';

  if (!d.daily || d.daily.length === 0) {
    empty.hidden = false;
    costSvg.style.display = 'none';
    tokensSvg.innerHTML = '';
    tbody.innerHTML = emptyCell(10, 'No daily data for the selected filter.', 'search');
    document.getElementById('tokenMixLegend').innerHTML = '';
    renderHeatmap(document.getElementById('hourlyHeatmap'), d.hourly || [], fmtCostShort);
    attachSortHandlers();
    return;
  }
  empty.hidden = true;
  costSvg.style.display = '';

  // Cost area + cumulative
  let acc = 0;
  const cum = d.daily.map(r => (acc += r.cost, acc));
  drawAreaChart(costSvg, d.daily, r => r.cost, r => fmtDate(r.date), {
    valueFmt: fmtCostShort,
    colorVar: '--chart-1',
    cumulative: { getValue: (_r, i) => cum[i], fmt: fmtCostShort },
  });

  // Stacked tokens
  const tokenSeries = [
    { key: 'inputTokens',          label: 'Input',         colorVar: '--chart-1' },
    { key: 'outputTokens',         label: 'Output',        colorVar: '--chart-2' },
    { key: 'cacheReadTokens',      label: 'Cache read',    colorVar: '--chart-3' },
    { key: 'cacheCreationTokens',  label: 'Cache create',  colorVar: '--chart-4' },
  ];
  drawStackedBars(tokensSvg, d.daily, tokenSeries, r => fmtDate(r.date), { valueFmt: fmt });
  document.getElementById('tokenMixLegend').innerHTML =
    tokenSeries.map(s =>
      '<span class="legend-item"><span class="swatch" style="background:hsl(var(' + s.colorVar + '))"></span>' + s.label + '</span>'
    ).join('');

  // Heatmap
  renderHeatmap(document.getElementById('hourlyHeatmap'), d.hourly || [], fmtCostShort);

  // Sortable table
  const getters = {
    date: r => r.date,
    cost: r => r.cost,
    inputTokens: r => r.inputTokens,
    outputTokens: r => r.outputTokens,
    cacheReadTokens: r => r.cacheReadTokens,
    cacheCreationTokens: r => r.cacheCreationTokens,
    totalTokensWithoutCache: r => r.totalTokensWithoutCache,
    totalTokensWithCache: r => r.totalTokensWithCache,
    sessions: r => r.sessions,
    requests: r => r.requests,
  };
  const rows = getSorted('daily', d.daily, getters);
  const max = Math.max(1, ...rows.map(r => r.cost));
  tbody.innerHTML = rows.map(r => {
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
  attachSortHandlers();
}
`;
