/**
 * Assets for the compact Explorer sidebar view.
 *
 * Deliberately independent from the full dashboard assets: chrome (text,
 * surfaces, buttons) uses VSCode theme variables so the view blends into the
 * side bar, while the data marks use a fixed categorical palette so a bar means
 * the same thing here as it does on the dashboard.
 *
 * Palette note: hues are stepped per mode because a single step cannot sit
 * inside both the light and the dark lightness band. Two independent sets are
 * in play, each validated on its own because they never share a chart — the
 * three donut slots (top-model donut, which needs all-pairs separation, not
 * just adjacent) and the single accent used by the trend line and the meter.
 * Contrast against the light surface is in the relief band, which is why
 * every mark here carries a visible label and value.
 */

export const SIDEBAR_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }

/* Declared on body, not :root — the --vscode-* variables these derive from are
   inherited, so a :root declaration can resolve before they exist. */
body {
  /* One step for both modes: it clears the lightness band and 3:1 contrast on
     the light and the dark surface alike. */
  --accent-mark: #008300;
  --slice-1: #2A78D6;
  --slice-2: #E87BA4;
  --slice-3: #EDA100;
  --slice-other: color-mix(in srgb, var(--vscode-foreground) 38%, transparent);
  --surface: var(--vscode-sideBar-background, var(--vscode-editor-background, #fff));
  --rule:  color-mix(in srgb, var(--vscode-foreground) 14%, transparent);

  /* One vertical rhythm for the whole view. Every gap is one of these three.
     The section gap is deliberately tight: VSCode splits the Explorer height
     evenly between the expanded panes, so the whole view has to live inside
     roughly half of it or the user has to drag the sash to see the bottom. */
  --gap-section: 12px;
  --gap-title: 6px;
  --gap-row: 4px;
}
body.vscode-dark, body.vscode-high-contrast {
  --slice-1: #3987E5;
  --slice-2: #D55181;
  --slice-3: #C98500;
  --rule:  color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
}

body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-sideBar-foreground, var(--vscode-foreground));
  background: transparent;
  padding: 10px 14px 12px;
}

