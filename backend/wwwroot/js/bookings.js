/* Bookings page (Razor port of React features/booking/BookingsPage + OrderDetailDrawer). */
(function () {
  'use strict';
  const root = document.getElementById('cp-bookings');
  if (!root) return;

  const L = (k) => (window.CP_LANG && window.CP_LANG[k]) || k;
  const tag = (k, fb) => { const v = L(k); return v === k ? fb : v; };
  const fmt = CP.fmt, esc = CP.esc, icon = CP.icon, toast = CP.toast;
  const $id = (id) => document.getElementById(id);
  const isEn = document.documentElement.lang === 'en';

  const BOOKING_COLOR = { pending: 'gold', confirmed: 'green', expired: 'default', refunded: 'red' };
  const PAYMENT_COLOR = { pending: 'gold', paid: 'green', failed: 'red', refund_pending: 'orange', refunded: 'purple' };
  const colorTag = (color, text) =>
    '<span class="ant-tag' + (color && color !== 'default' ? ' ant-tag-' + color : '') + '"' +
    (color === 'default' ? ' style="border-color:transparent"' : '') + '>' + esc(text) + '</span>';

  const searchEl = $id('bk_search'), searchBtn = $id('bk_search_btn');
  const statusEl = $id('bk_status'), paymentEl = $id('bk_payment'), viaEl = $id('bk_via');
  const fromEl = $id('bk_from'), toEl = $id('bk_to');
  const rowsEl = $id('bk_rows'), pagerEl = $id('bk_pager');
  const errEl = $id('bk_error'), hintEl = $id('bk_payhint');

  let items = [], page = 1, size = 10;
  let selectedId = null;

  const SIMPLE_SVG = '<svg width="64" height="41" viewBox="0 0 64 41" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g transform="translate(0 1)" fill="none" fill-rule="evenodd">' +
    '<ellipse fill="#272727" cx="32" cy="33" rx="32" ry="7"/>' +
    '<g fill-rule="nonzero" stroke="#373737">' +
    '<path d="M55 12.76L44.854 1.258C44.367.474 43.656 0 42.907 0H21.093c-.749 0-1.46.474-1.947 1.257L9 12.761V22h46v-9.24z"/>' +
    '<path d="M41.613 15.931c0-1.605.994-2.93 2.227-2.931H55v18.137C55 33.26 53.68 35 52.05 35h-40.1C10.32 35 9 33.259 9 31.137V13h11.16c1.233 0 2.227 1.323 2.227 2.928v.022c0 1.605 1.005 2.901 2.237 2.901h14.752c1.232 0 2.237-1.308 2.237-2.913v-.007z" fill="#1d1d1d"/>' +
    '</g></g></svg>';
  const emptyRow = (cols, text) => '<tr class="ant-table-empty"><td colspan="' + cols + '">' +
    '<div class="ant-empty" style="padding:8px 0">' + SIMPLE_SVG + '<div>' + esc(text) + '</div></div></td></tr>';

  const err = (e, m) => toast('error', (e && e.message) || m || L('common.somethingWrong'));
  function showErr(e) {
    errEl.innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') +
      '</span><div class="flex-1">' + esc((e && e.message) || L('common.somethingWrong')) + '</div></div>';
  }

  function paymentHint() {
    hintEl.innerHTML = paymentEl.value
      ? '<div class="ant-alert ant-alert-info" id="bk_payhint_box"><span class="ant-alert-icon anticon">' + icon('InfoCircleFilled') + '</span>' +
        '<div class="flex-1">' + esc(L('booking.paymentFilterHint')) + '</div>' +
        '<button type="button" class="ant-alert-close anticon" data-close-hint>' + icon('Close') + '</button></div>'
      : '';
    const box = $id('bk_payhint_box');
    if (box) box.querySelector('[data-close-hint]').addEventListener('click', () => { box.remove(); });
  }

  async function load(p, ps) {
    if (p) page = p;
    if (ps) size = ps;
    const q = new URLSearchParams({ page: String(page), page_size: String(size) });
    const s = searchEl.value.trim();
    if (s) q.set('search', s);
    if (statusEl.value) q.set('status', statusEl.value);
    if (paymentEl.value) q.set('payment_status', paymentEl.value);
    if (viaEl.value) q.set('sold_via', viaEl.value);
    if (fromEl.value) q.set('from', fromEl.value);
    if (toEl.value) q.set('to', toEl.value);
    try {
      const data = await Api.get('/admin/orders?' + q);
      errEl.innerHTML = '';
      items = data.items;
      render();
      CP.renderPagination(pagerEl, data.meta, load);
    } catch (e) { showErr(e); }
  }

  function customerHtml(o) {
    const c = o.customer;
    if (!c) return '<span class="text-[var(--text-2)]">' + esc(L('booking.walkInNoContact')) + '</span>';
    return '<div class="flex flex-col">' +
      '<span>' + esc(c.full_name || c.email || '-') + '</span>' +
      '<span class="text-xs text-[var(--text-2)]">' + esc(c.email || c.phone || L('booking.walkIn')) + '</span></div>';
  }

  function rowHtml(o) {
    const st = o.showtime || {};
    const money = '<span class="tabular-nums">' + esc(fmt.money(o.payable_amount)) + '</span>' +
      (o.discount_amount > 0
        ? '<div class="text-xs text-[var(--text-2)]"><span class="tabular-nums">' + esc('−' + fmt.money(o.discount_amount)) + '</span></div>'
        : '');
    const pay = o.payment
      ? colorTag(PAYMENT_COLOR[o.payment.status], tag('booking.payment_' + o.payment.status, o.payment.status))
      : '<span class="text-[var(--text-2)]">' + esc(L('booking.noPaymentShort')) + '</span>';
    return '<tr data-id="' + esc(o.id) + '">' +
      '<td>' + customerHtml(o) + '</td>' +
      '<td><div class="flex flex-col"><span>' + esc(st.movie_title || '-') + '</span>' +
      '<span class="text-xs text-[var(--text-2)]">' + esc(st.hall_name || '') +
      (st.hall_name ? ' · ' : '') + esc(fmt.datetime(st.start_at)) + '</span></div></td>' +
      '<td class="text-right tabular-nums">' + esc(String(o.seats)) + '</td>' +
      '<td class="text-right">' + money + '</td>' +
      '<td>' + colorTag('default', tag('booking.soldVia_' + o.sold_via, o.sold_via)) + '</td>' +
      '<td><div class="flex flex-col items-start">' +
      colorTag(BOOKING_COLOR[o.status], tag('booking.status_' + o.status, o.status)) +
      (o.status_reason ? '<span class="mt-1 text-xs text-[var(--text-2)]">' + esc(tag('booking.reason_' + o.status_reason, o.status_reason)) + '</span>' : '') +
      '</div></td>' +
      '<td>' + pay + '</td>' +
      '<td>' + esc(fmt.datetime(o.created_at)) + '</td>' +
      '<td class="text-right"><button type="button" class="ant-btn ant-btn-link" data-act="detail" aria-label="detail-' +
      esc(o.id) + '">' + esc(L('booking.viewDetail')) + '</button></td>' +
      '</tr>';
  }

  function render() {
    rowsEl.innerHTML = items.length ? items.map(rowHtml).join('') : emptyRow(9, L('common.noData'));
  }

  // ---- detail drawer ----
  const maskEl = $id('bk_d_mask'), drawerEl = $id('bk_drawer'), bodyEl = $id('bk_d_body');

  function openDrawer(id) {
    selectedId = id;
    const row = items.find((x) => x.id === id) || null;
    maskEl.classList.add('open');
    drawerEl.classList.add('open');
    drawerEl.setAttribute('aria-hidden', 'false');
    bodyEl.innerHTML = skeleton(6);
    Api.get('/staff/orders/' + id).then((d) => {
      if (selectedId !== id) return;
      bodyEl.innerHTML = detailHtml(d, row);
      bindCopyButtons();
    }).catch((e) => {
      if (selectedId !== id) return;
      bodyEl.innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') +
        '</span><div class="flex-1">' + esc((e && e.message) || L('common.somethingWrong')) + '</div></div>' + skeleton(6);
    });
  }

  function closeDrawer() {
    selectedId = null;
    maskEl.classList.remove('open');
    drawerEl.classList.remove('open');
    drawerEl.setAttribute('aria-hidden', 'true');
  }

  function skeleton(rows) {
    let h = '<div><div class="ant-skeleton-line" style="width:38%"></div>';
    for (let i = 0; i < rows; i++) h += '<div class="ant-skeleton-line"></div>';
    return h + '</div>';
  }

  function copyBtn(text) {
    return '<button type="button" class="ant-btn ant-btn-text ant-btn-icon ml-1" data-copy="' + esc(text) +
      '" title="' + esc(isEn ? 'Copy' : 'Sao chép') + '" aria-label="' + esc(isEn ? 'Copy' : 'Sao chép') + '">' +
      '<span class="anticon">' + icon('Copy') + '</span></button>';
  }

  // React: customer + soldVia always come from the list row; the rest prefers the detail payload.
  function detailHtml(d, row) {
    const o = d || row || {};
    const via = row ? row.sold_via : null;
    const c = row ? row.customer : null;
    const st = o.showtime || {}, pay = o.payment;
    let info = '';
    info += '<tr><th>' + esc(L('booking.code')) + '</th><td><span class="inline-flex items-center">' + esc(o.id || '') + copyBtn(o.id || '') + '</span></td></tr>';
    info += '<tr><th>' + esc(L('booking.status')) + '</th><td><span class="inline-flex items-center gap-1.5">' +
      colorTag(BOOKING_COLOR[o.status], tag('booking.status_' + o.status, o.status)) +
      (o.status_reason ? '<span class="text-[var(--text-2)]">' + esc(tag('booking.reason_' + o.status_reason, o.status_reason)) + '</span>' : '') +
      '</span></td></tr>';
    info += '<tr><th>' + esc(L('booking.soldVia')) + '</th><td>' + (via ? esc(tag('booking.soldVia_' + via, via)) : '-') + '</td></tr>';
    let cust = '';
    if (c) {
      cust = '<div class="flex flex-col"><span>' + esc(c.full_name || c.email || '-') + '</span>' +
        (c.email && c.full_name ? '<span class="text-[var(--text-2)]">' + esc(c.email) + '</span>' : '') +
        (c.phone ? '<span class="text-[var(--text-2)]">' + esc(c.phone) + '</span>' : '') +
        (!c.user_id ? '<span class="text-[var(--text-2)]">' + esc(L('booking.walkIn')) + '</span>' : '') + '</div>';
    } else {
      cust = '<span class="text-[var(--text-2)]">' + esc(L('booking.walkInNoContact')) + '</span>';
    }
    info += '<tr><th>' + esc(L('booking.customer')) + '</th><td>' + cust + '</td></tr>';
    info += '<tr><th>' + esc(L('showtime.movie')) + '</th><td>' + esc(st.movie_title || '-') + '</td></tr>';
    info += '<tr><th>' + esc(L('showtime.hall')) + '</th><td>' + esc(st.hall_name || '-') + '</td></tr>';
    info += '<tr><th>' + esc(L('showtime.startAt')) + '</th><td>' + esc(fmt.datetime(st.start_at)) + '</td></tr>';
    info += '<tr><th>' + esc(L('booking.createdAt')) + '</th><td>' + esc(fmt.datetime(o.created_at)) + '</td></tr>';
    info += '<tr><th>' + esc(L('booking.subtotal')) + '</th><td><span class="tabular-nums">' + esc(fmt.money(o.total_amount)) + '</span></td></tr>';
    if (o.discount_amount > 0) {
      info += '<tr><th>' + esc(L('booking.discount')) + '</th><td><span class="tabular-nums">' + esc('−' + fmt.money(o.discount_amount)) + '</span></td></tr>';
    }
    info += '<tr><th>' + esc(L('booking.total')) + '</th><td><span class="tabular-nums">' + esc(fmt.money(o.payable_amount)) + '</span></td></tr>';

    let h = '<div class="flex flex-col gap-4">' +
      '<table class="ant-descriptions-bordered"><tbody>' + info + '</tbody></table>';

    if (pay) {
      h += '<table class="ant-descriptions-bordered"><caption class="pb-2 text-left text-sm font-semibold text-white">' +
        esc(L('booking.payment')) + '</caption><tbody>' +
        '<tr><th>' + esc(L('booking.provider')) + '</th><td>' + esc(pay.provider) + '</td></tr>' +
        '<tr><th>' + esc(L('booking.txnRef')) + '</th><td><span class="inline-flex items-center">' + esc(pay.txn_ref || '') + copyBtn(pay.txn_ref || '') + '</span></td></tr>' +
        '<tr><th>' + esc(L('booking.paymentStatus')) + '</th><td>' +
        colorTag(PAYMENT_COLOR[pay.status], tag('booking.payment_' + pay.status, pay.status)) + '</td></tr>' +
        '<tr><th>' + esc(L('booking.paidAt')) + '</th><td>' + esc(fmt.datetime(pay.paid_at)) + '</td></tr>' +
        '</tbody></table>';
    } else {
      h += '<div class="ant-alert ant-alert-info"><span class="ant-alert-icon anticon">' + icon('InfoCircleFilled') + '</span>' +
        '<div class="flex-1">' + esc(L('booking.noPayment')) + '</div></div>';
    }

    const tickets = d && d.tickets ? d.tickets : [];
    h += '<div><div class="mb-2 text-sm font-semibold text-white">' + esc(L('booking.tickets')) + '</div>' +
      '<div class="ant-table-wrap"><table class="ant-table ant-table-sm">' +
      '<thead><tr><th style="width:80px">' + esc(L('booking.seat')) + '</th>' +
      '<th style="width:110px">' + esc(L('booking.seatType')) + '</th>' +
      '<th class="text-right" style="width:120px">' + esc(L('booking.price')) + '</th>' +
      '<th style="width:120px">' + esc(L('booking.ticketStatus')) + '</th></tr></thead><tbody>' +
      (tickets.length ? tickets.map((t) =>
        '<tr><td>' + esc(t.seat_label) + '</td>' +
        '<td>' + esc(tag('booking.seatType_' + t.seat_type, t.seat_type)) + '</td>' +
        '<td class="text-right"><span class="tabular-nums">' + esc(fmt.money(t.price)) + '</span></td>' +
        '<td>' + colorTag(t.status === 'redeemed' ? 'blue' : 'green', tag('booking.ticket_' + t.status, t.status)) + '</td></tr>'
      ).join('') : emptyRow(4, L('common.noData'))) +
      '</tbody></table></div></div>';

    return h + '</div>';
  }

  function bindCopyButtons() {
    bodyEl.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const text = btn.getAttribute('data-copy') || '';
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
          else {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); ta.remove();
          }
        } catch (e) { /* clipboard unavailable: keep quiet like antd */ }
        const ic = btn.querySelector('.anticon');
        if (ic) {
          ic.innerHTML = icon('Check');
          setTimeout(() => { ic.innerHTML = icon('Copy'); }, 2500);
        }
      });
    });
  }

  // ---- events ----
  searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(1); });
  searchBtn.addEventListener('click', () => load(1));
  statusEl.addEventListener('change', () => load(1));
  viaEl.addEventListener('change', () => load(1));
  paymentEl.addEventListener('change', () => { paymentHint(); load(1); });
  fromEl.addEventListener('change', () => load(1));
  toEl.addEventListener('change', () => load(1));

  rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="detail"]');
    if (!btn) return;
    const tr = btn.closest('tr');
    openDrawer(tr.dataset.id);
  });

  $id('bk_d_close').addEventListener('click', closeDrawer);
  maskEl.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerEl.classList.contains('open')) closeDrawer();
  });

  paymentHint();
  load();
})();
