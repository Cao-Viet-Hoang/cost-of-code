import { ICONS } from '../icons';

export const BREAKDOWN_HTML = `
<section class="panel" data-panel="breakdown">
  <div class="subtabs" role="tablist">
    <button class="subtab active" data-subtab="models">${ICONS.globe} Models</button>
    <button class="subtab" data-subtab="workspaces">${ICONS.folder} Workspaces</button>
    <button class="subtab" data-subtab="sources">${ICONS.activity} Sources</button>
  </div>

  <!-- MODELS -->
  <div class="subpanel active" data-subpanel="models">
    <div class="grid-2">
      <div class="card chart-card">
        <div class="card-header">
          <div><h3 class="card-title">Cost share</h3><p class="card-desc">USD by model</p></div>
        </div>
        <div class="card-body donut-row">
          <svg id="modelCostDonut" class="chart" viewBox="0 0 200 200"></svg>
          <ul class="donut-legend" id="modelCostLegend"></ul>
        </div>
      </div>
      <div class="card chart-card">
        <div class="card-header">
          <div><h3 class="card-title">Requests share</h3><p class="card-desc">API calls by model</p></div>
        </div>
        <div class="card-body donut-row">
          <svg id="modelRequestsDonut" class="chart" viewBox="0 0 200 200"></svg>
          <ul class="donut-legend" id="modelRequestsLegend"></ul>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div><h3 class="card-title">Models breakdown</h3><p class="card-desc">Per-model cost, tokens &amp; latency</p></div></div>
      <div class="card-body table-wrap" style="padding:0">
        <table class="data" id="modelsTable"><thead id="modelsThead"></thead><tbody></tbody></table>
        <div class="empty" id="modelsEmpty" hidden><div class="empty-icon">${ICONS.globe}</div><p>No model data yet.</p></div>
      </div>
    </div>
  </div>

  <!-- WORKSPACES -->
  <div class="subpanel" data-subpanel="workspaces">
    <div class="card">
      <div class="card-header"><div><h3 class="card-title">Cost by workspace</h3><p class="card-desc">Top contributors</p></div></div>
      <div class="card-body" id="workspacesBars"></div>
    </div>
    <div class="card">
      <div class="card-header"><div><h3 class="card-title">Workspaces breakdown</h3><p class="card-desc">Filter the dashboard by clicking a row</p></div></div>
      <div class="card-body table-wrap" style="padding:0">
        <table class="data" id="workspacesTable"><thead id="workspacesThead"></thead><tbody></tbody></table>
        <div class="empty" id="workspacesEmpty" hidden><div class="empty-icon">${ICONS.folder}</div><p>No workspace data yet.</p></div>
      </div>
    </div>
  </div>

  <!-- SOURCES -->
  <div class="subpanel" data-subpanel="sources">
    <div class="card">
      <div class="card-header"><div><h3 class="card-title">Query sources</h3><p class="card-desc">Where requests originate (CLI, extension, etc.)</p></div></div>
      <div class="card-body" id="sourcesBars"></div>
    </div>
    <div class="card">
      <div class="card-header"><div><h3 class="card-title">Sources breakdown</h3><p class="card-desc"></p></div></div>
      <div class="card-body table-wrap" style="padding:0">
        <table class="data" id="sourcesTable"><thead id="sourcesThead"></thead><tbody></tbody></table>
        <div class="empty" id="sourcesEmpty" hidden><div class="empty-icon">${ICONS.activity}</div><p>No source data yet.</p></div>
      </div>
    </div>
  </div>
</section>
`;

