import { ICONS } from '../icons';

export const SESSIONS_HTML = `
<section class="panel" data-panel="sessions">
  <div class="card">
    <div class="card-header">
      <div>
        <h3 class="card-title">Sessions</h3>
        <p class="card-desc" id="sessionsSubtitle">All sessions in the selected filter</p>
      </div>
      <div class="card-actions">
        <label class="field" style="min-width:auto">
          <span>Page size</span>
          <select id="sessionPageSize">
            <option value="25">25</option>
            <option value="50" selected>50</option>
            <option value="100">100</option>
            <option value="250">250</option>
          </select>
        </label>
        <button class="btn btn-ghost btn-sm" data-export="sessions-jsonl">${ICONS.download} JSONL</button>
        <button class="btn btn-ghost btn-sm" data-export="sessions-csv">${ICONS.download} CSV</button>
      </div>
    </div>
    <div class="card-body table-wrap" style="padding:0">
      <table class="data" id="sessionsTable">
        <thead id="sessionsThead"></thead>
        <tbody></tbody>
      </table>
      <div class="empty" id="sessionsEmpty" hidden>
        <div class="empty-icon">${ICONS.users}</div>
        <p>No sessions match the current filter.</p>
      </div>
    </div>
    <div id="sessionsFooter"></div>
  </div>
</section>
`;

