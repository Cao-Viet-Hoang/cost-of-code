export const COMPONENTS_JS = `
/* ----- KPI card with optional sparkline & delta ----- */
function kpi(opts) {
  // opts: { label, value, title?, sub?, icon?, accent?, delta?: { pct, dir }, sparkline?: number[] }
  const iconHtml = opts.icon ? '<div class="kpi-icon">' + opts.icon + '</div>' : '';
  let deltaHtml = '';
  if (opts.delta && typeof opts.delta.pct === 'number') {
    const d = opts.delta;
    let cls = 'flat', arrow = '·';
    if (d.dir === 'up')   { cls = d.invertColor ? 'down' : 'up';   arrow = '▲'; }
    if (d.dir === 'down') { cls = d.invertColor ? 'up'   : 'down'; arrow = '▼'; }
    const pctText = Number.isFinite(d.pct) ? Math.abs(d.pct).toFixed(0) + '%' : '—';
    deltaHtml = '<span class="kpi-delta ' + cls + '" title="' + (d.tooltip || '') + '">' + arrow + ' ' + pctText + '</span>';
  }
  const spkId = 'spk-' + Math.random().toString(36).slice(2);
  const spkHtml = opts.sparkline && opts.sparkline.length > 1
    ? '<svg class="kpi-sparkline" id="' + spkId + '"></svg>'
    : '';
  const sub = opts.sub ? '<div class="kpi-sub">' + opts.sub + '</div>' : '';
  const html =
    '<div class="kpi ' + (opts.accent || '') + '">' +
      '<div class="kpi-header">' +
        '<div class="kpi-label">' + opts.label + '</div>' +
        iconHtml +
      '</div>' +
      '<div class="kpi-row">' +
        '<div class="kpi-value" title="' + (opts.title || '') + '">' + opts.value + '</div>' +
        deltaHtml +
      '</div>' +
      spkHtml +
      sub +
    '</div>';
  return { html, spkId: opts.sparkline && opts.sparkline.length > 1 ? spkId : null, sparkline: opts.sparkline, colorVar: opts.colorVar || '--chart-1' };
}

function renderKpis(hostId, kpisArr) {
  const host = document.getElementById(hostId);
  host.innerHTML = kpisArr.map(k => k.html).join('');
  // attach sparklines after DOM mount
  kpisArr.forEach(k => {
    if (k.spkId) {
      const svg = document.getElementById(k.spkId);
      if (svg) drawSparkline(svg, k.sparkline, k.colorVar);
    }
  });
}

/* ----- Active filter chips ----- */
function renderActiveChips() {
  const host = document.getElementById('activeChips');
  if (!host) return;
  const f = readFilter();
  const items = [];
  if (currentPreset !== 'custom' && currentPreset !== 'all') {
    const p = PRESETS.find(x => x.id === currentPreset);
    if (p) items.push({ key: 'preset', label: 'Range', value: p.label, removable: false });
  }
  if (f.startDate || f.endDate) {
    if (currentPreset === 'custom') {
      items.push({ key: 'date', label: 'Date', value: (f.startDate || '…') + ' → ' + (f.endDate || '…'), removable: true, clear: () => {
        document.getElementById('filterStart').value = '';
        document.getElementById('filterEnd').value = '';
        applyPreset('all');
      }});
    }
  }
  if (f.model)       items.push({ key: 'model',  label: 'Model',  value: f.model,  removable: true, clear: () => { document.getElementById('filterModel').value = ''; refresh(); }});
  if (f.querySource) items.push({ key: 'source', label: 'Source', value: f.querySource, removable: true, clear: () => { document.getElementById('filterSource').value = ''; refresh(); }});
  if (f.workspace)   items.push({ key: 'ws',     label: 'WS',     value: f.workspace, removable: true, clear: () => { document.getElementById('filterWorkspace').value = ''; refresh(); }});
  if (f.search)      items.push({ key: 'search', label: 'Search', value: f.search, removable: true, clear: () => { document.getElementById('filterSearch').value = ''; refresh(); }});

  const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  host.innerHTML = items.map((it, i) =>
    '<span class="chip" data-chip-i="' + i + '"><strong>' + it.label + ':</strong> ' + escapeHtml(it.value) +
      (it.removable ? '<button data-chip-clear="' + i + '" title="Remove">' + closeIcon + '</button>' : '') +
    '</span>'
  ).join('');
  host.querySelectorAll('[data-chip-clear]').forEach(btn => {
    const i = parseInt(btn.getAttribute('data-chip-clear'));
    btn.addEventListener('click', () => items[i].clear());
  });
}

/* ----- Pagination footer ----- */
function paginationFooter(tableId, total, defaultSize) {
  const p = getPage(tableId, defaultSize);
  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  if (p.page >= totalPages) p.page = totalPages - 1;
  const start = total === 0 ? 0 : p.page * p.pageSize + 1;
  const end = Math.min(total, (p.page + 1) * p.pageSize);
  return (
    '<div class="pagination">' +
      '<span>Showing <strong>' + start + '–' + end + '</strong> of <strong>' + total + '</strong></span>' +
      '<span class="group">' +
        '<button class="btn btn-ghost btn-sm" ' + (p.page === 0 ? 'disabled' : '') + ' data-page-prev="' + tableId + '">Prev</button>' +
        '<span>' + (p.page + 1) + ' / ' + totalPages + '</span>' +
        '<button class="btn btn-ghost btn-sm" ' + (p.page >= totalPages - 1 ? 'disabled' : '') + ' data-page-next="' + tableId + '">Next</button>' +
      '</span>' +
    '</div>'
  );
}
function attachPaginationHandlers() {
  document.querySelectorAll('[data-page-prev]').forEach(b =>
    b.addEventListener('click', () => {
      const id = b.getAttribute('data-page-prev');
      setPage(id, getPage(id).page - 1);
    }));
  document.querySelectorAll('[data-page-next]').forEach(b =>
    b.addEventListener('click', () => {
      const id = b.getAttribute('data-page-next');
      setPage(id, getPage(id).page + 1);
    }));
}
function attachSortHandlers() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const id = th.getAttribute('data-sort-table');
      const key = th.getAttribute('data-sort-key');
      setSort(id, key);
    });
  });
}
function attachCopyHandlers() {
  document.querySelectorAll('[data-copy]').forEach(b =>
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      copyText(b.getAttribute('data-copy'));
    }));
}

/* ----- Empty state helpers ----- */
function emptyCell(colspan, text, iconKey) {
  return '<tr><td colspan="' + colspan + '"><div class="empty"><div class="empty-icon">' + (ICONS[iconKey] || ICONS.search) + '</div><p>' + text + '</p></div></td></tr>';
}
`;