export const BREAKDOWN_JS = `
function setSubtab(id) {
  document.querySelectorAll('.subtab').forEach(b => b.classList.toggle('active', b.getAttribute('data-subtab') === id));
  document.querySelectorAll('.subpanel').forEach(b => b.classList.toggle('active', b.getAttribute('data-subpanel') === id));
  if (lastData) render(lastData);
}

function renderBreakdown(d) {
  renderModelsSubtab(d);
  renderWorkspacesSubtab(d);
  renderSourcesSubtab(d);
}

function renderModelsSubtab(d) {
  const empty = document.getElementById('modelsEmpty');
  const tbody = document.querySelector('#modelsTable tbody');
  const thead = document.getElementById('modelsThead');

  thead.innerHTML = '<tr>' +
    sortableHeader('models', 'model', 'Model') +
    sortableHeader('models', 'cost', 'Cost',                  { num: true }) +
    sortableHeader('models', 'inputTokens', 'Input',          { num: true }) +
    sortableHeader('models', 'outputTokens', 'Output',        { num: true }) +
    sortableHeader('models', 'cacheReadTokens', 'Cache read', { num: true }) +
    sortableHeader('models', 'totalTokensWithCache', 'Total cached', { num: true }) +
    sortableHeader('models', 'requests', 'Requests',          { num: true }) +
    sortableHeader('models', 'p50DurationMs', 'p50',          { num: true }) +
    sortableHeader('models', 'p95DurationMs', 'p95',          { num: true }) +
  '</tr>';

  const models = d.models || [];
  if (models.length === 0) {
    empty.hidden = false;
    tbody.innerHTML = '';
    drawDonutChart(document.getElementById('modelCostDonut'), document.getElementById('modelCostLegend'), [], () => 0, () => '', () => '');
    drawDonutChart(document.getElementById('modelRequestsDonut'), document.getElementById('modelRequestsLegend'), [], () => 0, () => '', () => '');
    attachSortHandlers();
    return;
  }
  empty.hidden = true;

  drawDonutChart(
    document.getElementById('modelCostDonut'),
    document.getElementById('modelCostLegend'),
    models, m => m.cost, m => m.model, fmtCostShort,
  );
  drawDonutChart(
    document.getElementById('modelRequestsDonut'),
    document.getElementById('modelRequestsLegend'),
    models, m => m.requests, m => m.model, fmt,
  );

  const getters = {
    model: m => m.model,
    cost: m => m.cost,
    inputTokens: m => m.inputTokens,
    outputTokens: m => m.outputTokens,
    cacheReadTokens: m => m.cacheReadTokens,
    totalTokensWithCache: m => m.totalTokensWithCache,
    requests: m => m.requests,
    p50DurationMs: m => m.p50DurationMs,
    p95DurationMs: m => m.p95DurationMs,
  };
  const rows = getSorted('models', models, getters);
  const max = Math.max(1, ...rows.map(m => m.cost));
  tbody.innerHTML = rows.map(m => {
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
        '<td class="num">' + fmt(m.totalTokensWithCache) + '</td>' +
        '<td class="num">' + fmt(m.requests) + '</td>' +
        '<td class="num">' + fmtMs(m.p50DurationMs) + '</td>' +
        '<td class="num">' + fmtMs(m.p95DurationMs) + '</td>' +
      '</tr>'
    );
  }).join('');
  attachSortHandlers();
}

function renderWorkspacesSubtab(d) {
  const empty = document.getElementById('workspacesEmpty');
  const tbody = document.querySelector('#workspacesTable tbody');
  const thead = document.getElementById('workspacesThead');
  const ws = d.workspaces || [];

  thead.innerHTML = '<tr>' +
    sortableHeader('ws', 'workspace', 'Workspace') +
    sortableHeader('ws', 'cost', 'Cost',                  { num: true }) +
    sortableHeader('ws', 'totalTokensWithCache', 'Tokens (cached)', { num: true }) +
    sortableHeader('ws', 'sessions', 'Sessions',          { num: true }) +
    sortableHeader('ws', 'requests', 'Requests',          { num: true }) +
    '<th>Models</th>' +
    '<th></th>' +
  '</tr>';

  renderHBars(document.getElementById('workspacesBars'), ws.slice(0, 10),
    w => shortenWorkspace(w.workspace), w => w.cost, fmtCostShort, { colorByIndex: false });

  if (ws.length === 0) {
    empty.hidden = false; tbody.innerHTML = '';
    attachSortHandlers();
    return;
  }
  empty.hidden = true;

  const getters = {
    workspace: w => w.workspace,
    cost: w => w.cost,
    totalTokensWithCache: w => w.totalTokensWithCache,
    sessions: w => w.sessions,
    requests: w => w.requests,
  };
  const rows = getSorted('ws', ws, getters);
  tbody.innerHTML = rows.map(w => (
    '<tr>' +
      '<td title="' + escapeHtml(w.workspace) + '">' + escapeHtml(shortenWorkspace(w.workspace)) + '</td>' +
      '<td class="num">' + fmtCost(w.cost) + '</td>' +
      '<td class="num">' + fmt(w.totalTokensWithCache) + '</td>' +
      '<td class="num">' + fmt(w.sessions) + '</td>' +
      '<td class="num">' + fmt(w.requests) + '</td>' +
      '<td>' + (w.models || []).slice(0, 3).map(m => '<span class="tag">' + escapeHtml(m) + '</span>').join('') + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" data-filter-ws="' + escapeHtml(w.workspace) + '">Filter</button></td>' +
    '</tr>'
  )).join('');

  tbody.querySelectorAll('[data-filter-ws]').forEach(b =>
    b.addEventListener('click', () => {
      const wsName = b.getAttribute('data-filter-ws');
      const sel = document.getElementById('filterWorkspace');
      // make sure option exists (it may be <unknown>)
      let exists = false;
      for (const o of sel.options) { if (o.value === wsName) { exists = true; break; } }
      if (!exists) { const o = document.createElement('option'); o.value = wsName; o.textContent = wsName; sel.appendChild(o); }
      sel.value = wsName;
      refresh();
    }));
  attachSortHandlers();
}

function renderSourcesSubtab(d) {
  const empty = document.getElementById('sourcesEmpty');
  const tbody = document.querySelector('#sourcesTable tbody');
  const thead = document.getElementById('sourcesThead');
  const sources = d.sources || [];

  thead.innerHTML = '<tr>' +
    sortableHeader('sources', 'source', 'Source') +
    sortableHeader('sources', 'cost', 'Cost',                       { num: true }) +
    sortableHeader('sources', 'totalTokensWithCache', 'Tokens cached', { num: true }) +
    sortableHeader('sources', 'requests', 'Requests',                { num: true }) +
    '<th></th>' +
  '</tr>';

  renderHBars(document.getElementById('sourcesBars'), sources,
    s => s.source, s => s.cost, fmtCostShort, { colorByIndex: true });

  if (sources.length === 0) {
    empty.hidden = false; tbody.innerHTML = '';
    attachSortHandlers();
    return;
  }
  empty.hidden = true;

  const getters = {
    source: s => s.source,
    cost: s => s.cost,
    totalTokensWithCache: s => s.totalTokensWithCache,
    requests: s => s.requests,
  };
  const rows = getSorted('sources', sources, getters);
  tbody.innerHTML = rows.map(s => (
    '<tr>' +
      '<td>' + escapeHtml(s.source) + '</td>' +
      '<td class="num">' + fmtCost(s.cost) + '</td>' +
      '<td class="num">' + fmt(s.totalTokensWithCache) + '</td>' +
      '<td class="num">' + fmt(s.requests) + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" data-filter-src="' + escapeHtml(s.source) + '">Filter</button></td>' +
    '</tr>'
  )).join('');

  tbody.querySelectorAll('[data-filter-src]').forEach(b =>
    b.addEventListener('click', () => {
      const v = b.getAttribute('data-filter-src');
      const sel = document.getElementById('filterSource');
      let exists = false;
      for (const o of sel.options) { if (o.value === v) { exists = true; break; } }
      if (!exists) { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); }
      sel.value = v;
      refresh();
    }));
  attachSortHandlers();
}
`;
