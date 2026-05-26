/**
 * Client-side state primitives: filter/preset/sort/pagination/drill-down.
 * Implemented as plain mutable globals to keep the bundle tiny — no framework.
 */
export const STATE_JS = `
const vscode = acquireVsCodeApi();

/* ----- Filter & preset state ----- */
const PRESETS = [
  { id: 'today',   label: 'Today'      },
  { id: '7d',      label: '7d'         },
  { id: '30d',     label: '30d'        },
  { id: 'month',   label: 'This Month' },
  { id: 'all',     label: 'All'        },
  { id: 'custom',  label: 'Custom'     },
];
let currentPreset = 'month';
/* '' = all tools, 'claude' or 'codex' for single-tool view */
let toolFilter = '';

function applyToolFilter(tool) {
  toolFilter = tool || '';
  document.querySelectorAll('#toolSwitch button').forEach(b => {
    b.classList.toggle('active', (b.getAttribute('data-tool') || '') === toolFilter);
  });
  // The Source filter is Claude-specific; hide it for Codex-only mode.
  const srcField = document.getElementById('filterSource');
  if (srcField && srcField.parentElement) {
    srcField.parentElement.style.display = toolFilter === 'codex' ? 'none' : '';
  }
  refresh();
}

function presetRange(id) {
  const today = new Date();
  const todayStr = dateOnly(today);
  if (id === 'today') return { startDate: todayStr, endDate: todayStr };
  if (id === '7d')    return { startDate: dateOnly(addDays(today, -6)),  endDate: todayStr };
  if (id === '30d')   return { startDate: dateOnly(addDays(today, -29)), endDate: todayStr };
  if (id === 'month') return { startDate: dateOnly(startOfMonth(today)), endDate: todayStr };
  return { startDate: '', endDate: '' };
}

function applyPreset(id) {
  currentPreset = id;
  document.querySelectorAll('.preset-group button').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-preset') === id);
  });
  if (id !== 'custom') {
    const r = presetRange(id);
    document.getElementById('filterStart').value = r.startDate;
    document.getElementById('filterEnd').value   = r.endDate;
  }
  refresh();
}

function readFilter() {
  const f = {};
  const s = document.getElementById('filterStart').value;
  const e = document.getElementById('filterEnd').value;
  const m = document.getElementById('filterModel').value;
  const src = document.getElementById('filterSource').value;
  const ws  = document.getElementById('filterWorkspace').value;
  const q = document.getElementById('filterSearch').value;
  if (s) f.startDate = s;
  if (e) f.endDate = e;
  if (m) f.model = m;
  if (src && toolFilter !== 'codex') f.querySource = src;
  if (ws) f.workspace = ws;
  if (q) f.search = q;
  if (toolFilter) f.tool = toolFilter;
  return f;
}
function refresh() {
  vscode.postMessage({ type: 'refresh', payload: { filter: readFilter() } });
}

/* ----- Auto-refresh ----- */
let autoRefreshTimer = null;
let autoRefreshSeconds = 15;
let autoRefreshEnabled = true;
let countdown = 15;
function startAutoRefresh(sec) {
  stopAutoRefresh();
  autoRefreshSeconds = sec || 15;
  if (autoRefreshSeconds <= 0 || !autoRefreshEnabled) return;
  countdown = autoRefreshSeconds;
  updateCountdownUi();
  autoRefreshTimer = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      refresh();
      countdown = autoRefreshSeconds;
    }
    updateCountdownUi();
  }, 1000);
}
function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  updateCountdownUi();
}
function updateCountdownUi() {
  const el = document.getElementById('countdown');
  if (!el) return;
  el.textContent = autoRefreshEnabled && autoRefreshSeconds > 0 ? countdown + 's' : '—';
  const tog = document.getElementById('toggleAuto');
  if (tog) tog.innerHTML = autoRefreshEnabled ? ICONS.pause : ICONS.play;
  if (tog) tog.title = autoRefreshEnabled ? 'Pause auto-refresh' : 'Resume auto-refresh';
}
function toggleAuto() {
  autoRefreshEnabled = !autoRefreshEnabled;
  if (autoRefreshEnabled) {
    startAutoRefresh(autoRefreshSeconds);
  } else {
    stopAutoRefresh();
  }
}

/* ----- Toast ----- */
function showToast(message, kind) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.classList.toggle('success', kind === 'success');
  t.hidden = false;
  setTimeout(() => { t.hidden = true; }, 4000);
}

/* ----- Clipboard ----- */
function copyText(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast('Copied', 'success'),
      () => showToast('Copy failed'),
    );
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast('Copied', 'success'); }
    catch { showToast('Copy failed'); }
    finally { document.body.removeChild(ta); }
  }
}

/* ----- Table sort state ----- */
const sortState = {}; // { tableId: { key, dir } }
function setSort(tableId, key) {
  const s = sortState[tableId] || { key: null, dir: 'desc' };
  if (s.key === key) {
    s.dir = s.dir === 'asc' ? 'desc' : 'asc';
  } else {
    s.key = key;
    s.dir = 'desc';
  }
  sortState[tableId] = s;
  if (lastData) render(lastData);
}
function getSorted(tableId, rows, getters) {
  const s = sortState[tableId];
  if (!s || !s.key || !getters[s.key]) return rows;
  const get = getters[s.key];
  const dir = s.dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const va = get(a), vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
}
function sortArrow(tableId, key) {
  const s = sortState[tableId];
  if (!s || s.key !== key) return '<span class="arrow">▾</span>';
  return s.dir === 'asc' ? '<span class="arrow">▴</span>' : '<span class="arrow">▾</span>';
}
function sortableHeader(tableId, key, label, opts) {
  const cls = ['sortable'];
  if (opts && opts.num) cls.push('num');
  const s = sortState[tableId];
  if (s && s.key === key) cls.push('sorted-' + s.dir);
  return '<th class="' + cls.join(' ') + '" data-sort-table="' + tableId + '" data-sort-key="' + key + '">' + label + sortArrow(tableId, key) + '</th>';
}

/* ----- Pagination state ----- */
const pageState = {}; // { tableId: { page, pageSize } }
function getPage(tableId, defaultSize) {
  if (!pageState[tableId]) pageState[tableId] = { page: 0, pageSize: defaultSize || 50 };
  return pageState[tableId];
}
function setPage(tableId, page) {
  const p = getPage(tableId);
  p.page = Math.max(0, page);
  if (lastData) render(lastData);
}

/* ----- Drill-down (expanded rows) ----- */
const expanded = new Set();
const requestCache = {}; // sessionId -> RequestDetail[]
function toggleExpand(sessionId) {
  if (expanded.has(sessionId)) {
    expanded.delete(sessionId);
    if (lastData) render(lastData);
  } else {
    expanded.add(sessionId);
    if (requestCache[sessionId]) {
      if (lastData) render(lastData);
    } else {
      vscode.postMessage({ type: 'getSessionDetail', payload: { sessionId } });
    }
  }
}

/* ----- Modal ----- */
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

let lastData = null;
`;
