import { ICONS } from '../icons';

export const HEALTH_HTML = `
<section class="panel" data-panel="health">
  <div class="card">
    <div class="card-header">
      <div>
        <h3 class="card-title">Collector status</h3>
        <p class="card-desc">Local OTLP collector &amp; data folder checks</p>
      </div>
      <div id="healthSummary"></div>
    </div>
    <div class="card-body">
      <div class="health-grid" id="healthBody"></div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div><h3 class="card-title">Actions</h3><p class="card-desc">Setup &amp; collector control</p></div></div>
    <div class="card-body">
      <div class="action-group">
        <h4>Setup</h4>
        <div class="action-row">
          <button class="btn btn-primary" id="installBtn">${ICONS.settings} Run setup</button>
          <button class="btn btn-secondary" id="statusBtn">${ICONS.activity} Show status</button>
        </div>
      </div>
      <div class="action-group">
        <h4>Collector</h4>
        <div class="action-row">
          <button class="btn btn-secondary" id="startBtn">${ICONS.play} Start</button>
          <button class="btn btn-secondary" id="stopBtn">${ICONS.pause} Stop</button>
        </div>
      </div>
      <div class="action-group">
        <h4>Files</h4>
        <div class="action-row">
          <button class="btn btn-secondary" id="dataBtn">${ICONS.folder} Data folder</button>
          <button class="btn btn-secondary" id="exportsBtn">${ICONS.folder} Exports folder</button>
        </div>
      </div>
      <div class="action-group">
        <h4>Data</h4>
        <div class="action-col">
          <div class="action-row">
            <button class="btn btn-secondary" id="importHistoricalBtn">${ICONS.download} Import historical</button>
          </div>
          <p class="action-hint">Backfill past usage from <code>~/.claude/projects</code> transcripts. Dates already covered by OTEL are skipped.</p>
        </div>
      </div>
      <div class="action-group danger">
        <h4>Danger zone</h4>
        <div class="action-row">
          <button class="btn btn-destructive-ghost" id="uninstallBtn">Uninstall…</button>
        </div>
      </div>
    </div>
  </div>
</section>
`;

export const HEALTH_MODALS_HTML = `
  <div class="modal-bg" id="setupModal">
    <div class="modal">
      <h3>Setup Cost of Code</h3>
      <p>Installs the local OTLP collector and registers it to autostart at logon.</p>

      <div id="setupStatusBox" class="setup-status" hidden></div>

      <div class="setup-port">
        <label for="setupPortInput">Collector port</label>
        <div class="setup-port-row">
          <input type="number" id="setupPortInput" min="1" max="65535" step="1" />
          <button class="btn btn-secondary btn-sm" id="checkPortBtn">${ICONS.search} Check</button>
        </div>
        <div id="setupPortResult" class="setup-port-result" aria-live="polite"></div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close="setupModal">Cancel</button>
        <button class="btn btn-primary" id="runSetupBtn">Run setup</button>
      </div>
    </div>
  </div>

  <div class="modal-bg" id="confirmImportHistorical">
    <div class="modal">
      <h3>Import historical usage?</h3>
      <p>This reads conversation transcripts from <code>~/.claude/projects</code> and writes any missing days into your usage folder. Dates already covered by OTEL are skipped, so re-running is safe.</p>
      <p class="card-desc">Use <strong>Dry run</strong> to preview what would be imported without writing files.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close="confirmImportHistorical">Cancel</button>
        <button class="btn btn-secondary" id="dryRunImportBtn">Dry run</button>
        <button class="btn btn-primary" id="confirmImportHistoricalBtn">Import</button>
      </div>
    </div>
  </div>

  <div class="modal-bg" id="confirmUninstall">
    <div class="modal">
      <h3>Uninstall the collector?</h3>
      <p>This stops the collector and unregisters the autostart task. Your usage data under <code>~/.claude/usage-tracker</code> is preserved.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close="confirmUninstall">Cancel</button>
        <button class="btn btn-destructive" id="confirmUninstallBtn">Uninstall</button>
      </div>
    </div>
  </div>

  <div class="modal-bg" id="statusModal">
    <div class="modal modal-wide">
      <h3>Collector status</h3>
      <p class="card-desc">Detailed snapshot from the autostart entry, HTTP endpoint, status file, and Claude Code settings.</p>
      <div id="statusModalBody" class="status-detail"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close="statusModal">Close</button>
      </div>
    </div>
  </div>
`;