/* ---------- status ---------- */
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--gap-section);
  cursor: pointer;
  color: var(--vscode-descriptionForeground);
}
.status .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: var(--vscode-descriptionForeground);
}
.status[data-state="ok"]   .dot { background: var(--vscode-testing-iconPassed, #3fb950); }
.status[data-state="warn"] .dot { background: var(--vscode-editorWarning-foreground, #d29922); }
.status[data-state="bad"]  .dot { background: var(--vscode-editorError-foreground, #f85149); }
.status .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The refresh stamp rides the status line — it belongs to "is this current?",
   which is the same question the dot answers. */
.status .stamp {
  margin-left: auto;
  padding-left: 8px;
  flex: 0 0 auto;
  font-size: 0.9em;
  opacity: 0.75;
  white-space: nowrap;
}

/* ---------- blocks ---------- */
/* Sections are separated by one hairline rule and one section gap — nothing
   else. A hidden block contributes neither, so the rhythm survives it. */
.block[hidden] { display: none; }
.block + .block:not([hidden]) {
  margin-top: var(--gap-section);
  padding-top: var(--gap-section);
  border-top: 1px solid var(--rule);
}
.title,
.block-head .label {
  margin: 0;
  font-size: 0.85em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vscode-descriptionForeground);
}
.title { margin-bottom: var(--gap-title); }
/* The Today card already ends with an edge — a hairline right under it would
   be a second separator doing the same job. */
.tile + .block:not([hidden]) { border-top: none; padding-top: 0; }

/* ---------- stat tile ---------- */
.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}
/* The Today block is a card. Figure/ground is what makes the hero number read,
   so the number itself carries no decoration — no tint, no pill, no shrunken
   currency mark; those compete with the figure instead of serving it. */
.tile {
  background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
  border-radius: 6px;
  padding: 10px 12px 12px;
}
body.vscode-high-contrast .tile { border: 1px solid var(--rule); }

.hero { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
/* Proportional figures on purpose: tabular digits read loose at display size. */
.tile .value {
  font-size: 2.7em;
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--vscode-foreground);
}
.tile .sub {
  margin-top: 3px;
  font-size: 0.92em;
  color: var(--vscode-descriptionForeground);
  font-variant-numeric: tabular-nums;
}
/* Only the arrow wears the direction colour — a whole line of amber next to
   the figure reads as an alert, which is not what a change vs yesterday is. */
.delta {
  margin-left: auto;
  font-size: 0.88em;
  white-space: nowrap;
  color: var(--vscode-descriptionForeground);
}
.delta .arrow { font-size: 0.9em; }
.delta[data-dir="up"]   .arrow { color: var(--vscode-editorWarning-foreground, #d29922); }
.delta[data-dir="down"] .arrow { color: var(--vscode-testing-iconPassed, #3fb950); }
.delta[hidden] { display: none; }

/* Cache hit ratio lives inside the Today tile: it qualifies today's tokens
   rather than standing on its own. */
.cache-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
  font-size: 0.9em;
  color: var(--vscode-descriptionForeground);
  font-variant-numeric: tabular-nums;
}
.cache-line[hidden] { display: none; }

.spark { display: block; width: 100%; height: 38px; margin-top: 10px; overflow: visible; }
.caption {
  color: var(--vscode-descriptionForeground);
  font-size: 0.9em;
  margin: 5px 0 0;
  font-variant-numeric: tabular-nums;
}
.caption[hidden] { display: none; }

/* ---------- donut ---------- */
/* Slices are separated by a 2px gap stroked in the surface color, never a
   border. */
/* Chart beside its key while both fit; the flex gap doubles as the stacked
   spacing once the side bar gets too narrow and the legend wraps under. */
.donut-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 2px;
}
.donut-wrap[hidden] { display: none; }
/* Equal basis on both halves: the key holds names only, so neither side needs
   to win the free space. */
.donut {
  flex: 1 1 104px;
  min-width: 88px;
  max-width: 104px;
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  font-family: var(--vscode-font-family);
}

.slices { list-style: none; flex: 1 1 112px; min-width: 112px; max-width: 220px; margin: 0; padding: 0; }
.slices li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
  cursor: default;
}
.slices .swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex: 0 0 auto;
  transform: translateY(1px);
}
.slices .name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.empty { color: var(--vscode-descriptionForeground); font-style: italic; }

/* ---------- actions ---------- */
.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: var(--gap-section);
  padding-top: var(--gap-section);
  border-top: 1px solid var(--rule);
}
button {
  font-family: inherit;
  font-size: inherit;
  border: 1px solid transparent;
  border-radius: 2px;
  padding: 5px 10px;
  cursor: pointer;
  width: 100%;
}
button.primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}
button.primary:hover { background: var(--vscode-button-hoverBackground); }
/* The dashboard is a destination, not the thing to do next — a link-weight
   affordance, so a real call to action (Run setup) can still be the loud one. */
button.link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: transparent;
  color: var(--vscode-textLink-foreground, var(--vscode-button-background));
  border-radius: 4px;
}
button.link .arrow { opacity: 0.7; transition: transform 120ms ease-out; }
button.link:hover { background: var(--vscode-list-hoverBackground); }
button.link:hover .arrow { transform: translateX(2px); }
button.link:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
button[hidden] { display: none; }

/* ---------- tooltip ---------- */
.tip {
  position: fixed;
  z-index: 20;
  display: none;
  max-width: 200px;
  padding: 4px 8px;
  border-radius: 3px;
  pointer-events: none;
  background: var(--vscode-editorHoverWidget-background, var(--vscode-editorWidget-background));
  color: var(--vscode-editorHoverWidget-foreground, var(--vscode-editorWidget-foreground));
  border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-panel-border, transparent));
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
  font-size: 0.9em;
}
.tip .t { display: flex; align-items: center; gap: 6px; color: var(--vscode-descriptionForeground); }
.tip .t .dot { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; }
.tip .t .name { min-width: 0; overflow-wrap: anywhere; }
.tip .v { font-variant-numeric: tabular-nums; }
`;

export const SIDEBAR_HTML = `
<div class="status" id="status" data-state="unknown" title="">
  <span class="dot"></span>
  <span class="text" id="statusText">Loading…</span>
  <span class="stamp" id="updated"></span>
