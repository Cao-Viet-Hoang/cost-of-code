import { buildIconsJs } from './icons';
import { FORMAT_JS }     from './format';
import { CHARTS_JS }     from './charts';
import { STATE_JS }      from './state';
import { COMPONENTS_JS } from './components';
import { OVERVIEW_JS }   from './tabs/overview';
import { TRENDS_JS }     from './tabs/trends';
import { SESSIONS_JS }   from './tabs/sessions';
import { BREAKDOWN_JS }  from './tabs/breakdown';
import { CACHE_JS }      from './tabs/cache';
import { HEALTH_JS }     from './tabs/health';

/** Concatenated browser-side JS bundle injected into the webview. */
export function buildClientJs(autoRefreshSeconds: number): string {
  const BOOTSTRAP = `
/* ----- TABS ----- */
function setActiveTab(tab, subtab) {
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.getAttribute('data-tab') === tab));
  document.querySelectorAll('.panel').forEach(el => el.classList.toggle('active', el.getAttribute('data-panel') === tab));
  if (subtab) setSubtab(subtab);
  if (lastData) requestAnimationFrame(() => render(lastData));
}
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => setActiveTab(t.getAttribute('data-tab')));
});
document.querySelectorAll('[data-goto-tab]').forEach(b => {
  b.addEventListener('click', () => setActiveTab(b.getAttribute('data-goto-tab'), b.getAttribute('data-goto-subtab') || undefined));
});
document.querySelectorAll('.subtab').forEach(b => {
  b.addEventListener('click', () => setSubtab(b.getAttribute('data-subtab')));
});

/* ----- Resize ----- */
let resizeTimer = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (lastData) render(lastData); }, 120);
});

/* ----- Filter buttons ----- */
document.querySelectorAll('.preset-group button').forEach(b => {
  b.addEventListener('click', () => applyPreset(b.getAttribute('data-preset')));
});
document.getElementById('refreshBtn').addEventListener('click', refresh);
document.getElementById('toggleAuto').addEventListener('click', toggleAuto);
document.getElementById('applyFilter').addEventListener('click', () => {
  // changing from preset to typed date — switch to custom
  currentPreset = 'custom';
  document.querySelectorAll('.preset-group button').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-preset') === 'custom'));
  refresh();
});
document.getElementById('clearFilter').addEventListener('click', () => {
  for (const id of ['filterStart','filterEnd','filterSearch']) document.getElementById(id).value = '';
  document.getElementById('filterModel').value = '';
  document.getElementById('filterSource').value = '';
  document.getElementById('filterWorkspace').value = '';
  applyPreset('7d');
});
document.getElementById('setupBtn').addEventListener('click', () => vscode.postMessage({ type: 'runInstall' }));

/* ----- Health buttons ----- */
document.getElementById('installBtn').addEventListener('click', () => vscode.postMessage({ type: 'runInstall' }));
document.getElementById('startBtn').addEventListener('click',   () => vscode.postMessage({ type: 'startCollector' }));
document.getElementById('stopBtn').addEventListener('click',    () => vscode.postMessage({ type: 'stopCollector' }));
document.getElementById('statusBtn').addEventListener('click',  () => vscode.postMessage({ type: 'runStatus' }));
document.getElementById('dataBtn').addEventListener('click',    () => vscode.postMessage({ type: 'openDataFolder' }));
document.getElementById('exportsBtn').addEventListener('click', () => vscode.postMessage({ type: 'openExports' }));
document.getElementById('uninstallBtn').addEventListener('click', () => openModal('confirmUninstall'));
document.getElementById('confirmUninstallBtn').addEventListener('click', () => {
  closeModal('confirmUninstall');
  vscode.postMessage({ type: 'runUninstall' });
});
document.querySelectorAll('[data-modal-close]').forEach(b =>
  b.addEventListener('click', () => closeModal(b.getAttribute('data-modal-close'))));

/* ----- First-run setup button ----- */
const firstRunSetup = document.getElementById('firstRunSetup');
if (firstRunSetup) firstRunSetup.addEventListener('click', () => vscode.postMessage({ type: 'runInstall' }));

/* ----- Exports ----- */
document.querySelectorAll('button[data-export]').forEach(btn => {
  btn.addEventListener('click', () => {
    const [scope, format] = btn.getAttribute('data-export').split('-');
    vscode.postMessage({ type: 'export', payload: { filter: readFilter(), format, label: scope } });
  });
});

/* ----- Session page-size ----- */
const pgSel = document.getElementById('sessionPageSize');
if (pgSel) pgSel.addEventListener('change', () => {
  const p = getPage('sessions');
  p.pageSize = parseInt(pgSel.value) || 50;
  p.page = 0;
  if (lastData) render(lastData);
});

/* ----- Keyboard shortcuts ----- */
document.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  if (e.key === '/' && !inField) { e.preventDefault(); document.getElementById('filterSearch').focus(); return; }
  if (e.key === 'Escape' && inField) { e.target.blur(); return; }
  if (e.key === 'Escape') { document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open')); return; }
  if (inField) return;
  if (e.key === 'r') { refresh(); return; }
  const tabs = ['overview','trends','sessions','breakdown','cache','health'];
  const idx = parseInt(e.key) - 1;
  if (idx >= 0 && idx < tabs.length) setActiveTab(tabs[idx]);
});

/* enter key in filters triggers apply */
document.getElementById('filters').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { currentPreset = 'custom'; refresh(); }
});

/* ----- Messages ----- */
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'data') {
    lastData = msg.payload;
    render(msg.payload);
  } else if (msg.type === 'sessionDetail') {
    requestCache[msg.payload.sessionId] = msg.payload.requests;
    if (lastData) render(lastData);
  } else if (msg.type === 'statusDetail') {
    renderStatusDetail(msg.payload);
  } else if (msg.type === 'error') {
    showToast(msg.payload.message);
  }
});

/* ----- Render dispatcher ----- */
function render(d) {
  // last-updated label
  const upd = document.getElementById('updated');
  upd.textContent = 'Updated ' + fmtRel(d.updatedAt);
  upd.title = fmtTimeFull(d.updatedAt);

  // status pill
  const pill = document.getElementById('statusPill');
  if (d.health.collectorRunning && d.health.newRecordsBeingWritten) {
    pill.dataset.state = 'ok';
    pill.querySelector('.status-text').textContent = 'Collector live';
  } else if (d.health.collectorRunning) {
    pill.dataset.state = 'warn';
    pill.querySelector('.status-text').textContent = 'Idle';
  } else {
    pill.dataset.state = 'bad';
    pill.querySelector('.status-text').textContent = 'Collector down';
  }

  // filter selects (preserve user choices)
  const ms = document.getElementById('filterModel');
  const ss = document.getElementById('filterSource');
  const ws = document.getElementById('filterWorkspace');
  const cur = { m: ms.value, s: ss.value, w: ws.value };
  ms.innerHTML = '<option value="">All models</option>'  + d.filterOptions.models.map(m  => '<option>' + escapeHtml(m)  + '</option>').join('');
  ss.innerHTML = '<option value="">All sources</option>' + d.filterOptions.sources.map(s => '<option>' + escapeHtml(s) + '</option>').join('');
  ws.innerHTML = '<option value="">All workspaces</option>' + d.filterOptions.workspaces.map(w => '<option value="' + escapeHtml(w) + '">' + escapeHtml(shortenWorkspace(w)) + '</option>').join('');
  ms.value = cur.m; ss.value = cur.s; ws.value = cur.w;

  renderActiveChips();
  renderOverview(d);
  renderTrends(d);
  renderSessions(d);
  renderBreakdown(d);
  renderCache(d);
  renderHealth(d);
}

/* ----- Initial ----- */
applyPreset('7d');         // sets dates and triggers a refresh
startAutoRefresh(__AUTO_REFRESH_SECONDS__);
`;

  return [
    buildIconsJs(),
    FORMAT_JS,
    CHARTS_JS,
    STATE_JS,
    COMPONENTS_JS,
    OVERVIEW_JS,
    TRENDS_JS,
    SESSIONS_JS,
    BREAKDOWN_JS,
    CACHE_JS,
    HEALTH_JS,
    BOOTSTRAP.replace('__AUTO_REFRESH_SECONDS__', String(autoRefreshSeconds)),
  ].join('\n');
}
