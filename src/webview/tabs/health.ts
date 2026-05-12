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
      <div class="action-group danger">
        <h4>Danger zone</h4>
        <div class="action-row">
          <button class="btn btn-destructive-ghost" id="uninstallBtn">Uninstall…</button>
        </div>
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
</section>
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
    ['Scheduled task registered',            h.scheduledTaskRegistered === null ? unkBadge : yn(h.scheduledTaskRegistered)],
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
`;
