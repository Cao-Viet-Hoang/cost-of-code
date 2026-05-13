/**
 * Browser-side number/date formatting helpers.
 * Emitted verbatim into the webview as JS source.
 */
export const FORMAT_JS = `
const fmt = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (typeof n !== 'number') return String(n);
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
const fmtFull = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (typeof n !== 'number') return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
};
const fmtCost = (n) => '$' + (n || 0).toFixed(4);
const fmtCostShort = (n) => {
  const v = n || 0;
  if (v === 0) return '$0';
  const a = Math.abs(v);
  let s;
  if (a >= 100)       s = v.toFixed(0);
  else if (a >= 10)   s = v.toFixed(2);
  else if (a >= 1)    s = v.toFixed(2);
  else if (a >= 0.1)  s = v.toFixed(3);
  else if (a >= 0.01) s = v.toFixed(4);
  else                s = v.toFixed(5);
  // trim trailing zeros (keep \"$1\" rather than \"$1.00\", \"$0.005\" rather than \"$0.00500\")
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\\.$/, '');
  return '$' + s;
};
const fmtMs = (n) => {
  if (!n) return '—';
  if (n < 1000)    return n.toFixed(0) + ' ms';
  if (n < 60_000)  return (n / 1000).toFixed(1) + ' s';
  return (n / 60_000).toFixed(1) + ' min';
};
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtTimeFull = (iso) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }) : '—';
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
const fmtPct = (r) => (r * 100).toFixed(1) + '%';
const fmtRel = (iso) => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms < 0) return 'in the future';
  const s = Math.floor(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' h ago';
  const d = Math.floor(h / 24);
  if (d < 7) return d + 'd ago';
  return new Date(iso).toLocaleDateString();
};
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const CHART_VARS = ['--chart-1','--chart-2','--chart-3','--chart-4','--chart-5','--chart-6','--chart-7','--chart-8'];
const colorFor = (i) => 'hsl(var(' + CHART_VARS[i % CHART_VARS.length] + '))';

function shortenWorkspace(p) {
  if (!p) return '<unknown>';
  const s = String(p).replace(/\\\\\\\\/g, '/').replace(/\\\\/g, '/');
  const parts = s.split('/').filter(Boolean);
  if (parts.length === 0) return s;
  if (parts.length === 1) return parts[0];
  return parts.slice(-2).join('/');
}

function dateOnly(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
`;
