import { ICONS } from '../icons';

export const CACHE_HTML = `
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
        <div class="empty-icon">${ICONS.database}</div>
        <p>No cache data yet.</p>
      </div>
    </div>
  </div>

  <div class="card chart-card">
    <div class="card-header">
      <div>
        <h3 class="card-title">Estimated savings over time</h3>
        <p class="card-desc">USD saved by serving tokens from cache instead of fresh input</p>
      </div>
    </div>
    <div class="card-body">
      <svg id="cacheSavedSvg" class="chart"></svg>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div><h3 class="card-title">Cache by day</h3><p class="card-desc">Read vs creation, per day</p></div></div>
    <div class="card-body table-wrap" style="padding:0">
      <table class="data" id="cacheTable"><thead id="cacheThead"></thead><tbody></tbody></table>
    </div>
  </div>

  <p class="footnote">
    <strong>Estimated savings</strong> use Anthropic list prices (cache-read ~10% of fresh input) and the
    <em>cache_read_tokens</em> on each record. This is an estimate for trend-watching, <em>not</em> billing.
    Override prices via the <code>claudeUsageTracker.pricing</code> setting if Anthropic changes them.
  </p>
</section>
`;

export const CACHE_JS = `
function renderCache(d) {
  const tbody = document.querySelector('#cacheTable tbody');
  const empty = document.getElementById('cacheChartEmpty');
  const svg   = document.getElementById('cacheRatioSvg');
  const svgS  = document.getElementById('cacheSavedSvg');
  const thead = document.getElementById('cacheThead');

  thead.innerHTML = '<tr>' +
    sortableHeader('cache', 'date',                 'Date') +
    sortableHeader('cache', 'cacheReadTokens',      'Cache read',    { num: true }) +
    sortableHeader('cache', 'cacheCreationTokens',  'Cache create',  { num: true }) +
    sortableHeader('cache', 'totalTokensWithCache', 'Total cached',  { num: true }) +
    sortableHeader('cache', 'cacheRatio',           'Cache ratio',   { num: true }) +
    sortableHeader('cache', 'estimatedSavedUsd',    'Est. saved',    { num: true }) +
  '</tr>';

  const sav = d.cacheSavings || { totalReadTokens: 0, totalCreateTokens: 0, totalSavedUsd: 0, hypotheticalUncachedCost: 0 };
  const cacheBy = d.cacheByDay || [];

  const totalTokens = sav.totalReadTokens + sav.totalCreateTokens;
  const all = d.allTotals;
  const ratio = all && all.totalTokensWithCache > 0 ? totalTokens / all.totalTokensWithCache : 0;
  const wouldHavePaid = (all ? all.cost : 0) + sav.totalSavedUsd;
  const savingsPct = wouldHavePaid > 0 ? sav.totalSavedUsd / wouldHavePaid : 0;

  const cards = [
    kpi({
      label: 'Cache read',
      value: fmt(sav.totalReadTokens),
      title: sav.totalReadTokens + ' tokens',
      sub: 'tokens served from cache',
      icon: ICONS.database,
      accent: 'accent-3',
    }),
    kpi({
      label: 'Cache creation',
      value: fmt(sav.totalCreateTokens),
      title: sav.totalCreateTokens + ' tokens',
      sub: 'tokens written to cache',
      icon: ICONS.database,
      accent: 'accent-5',
    }),
    kpi({
      label: 'Cache ratio',
      value: all && all.totalTokensWithCache ? fmtPct(ratio) : '—',
      sub: '(read + create) / total tokens',
      icon: ICONS.database,
      accent: 'accent-4',
    }),
    kpi({
      label: 'Estimated saved',
      value: fmtCostShort(sav.totalSavedUsd),
      title: fmtCost(sav.totalSavedUsd),
      sub: 'list-price estimate · ~' + fmtPct(savingsPct) + ' of would-have cost',
      icon: ICONS.activity,
      accent: 'accent-2',
    }),
  ];
  renderKpis('cacheCards', cards);

  if (cacheBy.length === 0) {
    empty.hidden = false;
    svg.style.display = 'none';
    svgS.innerHTML = '';
    tbody.innerHTML = '';
    return;
  }
  empty.hidden = true;
  svg.style.display = '';

  drawAreaChart(svg, cacheBy, r => r.cacheRatio, r => fmtDate(r.date), {
    valueFmt: fmtPct, colorVar: '--chart-3', yMax: 1, yMin: 0,
  });
  drawAreaChart(svgS, cacheBy, r => r.estimatedSavedUsd, r => fmtDate(r.date), {
    valueFmt: fmtCostShort, colorVar: '--chart-2',
  });

  const getters = {
    date: r => r.date,
    cacheReadTokens: r => r.cacheReadTokens,
    cacheCreationTokens: r => r.cacheCreationTokens,
    totalTokensWithCache: r => r.totalTokensWithCache,
    cacheRatio: r => r.cacheRatio,
    estimatedSavedUsd: r => r.estimatedSavedUsd,
  };
  const rows = getSorted('cache', cacheBy, getters);
  tbody.innerHTML = rows.map(r => (
    '<tr>' +
      '<td>' + escapeHtml(r.date) + '</td>' +
      '<td class="num">' + fmt(r.cacheReadTokens) + '</td>' +
      '<td class="num">' + fmt(r.cacheCreationTokens) + '</td>' +
      '<td class="num">' + fmt(r.totalTokensWithCache) + '</td>' +
      '<td class="num">' + fmtPct(r.cacheRatio) + '</td>' +
      '<td class="num">' + fmtCostShort(r.estimatedSavedUsd) + '</td>' +
    '</tr>'
  )).join('');
  attachSortHandlers();
}
`;
