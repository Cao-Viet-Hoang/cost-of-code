import { ICONS } from './icons';
import { OVERVIEW_HTML }  from './tabs/overview';
import { TRENDS_HTML }    from './tabs/trends';
import { SESSIONS_HTML }  from './tabs/sessions';
import { BREAKDOWN_HTML } from './tabs/breakdown';
import { CACHE_HTML }     from './tabs/cache';
import { HEALTH_HTML }    from './tabs/health';

/** Assembles the static body markup. */
export function buildBodyHtml(): string {
  return `
<div class="app">
  <header class="header">
    <div class="header-left">
      <div class="brand">
        <div class="brand-icon" aria-hidden="true">${ICONS.trend}</div>
        <div class="brand-text">
          <h1>Claude Code Usage</h1>
          <p>Local-first dashboard for tokens, cost &amp; sessions</p>
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="status-pill" id="statusPill" data-state="unknown">
        <span class="dot"></span>
        <span class="status-text">Checking…</span>
      </div>
      <span class="updated muted" id="updated" title="">—</span>
      <div class="refresh-group" title="Auto-refresh">
        <span class="countdown" id="countdown">—</span>
        <button class="btn btn-ghost icon-btn" id="toggleAuto" title="Pause auto-refresh">${ICONS.pause}</button>
        <button class="btn btn-ghost icon-btn" id="refreshBtn" title="Refresh now">${ICONS.refresh}</button>
      </div>
      <button class="btn btn-primary" id="setupBtn">${ICONS.settings} Setup</button>
    </div>
  </header>

  <nav class="tabs" role="tablist">
    <button class="tab active" data-tab="overview">${ICONS.layout} Overview</button>
    <button class="tab" data-tab="trends">${ICONS.trend} Trends</button>
    <button class="tab" data-tab="sessions">${ICONS.users} Sessions</button>
    <button class="tab" data-tab="breakdown">${ICONS.globe} Breakdown</button>
    <button class="tab" data-tab="cache">${ICONS.database} Cache</button>
    <button class="tab" data-tab="health">${ICONS.activity} Health</button>
  </nav>

  <section class="filters card-surface" id="filters">
    <div class="filter-row">
      <div class="preset-group" role="tablist" aria-label="Date presets">
        <button data-preset="today">Today</button>
        <button data-preset="7d">7d</button>
        <button data-preset="30d">30d</button>
        <button data-preset="month" class="active">This Month</button>
        <button data-preset="all">All</button>
        <button data-preset="custom">Custom</button>
      </div>
      <div class="filter-dates">
        <label class="field-inline"><span class="label">From</span><input type="date" id="filterStart" /></label>
        <label class="field-inline"><span class="label">To</span><input type="date" id="filterEnd" /></label>
      </div>
    </div>

    <div class="filter-row">
      <label class="field-inline"><span class="label">Model</span><select id="filterModel"><option value="">All</option></select></label>
      <label class="field-inline"><span class="label">Source</span><select id="filterSource"><option value="">All</option></select></label>
      <label class="field-inline"><span class="label">Workspace</span><select id="filterWorkspace"><option value="">All</option></select></label>
      <label class="field-inline grow">
        <div class="input-with-icon">
          ${ICONS.search}
          <input type="search" id="filterSearch" placeholder="Session id, request id, model…" />
        </div>
      </label>
      <div class="filter-actions">
        <button class="btn btn-ghost" id="clearFilter">Clear</button>
        <button class="btn btn-primary" id="applyFilter">Apply</button>
      </div>
    </div>
  </section>

  <div class="active-chips" id="activeChips"></div>

  <main id="panels">
    ${OVERVIEW_HTML}
    ${TRENDS_HTML}
    ${SESSIONS_HTML}
    ${BREAKDOWN_HTML}
    ${CACHE_HTML}
    ${HEALTH_HTML}
  </main>

  <div id="toast" class="toast" hidden></div>
</div>
`;
}