</div>

<section class="block tile">
  <div class="block-head">
    <span class="label">Today</span>
  </div>
  <div class="hero">
    <div class="value" id="todayCost">—</div>
    <span class="delta" id="todayDelta" hidden></span>
  </div>
  <div class="sub" id="todaySub">—</div>
  <div class="cache-line" id="cacheLine" hidden>
    <span id="cacheText">—</span>
  </div>
  <svg class="spark" id="spark" role="img" aria-label="Today's cost by hour"></svg>
  <div class="caption" id="sparkCaption">By hour</div>
</section>

<section class="block">
  <p class="title">Top models today</p>
  <div class="donut-wrap" id="modelChart">
    <svg class="donut" id="modelDonut" viewBox="0 0 100 100" role="img"
         aria-label="Share of today's cost by model"></svg>
    <ul class="slices" id="modelLegend"></ul>
  </div>
  <p class="empty" id="modelEmpty">No usage yet</p>
</section>

<div class="actions">
  <button class="primary" id="setupBtn" hidden>Run setup</button>
  <button class="link" id="openBtn">Open full dashboard<span class="arrow">→</span></button>
</div>

<div class="tip" id="tip"></div>
`;

/**
 * Browser-side controller, emitted verbatim into the view. Auto-refresh runs
 * only while the view is visible — VSCode tears the webview down otherwise.
 */
export function buildSidebarJs(autoRefreshSeconds: number): string {
  return `
const vscodeApi = acquireVsCodeApi();
const el = (id) => document.getElementById(id);
const AUTO_REFRESH_MS = ${Math.max(0, Math.round(autoRefreshSeconds)) * 1000};
const SVG_NS = 'http://www.w3.org/2000/svg';

/* ---------- formatting ---------- */

/**
 * Display cost: a fixed shape so a column of values stays aligned. Sub-cent
 * amounts collapse to "<$0.01" rather than growing a 5-decimal tail — the
 * exact figure lives in the hover tooltip and on the dashboard.
 */
function fmtCost(n) {
  const v = n || 0;
  if (!v) { return '$0'; }
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a < 0.01)  { return sign + '<$0.01'; }
  if (a >= 1000) { return sign + '$' + (a / 1000).toFixed(1) + 'K'; }
  if (a >= 100)  { return sign + '$' + a.toFixed(0); }
  return sign + '$' + a.toFixed(2);
}

const fmtCostExact = (n) => '$' + (n || 0).toFixed(4);

function fmtNum(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) { return '—'; }
  if (Math.abs(n) >= 1000000) { return (n / 1000000).toFixed(2) + 'M'; }
  if (Math.abs(n) >= 1000)    { return (n / 1000).toFixed(1) + 'K'; }
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtRel(iso) {
  if (!iso) { return 'never'; }
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) { return 'just now'; }
  const s = Math.floor(ms / 1000);
  if (s < 60) { return s + 's ago'; }
  const m = Math.floor(s / 60);
  if (m < 60) { return m + ' min ago'; }
  const h = Math.floor(m / 60);
  if (h < 24) { return h + ' h ago'; }
  return Math.floor(h / 24) + 'd ago';
}

function fmtTimeFull(iso) {
  if (!iso) { return 'never'; }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown' : d.toLocaleString();
}

/**
 * Bucket starts arrive as UTC instants and are shown on the reader's own clock —
 * "when did I spend this" is a local-time question. Minutes are kept because a
 * bare hour renders as an ambiguous "13" in some locales.
 */
function fmtHour(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) { return String(iso); }
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const escapeHtml = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Drops the trailing release date so model names fit a narrow sidebar. */
const shortModel = (m) => String(m || 'unknown').replace(/-20\\d{6}$/, '');

