/* Dashboard page (Razor port of React features/dashboard + features/report).
   Admin: 4 tabs (overview / analytics / operations / reports). Staff: overview section only.
   Charts are plain SVG re-creations of the recharts visuals (no chart library in Razor). */
(function () {
  'use strict';
  var root = document.getElementById('db-tabs');
  var staffRoot = document.getElementById('st-root');
  if (!root && !staffRoot) return;

  var L = (k) => (window.CP_LANG && window.CP_LANG[k]) || k;
  var tp = (k, vars) => Object.entries(vars || {}).reduce((s, p) => s.split('{{' + p[0] + '}}').join(String(p[1])), L(k));
  var fmt = CP.fmt, esc = CP.esc, icon = CP.icon, toast = CP.toast;
  var $id = (id) => document.getElementById(id);

  // ============================================================ shared bits

  var EMPTY_SVG = '<svg width="184" height="152" viewBox="0 0 184 152" xmlns="http://www.w3.org/2000/svg" style="opacity:.65" aria-hidden="true">' +
    '<g fill="none" fill-rule="evenodd">' +
    '<g transform="translate(24 31.67)">' +
    '<ellipse fill-opacity=".8" fill="#F5F5F7" cx="67.797" cy="106.89" rx="67.797" ry="12.668"/>' +
    '<path d="M122.034 69.674L98.109 40.229c-1.148-1.386-2.826-2.225-4.593-2.225h-51.44c-1.766 0-3.444.839-4.592 2.225L13.56 69.674v15.383h108.475V69.674z" fill="#AEB8C2"/>' +
    '<path d="M101.537 86.214L80.63 61.102c-1.001-1.207-2.507-1.867-4.048-1.867H31.724c-1.54 0-3.047.66-4.048 1.867L6.769 86.214v13.792h94.768V86.214z" fill="url(#linearGradient-1)" transform="translate(13.56)"/>' +
    '<path d="M33.83 0h67.933a4 4 0 0 1 4 4v93.344a4 4 0 0 1-4 4H33.83a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill="#F5F5F7"/>' +
    '<path d="M42.678 9.953h50.237a2 2 0 0 1 2 2V36.91a2 2 0 0 1-2 2H42.678a2 2 0 0 1-2-2V11.953a2 2 0 0 1 2-2zM42.94 49.767h49.713a2.262 2.262 0 1 1 0 4.524H42.94a2.262 2.262 0 0 1 0-4.524zM42.94 61.53h49.713a2.262 2.262 0 1 1 0 4.525H42.94a2.262 2.262 0 0 1 0-4.525zM121.813 105.032c-.775 3.071-3.497 5.36-6.735 5.36H20.515c-3.238 0-5.96-2.29-6.734-5.36a7.309 7.309 0 0 1-.222-1.79V69.675h26.318c2.907 0 5.25 2.448 5.25 5.42v.04c0 2.971 2.37 5.37 5.277 5.37h34.785c2.907 0 5.277-2.421 5.277-5.393V75.1c0-2.972 2.343-5.426 5.25-5.426h26.318v33.569c0 .617-.077 1.216-.221 1.789z" fill="#DCE0E6"/>' +
    '</g>' +
    '<path d="M149.121 33.292l-6.83 2.65a1 1 0 0 1-1.317-1.23l1.937-6.207c-2.589-2.944-4.109-6.534-4.109-10.408C138.802 8.102 148.92 0 161.402 0 173.881 0 184 8.102 184 18.097c0 9.995-10.118 18.097-22.599 18.097-4.528 0-8.744-1.066-12.28-2.902z" fill="#DCE0E6"/>' +
    '<g transform="translate(149.65 15.383)" fill="#FFF">' +
    '<ellipse cx="20.654" cy="3.167" rx="2.849" ry="2.815"/>' +
    '<path d="M5.698 5.63H0L2.898.704zM9.259.704h4.985V5.63H9.259z"/>' +
    '</g></g></svg>';
  /* antd Empty.PRESENTED_IMAGE_SIMPLE, dark-token colors, used inside empty tables. */
  var SIMPLE_SVG = '<svg width="64" height="41" viewBox="0 0 64 41" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g transform="translate(0 1)" fill="none" fill-rule="evenodd">' +
    '<ellipse fill="#272727" cx="32" cy="33" rx="32" ry="7"/>' +
    '<g fill-rule="nonzero" stroke="#373737">' +
    '<path d="M55 12.76L44.854 1.258C44.367.474 43.656 0 42.907 0H21.093c-.749 0-1.46.474-1.947 1.257L9 12.761V22h46v-9.24z"/>' +
    '<path d="M41.613 15.931c0-1.605.994-2.93 2.227-2.931H55v18.137C55 33.26 53.68 35 52.05 35h-40.1C10.32 35 9 33.259 9 31.137V13h11.16c1.233 0 2.227 1.323 2.227 2.928v.022c0 1.605 1.005 2.901 2.237 2.901h14.752c1.232 0 2.237-1.308 2.237-2.913v-.007z" fill="#1d1d1d"/>' +
    '</g></g></svg>';

  function emptyHtml(text) {
    return '<div class="ant-empty">' + EMPTY_SVG + (text ? '<div>' + esc(text) + '</div>' : '') + '</div>';
  }
  function emptyRow(cols, text) {
    return '<tr class="ant-table-empty"><td colspan="' + cols + '">' +
      '<div class="ant-empty" style="padding:8px 0">' + SIMPLE_SVG + '<div>' + esc(text) + '</div></div></td></tr>';
  }
  function showErr(host, e) {
    if (!host) return;
    host.innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') + '</span><div class="flex-1">' +
      esc((e && e.message) || L('common.somethingWrong')) + '</div></div>';
  }
  function hideErr(host) { if (host) host.innerHTML = ''; }

  // ---- range helpers (mirror features/dashboard/components/dashboardRange.ts) ----

  var ISO_PAD = (n) => String(n).padStart(2, '0');
  function iso(d) { return d.getFullYear() + '-' + ISO_PAD(d.getMonth() + 1) + '-' + ISO_PAD(d.getDate()); }
  function shift(base, days) { var d = new Date(base); d.setDate(d.getDate() + days); return d; }
  function startOfWeek(d) { var out = new Date(d); var dow = (out.getDay() + 6) % 7; out.setDate(out.getDate() - dow); out.setHours(0, 0, 0, 0); return out; }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function monthEnd(s) { return new Date(s.getFullYear(), s.getMonth() + 1, 0); }
  function startOfYear(d) { return new Date(d.getFullYear(), 0, 1); }
  function isoToDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var BUCKET = { week: 'day', month: 'day', quarter: 'week', year: 'month' };

  function filterWindows(sel) {
    var start, end;
    if (sel.type === 'quarter') {
      var m = (sel.quarter - 1) * 3;
      start = new Date(sel.year, m, 1);
      end = new Date(sel.year, m + 3, 0);
    } else {
      var d = new Date(sel.date.getFullYear(), sel.date.getMonth(), sel.date.getDate());
      if (sel.type === 'week') { start = startOfWeek(d); end = shift(start, 6); }
      else if (sel.type === 'month') { start = startOfMonth(d); end = monthEnd(start); }
      else { start = startOfYear(d); end = new Date(start.getFullYear(), 11, 31); }
    }
    var span = Math.round((end - start) / 86400000) + 1;
    return {
      current: { from: iso(start), to: iso(end) },
      previous: { from: iso(shift(start, -span)), to: iso(shift(start, -1)) },
      bucket: BUCKET[sel.type], span: span,
    };
  }
  function bucketize(days, bucket) {
    if (bucket === 'day') return days.map((d) => ({ label: d.date.slice(5), fullLabel: d.date, revenue: d.revenue, tickets: d.tickets }));
    var groups = new Map();
    days.forEach((d) => {
      var dt = isoToDate(d.date);
      var key = bucket === 'week' ? iso(startOfWeek(dt)) : (dt.getFullYear() + '-' + ISO_PAD(dt.getMonth() + 1));
      var g = groups.get(key) || { revenue: 0, tickets: 0 };
      g.revenue += d.revenue; g.tickets += d.tickets;
      groups.set(key, g);
    });
    return [...groups.entries()].map(([key, g]) => ({
      label: bucket === 'week' ? key.slice(5) : (key.slice(5) + '/' + key.slice(2, 4)),
      fullLabel: bucket === 'week' ? ('w/c ' + key) : key,
      revenue: g.revenue, tickets: g.tickets,
    }));
  }
  function fillDays(from, to, rows, zero) {
    var byDate = new Map((rows || []).map((r) => [r.date, r]));
    var out = []; var d = isoToDate(from), end = isoToDate(to);
    while (d <= end) { var key = iso(d); out.push(byDate.get(key) || zero(key)); d = shift(d, 1); }
    return out;
  }
  function trendOf(cur, prev) { return prev === 0 ? null : Math.round(((cur - prev) / prev) * 100); }
  function occupancyPercent(seats, cap) { return cap === 0 ? 0 : Math.round((10000 * seats) / cap) / 100; }
  function missingDays(from, to, days) {
    var have = new Set((days || []).map((d) => d.report_date));
    var out = []; var d = isoToDate(from), end = isoToDate(to);
    while (d <= end) { var key = iso(d); if (!have.has(key)) out.push(key); d = shift(d, 1); }
    return out;
  }
  function rollupByMovie(days) {
    var byMovie = new Map();
    (days || []).forEach((day) => {
      (((day.breakdown || {}).showtimes) || []).forEach((show) => {
        var row = byMovie.get(show.movie) || { movie: show.movie, showtimes: 0, seatsSold: 0, capacity: 0, checkedIn: 0, revenue: 0 };
        row.showtimes += 1; row.seatsSold += show.seats_sold; row.capacity += show.capacity; row.checkedIn += show.checked_in; row.revenue += show.revenue;
        byMovie.set(show.movie, row);
      });
    });
    return [...byMovie.values()].sort((a, b) => b.revenue - a.revenue);
  }
  var qs = (w) => 'from=' + w.from + '&to=' + w.to;

  // ============================================================ chart kit (plain SVG)

  var chartFns = new Map();
  var rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => chartFns.forEach((f) => { try { f(); } catch (_) { /* hidden pane */ } }), 150);
  });
  function r2(v) { return Math.round(v * 100) / 100; }
  function niceTicks(max) {
    if (!(max > 0)) return { max: 1, ticks: [0, 1] };
    var raw = max / 4;
    var pow = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / pow;
    var step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
    return { max: step * 4, ticks: [0, step, step * 2, step * 3, step * 4] };
  }
  function tickFmt(v) { return v >= 1000000 ? Math.round(v / 1000000) + 'M' : Math.round(v / 1000) + 'k'; }
  function smoothPath(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) return 'M' + pts[0][0] + ',' + pts[0][1];
    var n = pts.length, dxs = [], slopes = [], m = [], i;
    for (i = 0; i < n - 1; i++) { dxs[i] = (pts[i + 1][0] - pts[i][0]) || 1; slopes[i] = (pts[i + 1][1] - pts[i][1]) / dxs[i]; }
    m[0] = slopes[0]; m[n - 1] = slopes[n - 2];
    for (i = 1; i < n - 1; i++) m[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (i = 0; i < n - 1; i++) {
      d += 'C' + r2(pts[i][0] + dxs[i] / 3) + ',' + r2(pts[i][1] + m[i] * dxs[i] / 3) +
        ' ' + r2(pts[i + 1][0] - dxs[i] / 3) + ',' + r2(pts[i + 1][1] - m[i + 1] * dxs[i] / 3) +
        ' ' + pts[i + 1][0] + ',' + pts[i + 1][1];
    }
    return d;
  }
  function roundRectTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.max(0, h));
    return 'M' + r2(x) + ',' + r2(y + h) + 'L' + r2(x) + ',' + r2(y + r) + 'Q' + r2(x) + ',' + r2(y) + ' ' + r2(x + r) + ',' + r2(y) +
      'L' + r2(x + w - r) + ',' + r2(y) + 'Q' + r2(x + w) + ',' + r2(y) + ' ' + r2(x + w) + ',' + r2(y + r) + 'L' + r2(x + w) + ',' + r2(y + h) + 'Z';
  }
  function svgTip(name, value) {
    return '<div class="db-tip-val">' + esc(name) + ' : ' + esc(value) + '</div>';
  }

  /** Area chart with gradient, dashed grid, k/M axis and a hover tooltip (recharts look). */
  function areaChart(host, points) {
    if (!points.length) { host.innerHTML = emptyHtml(L('common.noData')); chartFns.delete(host.id); return; }
    function draw() {
      var w = host.clientWidth; if (!w) return;
      var h = 260, padL = 48, padR = 8, padT = 8, padB = 24;
      var plotW = w - padL - padR, plotH = h - padT - padB;
      var t = niceTicks(Math.max.apply(null, points.map((p) => p.revenue).concat([0])));
      var band = plotW / points.length;
      var X = (i) => padL + band * (i + 0.5);
      var Y = (v) => padT + plotH - (v / t.max) * plotH;
      var pts = points.map((p, i) => [r2(X(i)), r2(Y(p.revenue))]);
      var line = smoothPath(pts);
      var area = line + 'L' + pts[pts.length - 1][0] + ',' + r2(padT + plotH) + 'L' + pts[0][0] + ',' + r2(padT + plotH) + 'Z';
      var labelStep = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 56))));
      var gid = 'dbg_' + host.id;
      var svg = '<svg width="' + w + '" height="' + h + '" style="display:block">' +
        '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#D33B56" stop-opacity="0.45"/><stop offset="100%" stop-color="#D33B56" stop-opacity="0.05"/>' +
        '</linearGradient></defs>';
      t.ticks.forEach((v) => {
        var y = r2(Y(v));
        svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + r2(w - padR) + '" y2="' + y + '" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 3"/>' +
          '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--text-2)">' + tickFmt(v) + '</text>';
      });
      points.forEach((p, i) => {
        if (i % labelStep === 0 || i === points.length - 1) {
          svg += '<text x="' + r2(X(i)) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="11" fill="var(--text-2)">' + esc(p.label) + '</text>';
        }
      });
      svg += '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
        '<path d="' + line + '" fill="none" stroke="#D33B56" stroke-width="2.5"/>' +
        '<line class="db-vline" x1="0" y1="' + padT + '" x2="0" y2="' + r2(padT + plotH) + '" stroke="#4b4b4b" style="display:none"/>' +
        '<circle class="db-dot" r="4" fill="#fff" stroke="#D33B56" stroke-width="2" style="display:none"/>' +
        '</svg><div class="db-tip" style="display:none"></div>';
      host.innerHTML = svg;
      var svgEl = host.querySelector('svg'), vline = host.querySelector('.db-vline');
      var dot = host.querySelector('.db-dot'), tip = host.querySelector('.db-tip');
      svgEl.addEventListener('mousemove', (ev) => {
        var rct = svgEl.getBoundingClientRect();
        var i = Math.max(0, Math.min(points.length - 1, Math.floor((ev.clientX - rct.left - padL) / band)));
        var px = X(i), py = Y(points[i].revenue);
        vline.setAttribute('x1', px); vline.setAttribute('x2', px); vline.style.display = '';
        dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.style.display = '';
        tip.innerHTML = '<div class="db-tip-label">' + esc(points[i].fullLabel) + '</div>' + svgTip(L('dashboard.kpiRevenue'), fmt.money(points[i].revenue));
        tip.style.display = '';
        tip.style.top = '14px';
        var left = px + 12;
        if (left + tip.offsetWidth > w - 4) left = Math.max(4, px - tip.offsetWidth - 12);
        tip.style.left = left + 'px';
      });
      svgEl.addEventListener('mouseleave', () => { vline.style.display = 'none'; dot.style.display = 'none'; tip.style.display = 'none'; });
    }
    draw();
    chartFns.set(host.id, draw);
  }

  function arcPath(cx, cy, r0, r1, a0, a1) {
    var P = (a, rad) => r2(cx + rad * Math.sin(a)) + ',' + r2(cy - rad * Math.cos(a));
    var large = (a1 - a0) > Math.PI ? 1 : 0;
    return 'M' + P(a0, r1) + 'A' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + P(a1, r1) +
      'L' + P(a1, r0) + 'A' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + P(a0, r0) + 'Z';
  }

  /** Donut with centred slices + bottom legend (recharts Pie look). */
  function pieChart(host, slices, colors) {
    if (!slices.length) { host.innerHTML = emptyHtml(L('common.noData')); chartFns.delete(host.id); return; }
    function draw() {
      var w = host.clientWidth; if (!w) return;
      var h = 260, cx = w / 2, cy = 118, R = 84, r0 = 52;
      var total = Math.max(1, slices.reduce((s, x) => s + x.value, 0));
      var svg = '<svg width="' + w + '" height="' + h + '" style="display:block">';
      if (slices.length === 1) {
        svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + colors[0] + '"/>' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + r0 + '" fill="#141414"/>';
      } else {
        var a = 0;
        slices.forEach((s, i) => {
          var a1 = a + (s.value / total) * Math.PI * 2;
          svg += '<path d="' + arcPath(cx, cy, r0, R, a, a1) + '" fill="' + colors[i % colors.length] + '" stroke="#141414" stroke-width="2"/>';
          a = a1;
        });
      }
      svg += '</svg><div class="db-legend">' + slices.map((s, i) =>
        '<span><i style="background:' + colors[i % colors.length] + '"></i>' + esc(s.name) + '</span>').join('') +
        '</div><div class="db-tip" style="display:none"></div>';
      host.innerHTML = svg;
      var svgEl = host.querySelector('svg'), tip = host.querySelector('.db-tip');
      svgEl.addEventListener('mousemove', (ev) => {
        var rct = svgEl.getBoundingClientRect();
        var mx = ev.clientX - rct.left - cx, my = ev.clientY - rct.top - cy;
        var dist = Math.sqrt(mx * mx + my * my);
        if (dist < r0 || dist > R + 4) { tip.style.display = 'none'; return; }
        var ang = Math.atan2(mx, -my); if (ang < 0) ang += Math.PI * 2;
        var acc = 0, hit = 0;
        for (var i = 0; i < slices.length; i++) { acc += (slices[i].value / total) * Math.PI * 2; hit = i; if (ang <= acc) break; }
        var s = slices[hit];
        tip.innerHTML = svgTip(s.name, fmt.money(s.value) + ' · ' + s.count);
        tip.style.display = '';
        tip.style.left = (ev.clientX - rct.left + 12) + 'px';
        tip.style.top = (ev.clientY - rct.top - 8) + 'px';
      });
      svgEl.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    }
    draw();
    chartFns.set(host.id, draw);
  }

  /** Pareto: bars (revenue) + cumulative % line + 80% reference line (recharts ComposedChart look). */
  function paretoChart(host, rows) {
    if (!rows.length) { host.innerHTML = emptyHtml(L('common.noData')); chartFns.delete(host.id); return; }
    function draw() {
      var w = host.clientWidth; if (!w) return;
      var h = Math.max(160, rows.length * 40);
      var padL = 44, padR = 44, padT = 8, padB = 52;
      var plotW = w - padL - padR, plotH = h - padT - padB;
      var t = niceTicks(Math.max.apply(null, rows.map((r) => r.revenue).concat([0])));
      var band = plotW / rows.length;
      var X = (i) => padL + band * (i + 0.5);
      var YL = (v) => padT + plotH - (v / t.max) * plotH;
      var YR = (v) => padT + plotH - (v / 100) * plotH;
      var svg = '<svg width="' + w + '" height="' + h + '" style="display:block">';
      t.ticks.forEach((v) => {
        var y = r2(YL(v));
        svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + r2(w - padR) + '" y2="' + y + '" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 3"/>' +
          '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--text-2)">' + tickFmt(v) + '</text>';
      });
      [0, 25, 50, 75, 100].forEach((v) => {
        var y = r2(YR(v));
        svg += '<text x="' + (w - padR + 8) + '" y="' + (y + 4) + '" font-size="11" fill="var(--text-2)">' + v + '%</text>';
      });
      rows.forEach((r, i) => {
        var x = r2(X(i) - 13), y = r2(YL(r.revenue));
        svg += '<line x1="' + r2(X(i)) + '" y1="' + padT + '" x2="' + r2(X(i)) + '" y2="' + r2(padT + plotH) + '" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 3"/>' +
          '<path d="' + roundRectTop(x, y, 26, padT + plotH - y, 4) + '" fill="#D33B56"/>';
      });
      var cpts = rows.map((r, i) => [r2(X(i)), r2(YR(r.cumulative))]);
      svg += '<path d="' + smoothPath(cpts) + '" fill="none" stroke="#D97706" stroke-width="2"/>';
      var y80 = r2(YR(80));
      svg += '<line x1="' + padL + '" y1="' + y80 + '" x2="' + r2(w - padR) + '" y2="' + y80 + '" stroke="#D22F27" stroke-dasharray="5 3"/>' +
        '<text x="' + r2(w - padR - 2) + '" y="' + (y80 - 4) + '" text-anchor="end" font-size="11" fill="#D22F27">80%</text>';
      rows.forEach((r, i) => {
        svg += '<text transform="translate(' + r2(X(i) + 4) + ',' + (h - padB + 16) + ') rotate(-18)" text-anchor="end" font-size="11" fill="var(--text-2)">' + esc(r.name) + '</text>';
      });
      svg += '</svg><div class="db-legend">' +
        '<span><i style="background:#D33B56"></i>' + esc(L('dashboard.colRevenue')) + '</span>' +
        '<span><i class="db-legend-line" style="background:#D97706"><b></b></i>' + esc(L('dashboard.paretoCumulative')) + '</span>' +
        '</div><div class="db-tip" style="display:none"></div>';
      host.innerHTML = svg;
      var svgEl = host.querySelector('svg'), tip = host.querySelector('.db-tip');
      svgEl.addEventListener('mousemove', (ev) => {
        var rct = svgEl.getBoundingClientRect();
        var i = Math.max(0, Math.min(rows.length - 1, Math.floor((ev.clientX - rct.left - padL) / band)));
        tip.innerHTML = '<div class="db-tip-label">' + esc(rows[i].name) + '</div>' +
          svgTip(L('dashboard.colRevenue'), fmt.money(rows[i].revenue)) +
          svgTip(L('dashboard.paretoCumulative'), rows[i].cumulative + '%');
        tip.style.display = '';
        tip.style.top = '14px';
        var left = X(i) + 12;
        if (left + tip.offsetWidth > w - 4) left = Math.max(4, X(i) - tip.offsetWidth - 12);
        tip.style.left = left + 'px';
      });
      svgEl.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    }
    draw();
    chartFns.set(host.id, draw);
  }

  /** Occupancy gauge: top semicircle + centre % + seats/capacity (recharts RadialBar look). */
  function gaugeChart(host, pctVal, pctText, subText) {
    function draw() {
      var w = host.clientWidth; if (!w) return;
      var h = 190;
      var R = Math.min(w / 2 - 16, 84);
      var thick = Math.max(8, Math.round(R * 0.32));
      var cx = w / 2, cy = 95;
      var pt = (t) => { var a = Math.PI - t * Math.PI; return r2(cx + R * Math.cos(a)) + ',' + r2(cy - R * Math.sin(a)); };
      var frac = Math.max(0, Math.min(100, pctVal)) / 100;
      var val = frac <= 0 ? '' : 'M' + pt(0) + 'A' + R + ' ' + R + ' 0 ' + (frac > 0.5 ? 1 : 0) + ' 1 ' + pt(frac);
      host.innerHTML = '<svg width="' + w + '" height="' + h + '" style="display:block">' +
        '<path d="M' + pt(0) + 'A' + R + ' ' + R + ' 0 0 1 ' + pt(1) + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="' + thick + '" stroke-linecap="round"/>' +
        (val ? '<path d="' + val + '" fill="none" stroke="#D33B56" stroke-width="' + thick + '" stroke-linecap="round"/>' : '') +
        '<text x="' + cx + '" y="' + r2(h * 0.62) + '" text-anchor="middle" font-size="26" font-weight="700" fill="#fff">' + esc(pctText) + '</text>' +
        '<text x="' + cx + '" y="' + r2(h * 0.76) + '" text-anchor="middle" font-size="12" fill="var(--text-2)">' + esc(subText) + '</text>' +
        '</svg>';
    }
    draw();
    chartFns.set(host.id, draw);
  }

  /** Vertical bars with integer ticks + hover tooltip (recharts BarChart look). */
  function barChart(host, rows, nameLabel) {
    if (!rows.length) { host.innerHTML = emptyHtml(L('common.noData')); chartFns.delete(host.id); return; }
    function draw() {
      var w = host.clientWidth; if (!w) return;
      var h = 190, padL = 28, padR = 8, padT = 8, padB = 22;
      var plotW = w - padL - padR, plotH = h - padT - padB;
      var maxV = Math.max(1, Math.max.apply(null, rows.map((r) => r.value)));
      var step = Math.max(1, Math.ceil(maxV / 4));
      var top = step * 4;
      var band = plotW / rows.length;
      var X = (i) => padL + band * (i + 0.5);
      var Y = (v) => padT + plotH - (v / top) * plotH;
      var svg = '<svg width="' + w + '" height="' + h + '" style="display:block">';
      for (var v = 0; v <= top; v += step) {
        var y = r2(Y(v));
        svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + r2(w - padR) + '" y2="' + y + '" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 3"/>' +
          '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--text-2)">' + v + '</text>';
      }
      rows.forEach((r, i) => {
        var y = r2(Y(r.value));
        svg += '<path d="' + roundRectTop(X(i) - 13, y, 26, padT + plotH - y, 4) + '" fill="#D33B56"/>' +
          '<text x="' + r2(X(i)) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="11" fill="var(--text-2)">' + esc(r.label) + '</text>';
      });
      svg += '</svg><div class="db-tip" style="display:none"></div>';
      host.innerHTML = svg;
      var svgEl = host.querySelector('svg'), tip = host.querySelector('.db-tip');
      svgEl.addEventListener('mousemove', (ev) => {
        var rct = svgEl.getBoundingClientRect();
        var i = Math.max(0, Math.min(rows.length - 1, Math.floor((ev.clientX - rct.left - padL) / band)));
        tip.innerHTML = svgTip(nameLabel, fmt.number(rows[i].value));
        tip.style.display = '';
        tip.style.top = '14px';
        var left = X(i) + 12;
        if (left + tip.offsetWidth > w - 4) left = Math.max(4, X(i) - tip.offsetWidth - 12);
        tip.style.left = left + 'px';
      });
      svgEl.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    }
    draw();
    chartFns.set(host.id, draw);
  }

  // ============================================================ time filter

  function buildFilter(host, state, onChange) {
    function paint() {
      var isQ = state.type === 'quarter';
      var anchor = isQ ? new Date(state.year, (state.quarter - 1) * 3, 1) : state.date;
      var segs = [['week', 'presetWeek'], ['month', 'presetMonth'], ['quarter', 'presetQuarter'], ['year', 'presetYear']];
      host.innerHTML = '<div class="ant-segmented">' +
        segs.map((s) => '<button type="button" class="ant-segmented-item' + (state.type === s[0] ? ' active' : '') + '" data-type="' + s[0] + '">' + esc(L('dashboard.' + s[1])) + '</button>').join('') +
        '</div>' +
        (isQ
          ? '<span id="db_qsel" style="width:90px"></span><span id="db_ysel" style="width:100px"></span>'
          : '<span class="ant-input ant-date-shell db-date-shell" style="height:32px;width:150px">' +
            '<input class="min-w-0 flex-1" type="' + (state.type === 'month' ? 'month' : 'date') + '" required />' +
            '<span class="ant-date-ph"></span>' +
            '<span class="anticon ml-1 shrink-0 text-[var(--text-3)]">' + icon('Calendar') + '</span>' +
            '</span>');
      host.querySelectorAll('[data-type]').forEach((b) => {
        b.onclick = () => {
          var type = b.dataset.type;
          onChange(type === 'quarter'
            ? { type: type, quarter: Math.floor(anchor.getMonth() / 3) + 1, year: anchor.getFullYear() }
            : { type: type, date: anchor });
        };
      });
      if (isQ) {
        var years = [0, 1, 2, 3, 4, 5].map((i) => new Date().getFullYear() - i).reverse();
        CP.makeSelect(host.querySelector('#db_qsel'), [1, 2, 3, 4].map((q) => ({ value: String(q), label: 'Q' + q })), String(state.quarter),
          (v) => onChange({ type: 'quarter', quarter: Number(v), year: state.year }));
        CP.makeSelect(host.querySelector('#db_ysel'), years.map((y) => ({ value: String(y), label: String(y) })), String(state.year),
          (v) => onChange({ type: 'quarter', quarter: state.quarter, year: Number(v) }));
      } else {
        var inp = host.querySelector('input');
        var lbl = host.querySelector('.ant-date-ph');
        if (state.type === 'month') inp.value = state.date.getFullYear() + '-' + ISO_PAD(state.date.getMonth() + 1);
        else inp.value = iso(state.date);
        lbl.textContent = state.type === 'month'
          ? (ISO_PAD(state.date.getMonth() + 1) + '/' + state.date.getFullYear())
          : fmt.date(state.date);
        inp.parentElement.addEventListener('click', () => { if (inp.showPicker) { try { inp.showPicker(); } catch (_) { /* opened */ } } });
        inp.addEventListener('change', () => {
          if (!inp.value) return;
          var p = inp.value.split('-');
          var d = state.type === 'month' ? new Date(+p[0], +p[1] - 1, 1) : new Date(+p[0], +p[1] - 1, +p[2]);
          onChange({ type: state.type, date: d });
        });
      }
    }
    paint();
    host._repaint = paint;
  }

  // ============================================================ shared table builders

  function kpiCard(title, valueHtml, prefixSvg, trendHtml, rev) {
    return '<div class="ant-card' + (rev ? ' db-kpi-rev' : '') + '"><div class="ant-card-body">' +
      '<div class="ant-statistic-title">' + esc(title) + '</div>' +
      '<div class="ant-statistic-value">' + (prefixSvg ? '<span class="anticon db-prefix">' + prefixSvg + '</span>' : '') + valueHtml + '</div>' +
      (trendHtml || '') + '</div></div>';
  }
  function trendBadge(value, suffix, unit) {
    if (value === null) return '<div class="db-trend db-trend-flat">— ' + esc(suffix) + '</div>';
    var up = value >= 0;
    return '<div class="db-trend ' + (up ? 'db-trend-up' : 'db-trend-down') + '"><span class="anticon">' + icon(up ? 'ArrowUp' : 'ArrowDown') + '</span> ' +
      Math.abs(value) + (unit || '%') + ' ' + esc(suffix) + '</div>';
  }
  function statCard(title, valueHtml) {
    return '<div class="ant-card"><div class="ant-card-body">' +
      '<div class="ant-statistic-title">' + esc(title) + '</div>' +
      '<div class="ant-statistic-value">' + valueHtml + '</div></div></div>';
  }
  function boardTable(rows) {
    return '<div class="ant-table-wrap"><table class="ant-table db-table-sm"><thead><tr>' +
      ['colTime', 'colMovie', 'colHall', 'colSold', 'colLeft', 'colCheckedIn'].map((k) => '<th>' + esc(L('dashboard.' + k)) + '</th>').join('') +
      '</tr></thead><tbody>' + rows.map((s) =>
        '<tr><td>' + esc(fmt.datetime(s.start_at)) + '</td><td>' + esc(s.movie_title) + '</td><td>' + esc(s.hall_name) + '</td>' +
        '<td>' + esc(fmt.number(s.sold) + '/' + fmt.number(s.capacity)) + '</td>' +
        '<td>' + esc(fmt.number(s.available)) + '</td><td>' + esc(fmt.number(s.checked_in)) + '</td></tr>').join('') +
      '</tbody></table></div>';
  }
  function topRowHtml(i, name, revenue, max, tickets) {
    return '<tr>' +
      '<td><span class="db-rank' + (i < 3 ? ' db-rank-top' : '') + '">' + (i + 1) + '</span></td>' +
      '<td><div class="font-semibold">' + esc(name) + '</div><div class="db-progress"><i style="width:' + Math.max(3, Math.round((revenue / max) * 100)) + '%"></i></div></td>' +
      '<td class="text-right tabular-nums">' + esc(fmt.number(tickets)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(fmt.money(revenue)) + '</td></tr>';
  }

  // ============================================================ overview tab

  var ovState = { type: 'week', date: new Date() };
  var PROVIDER_COLORS = ['#D33B56', '#2563EB', '#D97706', '#2E7D32', '#7A4405', '#1D4ED8'];

  function loadOverview() {
    var tf = $id('db_ov_tf');
    buildFilter(tf, ovState, (next) => { ovState = next; if (tf._repaint) tf._repaint(); fetchOverview(); });
    fetchOverview();
  }
  async function fetchOverview() {
    try {
      var w = filterWindows(ovState);
      var res = await Promise.all([
        Api.get('/admin/reports/breakdown?' + qs(w.current)),
        Api.get('/admin/reports/breakdown?' + qs(w.previous)),
        Api.get('/admin/reports/daily?' + qs(w.current)),
        Api.get('/admin/reports/daily?' + qs(w.previous)),
      ]);
      hideErr($id('db_ov_err'));
      renderOverview(w, res[0], res[1], res[2], res[3]);
    } catch (e) { showErr($id('db_ov_err'), e); }
  }
  function renderOverview(w, cur, prev, daily, prevDaily) {
    var suffix = tp('dashboard.vsPrev', { days: w.span });
    var cap = (daily.days || []).reduce((s, d) => s + d.capacity, 0);
    var seats = (daily.days || []).reduce((s, d) => s + d.seats_sold, 0);
    var occupancy = cap > 0 ? (100 * seats) / cap : 0;
    var prevCap = (prevDaily.days || []).reduce((s, d) => s + d.capacity, 0);
    var prevSeats = (prevDaily.days || []).reduce((s, d) => s + d.seats_sold, 0);
    var prevOccupancy = prevCap > 0 ? (100 * prevSeats) / prevCap : 0;
    var occupancyTrend = prevCap > 0 ? Math.round((occupancy - prevOccupancy) * 10) / 10 : null;
    var avgTicket = cur.tickets_sold > 0 ? cur.total_revenue / cur.tickets_sold : 0;
    var revenueTrend = trendOf(cur.total_revenue, prev.total_revenue);
    var ticketsTrend = trendOf(cur.tickets_sold, prev.tickets_sold);

    $id('db_ov_kpis').innerHTML =
      kpiCard(L('dashboard.kpiRevenue'), esc(fmt.money(cur.total_revenue)), icon('Dollar'), trendBadge(revenueTrend, suffix), true) +
      kpiCard(L('dashboard.kpiTickets'), esc(fmt.number(cur.tickets_sold)), icon('Tag'), trendBadge(ticketsTrend, suffix)) +
      kpiCard(L('dashboard.kpiOccupancy'), esc(fmt.number(Math.round(occupancy * 100) / 100)) + '%', icon('PieChart'), trendBadge(occupancyTrend, suffix, 'pp')) +
      kpiCard(L('dashboard.kpiAvgTicket'), esc(fmt.money(Math.round(avgTicket))), icon('LineChart'), '');

    var filled = fillDays(w.current.from, w.current.to, cur.days || [], (date) => ({ date: date, revenue: 0, tickets: 0 }));
    areaChart($id('db_ov_area'), bucketize(filled, w.bucket));

    pieChart($id('db_ov_pie'), (cur.providers || []).map((p) => ({ name: p.provider, value: p.revenue, count: p.count })), PROVIDER_COLORS);

    loadNowShowing();
  }
  async function loadNowShowing() {
    var box = $id('db_ov_movies');
    try {
      var data = await Api.get('/movies?page=1&page_size=6&status=showing');
      var items = data.items || [];
      box.innerHTML = items.length ? items.map(movieCardHtml).join('') : emptyHtml('');
    } catch (_) { box.innerHTML = ''; }
  }
  function movieCardHtml(m) {
    var st = {
      draft: { l: 'movie.statusDraft', c: '' },
      coming_soon: { l: 'movie.statusComing_soon', c: 'ant-tag-blue' },
      showing: { l: 'movie.statusShowing', c: 'ant-tag-green' },
      ended: { l: 'movie.statusEnded', c: 'ant-tag-red' },
    }[m.status] || { l: 'movie.statusDraft', c: '' };
    return '<article class="db-movie">' +
      '<div class="db-movie-media">' + (m.poster_url ? '<img src="' + esc(m.poster_url) + '" alt="" loading="lazy">' : '') + '</div>' +
      '<div class="db-movie-body">' +
      '<div class="db-movie-title">' + esc(m.title) + '</div>' +
      '<div class="db-movie-meta"><span class="ant-tag ' + st.c + '" style="border:0">' + esc(L(st.l)) + '</span>' + esc(fmt.duration(m.duration)) + '</div>' +
      '</div></article>';
  }

  // ============================================================ analytics tab

  var anState = { type: 'week', date: new Date() };

  function loadAnalytics() {
    var tf = $id('db_an_tf');
    buildFilter(tf, anState, (next) => { anState = next; if (tf._repaint) tf._repaint(); fetchAnalytics(); });
    fetchAnalytics();
  }
  async function fetchAnalytics() {
    try {
      var w = filterWindows(anState);
      var data = await Api.get('/admin/reports/breakdown?' + qs(w.current));
      hideErr($id('db_an_err'));
      renderAnalytics(w, data);
    } catch (e) { showErr($id('db_an_err'), e); }
  }
  function paretoRows(items) {
    var total = Math.max(1, items.reduce((s, i) => s + i.revenue, 0));
    var acc = 0;
    return items.map((it) => { acc += it.revenue; return { name: it.name, revenue: it.revenue, cumulative: Math.round((acc / total) * 1000) / 10 }; });
  }
  function renderAnalytics(w, data) {
    var movies = data.movies || [], halls = data.halls || [];
    var singleHall = halls.length <= 1;
    ['db_an_ph', 'db_an_th'].forEach((id) => { $id(id).style.display = singleHall ? 'none' : ''; });
    ['db_an_pm', 'db_an_tm'].forEach((id) => {
      $id(id).classList.toggle('db-span12', singleHall);
      $id(id).classList.toggle('db-span6', !singleHall);
    });
    var maxMovie = Math.max(1, Math.max.apply(null, movies.map((m) => m.revenue).concat([0])));
    var maxHall = Math.max(1, Math.max.apply(null, halls.map((h) => h.revenue).concat([0])));
    var trunc = (s) => (s.length > 18 ? s.slice(0, 17) + '…' : s);
    paretoChart($id('db_an_pm_c'), paretoRows(movies.slice(0, 8).map((m) => ({ name: trunc(m.title), revenue: m.revenue }))));
    paretoChart($id('db_an_ph_c'), paretoRows(halls.slice(0, 8).map((h) => ({ name: trunc(h.name), revenue: h.revenue }))));
    $id('db_an_tm_rows').innerHTML = movies.length
      ? movies.map((m, i) => topRowHtml(i, m.title, m.revenue, maxMovie, m.tickets)).join('')
      : emptyRow(4, L('common.noData'));
    $id('db_an_th_rows').innerHTML = halls.length
      ? halls.map((h, i) => topRowHtml(i, h.name, h.revenue, maxHall, h.tickets)).join('')
      : emptyRow(4, L('common.noData'));
    $id('db_an_range').textContent = w.current.from + ' → ' + w.current.to;
  }

  // ============================================================ operations tab

  function loadOperations() { fetchOperations(); }
  async function fetchOperations() {
    try {
      var data = await Api.get('/admin/overview');
      hideErr($id('db_op_err'));
      renderOperations(data);
    } catch (e) { showErr($id('db_op_err'), e); }
  }
  function queueHtml(title, count, high, href, rows) {
    if (!count) return '';
    return '<div class="db-queue' + (high ? ' db-queue-high' : '') + '">' +
      '<div class="db-queue-head"><span class="flex min-w-0 items-center gap-2">' +
      '<span class="anticon shrink-0 ' + (high ? 'text-[#D22F27]' : 'text-[var(--text-2)]') + '">' + icon(high ? 'Alert' : 'Eye') + '</span>' +
      '<strong class="truncate">' + esc(title) + '</strong>' +
      '<span class="db-queue-count">' + count + '</span></span>' +
      '<a class="cp-link shrink-0 text-xs" href="' + href + '">' + esc(L('dashboard.opsViewAll')) + ' →</a></div>' +
      rows.map((r) => '<a class="db-queue-row" href="' + r.href + '">' +
        '<span class="db-queue-code">' + esc(r.code) + '</span>' +
        '<span class="db-queue-mid">' + esc(r.mid) + '</span>' +
        '<span class="db-queue-right"></span>' +
        '<span class="anticon db-queue-link">' + icon('Link') + '</span></a>').join('') +
      '</div>';
  }
  function renderOperations(data) {
    var alerts = data.alerts || { stuck_refunds: [], failed_jobs: [], given_up_emails: [] };
    $id('db_op_updated').textContent = tp('dashboard.opsUpdatedAt', { time: new Date().toLocaleTimeString() });
    var stuck = alerts.stuck_refunds || [], failed = alerts.failed_jobs || [], emails = alerts.given_up_emails || [];
    var host = $id('db_op_alerts');
    if (!stuck.length && !failed.length && !emails.length) {
      host.innerHTML = emptyHtml(L('dashboard.opsEmpty'));
    } else {
      host.innerHTML =
        queueHtml(L('dashboard.stuckRefunds'), stuck.length, true, '/admin/bookings', stuck.slice(0, 3).map((a) => ({
          code: '#' + String(a.booking_id).slice(0, 8),
          mid: fmt.money(a.amount) + ' · ' + tp('dashboard.opsAttempts', { count: a.attempts }),
          href: '/admin/bookings',
        }))) +
        queueHtml(L('dashboard.failedJobs'), failed.length, true, '/admin/monitoring', failed.slice(0, 3).map((j) => ({
          code: j.job_name,
          mid: fmt.datetime(j.started_at),
          href: '/admin/monitoring',
        }))) +
        queueHtml(L('dashboard.givenUpEmails'), emails.length, false, '/admin/bookings', emails.slice(0, 3).map((m) => ({
          code: '#' + String(m.booking_id).slice(0, 8),
          mid: tp('dashboard.opsAttempts', { count: m.attempts }),
          href: '/admin/bookings',
        })));
    }
    var today = data.today || { capacity: 0, seats_sold: 0 };
    var occ = today.capacity > 0 ? (100 * today.seats_sold) / today.capacity : 0;
    gaugeChart($id('db_op_gauge'), occ, fmt.number(Math.round(occ * 10) / 10) + '%',
      fmt.number(today.seats_sold) + '/' + fmt.number(today.capacity));
    var byHour = new Map();
    (data.upcoming_showtimes || []).forEach((s) => {
      var hh = fmt.time(s.start_at).slice(0, 2) + ':00';
      byHour.set(hh, (byHour.get(hh) || 0) + s.sold);
    });
    var hourly = [...byHour.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([hour, sold]) => ({ label: hour, value: sold }));
    barChart($id('db_op_hourly'), hourly, L('dashboard.colSold'));
    var up = data.upcoming_showtimes || [];
    $id('db_op_board').innerHTML = up.length
      ? boardTable(up)
      : '<div class="ant-table-wrap"><table class="ant-table db-table-sm"><tbody>' + emptyRow(6, L('common.noData')) + '</tbody></table></div>';
  }

  // ============================================================ reports tab

  var rp = { from: '', to: '' };

  function loadReports() {
    var today = new Date();
    rp.from = iso(shift(today, -6));
    rp.to = iso(today);
    var fromEl = $id('db_rp_from'), toEl = $id('db_rp_to');
    var todayIso = iso(today);
    [fromEl, toEl].forEach((el) => { el.max = todayIso; });
    paintShell(fromEl, $id('db_rp_from_lbl'), rp.from);
    paintShell(toEl, $id('db_rp_to_lbl'), rp.to);
    fromEl.addEventListener('change', () => { if (fromEl.value) { rp.from = fromEl.value; paintShell(fromEl, $id('db_rp_from_lbl'), rp.from); fetchReports(); } });
    toEl.addEventListener('change', () => { if (toEl.value) { rp.to = toEl.value; paintShell(toEl, $id('db_rp_to_lbl'), rp.to); fetchReports(); } });
    [fromEl, toEl].forEach((el) => {
      el.parentElement.addEventListener('click', () => { if (el.showPicker) { try { el.showPicker(); } catch (_) { /* opened */ } } });
    });
    $id('db_rp_info').querySelector('[data-close-alert]').addEventListener('click', () => $id('db_rp_info').remove());
    $id('db_rp_close').addEventListener('click', closeDay);
    fetchReports();
  }
  function paintShell(inp, lbl, isoStr) {
    inp.value = isoStr;
    lbl.textContent = fmt.date(isoToDate(isoStr));
  }
  async function closeDay() {
    var btn = $id('db_rp_close'), ic = $id('db_rp_close_ic');
    btn.disabled = true; ic.style.display = '';
    try {
      await Api.post('/admin/batch/jobs/closeDay/run');
      await fetchReports();
      toast('success', L('report.closeDaySuccess'));
    } catch (e) {
      toast('error', (e && e.message) || L('common.somethingWrong'));
    } finally { btn.disabled = false; ic.style.display = 'none'; }
  }
  async function fetchReports() {
    var errBox = $id('db_rp_error');
    try {
      var data = await Api.get('/admin/reports/daily?from=' + rp.from + '&to=' + rp.to);
      errBox.innerHTML = '';
      renderReports(data);
    } catch (e) { showErr(errBox, e); }
  }
  function renderReports(data) {
    var days = data.days || [];
    var totalSeats = days.reduce((s, d) => s + d.seats_sold, 0);
    var totalCapacity = days.reduce((s, d) => s + d.capacity, 0);
    $id('db_rp_stats').innerHTML =
      statCard(L('report.totalRevenue'), esc(fmt.money(data.total_revenue))) +
      statCard(L('report.ticketsSold'), esc(fmt.number(data.tickets_sold))) +
      statCard(L('report.occupancy'), esc(String(occupancyPercent(totalSeats, totalCapacity))) + '<span class="ml-1">%</span>');

    var gaps = missingDays(data.from, data.to, days);
    $id('db_rp_missing').innerHTML = gaps.length
      ? '<div class="ant-alert ant-alert-warning"><span class="ant-alert-icon anticon">' + icon('ExclamationCircleFilled') + '</span><div class="flex-1">' +
        '<div class="font-semibold">' + esc(tp('report.missingDaysTitle', { count: gaps.length })) + '</div>' +
        '<div class="text-sm">' + esc(tp('report.missingDaysBody', { days: gaps.map((g) => fmt.date(isoToDate(g))).join(', ') })) + '</div>' +
        '</div></div>'
      : '';

    var rows = rollupByMovie(days);
    $id('db_rp_bymovie').innerHTML = rows.length
      ? rows.map((r) =>
        '<tr><td>' + esc(r.movie) + '</td>' +
        '<td class="text-right tabular-nums">' + esc(fmt.number(r.showtimes)) + '</td>' +
        '<td class="text-right tabular-nums">' + esc(fmt.number(r.seatsSold) + ' / ' + fmt.number(r.capacity)) + '</td>' +
        '<td class="text-right tabular-nums">' + esc(String(occupancyPercent(r.seatsSold, r.capacity)) + '%') + '</td>' +
        '<td class="text-right tabular-nums">' + esc(fmt.money(r.revenue)) + '</td></tr>').join('')
      : emptyRow(5, days.length === 0 ? L('report.emptyNotClosed') : L('report.emptyNoShowtimes'));

    var tbody = $id('db_rp_byday');
    if (!days.length) {
      tbody.innerHTML = emptyRow(6, L('report.emptyNotClosed'));
      return;
    }
    tbody.innerHTML = days.map(dayRowHtml).join('') + summaryRow(days, data, totalSeats, totalCapacity);
    tbody.querySelectorAll('.db-day-row-click').forEach((tr) => {
      tr.addEventListener('click', () => {
        var exp = tbody.querySelector('[data-expand="' + tr.dataset.day + '"]');
        if (!exp) return;
        var open = exp.style.display !== 'none';
        exp.style.display = open ? 'none' : '';
        var caret = tr.querySelector('.db-expand-btn');
        if (caret) caret.classList.toggle('open', !open);
      });
    });
  }
  function dayRowHtml(d) {
    var shows = ((d.breakdown || {}).showtimes) || [];
    var caret = '<span class="anticon db-expand-btn"' + (shows.length ? '' : ' style="visibility:hidden"') + '>' + icon('Right') + '</span>';
    return '<tr class="' + (shows.length ? 'db-day-row-click' : '') + '" data-day="' + d.report_date + '">' +
      '<td>' + caret + esc(fmt.date(d.report_date)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(fmt.money(d.total_revenue)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(fmt.number(d.tickets_sold)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(fmt.number(d.seats_sold) + ' / ' + fmt.number(d.capacity)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(String(d.occupancy_rate) + '%') + '</td>' +
      '<td><span class="text-xs text-[var(--text-2)]">' + esc(fmt.datetime(d.updated_at)) + '</span></td></tr>' +
      (shows.length
        ? '<tr class="db-expanded" style="display:none" data-expand="' + d.report_date + '"><td colspan="6">' + showtimeTable(shows) + '</td></tr>'
        : '');
  }
  function showtimeTable(shows) {
    return '<table class="ant-table db-table-sm db-sub" style="margin:0"><thead><tr>' +
      '<th>' + esc(L('report.startAt')) + '</th>' +
      '<th>' + esc(L('report.movie')) + '</th>' +
      '<th style="width:170px">' + esc(L('report.hall')) + '</th>' +
      '<th class="text-right" style="width:130px">' + esc(L('report.seats')) + '</th>' +
      '<th class="text-right" style="width:100px">' + esc(L('report.occupancy')) + '</th>' +
      '<th class="text-right" style="width:110px">' + esc(L('report.checkedIn')) + '</th>' +
      '<th class="text-right" style="width:150px">' + esc(L('report.revenue')) + '</th>' +
      '</tr></thead><tbody>' +
      shows.map((s) =>
        '<tr><td>' + esc(fmt.datetime(s.start_at)) + '</td>' +
        '<td>' + esc(s.movie) + '</td>' +
        '<td>' + esc(s.hall) + '</td>' +
        '<td class="text-right tabular-nums">' + esc(fmt.number(s.seats_sold) + ' / ' + fmt.number(s.capacity)) + '</td>' +
        '<td class="text-right tabular-nums">' + esc(String(occupancyPercent(s.seats_sold, s.capacity)) + '%') + '</td>' +
        '<td class="text-right tabular-nums">' + esc(fmt.number(s.checked_in)) + '</td>' +
        '<td class="text-right tabular-nums">' + esc(fmt.money(s.revenue)) + '</td></tr>').join('') +
      '</tbody></table>';
  }
  function summaryRow(days, data, totalSeats, totalCapacity) {
    return '<tr class="db-summary">' +
      '<td><span class="flex items-center gap-1.5"><strong>' + esc(L('report.rangeTotal')) + '</strong>' +
      '<span class="ant-tag" style="border:0">' + esc(tp('report.dayCount', { count: days.length })) + '</span></span></td>' +
      '<td class="text-right tabular-nums"><strong>' + esc(fmt.money(data.total_revenue)) + '</strong></td>' +
      '<td class="text-right tabular-nums"><strong>' + esc(fmt.number(data.tickets_sold)) + '</strong></td>' +
      '<td class="text-right tabular-nums">' + esc(fmt.number(totalSeats) + ' / ' + fmt.number(totalCapacity)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(String(occupancyPercent(totalSeats, totalCapacity)) + '%') + '</td>' +
      '<td></td></tr>';
  }

  // ============================================================ staff section

  function loadStaff() {
    Api.get('/staff/overview').then(renderStaff).catch((e) => showErr($id('st_err'), e));
  }
  function renderStaff(data) {
    $id('st_kpis').innerHTML =
      kpiCard(L('dashboard.counterCountToday'), esc(fmt.number(data.counter_sales_count)), icon('Shop'), '') +
      kpiCard(L('dashboard.counterToday'), esc(fmt.money(data.counter_sales_total)), '', '') +
      kpiCard(L('dashboard.awaitingCheckin'), esc(fmt.number(data.awaiting_checkin)), icon('Solution'), '');
    var rows = data.showtimes || [];
    $id('st_board').innerHTML = rows.length
      ? boardTable(rows)
      : '<div class="ant-table-wrap"><table class="ant-table db-table-sm"><tbody>' + emptyRow(6, L('common.noData')) + '</tbody></table></div>';
  }

  // ============================================================ boot (lazy per tab, like antd Tabs)

  var loaded = {};
  function ensure(tab) {
    if (loaded[tab]) return;
    loaded[tab] = true;
    if (tab === 'overview') loadOverview();
    else if (tab === 'analytics') loadAnalytics();
    else if (tab === 'operations') loadOperations();
    else if (tab === 'reports') loadReports();
  }
  if (root) {
    root.addEventListener('cp:tab', (e) => ensure(e.detail.key));
    ensure(root.dataset.initial || 'overview');
  }
  if (staffRoot) loadStaff();
})();
