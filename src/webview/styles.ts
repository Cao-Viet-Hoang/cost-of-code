/**
 * Inline CSS for the webview. Kept as a single exported string to avoid
 * pulling in any build tooling. Organised into themed sections.
 */
export const DASHBOARD_CSS = `
:root {
  --radius: 0.5rem;
  --radius-sm: 0.375rem;
  --radius-lg: 0.75rem;

  --chart-1: 217 91% 60%;
  --chart-2: 142 76% 45%;
  --chart-3: 38 92% 50%;
  --chart-4: 271 81% 66%;
  --chart-5: 0 84% 60%;
  --chart-6: 188 95% 43%;
  --chart-7: 322 81% 58%;
  --chart-8: 173 80% 40%;
}

body.theme {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --accent: 210 40% 96%;
  --accent-foreground: 222 47% 11%;
  --primary: 222 47% 11%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222 47% 11%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 210 40% 98%;
  --border: 214 32% 91%;
  --input: 214 32% 91%;
  --ring: 222 47% 11%;
  --success: 142 71% 45%;
  --warning: 38 92% 50%;
  --info: 199 89% 48%;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06);
}

body.vscode-dark {
  --background: 224 71% 4%;
  --foreground: 213 31% 91%;
  --card: 224 47% 8%;
  --card-foreground: 213 31% 91%;
  --muted: 217 32% 14%;
  --muted-foreground: 215 20% 65%;
  --accent: 217 32% 17%;
  --accent-foreground: 213 31% 91%;
  /* Use the brand blue as primary so buttons aren't a glaring white block.
     Slightly darker than chart-1 (60% L) to feel grounded against the dark bg. */
  --primary: 217 88% 50%;
  --primary-foreground: 0 0% 100%;
  --secondary: 217 32% 14%;
  --secondary-foreground: 213 31% 91%;
  --destructive: 0 63% 45%;
  --destructive-foreground: 210 40% 98%;
  --border: 217 32% 18%;
  --input: 217 32% 18%;
  --ring: 217 88% 50%;
  --success: 142 71% 45%;
  --warning: 38 92% 55%;
  --info: 199 89% 55%;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.4);
  --shadow: 0 4px 12px -2px rgb(0 0 0 / 0.4);
}

body.vscode-high-contrast { --border: 0 0% 50%; }

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
               Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif,
               "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  font-size: 13px;
  line-height: 1.5;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  -webkit-font-smoothing: antialiased;
}

.app { max-width: 1400px; margin: 0 auto; padding: 28px 32px 56px; }
.muted { color: hsl(var(--muted-foreground)); }
.mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.hidden { display: none !important; }

/* The HTML \`hidden\` attribute must always win over class-level \`display\` rules.
   Without this, e.g. \`.empty { display: flex }\` keeps the placeholder visible
   even when the renderer sets \`el.hidden = true\`. */
[hidden] { display: none !important; }

/* ============================== HEADER ============================== */
.header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 20px;
}
.header-left { min-width: 0; }
.brand { display: flex; gap: 12px; align-items: center; }
.brand-icon {
  width: 40px; height: 40px;
  border-radius: var(--radius);
  background: linear-gradient(135deg, hsl(var(--chart-1) / 0.15), hsl(var(--chart-4) / 0.15));
  color: hsl(var(--chart-1));
  display: flex; align-items: center; justify-content: center;
  border: 1px solid hsl(var(--border));
}
.brand-icon svg { width: 22px; height: 22px; }
.brand-text h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
.brand-text p { margin: 2px 0 0; font-size: 12px; color: hsl(var(--muted-foreground)); }

.header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.updated { font-size: 11.5px; font-variant-numeric: tabular-nums; }
.updated[title] { cursor: help; }

.status-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 999px;
  background: hsl(var(--card));
  font-size: 11.5px; font-weight: 500;
  color: hsl(var(--muted-foreground));
}
.status-pill .dot { width: 7px; height: 7px; border-radius: 50%; background: hsl(var(--muted-foreground)); }
.status-pill[data-state="ok"]  { color: hsl(var(--success));     border-color: hsl(var(--success) / 0.3);     background: hsl(var(--success) / 0.08); }
.status-pill[data-state="ok"] .dot { background: hsl(var(--success)); box-shadow: 0 0 0 3px hsl(var(--success) / 0.2); animation: pulse 2s infinite; }
.status-pill[data-state="bad"] { color: hsl(var(--destructive)); border-color: hsl(var(--destructive) / 0.3); background: hsl(var(--destructive) / 0.08); }
.status-pill[data-state="bad"] .dot { background: hsl(var(--destructive)); }
.status-pill[data-state="warn"] { color: hsl(var(--warning)); border-color: hsl(var(--warning) / 0.3); background: hsl(var(--warning) / 0.08); }
.status-pill[data-state="warn"] .dot { background: hsl(var(--warning)); }
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px hsl(var(--success) / 0.2); }
  50%      { box-shadow: 0 0 0 5px hsl(var(--success) / 0.05); }
}

.refresh-group {
  display: inline-flex; align-items: stretch;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: hsl(var(--card));
}
.refresh-group > * { border: 0; background: transparent; }
.refresh-group .countdown {
  display: inline-flex; align-items: center; padding: 0 8px;
  font-size: 11px; color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
  border-right: 1px solid hsl(var(--border));
  min-width: 36px; justify-content: center;
}
.refresh-group button { cursor: pointer; }

/* ============================== BUTTONS ============================== */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  font-family: inherit; font-size: 12.5px; font-weight: 500;
  cursor: pointer; user-select: none; white-space: nowrap;
  transition: background 120ms, border-color 120ms, color 120ms, transform 80ms;
}
.btn:hover { background: hsl(var(--accent)); }
.btn:active { transform: translateY(1px); }
.btn:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
.btn[disabled] { opacity: 0.45; cursor: not-allowed; }
.btn svg { width: 14px; height: 14px; flex-shrink: 0; }
.btn-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-color: hsl(var(--primary)); }
.btn-primary:hover { background: hsl(var(--primary) / 0.9); }
.btn-secondary { background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); }
.btn-secondary:hover { background: hsl(var(--accent)); }
.btn-ghost { background: transparent; border-color: transparent; color: hsl(var(--muted-foreground)); }
.btn-ghost:hover { background: hsl(var(--accent)); color: hsl(var(--accent-foreground)); }
.btn-link { background: transparent; border-color: transparent; color: hsl(var(--foreground)); height: auto; padding: 0; font-weight: 500; }
.btn-link:hover { text-decoration: underline; background: transparent; }
.btn-destructive { background: hsl(var(--destructive)); color: hsl(var(--destructive-foreground)); border-color: hsl(var(--destructive)); }
.btn-destructive:hover { background: hsl(var(--destructive) / 0.9); }
.btn-destructive-ghost { background: transparent; border-color: transparent; color: hsl(var(--destructive)); }
.btn-destructive-ghost:hover { background: hsl(var(--destructive) / 0.1); }
.icon-btn { width: 32px; padding: 0; }
.btn-sm { height: 26px; padding: 0 8px; font-size: 11.5px; }

/* ============================== TABS ============================== */
.tabs {
  display: inline-flex; gap: 4px;
  padding: 4px;
  background: hsl(var(--muted));
  border-radius: var(--radius-sm);
  margin-bottom: 20px;
  overflow-x: auto; max-width: 100%; scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 12px;
  border: 0; border-radius: var(--radius-sm);
  background: transparent; color: hsl(var(--muted-foreground));
  font-family: inherit; font-size: 12.5px; font-weight: 500;
  cursor: pointer; white-space: nowrap;
  transition: background 120ms, color 120ms;
}
.tab svg { width: 14px; height: 14px; }
.tab:hover { color: hsl(var(--foreground)); }
.tab.active { background: hsl(var(--card)); color: hsl(var(--foreground)); box-shadow: var(--shadow-sm); }

.subtabs {
  display: inline-flex; gap: 4px;
  border-bottom: 1px solid hsl(var(--border));
  padding: 0 4px;
  margin-bottom: 20px;
}
.subtab {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 0;
  padding: 10px 16px;
  color: hsl(var(--muted-foreground));
  font-family: inherit; font-size: 12.5px; font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.subtab svg { width: 14px; height: 14px; flex-shrink: 0; }
.subtab:hover { color: hsl(var(--foreground)); }
.subtab.active { color: hsl(var(--foreground)); border-bottom-color: hsl(var(--primary)); }

/* ============================== FILTERS ============================== */
.card-surface {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}
.filters {
  padding: 12px 14px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.filter-row + .filter-row {
  padding-top: 10px;
  border-top: 1px dashed hsl(var(--border));
}
.filter-dates {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;   /* push From/To to the right side of row 1 */
}
.preset-group {
  display: inline-flex;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.preset-group button {
  background: transparent; border: 0;
  border-right: 1px solid hsl(var(--border));
  height: 30px; padding: 0 12px;
  font-family: inherit; font-size: 12px; font-weight: 500;
  color: hsl(var(--muted-foreground)); cursor: pointer;
}
.preset-group button:last-child { border-right: 0; }
.preset-group button:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }
.preset-group button.active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }

.field-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.field-inline.grow {
  flex: 1; min-width: 200px;
}
.field-inline .label {
  font-size: 10.5px; font-weight: 600;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase; letter-spacing: 0.04em;
  white-space: nowrap;
}
.field-inline .input-with-icon { flex: 1; min-width: 0; }
.field-inline select,
.field-inline input[type=date] {
  min-width: 110px;
  max-width: 200px;
}
.filter-actions {
  display: inline-flex;
  gap: 8px;
  margin-left: auto;   /* push Clear/Apply to the right of row 2 */
}

/* legacy field used elsewhere (export pageSize selector, etc.) */
.field { display: flex; flex-direction: column; gap: 5px; min-width: 130px; }
.field.grow { flex: 1; min-width: 200px; }
.field > span {
  font-size: 10.5px; font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase; letter-spacing: 0.04em;
}
input[type=date], input[type=search], input[type=text], input[type=number], select {
  height: 32px; padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: inherit; font-size: 12.5px;
  transition: border-color 120ms, box-shadow 120ms;
}
input:focus, select:focus { outline: none; border-color: hsl(var(--ring)); box-shadow: 0 0 0 3px hsl(var(--ring) / 0.15); }
.input-with-icon { position: relative; }
.input-with-icon svg {
  position: absolute; left: 9px; top: 50%;
  transform: translateY(-50%);
  width: 14px; height: 14px;
  color: hsl(var(--muted-foreground));
  pointer-events: none;
}
.input-with-icon input { padding-left: 32px; width: 100%; }

.active-chips {
  display: flex; flex-wrap: wrap; gap: 8px;
  margin: 0 0 16px;
  min-height: 0;
}
.active-chips:empty { display: none; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 8px 3px 10px;
  background: hsl(var(--accent));
  border: 1px solid hsl(var(--border));
  border-radius: 999px;
  font-size: 11.5px;
  color: hsl(var(--accent-foreground));
}
.chip strong { font-weight: 600; }
.chip button {
  background: transparent; border: 0;
  width: 16px; height: 16px; padding: 0;
  border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  color: hsl(var(--muted-foreground)); cursor: pointer;
}
.chip button:hover { background: hsl(var(--border)); color: hsl(var(--foreground)); }
.chip button svg { width: 10px; height: 10px; }

/* ============================== PANELS / SUB-PANELS ============================== */
.panel, .subpanel { display: none; }
.panel.active, .subpanel.active { display: block; animation: fadeIn 200ms ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* ============================== KPI CARDS ============================== */
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-bottom: 22px;
}
.kpi {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 16px 18px;
  position: relative;
  transition: border-color 150ms;
}
.kpi:hover { border-color: hsl(var(--ring) / 0.4); }
.kpi-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 6px; gap: 8px;
}
.kpi-label {
  font-size: 11px; font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase; letter-spacing: 0.04em;
}
.kpi-icon {
  width: 26px; height: 26px;
  border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  background: hsl(var(--accent)); color: hsl(var(--foreground));
}
.kpi-icon svg { width: 13px; height: 13px; }
.kpi-row {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
}
.kpi-value {
  font-size: 24px; font-weight: 600;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.kpi-delta {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: 11.5px; font-weight: 600;
  padding: 2px 6px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.kpi-delta.up   { background: hsl(var(--destructive) / 0.12); color: hsl(var(--destructive)); }
.kpi-delta.down { background: hsl(var(--success) / 0.12);     color: hsl(var(--success));    }
.kpi-delta.flat { background: hsl(var(--muted));              color: hsl(var(--muted-foreground)); }
.kpi-delta svg { width: 10px; height: 10px; }
.kpi-sparkline { margin-top: 8px; width: 100%; height: 32px; display: block; }
.kpi-sub {
  margin-top: 6px;
  font-size: 11.5px;
  color: hsl(var(--muted-foreground));
  display: flex; align-items: center; gap: 4px;
}
.kpi.accent-1 .kpi-icon { color: hsl(var(--chart-1)); background: hsl(var(--chart-1) / 0.12); }
.kpi.accent-2 .kpi-icon { color: hsl(var(--chart-2)); background: hsl(var(--chart-2) / 0.12); }
.kpi.accent-3 .kpi-icon { color: hsl(var(--chart-3)); background: hsl(var(--chart-3) / 0.12); }
.kpi.accent-4 .kpi-icon { color: hsl(var(--chart-4)); background: hsl(var(--chart-4) / 0.12); }
.kpi.accent-5 .kpi-icon { color: hsl(var(--chart-5)); background: hsl(var(--chart-5) / 0.12); }

/* ============================== CARDS ============================== */
.card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  margin-bottom: 22px;
  overflow: hidden;
}
.card-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid hsl(var(--border));
  flex-wrap: wrap;
}
.card-title { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
.card-desc { margin: 3px 0 0; font-size: 12px; color: hsl(var(--muted-foreground)); }
.card-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.card-body { padding: 16px 18px; }
.chart-card .card-body { padding: 12px 18px 16px; }

.grid-2 {
  display: grid; gap: 20px; margin-bottom: 0;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
}
.grid-2 > .card { margin-bottom: 20px; }

/* ============================== CHARTS ============================== */
.chart {
  width: 100%; height: 240px;
  display: block; overflow: visible;
}
.chart text { font-size: 10.5px; fill: hsl(var(--muted-foreground)); }
.chart .grid-line { stroke: hsl(var(--border)); stroke-dasharray: 3 3; stroke-width: 1; }
.chart .axis-line { stroke: hsl(var(--border)); stroke-width: 1; }
.chart .point { transition: r 120ms; }
.chart .point:hover { r: 5; }
.chart .cumulative {
  stroke: hsl(var(--chart-3));
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
  fill: none;
}

.donut-row {
  display: flex; gap: 20px; align-items: center; flex-wrap: wrap;
}
.donut-row .chart { width: 200px; height: 200px; flex-shrink: 0; }
.donut-legend {
  list-style: none; margin: 0; padding: 0;
  flex: 1; min-width: 160px;
  display: flex; flex-direction: column; gap: 8px;
}
.donut-legend li { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; }
.donut-legend .label { display: flex; align-items: center; gap: 8px; min-width: 0; }
.donut-legend .label-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.donut-legend .swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.donut-legend .value { font-weight: 500; font-variant-numeric: tabular-nums; color: hsl(var(--muted-foreground)); }

.legend { display: flex; gap: 12px; flex-wrap: wrap; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: hsl(var(--muted-foreground)); }
.legend-item .swatch { width: 10px; height: 10px; border-radius: 3px; }

.heatmap {
  display: grid;
  grid-template-columns: 28px repeat(24, 1fr);
  gap: 2px;
  font-size: 10px;
}
.heatmap .corner, .heatmap .col-label, .heatmap .row-label {
  color: hsl(var(--muted-foreground));
  text-align: center; line-height: 14px;
}
.heatmap .row-label { text-align: right; padding-right: 4px; }
.heatmap .cell {
  aspect-ratio: 1;
  background: hsl(var(--muted));
  border-radius: 2px;
  position: relative;
  cursor: help;
  min-height: 14px;
}
.heatmap .cell:hover { outline: 1px solid hsl(var(--ring)); outline-offset: 1px; }
.heatmap-legend {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.heatmap-legend-label {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.02em;
}
.heatmap-legend-bar {
  width: 96px; height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right,
    hsl(var(--chart-1) / 0.08),
    hsl(var(--chart-1) / 1));
  border: 1px solid hsl(var(--border));
}

.bar-list {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 2fr auto;
  align-items: center;
  column-gap: 12px;
  font-size: 12.5px;
}
.bar-row {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
  padding: 6px 0;
}
.bar-row .label-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.bar-row .track {
  display: block;
  height: 8px; border-radius: 4px;
  background: hsl(var(--muted));
  overflow: hidden;
}
.bar-row .fill {
  display: block;
  height: 100%; border-radius: 4px;
  min-width: 2px;
}
.bar-row .val { font-variant-numeric: tabular-nums; color: hsl(var(--muted-foreground)); font-weight: 500; }

/* ============================== TABLES ============================== */
.table-wrap { overflow-x: auto; padding: 0; }
table.data {
  width: 100%; border-collapse: collapse;
  font-size: 12.5px; font-variant-numeric: tabular-nums;
}
table.data th, table.data td {
  padding: 11px 16px; text-align: left;
  border-bottom: 1px solid hsl(var(--border));
  white-space: nowrap;
}
table.data th {
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.04em;
  background: hsl(var(--muted) / 0.5);
  position: sticky; top: 0;
  user-select: none;
}
table.data th.sortable { cursor: pointer; }
table.data th.sortable:hover { color: hsl(var(--foreground)); background: hsl(var(--muted)); }
table.data th.sortable .arrow {
  display: inline-block; margin-left: 4px; opacity: 0.4;
  font-size: 9px;
}
table.data th.sorted-asc  .arrow,
table.data th.sorted-desc .arrow { opacity: 1; color: hsl(var(--foreground)); }
table.data th.num, table.data td.num { text-align: right; }
table.data tbody tr { transition: background 120ms; }
table.data tbody tr:hover { background: hsl(var(--accent) / 0.5); }
table.data tbody tr.expandable { cursor: pointer; }
table.data tbody tr:last-child td { border-bottom: 0; }
table.data tbody tr.detail-row { background: hsl(var(--muted) / 0.4); }
table.data tbody tr.detail-row > td { padding: 0; }
.session-id, .req-id, .mono-cell {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: hsl(var(--muted-foreground));
}
.bar-cell { position: relative; }
.bar-cell .bar {
  position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
  background: hsl(var(--chart-1) / 0.7);
}
.tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
  font-size: 11px;
  font-weight: 500;
  margin-right: 4px;
}
.copy-btn {
  background: transparent; border: 0; padding: 2px;
  border-radius: 3px; cursor: pointer;
  color: hsl(var(--muted-foreground));
  opacity: 0; transition: opacity 120ms, background 120ms;
}
table.data tbody tr:hover .copy-btn { opacity: 1; }
.copy-btn:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }
.copy-btn svg { width: 11px; height: 11px; display: block; }

.pagination {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid hsl(var(--border));
  font-size: 11.5px;
  color: hsl(var(--muted-foreground));
}
.pagination .group { display: inline-flex; gap: 6px; align-items: center; }

/* ============================== HEALTH ============================== */
.health-grid {
  display: grid; grid-template-columns: 1fr; gap: 10px;
}
@media (min-width: 640px) { .health-grid { grid-template-columns: 1fr 1fr; } }
.health-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 14px;
  background: hsl(var(--muted) / 0.5);
  border-radius: var(--radius-sm);
  font-size: 12.5px;
}
.health-key { color: hsl(var(--muted-foreground)); }
.health-value {
  font-weight: 500;
  display: inline-flex; align-items: center; gap: 6px;
  font-variant-numeric: tabular-nums;
}
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 500;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
}
.badge.ok   { background: hsl(var(--success) / 0.12);     color: hsl(var(--success));     border-color: hsl(var(--success) / 0.25); }
.badge.bad  { background: hsl(var(--destructive) / 0.12); color: hsl(var(--destructive)); border-color: hsl(var(--destructive) / 0.25); }
.badge.warn { background: hsl(var(--warning) / 0.12);     color: hsl(var(--warning));     border-color: hsl(var(--warning) / 0.25); }
.badge .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.action-group {
  display: grid;
  grid-template-columns: 110px 1fr;
  align-items: start;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid hsl(var(--border));
}
.action-group:first-child { padding-top: 0; }
.action-group:last-child  { padding-bottom: 0; border-bottom: 0; }
.action-group h4 {
  margin: 0;
  padding-top: 8px;
  font-size: 11.5px; font-weight: 600;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase; letter-spacing: 0.04em;
}
.action-group.danger h4 { color: hsl(var(--destructive)); }
.action-row {
  display: flex; flex-wrap: wrap; gap: 8px;
}
.action-col {
  display: flex; flex-direction: column; gap: 8px;
  min-width: 0;
}
.action-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}
.action-hint code {
  font-size: 11.5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: hsl(var(--muted) / 0.6);
  color: hsl(var(--foreground));
}
@media (max-width: 560px) {
  .action-group { grid-template-columns: 1fr; gap: 8px; padding: 12px 0; }
  .action-group h4 { padding-top: 0; }
}

/* ============================== HINT / EMPTY / TOAST ============================== */
.hint {
  background: hsl(var(--muted) / 0.6);
  border-left: 3px solid hsl(var(--info));
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-top: 8px;
}
.hint strong { color: hsl(var(--foreground)); font-weight: 500; }
.hint.warn { border-left-color: hsl(var(--warning)); }
.hint.bad  { border-left-color: hsl(var(--destructive)); }

.footnote {
  margin: 16px 4px 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
}
.footnote strong { color: hsl(var(--foreground)); font-weight: 600; }
.footnote em     { font-style: italic; color: hsl(var(--foreground)); }
.footnote code {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 4px;
  background: hsl(var(--muted) / 0.6);
  color: hsl(var(--foreground));
}

/* ============================== SETUP MODAL ============================== */
.setup-status {
  font-size: 12px;
  line-height: 1.55;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border-left: 3px solid hsl(var(--info));
  background: hsl(var(--muted) / 0.55);
  color: hsl(var(--muted-foreground));
  margin-bottom: 14px;
}
.setup-status strong { color: hsl(var(--foreground)); font-weight: 600; }
.setup-status.ok   { border-left-color: hsl(var(--success)); }
.setup-status.warn { border-left-color: hsl(var(--warning)); }
.setup-status.bad  { border-left-color: hsl(var(--destructive)); }

.setup-port { margin-bottom: 16px; }
.setup-port label {
  display: block;
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: hsl(var(--muted-foreground));
  margin-bottom: 6px;
}
.setup-port-row {
  display: flex; gap: 8px; align-items: center;
}
.setup-port-row input[type="number"] {
  flex: 0 0 120px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  color: hsl(var(--foreground));
}
.setup-port-row input[type="number"]:focus {
  outline: none;
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 2px hsl(var(--ring) / 0.25);
}
.setup-port-result {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  min-height: 18px;
  color: hsl(var(--muted-foreground));
}
.setup-port-result.ok   { color: hsl(var(--success)); }
.setup-port-result.info { color: hsl(var(--info)); }
.setup-port-result.bad  { color: hsl(var(--destructive)); }

.empty {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; padding: 36px 20px;
  text-align: center;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}
.empty p { margin: 0; }
.empty-icon {
  width: 44px; height: 44px; border-radius: 50%;
  background: hsl(var(--muted));
  display: flex; align-items: center; justify-content: center;
}
.empty-icon svg { width: 22px; height: 22px; }
.empty .btn-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

.first-run {
  border: 1px dashed hsl(var(--border));
  background: hsl(var(--muted) / 0.3);
  border-radius: var(--radius);
  padding: 24px;
  text-align: center;
  margin-bottom: 16px;
}
.first-run h3 { margin: 0 0 6px; font-size: 15px; }
.first-run p  { margin: 0 0 14px; font-size: 12.5px; color: hsl(var(--muted-foreground)); }
.first-run ol { text-align: left; max-width: 480px; margin: 0 auto 14px; font-size: 12.5px; }
.first-run ol li { margin: 4px 0; }

.toast {
  position: fixed; right: 16px; bottom: 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--destructive) / 0.4);
  color: hsl(var(--destructive));
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 12.5px; max-width: 380px;
  box-shadow: var(--shadow);
  animation: slideUp 200ms ease-out;
  z-index: 100;
}
.toast.success { border-color: hsl(var(--success) / 0.4); color: hsl(var(--success)); }
@keyframes slideUp {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: none; opacity: 1; }
}

/* ============================== MODAL ============================== */
.modal-bg {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  display: none;
  align-items: center; justify-content: center;
  z-index: 200;
}
.modal-bg.open { display: flex; }
.modal {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  width: 90%; max-width: 440px;
  padding: 20px;
  box-shadow: var(--shadow);
}
.modal h3 { margin: 0 0 8px; font-size: 15px; }
.modal p  { margin: 0 0 16px; font-size: 12.5px; color: hsl(var(--muted-foreground)); }
.modal .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.modal.modal-wide { max-width: 640px; }
.status-detail { max-height: 60vh; overflow-y: auto; margin-bottom: 16px; }
.status-section { margin-bottom: 14px; }
.status-section:last-child { margin-bottom: 0; }
.status-section h4 {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: hsl(var(--muted-foreground));
}

/* ============================== SVG TOOLTIP ============================== */
.svg-tooltip { pointer-events: none; }
/* Only the background rect gets the card styling — scoping by class prevents
   this rule from clobbering per-series swatch rects (which set their own fill
   via the SVG attribute and would otherwise lose to this selector). */
.svg-tooltip .tip-bg { fill: hsl(var(--card)); stroke: hsl(var(--border)); rx: 6; }
.svg-tooltip text { fill: hsl(var(--foreground)); }
.svg-tooltip .label { fill: hsl(var(--muted-foreground)); font-size: 10px; }

/* ============================== FLOATING HTML TOOLTIP ============================== */
/* Used by donut slices, horizontal bar rows, and heatmap cells. Anchored to the
   cursor by chartTooltip helpers in charts.ts. */
.chart-tooltip {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.4;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
  max-width: 320px;
  white-space: nowrap;
}
.chart-tooltip .title {
  font-weight: 600;
  margin-bottom: 4px;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chart-tooltip .row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chart-tooltip .swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
.chart-tooltip .value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.chart-tooltip .label {
  color: hsl(var(--muted-foreground));
}

.donut-slice { transition: opacity 0.15s ease; }
.donut-slice:hover { opacity: 0.82; }
.bar-row { transition: background-color 0.15s ease; border-radius: 4px; }
.bar-row:hover { background: hsl(var(--accent) / 0.4); }
`;