export const HEALTH_JS = `
function renderHealth(d) {
  const h = d.health;
  const okBadge  = (label) => '<span class="badge ok"><span class="dot"></span>' + label + '</span>';
  const badBadge = (label) => '<span class="badge bad"><span class="dot"></span>' + label + '</span>';
  const unkBadge = '<span class="badge"><span class="dot"></span>unknown</span>';
  const yn = (b) => b ? okBadge('yes') : badBadge('no');

  let summary;
  if (h.collectorRunning && h.newRecordsBeingWritten) {
    summary = '<span class="badge ok"><span class="dot"></span>Healthy</span>';
  } else if (h.collectorRunning) {
    summary = '<span class="badge warn"><span class="dot"></span>Idle</span>';
  } else {
    summary = '<span class="badge bad"><span class="dot"></span>Collector down</span>';
  }
  document.getElementById('healthSummary').innerHTML = summary;

  const rows = [
    ['Collector running',                    yn(h.collectorRunning)],
    ['Collector responding (HTTP)',          yn(h.collectorRespondedHttp)],
    ['Endpoint',                             '<span class="health-value mono">' + escapeHtml(h.endpoint) + ' <button class="copy-btn" data-copy="' + escapeHtml(h.endpoint) + '" title="Copy">' + ICONS.copy + '</button></span>'],
    ['Data root exists',                     yn(h.rootDirExists)],
    ['Raw folder exists',                    yn(h.rawDirExists)],
    ['Usage folder exists',                  yn(h.usageDirExists)],
    ['New records being written (10m)',      yn(h.newRecordsBeingWritten)],
    ['Last received event',                  '<span class="health-value" title="' + escapeHtml(fmtTimeFull(h.lastEventAt)) + '">' + fmtRel(h.lastEventAt) + '</span>'],
    ['Last usage record',                    '<span class="health-value" title="' + escapeHtml(fmtTimeFull(h.lastUsageAt)) + '">' + fmtRel(h.lastUsageAt) + '</span>'],
    ['Telemetry env configured',             yn(h.telemetryEnvConfigured)],
    ['Autostart registered',                  h.scheduledTaskRegistered === null ? unkBadge : yn(h.scheduledTaskRegistered)],
    ['Has any usage records',                yn(h.hasUsageRecords)],
    ['OTLP requests received',               '<span class="health-value">' + fmt(h.totalRequests) + '</span>'],
    ['OTLP log payloads received',           '<span class="health-value">' + fmt(h.totalLogPayloads) + '</span>'],
    ['Usage records written',                '<span class="health-value">' + fmt(h.totalUsageRecords) + '</span>'],
  ];

  const errs = (h.errors && h.errors.length)
    ? '<div class="hint bad" style="margin-top:12px"><strong>Errors:</strong><ul>' +
        h.errors.map(e => '<li>' + escapeHtml(e) + '</li>').join('') +
      '</ul></div>'
    : '';
  const notes = (h.notes && h.notes.length)
    ? '<div class="hint" style="margin-top:12px"><strong>Notes:</strong><ul>' +
        h.notes.map(e => '<li>' + escapeHtml(e) + '</li>').join('') +
      '</ul></div>'
    : '';

  document.getElementById('healthBody').innerHTML =
    rows.map(([k, v]) =>
      '<div class="health-row"><span class="health-key">' + escapeHtml(k) + '</span><span class="health-value">' + v + '</span></div>'
    ).join('') + errs + notes;
  attachCopyHandlers();
}

function renderStatusDetail(d) {
  const okBadge  = (label) => '<span class="badge ok"><span class="dot"></span>' + label + '</span>';
  const badBadge = (label) => '<span class="badge bad"><span class="dot"></span>' + label + '</span>';
  const warnBadge = (label) => '<span class="badge warn"><span class="dot"></span>' + label + '</span>';

  const row = (k, v) =>
    '<div class="health-row"><span class="health-key">' + escapeHtml(k) +
    '</span><span class="health-value">' + v + '</span></div>';

  const section = (title, html) =>
    '<div class="status-section"><h4>' + escapeHtml(title) + '</h4>' + html + '</div>';

  /* ----- Autostart ----- */
  let taskHtml;
  if (d.scheduledTask === null) {
    taskHtml = '<div class="hint">Autostart information is not available on this platform.</div>';
  } else if (!d.scheduledTask.registered) {
    taskHtml = row('Registered', badBadge('no')) +
      '<div class="hint" style="margin-top:8px">Run setup to register the autostart entry.</div>';
  } else {
    const t = d.scheduledTask;
    const OK_STATES = new Set(['Ready', 'Running', 'active', 'running']);
    const stateBadge = OK_STATES.has(t.state ?? '')
      ? okBadge(t.state ?? '') : warnBadge(t.state || 'unknown');
    const resultBadge = t.lastTaskResult === 0
      ? okBadge('0 (success)')
      : t.lastTaskResult === null
        ? '<span class="health-value">—</span>'
        : warnBadge(String(t.lastTaskResult));
    taskHtml =
      row('Registered', okBadge('yes')) +
      row('State', stateBadge) +
      row('Last run', '<span class="health-value" title="' + escapeHtml(fmtTimeFull(t.lastRunTime)) + '">' + fmtRel(t.lastRunTime) + '</span>') +
      row('Last result', resultBadge) +
      row('Next run', '<span class="health-value" title="' + escapeHtml(fmtTimeFull(t.nextRunTime)) + '">' + fmtRel(t.nextRunTime) + '</span>');
  }

  /* ----- HTTP endpoint ----- */
  const http = d.collectorHttp;
  let httpHtml =
    row('Endpoint', '<span class="health-value mono">' + escapeHtml(d.endpoint) + ' <button class="copy-btn" data-copy="' + escapeHtml(d.endpoint) + '" title="Copy">' + ICONS.copy + '</button></span>') +
    row('Responding', http.responded ? okBadge('yes') : badBadge('no'));
  if (http.status) {
    const s = http.status;
    if (s.pid != null)             httpHtml += row('PID', '<span class="health-value mono">' + escapeHtml(String(s.pid)) + '</span>');
    if (s.startedAt)               httpHtml += row('Started', '<span class="health-value" title="' + escapeHtml(fmtTimeFull(s.startedAt)) + '">' + fmtRel(s.startedAt) + '</span>');
    if (s.totalRequests != null)   httpHtml += row('Total requests', '<span class="health-value">' + fmt(s.totalRequests) + '</span>');
    if (s.totalLogPayloads != null) httpHtml += row('Log payloads', '<span class="health-value">' + fmt(s.totalLogPayloads) + '</span>');
    if (s.totalUsageRecords != null) httpHtml += row('Usage records', '<span class="health-value">' + fmt(s.totalUsageRecords) + '</span>');
    if (s.lastError)               httpHtml += row('Last error', '<span class="health-value bad">' + escapeHtml(s.lastError) + '</span>');
  }

  /* ----- Status file ----- */
  const sf = d.statusFile;
  let fileHtml =
    row('Path', '<span class="health-value mono">' + escapeHtml(sf.path) + ' <button class="copy-btn" data-copy="' + escapeHtml(sf.path) + '" title="Copy">' + ICONS.copy + '</button></span>') +
    row('Exists', sf.exists ? okBadge('yes') : badBadge('no'));
  if (sf.status) {
    const s = sf.status;
    if (s.now)        fileHtml += row('Written', '<span class="health-value" title="' + escapeHtml(fmtTimeFull(s.now)) + '">' + fmtRel(s.now) + '</span>');
    if (s.lastUsageAt) fileHtml += row('Last usage', '<span class="health-value" title="' + escapeHtml(fmtTimeFull(s.lastUsageAt)) + '">' + fmtRel(s.lastUsageAt) + '</span>');
  }

  /* ----- Telemetry env ----- */
  const env = d.telemetryEnv;
  let envHtml =
    row('settings.json', '<span class="health-value mono">' + escapeHtml(env.settingsPath) + ' <button class="copy-btn" data-copy="' + escapeHtml(env.settingsPath) + '" title="Copy">' + ICONS.copy + '</button></span>');
  if (!env.settingsExists) {
    envHtml += '<div class="hint bad" style="margin-top:8px">Missing — run setup to create it.</div>';
  } else {
    envHtml += env.entries.map(e =>
      row(e.name, e.value === null
        ? warnBadge('not set')
        : '<span class="health-value mono">' + escapeHtml(e.value) + '</span>')
    ).join('');
  }

  document.getElementById('statusModalBody').innerHTML =
    section('Autostart', taskHtml) +
    section('Collector HTTP', httpHtml) +
    section('Status file', fileHtml) +
    section('Claude Code telemetry env', envHtml);

  attachCopyHandlers();
  openModal('statusModal');
}
`;
