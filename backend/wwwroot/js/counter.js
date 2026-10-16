/* Counter page (Razor port of React CounterPage + staff BoxOffice/CustomerLookup). */
(function () {
  'use strict';
  const root = document.getElementById('cp-counter');
  if (!root) return;

  const L = (k) => (window.CP_LANG && window.CP_LANG[k]) || k;
  const tp = (k, vars) => Object.entries(vars || {}).reduce((s, p) => s.split('{{' + p[0] + '}}').join(String(p[1])), L(k));
  const tag = (k, fb) => { const v = L(k); return v === k ? fb : v; };
  const fmt = CP.fmt, esc = CP.esc, icon = CP.icon, toast = CP.toast;
  const $id = (id) => document.getElementById(id);
  const isEn = document.documentElement.lang === 'en';

  const SIMPLE_SVG = '<svg width="64" height="41" viewBox="0 0 64 41" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g transform="translate(0 1)" fill="none" fill-rule="evenodd">' +
    '<ellipse fill="#272727" cx="32" cy="33" rx="32" ry="7"/>' +
    '<g fill-rule="nonzero" stroke="#373737">' +
    '<path d="M55 12.76L44.854 1.258C44.367.474 43.656 0 42.907 0H21.093c-.749 0-1.46.474-1.947 1.257L9 12.761V22h46v-9.24z"/>' +
    '<path d="M41.613 15.931c0-1.605.994-2.93 2.227-2.931H55v18.137C55 33.26 53.68 35 52.05 35h-40.1C10.32 35 9 33.259 9 31.137V13h11.16c1.233 0 2.227 1.323 2.227 2.928v.022c0 1.605 1.005 2.901 2.237 2.901h14.752c1.232 0 2.237-1.308 2.237-2.913v-.007z" fill="#1d1d1d"/>' +
    '</g></g></svg>';
  const emptyRow = (cols, text) => '<tr class="ant-table-empty"><td colspan="' + cols + '">' +
    '<div class="ant-empty" style="padding:8px 0">' + SIMPLE_SVG + '<div>' + esc(text) + '</div></div></td></tr>';
  const standaloneEmpty = (text) => '<div class="ant-empty">' + SIMPLE_SVG + '<div>' + esc(text) + '</div></div>';

  const err = (e, m) => toast('error', (e && e.message) || m || L('common.somethingWrong'));
  function showErr(el, e) {
    el.innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') +
      '</span><div class="flex-1">' + esc((e && e.message) || L('common.somethingWrong')) + '</div></div>';
  }
  const colorTag = (color, text, bordered) =>
    '<span class="ant-tag' + (color && color !== 'default' ? ' ant-tag-' + color : '') + '"' +
    (bordered === false ? ' style="border-color:transparent"' : '') + '>' + esc(text) + '</span>';
  const copyTitle = isEn ? 'Copy' : 'Sao chép';
  function copyBtn(text) {
    return '<button type="button" class="ant-btn ant-btn-text ant-btn-icon ml-1" data-copy="' + esc(text) +
      '" title="' + esc(copyTitle) + '" aria-label="' + esc(copyTitle) + '">' +
      '<span class="anticon">' + icon('Copy') + '</span></button>';
  }
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const text = btn.getAttribute('data-copy') || '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
    } catch (e2) { /* keep quiet like antd */ }
    const ic = btn.querySelector('.anticon');
    if (ic) {
      ic.innerHTML = icon('Check');
      setTimeout(() => { ic.innerHTML = icon('Copy'); }, 2500);
    }
  });
  function skeleton(rows) {
    let h = '<div><div class="ant-skeleton-line" style="width:38%"></div>';
    for (let i = 0; i < rows; i++) h += '<div class="ant-skeleton-line"></div>';
    return h + '</div>';
  }

  // ---- seat grid math (port of features/hall/seatGrid) ----
  const SEAT_SIZE = 40, AISLE_WIDTH = 22;
  function groupSeatsByRow(seats) {
    const rows = [], index = {};
    seats.forEach((s) => {
      let r = index[s.row_label];
      if (!r) { r = { rowLabel: s.row_label, seats: [] }; index[s.row_label] = r; rows.push(r); }
      r.seats.push(s);
    });
    return rows;
  }
  function widestColumn(seats) {
    return seats.reduce((m, s) => Math.max(m, s.col_number + (s.col_span || 1) - 1), 0);
  }
  function buildGridLayout(seatsPerRow, aisleAfterCols) {
    const seen = {};
    (aisleAfterCols || []).forEach((c) => {
      if (Number.isInteger(c) && c >= 1 && c < seatsPerRow) seen[c] = 1;
    });
    const aisles = Object.keys(seen).map(Number).sort((a, b) => a - b);
    const tracks = [];
    for (let col = 1; col <= seatsPerRow; col++) {
      tracks.push(SEAT_SIZE + 'px');
      if (seen[col]) tracks.push(AISLE_WIDTH + 'px');
    }
    return {
      templateColumns: tracks.join(' '),
      lineOf: (col) => { let n = 0; aisles.forEach((a) => { if (a < col) n++; }); return col + n; },
      spanOf: (col, span) => (span <= 1 ? 1 : span + (seen[col] ? 1 : 0)),
    };
  }
  const SEAT_COLORS = {
    selected: { bg: '#D33B56', color: '#fff', border: '#D33B56' },
    sold: { bg: 'rgba(255,255,255,.06)', color: 'var(--text-4)', border: 'var(--border-1)' },
    held: { bg: 'rgba(217,119,6,.15)', color: '#E8A33D', border: '#D97706' },
    available: { bg: 'var(--color-ink-base)', color: 'var(--text-1)', border: 'var(--border-1)' },
    blank: { bg: 'transparent', color: 'transparent', border: 'transparent' },
  };
  function seatVisual(seat, isSelected) {
    if (seat.is_gap || !seat.showtime_seat_id) return 'blank';
    if (isSelected) return 'selected';
    if (seat.status === 'sold') return 'sold';
    if (seat.status === 'held') return 'held';
    return 'available';
  }
  function seatGridHtml(seatMap, selected, maxSeats, inputName) {
    const rows = groupSeatsByRow(seatMap.seats || []);
    const layout = buildGridLayout(widestColumn(seatMap.seats || []), seatMap.aisle_after_cols || []);
    let legend = '<div class="flex flex-wrap items-center gap-4">';
    ['available', 'selected', 'held', 'sold'].forEach((key) => {
      const c = SEAT_COLORS[key];
      legend += '<span class="inline-flex items-center gap-1.5"><span style="width:16px;height:16px;border-radius:4px;display:inline-block;background:' +
        c.bg + ';border:1px solid ' + c.border + '"></span>' +
        '<span class="text-xs text-[var(--text-2)]">' + esc(L('customer.seat_' + key)) + '</span></span>';
    });
    let h = legend + '</div><div style="overflow-x:auto;padding-bottom:8px"><div style="display:inline-flex;flex-direction:column;gap:6px">';
    rows.forEach((row) => {
      h += '<div style="display:flex;align-items:center;gap:8px"><span style="width:20px;font-size:12px;color:var(--text-2)">' +
        esc(row.rowLabel) + '</span><div style="display:grid;grid-template-columns:' + esc(layout.templateColumns) + ';gap:0">';
      row.seats.forEach((seat) => {
        const ssid = seat.showtime_seat_id;
        const isSel = Boolean(ssid && selected.has(ssid));
        const visual = seatVisual(seat, isSel);
        const c = SEAT_COLORS[visual];
        const atMax = !isSel && selected.size >= maxSeats;
        const disabled = visual === 'blank' || (visual === 'available' && atMax) || (visual !== 'available' && visual !== 'selected');
        const span = layout.spanOf(seat.col_number, seat.col_span || 1);
        h += '<button type="button" data-seat="' + esc(ssid || '') + '" title="' + esc(seat.label + ' - ' + fmt.money(seat.price)) + '"' +
          (disabled ? ' disabled' : '') +
          ' style="grid-column:' + layout.lineOf(seat.col_number) + ' / span ' + span +
          ';width:' + (span > 1 ? '100%' : '32px') + ';height:32px;margin:2px;font-size:11px;border-radius:6px' +
          ';background:' + c.bg + ';color:' + c.color + ';border:1px solid ' + c.border +
          ';cursor:' + (visual === 'blank' ? 'default' : 'pointer') + ';opacity:' + (visual === 'blank' ? '0' : '1') + '">' +
          (visual === 'blank' ? '' : esc(String(seat.col_number))) + '</button>';
      });
      h += '</div></div>';
    });
    return h + '</div></div>';
  }

  const SHOW_STATUS_COLOR = { open: 'green', closed: 'default', cancelled: 'red' };
  const SHOW_STATUS_KEY = { open: 'showtime.statusOpen', closed: 'showtime.statusClosed', cancelled: 'showtime.statusCancelled' };

  // ============================== DASHBOARD TAB ==============================
  const db = { data: null, movies: null, fetching: false };
  function statCard(title, valueHtml) {
    return '<div class="ant-card"><div class="ant-card-body">' +
      '<div class="ant-statistic-title">' + esc(title) + '</div>' +
      '<div class="ant-statistic-value">' + valueHtml + '</div></div></div>';
  }
  function dbRender() {
    const d = db.data;
    $('ct_stats').innerHTML = d
      ? statCard(L('boxOffice.counterSalesCount'), '<span class="tabular-nums">' + esc(String(d.counter_sales_count)) + '</span>') +
        statCard(L('boxOffice.counterSalesTotal'), '<span class="tabular-nums">' + esc(fmt.money(d.counter_sales_total)) + '</span>') +
        statCard(L('boxOffice.comboSalesTotal'), '<span class="tabular-nums">' + esc(fmt.money(d.combo_sales_total)) + '</span>') +
        statCard(L('boxOffice.awaitingCheckin'), '<span class="tabular-nums">' + esc(String(d.awaiting_checkin)) + '</span>')
      : '';
    const rows = (d && d.showtimes) || [];
    $id('ct_db_rows').innerHTML = rows.length ? rows.map((s) =>
      '<tr><td>' + esc(s.movie_title) + '</td>' +
      '<td>' + esc(s.hall_name) + '</td>' +
      '<td>' + esc(fmt.datetime(s.start_at)) + '</td>' +
      '<td>' + colorTag(SHOW_STATUS_COLOR[s.status], L(SHOW_STATUS_KEY[s.status]), false) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(String(s.capacity)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(String(s.held)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(String(s.sold)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(String(s.available)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(String(s.checked_in)) + '</td></tr>'
    ).join('') : emptyRow(9, L('common.noData'));
    const mv = db.movies || [];
    $id('ct_mv_rows').innerHTML = mv.length ? mv.map((m) =>
      '<tr><td>' + esc(m.title) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(String(m.tickets)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(fmt.money(m.revenue)) + '</td></tr>'
    ).join('') : emptyRow(3, L('common.noData'));
  }
  function $(id) { return $id(id); }
  async function dbLoad() {
    if (db.fetching) return;
    db.fetching = true;
    const date = $id('ct_date').value || undefined;
    $id('ct_stats').innerHTML = statCard(L('boxOffice.counterSalesCount'), skeleton(1)) +
      statCard(L('boxOffice.counterSalesTotal'), skeleton(1)) +
      statCard(L('boxOffice.comboSalesTotal'), skeleton(1)) +
      statCard(L('boxOffice.awaitingCheckin'), skeleton(1));
    try {
      const q = date ? '?date=' + date : '';
      const [d, mv] = await Promise.all([
        Api.get('/staff/overview' + q),
        Api.get('/staff/boxoffice/movies' + q),
      ]);
      $id('ct_db_error').innerHTML = '';
      db.data = d;
      db.movies = mv;
      dbRender();
    } catch (e) {
      showErr($id('ct_db_error'), e);
      $id('ct_stats').innerHTML = '';
      $id('ct_db_rows').innerHTML = emptyRow(9, L('common.noData'));
      $id('ct_mv_rows').innerHTML = emptyRow(3, L('common.noData'));
    } finally {
      db.fetching = false;
    }
  }
  $id('ct_date').addEventListener('change', dbLoad);

  // ============================== SELL TAB ==============================
  const MAX_SEATS = 8;
  const sell = {
    search: '', options: [], showtimeId: null, selected: new Set(),
    seatMap: null, seatErr: null, seatLoading: false, name: '', phone: '',
    sellError: null, sold: null, selling: false, timer: null,
  };
  function sellSelectedSeats() {
    return ((sell.seatMap && sell.seatMap.seats) || []).filter((s) => s.showtime_seat_id && sell.selected.has(s.showtime_seat_id));
  }
  function sellRender() {
    const host = $id('ct_sell_wrap');
    if (sell.sold) {
      const o = sell.sold;
      host.innerHTML = '<div class="ant-card"><div class="ant-card-body">' +
        '<div class="ant-result"><div class="ant-result-icon" style="color:#52c41a"><span class="anticon">' + icon('CheckCircleFilled') + '</span></div>' +
        '<div class="ant-result-title">' + esc(L('boxOffice.sellSuccess')) + '</div>' +
        '<div class="ant-result-subtitle">' + esc(tp('boxOffice.sellSuccessHint', { id: o.id })) + '</div></div>' +
        '<div id="ct_sold_detail">' + orderDetailHtml(o) + '</div>' +
        '<div class="mt-4 text-center"><div class="inline-flex gap-3">' +
        '<button type="button" class="ant-btn" data-sell="print"><span class="anticon">' + icon('Printer') + '</span>' + esc(L('boxOffice.printTickets')) + '</button>' +
        '<button type="button" class="ant-btn ant-btn-primary" data-sell="again">' + esc(L('boxOffice.sellAnother')) + '</button>' +
        '</div></div></div></div>';
      bindCopyScope(host);
      return;
    }
    const seats = sellSelectedSeats();
    const total = seats.reduce((s, x) => s + x.price, 0);
    let seatsCard;
    if (!sell.showtimeId) {
      seatsCard = '';
    } else if (sell.seatErr) {
      seatsCard = '<div class="ant-card" style="margin-bottom:0"><div class="ant-card-head">' + esc(L('boxOffice.pickSeats')) + '</div>' +
        '<div class="ant-card-body"><div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') + '</span>' +
        '<div class="flex-1">' + esc(sell.seatErr) + '</div></div></div></div>';
    } else if (sell.seatLoading || !sell.seatMap) {
      seatsCard = '<div class="ant-card" style="margin-bottom:0"><div class="ant-card-head">' + esc(L('boxOffice.pickSeats')) + '</div>' +
        '<div class="ant-card-body">' + skeleton(4) + '</div></div>';
    } else {
      seatsCard = '<div class="ant-card" style="margin-bottom:0"><div class="ant-card-head">' + esc(L('boxOffice.pickSeats')) + '</div>' +
        '<div class="ant-card-body"><div id="ct_seat_grid">' + seatGridHtml(sell.seatMap, sell.selected, MAX_SEATS) + '</div></div></div>';
    }
    host.innerHTML = '<div class="grid grid-cols-1 gap-4 lg:grid-cols-12">' +
      '<div class="lg:col-span-7"><div class="ant-card" style="margin-bottom:16px"><div class="ant-card-head">' + esc(L('boxOffice.pickShowtime')) + '</div>' +
      '<div class="ant-card-body"><div class="ant-input-affix ant-input-search" style="width:100%;margin-bottom:8px">' +
      '<input id="ct_sell_search" class="ant-input" placeholder="' + esc(L('boxOffice.pickShowtimePlaceholder')) + '" value="' + esc(sell.search) + '" />' +
      '<span class="ant-input-suffix"><span class="anticon">' + icon('Search') + '</span></span></div>' +
      '<select id="ct_sell_show" class="ant-input">' +
      '<option value="">' + esc(L('boxOffice.pickShowtimePlaceholder')) + '</option>' +
      sell.options.map((s) => '<option value="' + esc(s.id) + '"' + (s.id === sell.showtimeId ? ' selected' : '') + '>' +
        esc(s.movie_title + ' · ' + s.hall_name + ' · ' + fmt.datetime(s.start_at)) + '</option>').join('') +
      '</select></div></div>' +
      '<div id="ct_seats_card">' + seatsCard + '</div></div>' +
      '<div class="lg:col-span-5"><div class="ant-card"><div class="ant-card-head">' + esc(L('boxOffice.orderSummary')) + '</div>' +
      '<div class="ant-card-body"><div class="flex flex-col gap-4">' +
      '<span>' + esc(tp('customer.seatCount', { count: seats.length, max: MAX_SEATS })) + '</span>' +
      '<span>' + (seats.length ? esc(seats.map((s) => s.label).join(', ')) : esc(L('customer.noSeatPicked'))) + '</span>' +
      '<h4 class="m-0 text-xl font-semibold text-white tabular-nums">' + esc(fmt.money(total)) + '</h4>' +
      '<div class="ant-form-item mb-0"><label class="ant-form-item-label">' + esc(L('boxOffice.customerName')) + '</label>' +
      '<input id="ct_sell_name" class="ant-input" placeholder="' + esc(L('boxOffice.customerNamePlaceholder')) + '" maxlength="255" value="' + esc(sell.name) + '" /></div>' +
      '<div class="ant-form-item mb-0"><label class="ant-form-item-label">' + esc(L('boxOffice.customerPhone')) + '</label>' +
      '<input id="ct_sell_phone" class="ant-input" placeholder="' + esc(L('boxOffice.customerPhonePlaceholder')) + '" maxlength="20" value="' + esc(sell.phone) + '" /></div>' +
      (sell.sellError ? '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') + '</span>' +
        '<div class="flex-1">' + esc(sell.sellError) + '</div></div>' : '') +
      '<button type="button" class="ant-btn ant-btn-primary ant-btn-block" id="ct_sell_go"' +
      ((!sell.showtimeId || !seats.length || sell.selling) ? ' disabled' : '') + '>' + esc(L('boxOffice.confirmSell')) + '</button>' +
      '</div></div></div></div></div>';
    const sel = $id('ct_sell_show');
    sel.addEventListener('change', () => {
      if (sel.value) sellPickShowtime(sel.value);
      else { sell.showtimeId = null; sell.selected = new Set(); sell.seatMap = null; sell.sellError = null; sellRender(); }
    });
    const grid = $id('ct_seat_grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-seat]');
        if (!btn || btn.hasAttribute('disabled') || !btn.dataset.seat) return;
        const id = btn.dataset.seat;
        if (sell.selected.has(id)) sell.selected.delete(id);
        else if (sell.selected.size < MAX_SEATS) sell.selected.add(id);
        sellRender();
      });
    }
    const go = $id('ct_sell_go');
    if (go) go.addEventListener('click', sellSubmit);
  }

  function sellPaintOptions() {
    const sel = $id('ct_sell_show');
    if (!sel) return;
    const cur = sell.showtimeId;
    sel.innerHTML = '<option value="">' + esc(L('boxOffice.pickShowtimePlaceholder')) + '</option>' +
      sell.options.map((s) => '<option value="' + esc(s.id) + '"' + (s.id === cur ? ' selected' : '') + '>' +
        esc(s.movie_title + ' · ' + s.hall_name + ' · ' + fmt.datetime(s.start_at)) + '</option>').join('');
  }
  async function sellLoadOptions() {
    try {
      const q = new URLSearchParams({ page: '1', page_size: '100', status: 'open', sort: 'start_at', order: 'desc' });
      if (sell.search.trim()) q.set('search', sell.search.trim());
      const data = await Api.get('/admin/showtimes?' + q);
      sell.options = data.items || [];
      sellPaintOptions();
    } catch (e) { /* keep previous options like placeholderData */ }
  }
  function sellOptionsDebounced() {
    clearTimeout(sell.timer);
    sell.timer = setTimeout(sellLoadOptions, 400);
  }
  async function sellPickShowtime(id) {
    sell.showtimeId = id;
    sell.selected = new Set();
    sell.sellError = null;
    sell.sold = null;
    sell.seatMap = null;
    sell.seatErr = null;
    sell.seatLoading = true;
    sellRender();
    try {
      sell.seatMap = await Api.get('/shows/' + id + '/seats');
    } catch (e) {
      sell.seatErr = (e && e.message) || L('common.somethingWrong');
    } finally {
      sell.seatLoading = false;
      sellRender();
    }
  }
  async function sellSubmit() {
    const seats = sellSelectedSeats();
    if (!sell.showtimeId || !seats.length || sell.selling) return;
    sell.selling = true;
    sell.sellError = null;
    sellRender();
    try {
      const order = await Api.post('/staff/orders', {
        show_id: sell.showtimeId,
        seat_ids: seats.map((s) => s.showtime_seat_id),
        customer_name: sell.name.trim() || undefined,
        customer_phone: sell.phone.trim() || undefined,
      });
      sell.sold = order;
      sell.selected = new Set();
      toast('success', L('boxOffice.sellSuccess'));
    } catch (e) {
      sell.sellError = (e && e.message) || L('common.somethingWrong');
    } finally {
      sell.selling = false;
      sellRender();
    }
  }

  document.getElementById('ct_inner_tabs').addEventListener('cp:tab', (e) => {
    if (e.detail.key === 'sell' && !sell.options.length) sellLoadOptions();
    if (e.detail.key === 'sell') sellRender();
  });

  // showtime search box lives inside the sell pane; bind lazily on first render
  document.addEventListener('input', (e) => {
    if (!e.target) return;
    if (e.target.id === 'ct_sell_search') {
      sell.search = e.target.value;
      sellOptionsDebounced();
    }
    if (e.target.id === 'ct_sell_name') sell.name = e.target.value;
    if (e.target.id === 'ct_sell_phone') sell.phone = e.target.value;
  });

  // ---- shared order detail view (sell success + lookup) ----
  const BOOKING_COLOR = { pending: 'gold', confirmed: 'green', expired: 'default', refunded: 'red' };
  const PAYMENT_COLOR = { pending: 'gold', paid: 'green', failed: 'red', refund_pending: 'orange', refunded: 'purple' };
  function orderDetailHtml(o) {
    const st = o.showtime || {};
    let h = '<div class="flex flex-col gap-4"><table class="ant-descriptions-bordered"><tbody>' +
      '<tr><th>' + esc(L('booking.code')) + '</th><td><span class="inline-flex items-center">' + esc(o.id || '') + copyBtn(o.id || '') + '</span></td></tr>' +
      '<tr><th>' + esc(L('booking.status')) + '</th><td><span class="inline-flex items-center gap-1.5">' +
      colorTag(BOOKING_COLOR[o.status], tag('booking.status_' + o.status, o.status), false) +
      (o.status_reason ? '<span class="text-[var(--text-2)]">' + esc(tag('booking.reason_' + o.status_reason, o.status_reason)) + '</span>' : '') +
      '</span></td></tr>' +
      '<tr><th>' + esc(L('showtime.movie')) + '</th><td>' + esc(st.movie_title || '-') + '</td></tr>' +
      '<tr><th>' + esc(L('showtime.hall')) + '</th><td>' + esc(st.hall_name || '-') + '</td></tr>' +
      '<tr><th>' + esc(L('showtime.startAt')) + '</th><td>' + esc(fmt.datetime(st.start_at)) + '</td></tr>' +
      '<tr><th>' + esc(L('booking.createdAt')) + '</th><td>' + esc(fmt.datetime(o.created_at)) + '</td></tr>' +
      '<tr><th>' + esc(L('booking.total')) + '</th><td><span class="tabular-nums">' + esc(fmt.money(o.payable_amount)) + '</span></td></tr>' +
      '</tbody></table>';
    if (o.payment) {
      h += '<table class="ant-descriptions-bordered"><caption class="pb-2 text-left text-sm font-semibold text-white">' +
        esc(L('booking.payment')) + '</caption><tbody>' +
        '<tr><th>' + esc(L('booking.provider')) + '</th><td>' + esc(o.payment.provider) + '</td></tr>' +
        '<tr><th>' + esc(L('booking.paymentStatus')) + '</th><td>' +
        colorTag(PAYMENT_COLOR[o.payment.status], tag('booking.payment_' + o.payment.status, o.payment.status), false) + '</td></tr>' +
        '<tr><th>' + esc(L('booking.paidAt')) + '</th><td>' + esc(fmt.datetime(o.payment.paid_at)) + '</td></tr>' +
        '</tbody></table>';
    }
    const tickets = o.tickets || [];
    h += '<div><div class="mb-2 text-sm font-semibold text-white">' + esc(L('booking.tickets')) + '</div>' +
      '<div class="ant-table-wrap"><table class="ant-table ant-table-sm"><thead><tr>' +
      '<th style="width:80px">' + esc(L('booking.seat')) + '</th>' +
      '<th style="width:110px">' + esc(L('booking.seatType')) + '</th>' +
      '<th class="text-right" style="width:110px">' + esc(L('booking.price')) + '</th>' +
      '<th>' + esc(L('boxOffice.ticketCode')) + '</th>' +
      '<th style="width:120px">' + esc(L('booking.ticketStatus')) + '</th></tr></thead><tbody>' +
      (tickets.length ? tickets.map((t) =>
        '<tr><td>' + esc(t.seat_label) + '</td>' +
        '<td>' + esc(tag('booking.seatType_' + t.seat_type, t.seat_type)) + '</td>' +
        '<td class="text-right"><span class="tabular-nums">' + esc(fmt.money(t.price)) + '</span></td>' +
        '<td><span class="inline-flex items-center">' + esc(t.code) + copyBtn(t.code) + '</span></td>' +
        '<td>' + colorTag(t.status === 'redeemed' ? 'blue' : 'green', tag('booking.ticket_' + t.status, t.status), false) + '</td></tr>'
      ).join('') : emptyRow(5, L('common.noData'))) +
      '</tbody></table></div></div></div>';
    return h;
  }
  function bindCopyScope(host) { /* document-level copy delegation already handles it */ }

  $id('ct_sell_wrap').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-sell]');
    if (!btn) return;
    if (btn.dataset.sell === 'again') {
      sell.sold = null; sell.showtimeId = null; sell.selected = new Set();
      sell.seatMap = null; sell.sellError = null; sell.name = ''; sell.phone = '';
      sellRender();
      sellLoadOptions();
      return;
    }
    if (btn.dataset.sell === 'print') {
      openPrint(sell.sold);
    }
  });

  // ---- print tickets ----
  let printOrder = null, printQr = {}, printLoading = false, printError = null, printToken = 0;
  function openPrint(order) {
    printOrder = order;
    printQr = {};
    printError = null;
    printLoading = true;
    printToken++;
    const my = printToken;
    renderPrint();
    CP.modal.open('ct_print_modal');
    $id('ct_print_go').disabled = true;
    Promise.all((order.tickets || []).map((t) =>
      Api.get('/tickets/' + t.id + '/qr').then((res) => ({ id: t.id, qr: res.qr_base64 })).catch(() => ({ id: t.id, qr: '' }))
    )).then((rows) => {
      if (my !== printToken) return;
      const missing = rows.filter((r) => !r.qr);
      if (missing.length) printError = tp('boxOffice.printQrMissing', { count: missing.length });
      printQr = Object.fromEntries(rows.map((r) => [r.id, r.qr]));
      printLoading = false;
      renderPrint();
    });
  }
  function renderPrint() {
    const o = printOrder;
    const body = $id('ct_print_body');
    if (!o) { body.innerHTML = ''; return; }
    let h = '';
    if (printError) {
      h += '<div class="ant-alert ant-alert-warning"><span class="ant-alert-icon anticon">' + icon('ExclamationCircleFilled') + '</span>' +
        '<div class="flex-1">' + esc(printError) + '</div></div>';
    }
    if (printLoading) {
      h += '<div class="text-center" style="padding:32px"><span class="ant-spin"></span></div>';
    } else {
      h += '<div class="cp-print-sheet">' + (o.tickets || []).map((t) =>
        '<div class="cp-ticket-slip" style="background:#fff;color:#000;border:1px solid #000;border-radius:8px;padding:16px;margin-bottom:16px;display:flex;gap:16px;align-items:center;page-break-inside:avoid">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:18px;font-weight:800">' + esc((o.showtime || {}).movie_title || '') + '</div>' +
        '<div style="font-size:13px">' + esc((o.showtime || {}).hall_name || '') + ' · ' + esc(o.showtime ? fmt.datetime(o.showtime.start_at) : '') + '</div>' +
        '<div style="font-size:15px;margin-top:8px">' + esc(L('booking.seat')) + ': <strong>' + esc(t.seat_label) + '</strong> · ' +
        esc(tag('booking.seatType_' + t.seat_type, t.seat_type)) + ' · ' + esc(fmt.money(t.price)) + '</div>' +
        '<div class="tabular-nums" style="font-size:13px;margin-top:4px">' + esc(L('boxOffice.ticketCode')) + ': <strong>' + esc(t.code) + '</strong></div>' +
        '</div>' +
        (printQr[t.id] ? '<img src="data:image/png;base64,' + printQr[t.id] + '" alt="' + esc(t.code) + '" width="120" height="120" style="flex-shrink:0" />' : '') +
        '</div>'
      ).join('') + '</div>';
    }
    body.innerHTML = h;
    $id('ct_print_go').disabled = printLoading || !(o.tickets || []).length;
  }
  $id('ct_print_go').addEventListener('click', () => window.print());

  // ============================== PICKUP TAB ==============================
  const pk = { q: '', items: [], err: null, collectingId: null, fetching: false };
  async function pkLoad() {
    if (pk.fetching) return;
    pk.fetching = true;
    try {
      const p = new URLSearchParams();
      if (pk.q) p.set('search', pk.q);
      const qs = p.toString();
      pk.items = await Api.get('/staff/combo-orders/pending' + (qs ? '?' + qs : ''));
      $id('ct_pk_error').innerHTML = '';
      pkRender();
    } catch (e) {
      showErr($id('ct_pk_error'), e);
      pk.items = [];
      pkRender();
    } finally {
      pk.fetching = false;
    }
  }
  function pkRender() {
    const rows = pk.items || [];
    $id('ct_pk_rows').innerHTML = rows.length ? rows.map((r) => {
      const items = (r.items || []).map((it) =>
        '<span class="tabular-nums">' + esc(it.combo_name) + ' × ' + esc(String(it.quantity)) + '</span>'
      ).join('');
      const movie = r.movie_title
        ? '<span class="ant-tag" style="border-color:transparent;margin-top:4px">' + esc(r.movie_title) +
          (r.showtime_at ? ' · ' + esc(fmt.datetime(r.showtime_at)) : '') + '</span>' : '';
      const busy = pk.collectingId === r.order_id;
      return '<tr data-id="' + esc(r.order_id) + '"><td><div class="flex flex-col"><strong>' +
        esc(r.customer_name || L('booking.walkInNoContact')) + '</strong>' +
        (r.customer_email ? '<span class="text-xs text-[var(--text-2)]">' + esc(r.customer_email) + '</span>' : '') + '</div></td>' +
        '<td><div class="flex flex-col">' + items + movie + '</div></td>' +
        '<td class="text-right"><span class="tabular-nums">' + esc(fmt.money(r.total)) + '</span></td>' +
        '<td class="text-right"><button type="button" class="ant-btn ant-btn-primary" data-pk="collect"' +
        (busy ? ' disabled' : '') + '>' + esc(L('boxOffice.pickupCollect')) + '</button></td></tr>';
    }).join('') : emptyRow(4, L('boxOffice.pickupEmpty'));
  }
  async function pkSearch() {
    pk.q = $id('ct_pk_search').value.trim() || '';
    pkLoad();
  }
  $id('ct_pk_btn').addEventListener('click', pkSearch);
  $id('ct_pk_search').addEventListener('keydown', (e) => { if (e.key === 'Enter') pkSearch(); });
  $id('ct_pk_rows').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-pk="collect"]');
    if (!btn || btn.hasAttribute('disabled')) return;
    const id = btn.closest('tr').dataset.id;
    pk.collectingId = id;
    pkRender();
    try {
      await Api.post('/staff/combo-orders/' + id + '/collect', {});
      toast('success', tp('boxOffice.pickupDone', { id: String(id).slice(0, 8) }));
      pkLoad();
    } catch (err2) {
      err(err2);
    } finally {
      pk.collectingId = null;
      pkRender();
    }
  });

  // ============================== CONCESSION TAB ==============================
  const MAX_QTY = 20;
  const cc = { combos: [], qty: {}, err: null, sellError: null, soldId: null, soldTotal: 0, selling: false, pay: 'cash', cname: '' };
  async function ccLoad() {
    try {
      cc.combos = await Api.get('/combos');
      $id('ct_cc_wrap').querySelector('[data-cc="error"]');
      ccRender();
    } catch (e) {
      ccRender(e);
    }
  }
  function ccLines() {
    return (cc.combos || []).map((c) => ({ combo: c, quantity: cc.qty[c.id] || 0 })).filter((l) => l.quantity > 0);
  }
  function ccRender(loadErr) {
    const host = $id('ct_cc_wrap');
    if (cc.soldId) {
      host.innerHTML = '<div class="ant-card"><div class="ant-card-body">' +
        '<div class="ant-result"><div class="ant-result-icon" style="color:#52c41a"><span class="anticon">' + icon('CheckCircleFilled') + '</span></div>' +
        '<div class="ant-result-title">' + esc(L('boxOffice.comboSold')) + '</div>' +
        '<div class="ant-result-subtitle">' + esc(tp('boxOffice.sellSuccessHint', { id: cc.soldId })) + '</div></div>' +
        '<div class="text-center"><h4 class="m-0 text-xl font-semibold text-white tabular-nums">' + esc(fmt.money(cc.soldTotal)) + '</h4></div>' +
        '<div class="mt-4 text-center"><button type="button" class="ant-btn ant-btn-primary" data-cc="again">' + esc(L('boxOffice.sellAnother')) + '</button></div>' +
        '</div></div>';
      return;
    }
    const lines = ccLines();
    const total = lines.reduce((s, l) => s + l.combo.price * l.quantity, 0);
    host.innerHTML = '<div class="grid grid-cols-1 gap-4 lg:grid-cols-12">' +
      '<div class="lg:col-span-7"><div class="ant-card"><div class="ant-card-head">' + esc(L('boxOffice.comboPick')) + '</div>' +
      '<div class="ant-card-body"><div data-cc="error"></div>' +
      '<div class="ant-table-wrap"><table class="ant-table"><thead><tr>' +
      '<th>' + esc(L('concession.name')) + '</th>' +
      '<th class="text-right" style="width:130px">' + esc(L('concession.price')) + '</th>' +
      '<th class="text-center" style="width:170px">' + esc(L('boxOffice.comboQty')) + '</th>' +
      '<th class="text-right" style="width:150px">' + esc(L('report.totalSales')) + '</th></tr></thead>' +
      '<tbody>' + (cc.combos.length ? cc.combos.map((c) => {
        const q = cc.qty[c.id] || 0;
        return '<tr data-id="' + esc(c.id) + '"><td>' + esc(c.name) + '</td>' +
          '<td class="text-right"><span class="tabular-nums">' + esc(fmt.money(c.price)) + '</span></td>' +
          '<td class="text-center"><div class="inline-flex items-center gap-2">' +
          '<button type="button" class="ant-btn ant-btn-sm" data-cc="dec"' + (q === 0 ? ' disabled' : '') + '>−</button>' +
          '<span class="tabular-nums" style="min-width:24px;text-align:center">' + esc(String(q)) + '</span>' +
          '<button type="button" class="ant-btn ant-btn-sm" data-cc="inc"' + (q >= MAX_QTY ? ' disabled' : '') + '>+</button>' +
          '</div></td>' +
          '<td class="text-right"><span class="tabular-nums">' + esc(fmt.money(c.price * q)) + '</span></td></tr>';
      }).join('') : emptyRow(4, L('common.noData'))) + '</tbody></table></div></div></div></div>' +
      '<div class="lg:col-span-5"><div class="ant-card"><div class="ant-card-head">' + esc(L('boxOffice.orderSummary')) + '</div>' +
      '<div class="ant-card-body"><div class="flex flex-col gap-4">' +
      '<span>' + (lines.length ? esc(lines.map((l) => l.combo.name + ' × ' + l.quantity).join(', ')) : esc(L('boxOffice.comboEmpty'))) + '</span>' +
      '<h4 class="m-0 text-xl font-semibold text-white tabular-nums">' + esc(fmt.money(total)) + '</h4>' +
      '<div class="ant-form-item mb-0"><label class="ant-form-item-label">' + esc(L('boxOffice.customerName')) + '</label>' +
      '<input id="ct_cc_name" class="ant-input" placeholder="' + esc(L('boxOffice.customerNamePlaceholder')) + '" maxlength="255" value="' + esc(cc.cname) + '" /></div>' +
      '<div class="ant-form-item mb-0"><label class="ant-form-item-label required">' + esc(L('boxOffice.payMethod')) + '</label>' +
      '<div class="flex items-center gap-4">' +
      '<label class="ant-radio' + (cc.pay === 'cash' ? ' on' : '') + '" data-pay="cash"><input type="radio" name="cc_pay" value="cash" tabindex="-1" /><span class="ant-radio-dot"></span>' + esc(L('boxOffice.payCash')) + '</label>' +
      '<label class="ant-radio' + (cc.pay === 'pos' ? ' on' : '') + '" data-pay="pos"><input type="radio" name="cc_pay" value="pos" tabindex="-1" /><span class="ant-radio-dot"></span>' + esc(L('boxOffice.payPos')) + '</label>' +
      '</div></div>' +
      (cc.sellError ? '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') + '</span>' +
        '<div class="flex-1">' + esc(cc.sellError) + '</div></div>' : '') +
      '<button type="button" class="ant-btn ant-btn-primary ant-btn-block" data-cc="sell"' +
      ((lines.length === 0 || cc.selling) ? ' disabled' : '') + '>' + esc(L('boxOffice.confirmSell')) + '</button>' +
      '</div></div></div></div></div>';
    if (loadErr) showErr(host.querySelector('[data-cc="error"]'), loadErr);
  }
  function ccChangeQty(id, delta) {
    cc.qty[id] = Math.min(MAX_QTY, Math.max(0, (cc.qty[id] || 0) + delta));
    ccRender();
  }
  async function ccSubmit() {
    const lines = ccLines();
    if (!lines.length || cc.selling) return;
    cc.selling = true;
    cc.sellError = null;
    ccRender();
    try {
      const order = await Api.post('/staff/combo-orders', {
        items: lines.map((l) => ({ combo_id: l.combo.id, quantity: l.quantity })),
        pay_method: cc.pay,
        customer_name: cc.cname.trim() || undefined,
      });
      cc.soldId = order.id;
      cc.soldTotal = order.total;
      cc.qty = {};
      cc.cname = '';
      toast('success', L('boxOffice.comboSold'));
    } catch (e) {
      cc.sellError = (e && e.message) || L('common.somethingWrong');
    } finally {
      cc.selling = false;
      ccRender();
    }
  }
  $id('ct_cc_wrap').addEventListener('click', (e) => {
    const pay = e.target.closest('[data-pay]');
    if (pay) { cc.pay = pay.dataset.pay; ccRender(); return; }
    const btn = e.target.closest('[data-cc]');
    if (!btn || btn.hasAttribute('disabled')) return;
    const tr = btn.closest('tr');
    if (btn.dataset.cc === 'inc' && tr) ccChangeQty(tr.dataset.id, 1);
    else if (btn.dataset.cc === 'dec' && tr) ccChangeQty(tr.dataset.id, -1);
    else if (btn.dataset.cc === 'sell') ccSubmit();
    else if (btn.dataset.cc === 'again') { cc.soldId = null; cc.soldTotal = 0; ccRender(); }
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'ct_cc_name') cc.cname = e.target.value;
  });

  // ============================== LOOKUP TAB ==============================
  const lk = {
    id: '', phone: '', submittedPhone: undefined, customerId: undefined,
    customers: null, customersFetching: false, orders: null, ordersFetching: false,
    byId: { state: 'idle', data: null, error: null },
    byTicket: { state: 'idle', data: null, error: null },
    collecting: false,
  };
  function lkActive() { return lk.byTicket.state === 'pending' ? lk.byTicket : lk.byId; }
  function lkRenderLists() {
    const host = $id('ct_lk_lists');
    let h = '';
    if (lk.customers && lk.submittedPhone) {
      h += '<div class="ant-list ant-list-sm" style="max-width:480px;margin-bottom:16px">' +
        (lk.customers.length ? lk.customers.map((c) =>
          '<div class="ant-list-item"><div class="flex flex-col"><strong>' + esc(c.full_name) + '</strong>' +
          '<span class="text-xs text-[var(--text-2)]">' + esc(c.email) + (c.phone ? ' · ' + esc(c.phone) : '') + '</span></div>' +
          '<button type="button" class="ant-btn ant-btn-sm' + (lk.customerId === c.id ? ' ant-btn-primary' : '') + '" data-lk="pick-cust" data-id="' + esc(c.id) + '">' +
          esc(L('boxOffice.lookupCustomerOrders')) + '</button></div>'
        ).join('') : '<div class="ant-list-empty">' + esc(L('common.noData')) + '</div>') + '</div>';
    }
    if (lk.customerId) {
      h += '<div class="ant-list ant-list-sm" style="max-width:480px;margin-bottom:16px">' +
        ((lk.orders && lk.orders.length) ? lk.orders.map((o) =>
          '<div class="ant-list-item"><div class="inline-flex items-center gap-1.5">' +
          '<span class="tabular-nums">' + esc(fmt.money(o.payable_amount)) + '</span>' +
          colorTag('default', tag('booking.status_' + o.status, o.status)) +
          '<span class="text-xs text-[var(--text-2)]">' + esc(fmt.datetime(o.created_at)) + '</span></div>' +
          '<button type="button" class="ant-btn ant-btn-sm" data-lk="pick-order" data-id="' + esc(o.id) + '">' +
          esc(L('booking.viewDetail')) + '</button></div>'
        ).join('') : '<div class="ant-list-empty">' + esc(L('common.noData')) + '</div>') + '</div>';
    }
    host.innerHTML = h;
  }
  function lkRenderResult() {
    const host = $id('ct_lk_result');
    const active = lkActive();
    if (active.state === 'pending') { host.innerHTML = skeleton(4); return; }
    if (active.state === 'error') {
      host.innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') + '</span>' +
        '<div class="flex-1">' + esc(active.error) + '</div></div>';
      return;
    }
    if (active.state === 'success' && active.data) {
      const o = active.data;
      host.innerHTML = '<div class="flex flex-col gap-4">' +
        (o.collected_at
          ? '<div class="ant-alert ant-alert-success"><span class="ant-alert-icon anticon">' + icon('CheckCircleFilled') + '</span>' +
            '<div class="flex-1">' + esc(tp('boxOffice.collectedAt', { time: fmt.datetime(o.collected_at) })) + '</div></div>'
          : '<div><button type="button" class="ant-btn ant-btn-primary" data-lk="collect" data-id="' + esc(o.id) + '"' +
            (lk.collecting ? ' disabled' : '') + '>' + esc(L('boxOffice.collectTickets')) + '</button></div>') +
        '<div id="ct_lk_detail">' + orderDetailHtml(o) + '</div>' +
        '<div><button type="button" class="ant-btn" data-lk="print"><span class="anticon">' + icon('Printer') + '</span>' + esc(L('boxOffice.printTickets')) + '</button></div>' +
        '</div>';
      bindCopyScope(host);
      return;
    }
    host.innerHTML = '';
  }
  async function lkSearchById(id) {
    id = (id || '').trim();
    if (!id) return;
    lk.byTicket = { state: 'idle', data: null, error: null };
    lk.byId = { state: 'pending', data: null, error: null };
    lkRenderResult();
    try {
      lk.byId = { state: 'success', data: await Api.get('/staff/orders/' + id), error: null };
    } catch (e) {
      lk.byId = { state: 'error', data: null, error: (e && e.message) || L('common.somethingWrong') };
    }
    lkRenderResult();
  }
  async function lkSearchByTicket(code) {
    lk.byId = { state: 'idle', data: null, error: null };
    lk.byTicket = { state: 'pending', data: null, error: null };
    lkRenderResult();
    try {
      lk.byTicket = { state: 'success', data: await Api.get('/staff/tickets/' + code + '/order'), error: null };
    } catch (e) {
      lk.byTicket = { state: 'error', data: null, error: (e && e.message) || L('common.somethingWrong') };
    }
    lkRenderResult();
  }
  async function lkSearchPhone() {
    const t = lk.phone.trim();
    if (!t) return;
    lk.customerId = undefined;
    lk.submittedPhone = t;
    lk.customersFetching = true;
    try {
      lk.customers = (await Api.get('/staff/customers?page=1&page_size=10&search=' + encodeURIComponent(t))).items || [];
    } catch (e) {
      lk.customers = [];
      err(e);
    } finally {
      lk.customersFetching = false;
      lkRenderLists();
    }
  }
  async function lkLoadCustomerOrders() {
    if (!lk.customerId) { lk.orders = null; lkRenderLists(); return; }
    lk.ordersFetching = true;
    try {
      lk.orders = (await Api.get('/staff/customers/' + lk.customerId + '/orders?page=1&page_size=20')).items || [];
    } catch (e) {
      lk.orders = [];
      err(e);
    } finally {
      lk.ordersFetching = false;
      lkRenderLists();
    }
  }
  async function lkCollect(id) {
    if (lk.collecting) return;
    lk.collecting = true;
    lkRenderResult();
    try {
      await Api.post('/staff/orders/' + id + '/collect', {});
      await lkSearchById(id);
    } catch (e) {
      err(e);
    } finally {
      lk.collecting = false;
      lkRenderResult();
    }
  }
  $id('ct_lk_go').addEventListener('click', () => lkSearchById($id('ct_lk_id').value));
  $id('ct_lk_id').addEventListener('keydown', (e) => { if (e.key === 'Enter') lkSearchById($id('ct_lk_id').value); });
  $id('ct_lk_phone_go').addEventListener('click', () => { lk.phone = $id('ct_lk_phone').value; lkSearchPhone(); });
  $id('ct_lk_phone').addEventListener('keydown', (e) => { if (e.key === 'Enter') { lk.phone = $id('ct_lk_phone').value; lkSearchPhone(); } });
  $id('ct_lk_lists').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lk]');
    if (!btn) return;
    if (btn.dataset.lk === 'pick-cust') { lk.customerId = btn.dataset.id; lkLoadCustomerOrders(); lkRenderLists(); }
    if (btn.dataset.lk === 'pick-order') { $id('ct_lk_id').value = btn.dataset.id; lkSearchById(btn.dataset.id); }
  });
  $id('ct_lk_result').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lk]');
    if (!btn) return;
    if (btn.dataset.lk === 'collect') lkCollect(btn.dataset.id);
    if (btn.dataset.lk === 'print') {
      const active = lkActive();
      if (active.state === 'success' && active.data) openPrint(active.data);
    }
  });
  document.addEventListener('input', (e) => {
    if (!e.target) return;
    if (e.target.id === 'ct_lk_id') lk.id = e.target.value;
    if (e.target.id === 'ct_lk_phone') lk.phone = e.target.value;
  });

  // ---- QR scanner ----
  let scanRaf = 0, scanStream = null, scanLast = 0;
  const SCAN_COOLDOWN = 1500, FRAME_W = 640;
  function scanStop() {
    cancelAnimationFrame(scanRaf);
    if (scanStream) scanStream.getTracks().forEach((t) => t.stop());
    scanStream = null;
  }
  $id('ct_lk_scan').addEventListener('click', () => {
    const body = $id('ct_scan_body');
    scanLast = 0;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      body.innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') + '</span>' +
        '<div class="flex-1">' + esc(L('boxOffice.scanUnsupported')) + '</div></div>';
    } else {
      body.innerHTML = '<div style="position:relative;background:#000;border-radius:8px;overflow:hidden">' +
        '<div class="text-center" style="padding:32px"><span class="ant-spin"></span></div>' +
        '<video id="ct_scan_video" playsinline muted style="width:100%;display:block"></video></div>';
      const video = $id('ct_scan_video');
      let scratch = null;
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then((stream) => {
        scanStream = stream;
        video.srcObject = stream;
        video.play().then(() => {
          const tick = () => {
            const v = $id('ct_scan_video');
            if (v && v.readyState === 4 && v.videoWidth > 0 && typeof jsQR !== 'undefined') {
              if (!scratch) {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d', { willReadFrequently: true });
                if (!context) {
                  body.innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') + '</span>' +
                    '<div class="flex-1">' + esc(L('boxOffice.scanFailed')) + '</div></div>';
                  return;
                }
                scratch = { canvas, context };
              }
              const scale = FRAME_W / v.videoWidth;
              scratch.canvas.width = FRAME_W;
              scratch.canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
              scratch.context.drawImage(v, 0, 0, scratch.canvas.width, scratch.canvas.height);
              const frame = scratch.context.getImageData(0, 0, scratch.canvas.width, scratch.canvas.height);
              const decoded = jsQR(frame.data, frame.width, frame.height);
              const now = Date.now();
              if (decoded && decoded.data && now - scanLast > SCAN_COOLDOWN) {
                scanLast = now;
                const code = String(decoded.data).trim();
                CP.modal.close('ct_scan_modal');
                $id('ct_lk_id').value = code;
                lkSearchByTicket(code);
                return;
              }
            }
            scanRaf = requestAnimationFrame(tick);
          };
          scanRaf = requestAnimationFrame(tick);
        });
      }).catch((er) => {
        body.innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') + '</span>' +
          '<div class="flex-1">' + esc(er && er.name === 'NotAllowedError' ? L('boxOffice.scanDenied') : L('boxOffice.scanFailed')) + '</div></div>';
      });
    }
    CP.modal.open('ct_scan_modal');
  });
  $id('ct_scan_modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-close="ct_scan_modal"]') || e.target === $id('ct_scan_modal')) scanStop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $id('ct_scan_modal').classList.contains('open')) scanStop();
  });

  // ============================== CUSTOMERS TAB ==============================
  const cu = {
    items: [], page: 1, size: 10, search: '',
    rowsEl: $id('ct_cu_rows'), pagerEl: $id('ct_cu_pager'), errEl: $id('ct_cu_error'),
    drawerId: null, drawerPage: 1, drawerOrders: null, drawerMeta: null, drawerProfile: null, drawerErr: null,
  };
  async function cuLoad(p, ps) {
    if (p) cu.page = p;
    if (ps) cu.size = ps;
    const q = new URLSearchParams({ page: String(cu.page), page_size: String(cu.size) });
    if (cu.search) q.set('search', cu.search);
    try {
      const data = await Api.get('/staff/customers?' + q);
      cu.errEl.innerHTML = '';
      cu.items = data.items;
      cuRender();
      CP.renderPagination(cu.pagerEl, data.meta, cuLoad);
    } catch (e) { showErr(cu.errEl, e); }
  }
  function cuRender() {
    if (!cu.items.length) {
      cu.rowsEl.innerHTML = emptyRow(5, cu.search ? L('common.noData') : L('customerLookup.emptyHint'));
      return;
    }
    cu.rowsEl.innerHTML = cu.items.map((u) =>
      '<tr data-id="' + esc(u.id) + '"><td>' + esc(u.full_name) + '</td>' +
      '<td>' + esc(u.email) + '</td>' +
      '<td>' + esc(u.phone || '-') + '</td>' +
      '<td>' + esc(fmt.datetime(u.created_at)) + '</td>' +
      '<td class="text-right"><button type="button" class="ant-btn ant-btn-link" data-act="detail">' + esc(L('customerLookup.viewDetail')) + '</button></td></tr>'
    ).join('');
  }
  function cuSearch() {
    cu.search = $id('ct_cu_search').value.trim();
    cuLoad(1);
  }
  $id('ct_cu_btn').addEventListener('click', cuSearch);
  $id('ct_cu_search').addEventListener('keydown', (e) => { if (e.key === 'Enter') cuSearch(); });
  cu.rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="detail"]');
    if (!btn) return;
    cuOpenDrawer(btn.closest('tr').dataset.id);
  });

  async function cuOpenDrawer(id) {
    cu.drawerId = id;
    cu.drawerPage = 1;
    cu.drawerProfile = null;
    cu.drawerOrders = null;
    cu.drawerErr = null;
    cuRenderDrawer();
    $id('ct_cu_mask').classList.add('open');
    $id('ct_cu_drawer').classList.add('open');
    $id('ct_cu_drawer').setAttribute('aria-hidden', 'false');
    try {
      cu.drawerProfile = await Api.get('/staff/customers/' + id);
    } catch (e) {
      cu.drawerErr = (e && e.message) || L('common.somethingWrong');
    }
    await cuLoadDrawerOrders();
    if (cu.drawerId === id) cuRenderDrawer();
  }
  async function cuLoadDrawerOrders() {
    const id = cu.drawerId;
    if (!id) return;
    try {
      const data = await Api.get('/staff/customers/' + id + '/orders?page=' + cu.drawerPage + '&page_size=10');
      if (cu.drawerId !== id) return;
      cu.drawerOrders = data.items;
      cu.drawerMeta = data.meta;
    } catch (e) {
      if (cu.drawerId !== id) return;
      cu.drawerOrders = [];
      cu.drawerErr = cu.drawerErr || (e && e.message) || L('common.somethingWrong');
    }
    if (cu.drawerId === id) cuRenderDrawer();
  }
  function cuRenderDrawer() {
    const body = $id('ct_cu_body');
    if (cu.drawerErr && !cu.drawerProfile) {
      body.innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') + '</span>' +
        '<div class="flex-1">' + esc(cu.drawerErr) + '</div></div>';
      return;
    }
    if (!cu.drawerProfile) { body.innerHTML = skeleton(4); return; }
    const p = cu.drawerProfile;
    let h = '<div class="flex flex-col gap-4">' +
      '<table class="ant-descriptions-bordered"><tbody>' +
      '<tr><th>' + esc(L('user.fullName')) + '</th><td>' + esc(p.full_name) + '</td></tr>' +
      '<tr><th>' + esc(L('user.email')) + '</th><td>' + esc(p.email) + '</td></tr>' +
      '<tr><th>' + esc(L('customerLookup.phone')) + '</th><td>' + esc(p.phone || '-') + '</td></tr>' +
      '<tr><th>' + esc(L('user.status')) + '</th><td>' +
      colorTag(p.active ? 'green' : 'default', L(p.active ? 'user.statusActive' : 'user.statusLocked'), false) + '</td></tr>' +
      '<tr><th>' + esc(L('user.createdAt')) + '</th><td>' + esc(fmt.datetime(p.created_at)) + '</td></tr>' +
      '</tbody></table>';
    if (cu.drawerErr && cu.drawerOrders) {
      h += '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') + '</span>' +
        '<div class="flex-1">' + esc(cu.drawerErr) + '</div></div>';
    }
    const orders = cu.drawerOrders || [];
    h += '<div><div class="mb-2 text-sm font-semibold text-white">' + esc(L('customerLookup.orderHistory')) + '</div>' +
      '<div class="ant-table-wrap"><table class="ant-table ant-table-sm"><thead><tr>' +
      '<th>' + esc(L('booking.code')) + '</th>' +
      '<th>' + esc(L('showtime.movie')) + '</th>' +
      '<th style="width:140px">' + esc(L('booking.status')) + '</th>' +
      '<th class="text-right" style="width:120px">' + esc(L('booking.total')) + '</th>' +
      '<th style="width:160px">' + esc(L('booking.createdAt')) + '</th></tr></thead><tbody>' +
      (orders.length ? orders.map((o) =>
        '<tr><td><span class="inline-flex items-center">' + esc(o.id) + copyBtn(o.id) + '</span></td>' +
        '<td>' + esc((o.showtime || {}).movie_title || '-') + '</td>' +
        '<td>' + colorTag(BOOKING_COLOR[o.status], tag('booking.status_' + o.status, o.status), false) + '</td>' +
        '<td class="text-right"><span class="tabular-nums">' + esc(fmt.money(o.payable_amount)) + '</span></td>' +
        '<td>' + esc(fmt.datetime(o.created_at)) + '</td></tr>'
      ).join('') : emptyRow(5, L('common.noData'))) +
      '</tbody></table></div>';
    if (cu.drawerMeta && cu.drawerMeta.total_pages > 1) {
      const m = cu.drawerMeta;
      h += '<div class="ant-pagination" style="justify-content:flex-end">';
      for (let i = 1; i <= m.total_pages; i++) {
        h += '<span class="ant-pagination-item' + (i === m.page ? ' active' : '') + '" data-cupage="' + i + '">' + i + '</span>';
      }
      h += '</div>';
    }
    body.innerHTML = h + '</div></div>';
  }
  $id('ct_cu_body').addEventListener('click', (e) => {
    const pg = e.target.closest('[data-cupage]');
    if (pg) {
      cu.drawerPage = Number(pg.dataset.cupage);
      cu.drawerOrders = null;
      cuRenderDrawer();
      cuLoadDrawerOrders();
    }
  });
  function cuCloseDrawer() {
    cu.drawerId = null;
    $id('ct_cu_mask').classList.remove('open');
    $id('ct_cu_drawer').classList.remove('open');
    $id('ct_cu_drawer').setAttribute('aria-hidden', 'true');
  }
  $id('ct_cu_close').addEventListener('click', cuCloseDrawer);
  $id('ct_cu_mask').addEventListener('click', cuCloseDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $id('ct_cu_drawer').classList.contains('open')) cuCloseDrawer();
  });

  // ============================== TABS ==============================
  const loaded = {};
  function loadTab(key) {
    if (loaded[key]) return;
    loaded[key] = true;
    if (key === 'boxOffice') loadInner('dashboard');
    else if (key === 'customerLookup') cuLoad();
  }
  const loadedInner = {};
  function loadInner(key) {
    if (loadedInner[key]) {
      if (key === 'sell') sellRender();
      return;
    }
    loadedInner[key] = true;
    if (key === 'dashboard') dbLoad();
    else if (key === 'sell') { sellRender(); sellLoadOptions(); }
    else if (key === 'pickup') pkLoad();
    else if (key === 'concession') ccLoad();
  }
  $id('ct_tabs').addEventListener('cp:tab', (e) => loadTab(e.detail.key));
  $id('ct_inner_tabs').addEventListener('cp:tab', (e) => loadInner(e.detail.key));
  loadTab('boxOffice');
})();
