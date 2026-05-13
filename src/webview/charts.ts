export const CHARTS_JS = `
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function clearSvg(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

/* ----- Shared floating HTML tooltip ----- */
/* One DOM node reused across charts; follows the cursor and stays within viewport. */
function ensureChartTooltip() {
  let tip = document.getElementById('chartTooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'chartTooltip';
    tip.className = 'chart-tooltip';
    tip.style.display = 'none';
    document.body.appendChild(tip);
  }
  return tip;
}
function positionChartTooltip(tip, ev) {
  const pad = 12;
  const rect = tip.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + rect.width + pad > vw)  x = ev.clientX - rect.width - pad;
  if (y + rect.height + pad > vh) y = ev.clientY - rect.height - pad;
  if (x < 4) x = 4;
  if (y < 4) y = 4;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}
function showChartTooltip(html, ev) {
  const tip = ensureChartTooltip();
  tip.innerHTML = html;
  tip.style.display = 'block';
  positionChartTooltip(tip, ev);
}
function hideChartTooltip() {
  const tip = document.getElementById('chartTooltip');
  if (tip) tip.style.display = 'none';
}
/* Build a standard 1-row tooltip: title + colored swatch + value + optional extra. */
function tipHtml(title, color, valueText, extra) {
  return (
    '<div class="title">' + escapeHtml(title) + '</div>' +
    '<div class="row">' +
      '<span class="swatch" style="background:' + color + '"></span>' +
      '<span class="value">' + escapeHtml(valueText) + '</span>' +
      (extra ? '<span class="label">· ' + escapeHtml(extra) + '</span>' : '') +
    '</div>'
  );
}

function niceTicks(min, max, count) {
  const range = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(range / count)));
  const err = (count / range) * step;
  const niceStep =
    err <= 0.15 ? step * 10 :
    err <= 0.35 ? step * 5  :
    err <= 0.75 ? step * 2  :
    step;
  const start = Math.floor(min / niceStep) * niceStep;
  const end   = Math.ceil(max / niceStep) * niceStep;
  const ticks = [];
  for (let v = start; v <= end + niceStep / 2; v += niceStep) ticks.push(+v.toFixed(10));
  return ticks;
}

/**
 * Area / line chart with optional secondary cumulative line overlay.
 *
 * opts: { valueFmt, colorVar, yMin?, yMax?, cumulative?: { getValue, fmt } }
 */
function drawAreaChart(svg, data, getValue, getLabel, opts) {
  if (!svg) return;
  clearSvg(svg);
  if (!data || data.length === 0) return;

  const W = Math.max(280, Math.round(svg.getBoundingClientRect().width || 800));
  const H = 240;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const margin = { top: 16, right: opts.cumulative ? 48 : 16, bottom: 28, left: 48 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const values = data.map(getValue);
  let yMin = opts.yMin !== undefined ? opts.yMin : Math.min(0, ...values);
  let yMax = opts.yMax !== undefined ? opts.yMax : Math.max(...values, 0.0001);
  if (yMin === yMax) yMax = yMin + 1;

  const ticks = niceTicks(yMin, yMax, 4);
  yMin = ticks[0];
  yMax = ticks[ticks.length - 1];

  const x = (i) => margin.left + (data.length === 1 ? innerW / 2 : (innerW / (data.length - 1)) * i);
  const y = (v) => margin.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const gradId = 'grad-' + Math.random().toString(36).slice(2);
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(svgEl('stop', { offset: '0%',  'stop-color': 'hsl(var(' + opts.colorVar + '))', 'stop-opacity': '0.35' }));
  grad.appendChild(svgEl('stop', { offset: '100%','stop-color': 'hsl(var(' + opts.colorVar + '))', 'stop-opacity': '0' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // grid + y axis (left)
  const gridG = svgEl('g');
  ticks.forEach(t => {
    const yy = y(t);
    gridG.appendChild(svgEl('line', { x1: margin.left, y1: yy, x2: margin.left + innerW, y2: yy, class: 'grid-line' }));
    const text = svgEl('text', { x: margin.left - 8, y: yy + 3, 'text-anchor': 'end' });
    text.textContent = opts.valueFmt(t);
    gridG.appendChild(text);
  });
  svg.appendChild(gridG);

  // x labels
  const labelStep = Math.ceil(data.length / 8);
  const xLabelG = svgEl('g');
  data.forEach((d, i) => {
    if (i % labelStep !== 0 && i !== data.length - 1) return;
    const text = svgEl('text', { x: x(i), y: margin.top + innerH + 18, 'text-anchor': 'middle' });
    text.textContent = getLabel(d, i);
    xLabelG.appendChild(text);
  });
  svg.appendChild(xLabelG);

  // area path
  const areaPts = data.map((d, i) => x(i) + ',' + y(values[i])).join(' L ');
  const baselineY = y(Math.max(yMin, 0));
  const areaD = 'M ' + x(0) + ',' + baselineY + ' L ' + areaPts + ' L ' + x(data.length - 1) + ',' + baselineY + ' Z';
  svg.appendChild(svgEl('path', { d: areaD, fill: 'url(#' + gradId + ')' }));

  // line
  svg.appendChild(svgEl('polyline', {
    points: data.map((d, i) => x(i) + ',' + y(values[i])).join(' '),
    fill: 'none',
    stroke: 'hsl(var(' + opts.colorVar + '))',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }));

  // cumulative overlay (optional, on a right-side y-axis)
  let cumVals = null;
  if (opts.cumulative) {
    cumVals = data.map(opts.cumulative.getValue);
    const cMax = Math.max(...cumVals, 0.0001);
    const cTicks = niceTicks(0, cMax, 4);
    const cMaxN = cTicks[cTicks.length - 1];
    const cy = (v) => margin.top + innerH - (v / cMaxN) * innerH;

    // right axis labels
    const rAxis = svgEl('g');
    cTicks.forEach(t => {
      const yy = cy(t);
      const text = svgEl('text', { x: margin.left + innerW + 8, y: yy + 3, 'text-anchor': 'start' });
      text.textContent = opts.cumulative.fmt(t);
      rAxis.appendChild(text);
    });
    svg.appendChild(rAxis);

    svg.appendChild(svgEl('polyline', {
      points: data.map((d, i) => x(i) + ',' + cy(cumVals[i])).join(' '),
      class: 'cumulative',
    }));
  }

  // tooltip
  const tipG = svgEl('g', { class: 'svg-tooltip' });
  tipG.style.display = 'none';
  const tipW = opts.cumulative ? 180 : 140;
  const tipH = opts.cumulative ? 54 : 38;
  const tipRect = svgEl('rect', { width: tipW, height: tipH, class: 'tip-bg' });
  const tipLabel = svgEl('text', { x: 8, y: 14, class: 'label' });
  // Color swatch matches the line/area colour so users can map the tooltip
  // back to the series even when several charts share the screen.
  const tipSwatch = svgEl('rect', { x: 8, y: 22, width: 8, height: 8, rx: 2, fill: 'hsl(var(' + opts.colorVar + '))' });
  const tipValue = svgEl('text', { x: 22, y: 30, 'font-weight': '600', 'font-size': '12' });
  tipG.appendChild(tipRect); tipG.appendChild(tipLabel); tipG.appendChild(tipSwatch); tipG.appendChild(tipValue);
  // Cumulative row: mirror the series-row layout (swatch + text) so the user
  // can tell which colour is which. --chart-3 matches the .cumulative line in styles.
  const tipCumSwatch = opts.cumulative ? svgEl('rect', { x: 8, y: 38, width: 8, height: 8, rx: 2, fill: 'hsl(var(--chart-3))' }) : null;
  const tipCum = opts.cumulative ? svgEl('text', { x: 22, y: 46, 'font-size': '11', fill: 'hsl(var(--muted-foreground))' }) : null;
  if (tipCumSwatch) tipG.appendChild(tipCumSwatch);
  if (tipCum) tipG.appendChild(tipCum);

  data.forEach((d, i) => {
    svg.appendChild(svgEl('circle', {
      cx: x(i), cy: y(values[i]), r: 3.5,
      fill: 'hsl(var(--background))',
      stroke: 'hsl(var(' + opts.colorVar + '))',
      'stroke-width': 1.8,
      class: 'point',
    }));
  });

  const hoverG = svgEl('g');
  data.forEach((d, i) => {
    const bandX = i === 0 ? margin.left : (x(i - 1) + x(i)) / 2;
    const bandEnd = i === data.length - 1 ? margin.left + innerW : (x(i) + x(i + 1)) / 2;
    const hit = svgEl('rect', {
      x: bandX, y: margin.top, width: Math.max(0, bandEnd - bandX), height: innerH,
      fill: 'transparent',
    });
    hit.addEventListener('mouseenter', () => {
      tipG.style.display = '';
      tipLabel.textContent = getLabel(d, i);
      tipValue.textContent = (opts.cumulative ? 'Daily: ' : '') + opts.valueFmt(values[i]);
      if (tipCum && cumVals) tipCum.textContent = 'Cum: ' + opts.cumulative.fmt(cumVals[i]);
      const tx = Math.min(W - tipW - 8, Math.max(margin.left, x(i) - tipW / 2));
      const ty = Math.max(margin.top, y(values[i]) - tipH - 10);
      tipG.setAttribute('transform', 'translate(' + tx + ',' + ty + ')');
    });
    hit.addEventListener('mouseleave', () => { tipG.style.display = 'none'; });
    hoverG.appendChild(hit);
  });
  svg.appendChild(hoverG);
  svg.appendChild(tipG);
}

/**
 * Compact sparkline (no axes). Used inside KPI cards.
 */
function drawSparkline(svg, values, colorVar) {
  if (!svg) return;
  clearSvg(svg);
  if (!values || values.length === 0) return;

  const W = Math.max(60, Math.round(svg.getBoundingClientRect().width || 120));
  const H = 32;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const pad = 2;
  const maxV = Math.max(...values, 0.0001);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;

  const x = (i) => pad + (values.length === 1 ? (W - 2 * pad) / 2 : ((W - 2 * pad) / (values.length - 1)) * i);
  const y = (v) => pad + (H - 2 * pad) - ((v - minV) / range) * (H - 2 * pad);

  // gradient
  const gradId = 'spk-' + Math.random().toString(36).slice(2);
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(svgEl('stop', { offset: '0%',  'stop-color': 'hsl(var(' + colorVar + '))', 'stop-opacity': '0.4' }));
  grad.appendChild(svgEl('stop', { offset: '100%','stop-color': 'hsl(var(' + colorVar + '))', 'stop-opacity': '0' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  const pts = values.map((v, i) => x(i) + ',' + y(v));
  svg.appendChild(svgEl('path', {
    d: 'M ' + x(0) + ',' + (H - pad) + ' L ' + pts.join(' L ') + ' L ' + x(values.length - 1) + ',' + (H - pad) + ' Z',
    fill: 'url(#' + gradId + ')',
  }));
  svg.appendChild(svgEl('polyline', {
    points: pts.join(' '),
    fill: 'none', stroke: 'hsl(var(' + colorVar + '))',
    'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));
  // last point dot
  svg.appendChild(svgEl('circle', {
    cx: x(values.length - 1), cy: y(values[values.length - 1]), r: 2,
    fill: 'hsl(var(' + colorVar + '))',
  }));
}

/**
 * Stacked bars (for token mix per day).
 * series: [{ key, label, colorVar }]
 */
function drawStackedBars(svg, data, series, getLabel, opts) {
  if (!svg) return;
  clearSvg(svg);
  if (!data || data.length === 0) return;

  const W = Math.max(280, Math.round(svg.getBoundingClientRect().width || 800));
  const H = 240;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const margin = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const totals = data.map(d => series.reduce((s, sr) => s + (d[sr.key] || 0), 0));
  let yMax = Math.max(...totals, 1);
  const ticks = niceTicks(0, yMax, 4);
  yMax = ticks[ticks.length - 1];

  const bandW = innerW / data.length;
  const barW = Math.max(2, bandW * 0.6);
  const y = (v) => margin.top + innerH - (v / yMax) * innerH;

  const gridG = svgEl('g');
  ticks.forEach(t => {
    const yy = y(t);
    gridG.appendChild(svgEl('line', { x1: margin.left, y1: yy, x2: margin.left + innerW, y2: yy, class: 'grid-line' }));
    const text = svgEl('text', { x: margin.left - 8, y: yy + 3, 'text-anchor': 'end' });
    text.textContent = opts.valueFmt(t);
    gridG.appendChild(text);
  });
  svg.appendChild(gridG);

  const labelStep = Math.ceil(data.length / 10);
  const xLabelG = svgEl('g');
  data.forEach((d, i) => {
    if (i % labelStep !== 0 && i !== data.length - 1) return;
    const cx = margin.left + i * bandW + bandW / 2;
    const text = svgEl('text', { x: cx, y: margin.top + innerH + 18, 'text-anchor': 'middle' });
    text.textContent = getLabel(d, i);
    xLabelG.appendChild(text);
  });
  svg.appendChild(xLabelG);

  // tooltip
  const tipG = svgEl('g', { class: 'svg-tooltip' });
  tipG.style.display = 'none';
  const tipH = 18 + series.length * 14;
  const tipRect = svgEl('rect', { width: 180, height: tipH, class: 'tip-bg' });
  const tipTitle = svgEl('text', { x: 8, y: 14, 'font-weight': '600', 'font-size': '11' });
  tipG.appendChild(tipRect); tipG.appendChild(tipTitle);
  const tipLines = series.map((s, i) => {
    const sw = svgEl('rect', { x: 8, y: 22 + i * 14, width: 8, height: 8, fill: 'hsl(var(' + s.colorVar + '))', rx: 2 });
    const t = svgEl('text', { x: 22, y: 30 + i * 14, 'font-size': '11', fill: 'hsl(var(--foreground))' });
    tipG.appendChild(sw); tipG.appendChild(t);
    return t;
  });

  data.forEach((d, i) => {
    let yCursor = margin.top + innerH;
    const bx = margin.left + i * bandW + (bandW - barW) / 2;
    series.forEach(sr => {
      const v = d[sr.key] || 0;
      const h = (v / yMax) * innerH;
      if (h > 0.1) {
        yCursor -= h;
        svg.appendChild(svgEl('rect', {
          x: bx, y: yCursor, width: barW, height: h,
          fill: 'hsl(var(' + sr.colorVar + '))',
          rx: 1,
        }));
      }
    });
    const hit = svgEl('rect', {
      x: margin.left + i * bandW, y: margin.top, width: bandW, height: innerH,
      fill: 'transparent',
    });
    hit.addEventListener('mouseenter', () => {
      tipG.style.display = '';
      tipTitle.textContent = getLabel(d, i);
      series.forEach((sr, k) => {
        tipLines[k].textContent = sr.label + ': ' + opts.valueFmt(d[sr.key] || 0);
      });
      const tx = Math.min(W - 188, Math.max(margin.left, margin.left + i * bandW + bandW / 2 - 90));
      const ty = Math.max(margin.top, margin.top + innerH - (totals[i] / yMax) * innerH - (tipH + 8));
      tipG.setAttribute('transform', 'translate(' + tx + ',' + Math.max(2, ty) + ')');
    });
    hit.addEventListener('mouseleave', () => { tipG.style.display = 'none'; });
    svg.appendChild(hit);
  });
  svg.appendChild(tipG);
}

/** Donut chart with side legend. */
function drawDonutChart(svg, legendEl, data, getValue, getLabel, valueFmt) {
  if (!svg) return;
  clearSvg(svg);
  if (legendEl) legendEl.innerHTML = '';
  if (!data || data.length === 0) {
    if (legendEl) legendEl.innerHTML = '<li class="muted" style="font-size:12px">No data</li>';
    return;
  }
  const cx = 100, cy = 100, rOuter = 80, rInner = 50;
  const total = data.reduce((s, d) => s + (getValue(d) || 0), 0);
  if (total <= 0) {
    svg.appendChild(svgEl('circle', { cx, cy, r: rOuter, fill: 'hsl(var(--muted))' }));
    svg.appendChild(svgEl('circle', { cx, cy, r: rInner, fill: 'hsl(var(--card))' }));
    if (legendEl) legendEl.innerHTML = '<li class="muted" style="font-size:12px">No data</li>';
    return;
  }
  let start = -Math.PI / 2;
  data.forEach((d, i) => {
    const v = getValue(d) || 0;
    if (v <= 0) return;
    const slice = (v / total) * 2 * Math.PI;
    const end = start + slice;
    const large = slice > Math.PI ? 1 : 0;
    const x1 = cx + rOuter * Math.cos(start), y1 = cy + rOuter * Math.sin(start);
    const x2 = cx + rOuter * Math.cos(end),   y2 = cy + rOuter * Math.sin(end);
    const x3 = cx + rInner * Math.cos(end),   y3 = cy + rInner * Math.sin(end);
    const x4 = cx + rInner * Math.cos(start), y4 = cy + rInner * Math.sin(start);
    const color = colorFor(i);
    const slicePath = svgEl('path', {
      d:
        'M ' + x1 + ' ' + y1 + ' ' +
        'A ' + rOuter + ' ' + rOuter + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 + ' ' +
        'L ' + x3 + ' ' + y3 + ' ' +
        'A ' + rInner + ' ' + rInner + ' 0 ' + large + ' 0 ' + x4 + ' ' + y4 + ' Z',
      fill: color,
      class: 'donut-slice',
    });
    const label = getLabel(d);
    const pct   = ((v / total) * 100).toFixed(1) + '%';
    const valStr = valueFmt(v);
    slicePath.addEventListener('mousemove', (ev) => {
      showChartTooltip(tipHtml(label, color, valStr, pct), ev);
    });
    slicePath.addEventListener('mouseleave', hideChartTooltip);
    svg.appendChild(slicePath);
    start = end;
  });
  const center = svgEl('text', {
    x: cx, y: cy - 2, 'text-anchor': 'middle',
    fill: 'hsl(var(--foreground))', 'font-size': '14', 'font-weight': '600',
  });
  center.textContent = valueFmt(total);
  svg.appendChild(center);
  const sub = svgEl('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', fill: 'hsl(var(--muted-foreground))', 'font-size': '10' });
  sub.textContent = 'Total';
  svg.appendChild(sub);
  if (legendEl) {
    legendEl.innerHTML = data.map((d, i) => {
      const v = getValue(d) || 0;
      const pct = total ? ((v / total) * 100).toFixed(1) + '%' : '0%';
      return (
        '<li>' +
          '<span class="label">' +
            '<span class="swatch" style="background:' + colorFor(i) + '"></span>' +
            '<span class="label-text" title="' + escapeHtml(getLabel(d)) + '">' + escapeHtml(getLabel(d)) + '</span>' +
          '</span>' +
          '<span class="value">' + valueFmt(v) + ' · ' + pct + '</span>' +
        '</li>'
      );
    }).join('');
  }
}

/** Horizontal bar list rendered into a host element using .bar-row markup. */
function renderHBars(host, items, getLabel, getValue, valueFmt, opts) {
  if (!host) return;
  if (!items || items.length === 0) {
    host.innerHTML = '<div class="muted" style="font-size:12px;padding:6px 0">No data</div>';
    return;
  }
  const values = items.map(getValue);
  const max   = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + (v || 0), 0);
  host.innerHTML = items.map((it, i) => {
    const v = values[i];
    const pct = (v / max) * 100;
    const c = (opts && opts.colorByIndex) ? colorFor(i) : 'hsl(var(--chart-1))';
    return (
      '<div class="bar-row" data-i="' + i + '">' +
        '<span class="label-text">' + escapeHtml(getLabel(it)) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + pct.toFixed(1) + '%;background:' + c + '"></span></span>' +
        '<span class="val">' + valueFmt(v) + '</span>' +
      '</div>'
    );
  }).join('');

  // Hover tooltip: shows item label, bar colour, value, and share of total.
  host.querySelectorAll('.bar-row').forEach((row) => {
    const i = +row.getAttribute('data-i');
    const it = items[i];
    const v  = values[i];
    const c  = (opts && opts.colorByIndex) ? colorFor(i) : 'hsl(var(--chart-1))';
    const share = total > 0 ? ((v / total) * 100).toFixed(1) + '% of total' : '';
    const html = tipHtml(getLabel(it), c, valueFmt(v), share);
    row.addEventListener('mousemove', (ev) => showChartTooltip(html, ev));
    row.addEventListener('mouseleave', hideChartTooltip);
  });
}

/**
 * Hourly heatmap 7×24 (weekday × hour).
 * data: HourlyBucket[]
 */
function renderHeatmap(host, data, valueFmt) {
  if (!host) return;
  if (!data || data.length === 0) {
    host.innerHTML = '<div class="muted" style="font-size:12px;padding:6px 0">No data</div>';
    return;
  }
  const max = Math.max(...data.map(d => d.cost), 0.0001);
  const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const cells = [];
  // header row
  cells.push('<div class="corner"></div>');
  for (let h = 0; h < 24; h++) {
    cells.push('<div class="col-label">' + (h % 3 === 0 ? h : '') + '</div>');
  }
  // Index by weekday-hour so the hover handler can look up cost/requests in O(1).
  const cellMeta = {};
  for (let d = 0; d < 7; d++) {
    cells.push('<div class="row-label">' + dayLabels[d] + '</div>');
    for (let h = 0; h < 24; h++) {
      const b = data.find(x => x.weekday === d && x.hour === h) || { cost: 0, requests: 0 };
      const intensity = max > 0 ? b.cost / max : 0;
      const bg = intensity > 0
        ? 'hsl(var(--chart-1) / ' + Math.max(0.08, intensity).toFixed(2) + ')'
        : 'hsl(var(--muted))';
      const key = d + '-' + h;
      cellMeta[key] = { day: dayLabels[d], hour: h, cost: b.cost, requests: b.requests, bg };
      cells.push('<div class="cell" data-key="' + key + '" style="background:' + bg + '"></div>');
    }
  }
  host.innerHTML = cells.join('');

  host.querySelectorAll('.cell[data-key]').forEach((cell) => {
    const meta = cellMeta[cell.getAttribute('data-key')];
    if (!meta) return;
    // Swatch reflects intensity but stays visible: floor alpha so even faint
    // cells produce a clearly tinted dot (the unblended cell color would be
    // nearly invisible at alpha 0.08).
    const intensity = max > 0 ? meta.cost / max : 0;
    const alpha = meta.cost > 0 ? Math.max(0.55, intensity).toFixed(2) : 0;
    const swatch = meta.cost > 0
      ? 'hsl(var(--chart-1) / ' + alpha + ')'
      : 'hsl(var(--muted))';
    const html = tipHtml(
      meta.day + ' ' + String(meta.hour).padStart(2, '0') + ':00',
      swatch,
      valueFmt(meta.cost),
      meta.requests + ' req'
    );
    cell.addEventListener('mousemove', (ev) => showChartTooltip(html, ev));
    cell.addEventListener('mouseleave', hideChartTooltip);
  });
}
`;