/* ---------- tooltip ---------- */

function showTip(html, ev) {
  const tip = el('tip');
  tip.innerHTML = html;
  tip.style.display = 'block';
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 10;
  let y = ev.clientY + 12;
  if (x + r.width + 6 > window.innerWidth)  { x = ev.clientX - r.width - 10; }
  if (y + r.height + 6 > window.innerHeight) { y = ev.clientY - r.height - 10; }
  tip.style.left = Math.max(4, x) + 'px';
  tip.style.top  = Math.max(4, y) + 'px';
}
function hideTip() { el('tip').style.display = 'none'; }

/** Attaches the hover layer to a node; the hit area is the node itself. */
function bindTip(node, html) {
  node.addEventListener('mousemove', (ev) => showTip(html, ev));
  node.addEventListener('mouseleave', hideTip);
}

/* ---------- sparkline ---------- */

function svgEl(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const k in attrs) { node.setAttribute(k, attrs[k]); }
  return node;
}

function drawSpark(hours) {
  const svg = el('spark');
  while (svg.firstChild) { svg.removeChild(svg.firstChild); }
  if (!hours || hours.length === 0) { return; }

  const W = Math.max(80, Math.round(svg.getBoundingClientRect().width || 220));
  const H = 40;
  const padY = 6;
  const padX = 5;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

  const values = hours.map((h) => h.cost || 0);
  const maxV = Math.max(...values, 0.000001);
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const x = (i) => padX + (hours.length === 1 ? innerW / 2 : (innerW / (hours.length - 1)) * i);
  const y = (v) => padY + innerH - (v / maxV) * innerH;

  const pts = values.map((v, i) => x(i) + ',' + y(v));
  // Area wash fading to nothing at the baseline — a flat 10% block reads as a
  // filled shape on a dark surface, which competes with the line.
  const defs = svgEl('defs', {});
  const grad = svgEl('linearGradient', { id: 'sparkGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'var(--accent-mark)', 'stop-opacity': '0.16' }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'var(--accent-mark)', 'stop-opacity': '0' }));
  defs.appendChild(grad);
  svg.appendChild(defs);
  svg.appendChild(svgEl('path', {
    d: 'M ' + x(0) + ',' + (H - padY) + ' L ' + pts.join(' L ') + ' L ' + x(hours.length - 1) + ',' + (H - padY) + ' Z',
    fill: 'url(#sparkGrad)',
  }));
  svg.appendChild(svgEl('polyline', {
    points: pts.join(' '),
    fill: 'none',
    stroke: 'var(--accent-mark)',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }));
  // End marker: >=8px across, with a 2px surface ring so it stays legible.
  const last = hours.length - 1;
  svg.appendChild(svgEl('circle', {
    cx: x(last), cy: y(values[last]), r: '4',
    fill: 'var(--accent-mark)',
    stroke: 'var(--surface)',
    'stroke-width': '2',
  }));

  // Hover layer: one band per hour, far wider than the line itself.
  const bandW = innerW / Math.max(1, hours.length - 1 || 1);
  hours.forEach((h, i) => {
    const hit = svgEl('rect', {
      x: Math.max(0, x(i) - bandW / 2), y: 0,
      width: Math.max(6, bandW), height: H,
      fill: 'transparent',
    });
    // The final bucket is the hour in progress — say so, or its dip reads as a
    // real drop in spend rather than an hour that is not over yet.
    const span = i === last
      ? fmtHour(h.time) + ' – now'
      : fmtHour(h.time) + ' – ' + fmtHour(hours[i + 1].time);
    bindTip(hit,
      '<div class="t">' + escapeHtml(span) + '</div>' +
      '<div class="v">' + fmtCostExact(h.cost) + ' · ' + fmtNum(h.requests) + ' req</div>');
    svg.appendChild(hit);
  });
}

/* ---------- sections ---------- */

function renderStatus(d) {
  const node = el('status');
  const h = d.health || {};
  let state = 'bad';
  let label = 'Collector stopped';
  let tip = 'The OTLP collector is not running — Claude usage is not being recorded.';

  if (!h.telemetryEnvConfigured) {
    state = 'warn';
    label = 'Setup needed';
    tip = 'Claude telemetry is not configured in ~/.claude/settings.json.';
  } else if (h.collectorRunning) {
    state = 'ok';
    label = 'Collector running';
    tip = 'Last Claude event: ' + fmtRel(h.lastEventAt);
  }

  node.setAttribute('data-state', state);
  node.title = tip +
    '\\nLast usage: ' + fmtTimeFull(d.lastActivityAt) +
    '\\nRead at ' + new Date(d.updatedAt).toLocaleTimeString() +
    ' — click to open the full dashboard';
  el('statusText').textContent = label;
  el('setupBtn').hidden = h.telemetryEnvConfigured !== false;
}

function renderTile(d) {
  const cost = el('todayCost');
  cost.textContent = fmtCost(d.today.cost);
  cost.title = fmtCostExact(d.today.cost) + ' today';
  el('todaySub').textContent =
    fmtNum(d.today.totalTokensWithCache) + ' tokens · ' + fmtNum(d.today.requests) + ' req';

  // Cache hit ratio, not read share: read / (read + creation), as on the
  // dashboard. It qualifies the token count directly above it.
  const read = d.today.cacheReadTokens || 0;
  const created = d.today.cacheCreationTokens || 0;
  const line = el('cacheLine');
  if (read + created > 0) {
    const ratio = read / (read + created);
    line.hidden = false;
    el('cacheText').textContent = (ratio * 100).toFixed(0) + '% cache hit';
    line.title = fmtNum(read) + ' cache read · ' + fmtNum(created) + ' cache created';
  } else {
    line.hidden = true;
  }

  const delta = el('todayDelta');
  const prev = d.yesterday ? d.yesterday.cost : 0;
  if (!prev && !d.today.cost) {
    delta.hidden = true;
  } else if (!prev) {
    delta.hidden = false;
    delta.removeAttribute('data-dir');
    delta.textContent = 'first spend';
    delta.title = 'No spend yesterday.';
  } else {
    const pct = ((d.today.cost - prev) / prev) * 100;
    const up = pct >= 0;
    delta.hidden = false;
    delta.setAttribute('data-dir', up ? 'up' : 'down');
    delta.innerHTML = '<span class="arrow">' + (up ? '▲' : '▼') + '</span> ' +
      Math.abs(pct).toFixed(0) + '% vs yesterday';
    delta.title = 'Yesterday: ' + fmtCostExact(prev);
  }

  // A flat zero line says nothing — drop the trend entirely until there is spend.
  const hours = d.hourly || [];
  const peak = hours.reduce((a, b) => (b.cost > a.cost ? b : a), { cost: 0, time: '' });
  const hasTrend = peak.cost > 0;
  el('spark').style.display = hasTrend ? 'block' : 'none';
  el('sparkCaption').hidden = !hasTrend;
  if (hasTrend) {
    drawSpark(hours);
    el('sparkCaption').textContent =
      'By hour · peak ' + fmtCost(peak.cost) + ' at ' + fmtHour(peak.time);
  }
}

/* ---------- top-model donut ---------- */

const SLICE_COLORS = ['var(--slice-1)', 'var(--slice-2)', 'var(--slice-3)'];
const DONUT_R = 36;
const DONUT_C = 2 * Math.PI * DONUT_R;

function renderModels(d) {
  const svg = el('modelDonut');
  const chart = el('modelChart');
  const legend = el('modelLegend');
  const empty = el('modelEmpty');
  const top = (d.topModels || []).filter((m) => m.cost > 0);
  const other = d.otherModels || { cost: 0, count: 0 };

  const slices = top.map((m, i) => ({
    color: SLICE_COLORS[i % SLICE_COLORS.length],
    label: shortModel(m.model),
    name: m.model,
    value: m.cost,
  }));
  // The remainder has to be on the chart, otherwise the slices do not add up to
  // today's cost and every percentage on screen is wrong.
  if (other.cost > 0 && other.count > 0) {
    slices.push({
      color: 'var(--slice-other)',
      label: 'Other (' + other.count + ')',
      name: other.count + ' more model' + (other.count === 1 ? '' : 's'),
      value: other.cost,
    });
  }

  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!slices.length || total <= 0) {
    chart.hidden = true;
    legend.innerHTML = '';
    empty.hidden = false;
    return;
  }
  chart.hidden = false;
  empty.hidden = true;

  // Swatch, name, cost, share — nothing else fits the pointer's job here.
  slices.forEach((s) => {
    s.tip =
      '<div class="t">' +
        '<span class="dot" style="background:' + s.color + '"></span>' +
        '<span class="name">' + escapeHtml(s.name) + '</span>' +
      '</div>' +
      '<div class="v">' + fmtCostExact(s.value) + ' · ' +
        ((s.value / total) * 100).toFixed(0) + '%</div>';
  });

  while (svg.firstChild) { svg.removeChild(svg.firstChild); }
  const ring = svgEl('g', { transform: 'rotate(-90 50 50)' });
  const gap = slices.length > 1 ? 2 : 0;
  let offset = 0;
  slices.forEach((s) => {
    const len = (s.value / total) * DONUT_C;
    const drawn = Math.max(0.8, len - gap);
    const arc = svgEl('circle', {
      cx: '50', cy: '50', r: String(DONUT_R),
      fill: 'none',
      stroke: s.color,
      'stroke-width': '16',
      'stroke-dasharray': drawn.toFixed(3) + ' ' + (DONUT_C - drawn).toFixed(3),
      'stroke-dashoffset': (-offset).toFixed(3),
    });
    bindTip(arc, s.tip);
    ring.appendChild(arc);
    offset += len;
  });
  svg.appendChild(ring);

  // The key names the slices; cost and share are one hover away, on either the
  // slice or its legend row. The tile above already states today's total.
  legend.innerHTML = slices.map((s) =>
    '<li>' +
      '<span class="swatch" style="background:' + s.color + '"></span>' +
      '<span class="name">' + escapeHtml(s.label) + '</span>' +
    '</li>',
  ).join('');
  Array.prototype.forEach.call(legend.children, (li, i) => bindTip(li, slices[i].tip));
}

/**
 * The stamp reports the newest usage record, not the moment we read the files.
 * A read-time stamp is written and formatted in the same tick, so it can only
 * ever render "0s ago" — it looks like a freshness indicator while measuring
 * nothing. "Read at …" stays in the status tooltip, where it belongs.
 */
function renderStamp(d) {
  el('updated').textContent = fmtRel(d.lastActivityAt);
}

function render(d) {
  renderStatus(d);
  renderTile(d);
  renderModels(d);
  renderStamp(d);
}

/* ---------- wiring ---------- */

let last = null;

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg && msg.type === 'data') { last = msg.payload; render(last); }
  if (msg && msg.type === 'error') {
    el('status').setAttribute('data-state', 'bad');
    el('statusText').textContent = msg.payload.message;
  }
});

window.addEventListener('resize', () => {
  if (last && el('spark').style.display !== 'none') { drawSpark(last.hourly); }
});

el('openBtn').addEventListener('click', () => vscodeApi.postMessage({ type: 'openDashboard' }));
el('status').addEventListener('click', () => vscodeApi.postMessage({ type: 'openDashboard' }));
el('setupBtn').addEventListener('click', () => vscodeApi.postMessage({ type: 'runSetup' }));

vscodeApi.postMessage({ type: 'ready' });
if (AUTO_REFRESH_MS > 0) {
  setInterval(() => {
    if (!document.hidden) { vscodeApi.postMessage({ type: 'refresh' }); }
  }, AUTO_REFRESH_MS);
}

// The stamp ages on its own between payloads — without this it would sit frozen
// at whatever it said when the last one landed, which is the whole point of it.
// Needed even when auto-refresh is off (autoRefreshSeconds = 0).
setInterval(() => {
  if (last && !document.hidden) { renderStamp(last); }
}, 30000);
`;
}
