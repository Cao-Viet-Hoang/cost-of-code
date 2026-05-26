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
document.querySelectorAll('#toolSwitch button').forEach(b => {
  b.addEventListener('click', () => applyToolFilter(b.getAttribute('data-tool') || ''));
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
  applyPreset('month');
});
document.getElementById('setupBtn').addEventListener('click', () => openSetupModal());

/* ----- Health buttons ----- */
document.getElementById('installBtn').addEventListener('click', () => openSetupModal());
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
document.getElementById('importHistoricalBtn').addEventListener('click', () => openModal('confirmImportHistorical'));
document.getElementById('confirmImportHistoricalBtn').addEventListener('click', () => {
  closeModal('confirmImportHistorical');
  vscode.postMessage({ type: 'importHistorical', payload: { dryRun: false } });
});
document.getElementById('dryRunImportBtn').addEventListener('click', () => {
  closeModal('confirmImportHistorical');
  vscode.postMessage({ type: 'importHistorical', payload: { dryRun: true } });
});
document.querySelectorAll('[data-modal-close]').forEach(b =>
  b.addEventListener('click', () => closeModal(b.getAttribute('data-modal-close'))));

/* ----- First-run setup button ----- */
const firstRunSetup = document.getElementById('firstRunSetup');
if (firstRunSetup) firstRunSetup.addEventListener('click', () => openSetupModal());

/* ----- Setup modal ----- */
let runSetupLabel = 'Run setup';
function openSetupModal() {
  document.getElementById('setupStatusBox').hidden = true;
  document.getElementById('setupPortResult').innerHTML = '';
  document.getElementById('setupPortInput').value = '4318';
  runSetupLabel = 'Run setup';
  setupPending = null;
  setSetupBusy(false, runSetupLabel);
  openModal('setupModal');
  vscode.postMessage({ type: 'getSetupState' });
}
function renderSetupState(s) {
  const portInput = document.getElementById('setupPortInput');
  if (s.currentPort) portInput.value = String(s.currentPort);

  const box = document.getElementById('setupStatusBox');
  const runBtn = document.getElementById('runSetupBtn');
  if (s.alreadyInstalled) {
    box.hidden = false;
    box.className = 'setup-status ok';
    box.innerHTML =
      '<strong>Already set up.</strong> ' +
      'You don\\'t need to run setup again unless something looks broken in the Collector status panel. ' +
      'Re-running will reinstall the collector files and re-register the autostart task.';
    runSetupLabel = 'Re-run setup';
  } else {
    box.hidden = false;
    box.className = 'setup-status warn';
    const parts = [];
    if (s.taskRegistered === false) parts.push('scheduled task not registered');
    if (!s.envConfigured) parts.push('telemetry env not configured');
    box.innerHTML =
      '<strong>Not fully set up yet.</strong> ' +
      (parts.length ? ('Missing: ' + parts.join(', ') + '.') : 'Run setup to install the collector and autostart task.');
    runSetupLabel = 'Run setup';
  }
  runBtn.textContent = runSetupLabel;
}
let setupPending = null; // null | 'manual' | 'install'
function setSetupBusy(busy, runLabel) {
  const checkBtn = document.getElementById('checkPortBtn');
  const runBtn = document.getElementById('runSetupBtn');
  const input = document.getElementById('setupPortInput');
  checkBtn.disabled = busy;
  runBtn.disabled = busy;
  input.disabled = busy;
  if (runLabel) runBtn.textContent = runLabel;
}
function renderPortCheck(r) {
  const el = document.getElementById('setupPortResult');
  const cls = r.status === 'free' ? 'ok'
    : r.status === 'in-use-by-tracker' ? 'info'
    : 'bad';
  el.className = 'setup-port-result ' + cls;
  el.textContent = r.message;

  // Pre-flight branch: user clicked Run setup, we ran a check first.
  if (setupPending === 'install') {
    setupPending = null;
    const safe = r.status === 'free' || r.status === 'in-use-by-tracker';
    if (safe) {
      closeModal('setupModal');
      vscode.postMessage({ type: 'runInstall', payload: { port: r.port } });
    } else {
      setSetupBusy(false, runSetupLabel);
    }
    return;
  }
  setupPending = null;
  setSetupBusy(false, runSetupLabel);
}
document.getElementById('checkPortBtn').addEventListener('click', () => {
  const port = parseInt(document.getElementById('setupPortInput').value, 10);
  setupPending = 'manual';
  setSetupBusy(true);
  vscode.postMessage({ type: 'checkPort', payload: { port } });
});
document.getElementById('setupPortInput').addEventListener('input', () => {
  document.getElementById('setupPortResult').innerHTML = '';
});
document.getElementById('runSetupBtn').addEventListener('click', () => {
  const port = parseInt(document.getElementById('setupPortInput').value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    document.getElementById('setupPortResult').className = 'setup-port-result bad';
    document.getElementById('setupPortResult').textContent = 'Port must be an integer between 1 and 65535.';
    return;
  }
  // Pre-flight check — install proceeds in renderPortCheck if safe.
  setupPending = 'install';
  setSetupBusy(true, 'Checking port…');
  vscode.postMessage({ type: 'checkPort', payload: { port } });
});

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
  } else if (msg.type === 'setupState') {
    renderSetupState(msg.payload);
  } else if (msg.type === 'portCheck') {
    renderPortCheck(msg.payload);
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
applyPreset('month');         // sets dates and triggers a refresh
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