export const SESSIONS_JS = `
function renderSessions(d) {
  const tbody = document.querySelector('#sessionsTable tbody');
  const empty = document.getElementById('sessionsEmpty');
  const subtitle = document.getElementById('sessionsSubtitle');
  const thead = document.getElementById('sessionsThead');
  const footer = document.getElementById('sessionsFooter');

  thead.innerHTML = '<tr>' +
    '<th style="width:24px"></th>' +
    sortableHeader('sessions', 'sessionId',     'Session') +
    sortableHeader('sessions', 'workspace',     'Workspace') +
    sortableHeader('sessions', 'startTime',     'Started') +
    sortableHeader('sessions', 'durationMs',    'Duration',     { num: true }) +
    sortableHeader('sessions', 'cost',          'Cost',         { num: true }) +
    '<th>Models</th>' +
    sortableHeader('sessions', 'totalTokensWithCache', 'Tokens (cached)', { num: true }) +
    sortableHeader('sessions', 'requests',      'Reqs',         { num: true }) +
  '</tr>';

  const sessions = d.sessions || [];
  if (sessions.length === 0) {
    empty.hidden = false;
    tbody.innerHTML = '';
    footer.innerHTML = '';
    subtitle.textContent = 'No sessions in the selected filter';
    return;
  }
  empty.hidden = true;
  subtitle.textContent = sessions.length + ' session' + (sessions.length === 1 ? '' : 's') + ' in the selected filter';

  // Default sort: by endTime desc (latest first)
  if (!sortState.sessions || !sortState.sessions.key) {
    sortState.sessions = { key: 'startTime', dir: 'desc' };
  }

  const getters = {
    sessionId: s => s.sessionId,
    workspace: s => s.workspace || '',
    startTime: s => s.startTime,
    durationMs: s => s.durationMs,
    cost: s => s.cost,
    totalTokensWithCache: s => s.totalTokensWithCache,
    requests: s => s.requests,
  };
  const sorted = getSorted('sessions', sessions, getters);

  // pagination
  const p = getPage('sessions', 50);
  const pgSel = document.getElementById('sessionPageSize');
  if (pgSel && parseInt(pgSel.value) !== p.pageSize) pgSel.value = String(p.pageSize);
  const start = p.page * p.pageSize;
  const pageRows = sorted.slice(start, start + p.pageSize);
  const max = Math.max(1, ...sorted.map(s => s.cost));

  tbody.innerHTML = pageRows.map(s => {
    const pct = (s.cost / max) * 100;
    const isOpen = expanded.has(s.sessionId);
    const chevron = '<span class="chevron-cell" style="display:inline-block;transition:transform 120ms;transform:rotate(' + (isOpen ? '90' : '0') + 'deg)">' + ICONS.chevron + '</span>';
    const row =
      '<tr class="expandable" data-expand="' + escapeHtml(s.sessionId) + '">' +
        '<td>' + chevron + '</td>' +
        '<td><span class="session-id" title="' + escapeHtml(s.sessionId || '') + '">' +
          escapeHtml((s.sessionId || '').slice(0, 8)) + '…</span>' +
          ' <button class="copy-btn" data-copy="' + escapeHtml(s.sessionId || '') + '" title="Copy id">' + ICONS.copy + '</button>' +
        '</td>' +
        '<td title="' + escapeHtml(s.workspace || '') + '">' + escapeHtml(shortenWorkspace(s.workspace)) + '</td>' +
        '<td title="' + escapeHtml(fmtTimeFull(s.startTime)) + '">' + fmtTime(s.startTime) + '</td>' +
        '<td class="num">' + fmtMs(s.durationMs) + '</td>' +
        '<td class="num bar-cell">' + fmtCost(s.cost) +
          '<span class="bar" style="width:' + pct + '%"></span>' +
        '</td>' +
        '<td>' + (s.models || []).map(m => '<span class="tag">' + escapeHtml(m) + '</span>').join('') + '</td>' +
        '<td class="num">' + fmt(s.totalTokensWithCache) + '</td>' +
        '<td class="num">' + fmt(s.requests) + '</td>' +
      '</tr>';

    let detail = '';
    if (isOpen) {
      const reqs = requestCache[s.sessionId];
      if (!reqs) {
        detail =
          '<tr class="detail-row"><td colspan="9">' +
            '<div class="empty" style="padding:16px"><p class="muted">Loading requests…</p></div>' +
          '</td></tr>';
      } else if (reqs.length === 0) {
        detail =
          '<tr class="detail-row"><td colspan="9">' +
            '<div class="empty" style="padding:16px"><p class="muted">No request-level data for this session.</p></div>' +
          '</td></tr>';
      } else {
        detail =
          '<tr class="detail-row"><td colspan="9"><div class="table-wrap" style="padding:0 14px 12px">' +
            '<table class="data" style="margin-top:4px"><thead><tr>' +
              '<th>Time</th><th>Model</th><th class="num">Input</th><th class="num">Output</th>' +
              '<th class="num">Cache read</th><th class="num">Cache create</th>' +
              '<th class="num">Cost</th><th class="num">Duration</th><th>Source</th><th>Request</th>' +
            '</tr></thead><tbody>' +
              reqs.map(r => (
                '<tr>' +
                  '<td title="' + escapeHtml(fmtTimeFull(r.timestamp)) + '">' + fmtTime(r.timestamp) + '</td>' +
                  '<td>' + escapeHtml(r.model || '—') + '</td>' +
                  '<td class="num">' + fmt(r.inputTokens) + '</td>' +
                  '<td class="num">' + fmt(r.outputTokens) + '</td>' +
                  '<td class="num">' + fmt(r.cacheReadTokens) + '</td>' +
                  '<td class="num">' + fmt(r.cacheCreationTokens) + '</td>' +
                  '<td class="num">' + fmtCost(r.cost) + '</td>' +
                  '<td class="num">' + fmtMs(r.durationMs) + '</td>' +
                  '<td>' + escapeHtml(r.querySource || '—') + '</td>' +
                  '<td><span class="mono-cell" title="' + escapeHtml(r.requestId || '') + '">' +
                    escapeHtml((r.requestId || '').slice(0, 10)) + (r.requestId && r.requestId.length > 10 ? '…' : '') +
                  '</span></td>' +
                '</tr>'
              )).join('') +
            '</tbody></table>' +
          '</div></td></tr>';
      }
    }
    return row + detail;
  }).join('');

  footer.innerHTML = paginationFooter('sessions', sorted.length, p.pageSize);

  // Wire row-expand
  tbody.querySelectorAll('tr.expandable').forEach(tr => {
    tr.addEventListener('click', (ev) => {
      if (ev.target.closest('.copy-btn')) return;
      toggleExpand(tr.getAttribute('data-expand'));
    });
  });

  attachSortHandlers();
  attachPaginationHandlers();
  attachCopyHandlers();
}
`;
