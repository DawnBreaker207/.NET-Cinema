/* Monitoring page (Razor port of React MonitoringPage + AuditLogPage/auditDiff + BatchJobsPage). */
(function () {
  'use strict';
  const root = document.getElementById('cp-monitoring');
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

  const AUDIT_ACTIONS = ['admin.add_hall_column', 'admin.add_hall_row', 'admin.attach_campaign_article', 'admin.attach_campaign_combo', 'admin.attach_campaign_discount', 'admin.bulk_update_seats', 'admin.cancel_showtime', 'admin.clone_hall', 'admin.create_article', 'admin.create_campaign', 'admin.create_concession', 'admin.create_discount', 'admin.create_hall', 'admin.create_movie', 'admin.create_pricing_rule', 'admin.create_showtime', 'admin.create_user', 'admin.delete_article', 'admin.delete_campaign', 'admin.delete_concession', 'admin.delete_discount', 'admin.delete_hall', 'admin.delete_hall_row', 'admin.delete_movie', 'admin.delete_pricing_rule', 'admin.delete_showtime', 'admin.detach_campaign_article', 'admin.detach_campaign_combo', 'admin.detach_campaign_discount', 'admin.merge_hall_seats', 'admin.run_job', 'admin.set_base_price', 'admin.split_hall_seat', 'admin.update_article', 'admin.update_campaign', 'admin.update_concession', 'admin.update_discount', 'admin.update_hall', 'admin.update_hall_layout', 'admin.update_hall_seat', 'admin.update_movie', 'admin.update_pricing_rule', 'admin.update_showtime', 'admin.update_user', 'admin.upload_poster', 'auth.accept_terms', 'auth.forgot_password', 'auth.login', 'auth.logout', 'auth.refresh', 'auth.register', 'auth.reset_password', 'combo_orders.create', 'orders.apply_discount', 'orders.cancel', 'orders.confirm', 'orders.counter_sell', 'orders.hold', 'orders.init', 'orders.pay', 'orders.refresh', 'orders.remove_discount', 'staff.redeem_ticket', 'users.change_password', 'users.delete_me', 'users.revoke_session', 'users.update_notification_preferences', 'users.update_profile'];
  const AUDIT_RESOURCE_TYPES = ['article', 'batch_job', 'booking', 'campaign', 'combo_order', 'concession', 'discount', 'hall', 'media', 'movie', 'pricing_rule', 'seat', 'seat_base_price', 'session', 'showtime', 'ticket', 'user'];
  const actionLabel = (a) => tag('audit.action_' + String(a).replace(/\./g, '_'), a);

  // Map backend English sentences to audit.err_* keys; keep the original sentence when unmapped.
  const ERROR_MESSAGE_SLUGS = {
    'nothing to update': 'nothing_to_update',
    'price can not be negative': 'price_negative',
    'end_time must be after start_time': 'invalid_time_range',
    'a percentage discount must be between 1 and 100': 'discount_percent_range',
    'max_discount only applies to a percentage code': 'max_discount_invalid',
    'ends_at must be after starts_at': 'discount_dates_invalid',
    'nothing to update: send active and/or role': 'user_nothing_to_update',
    'phone must be 8 to 15 digits, optionally prefixed with +': 'invalid_phone',
    'unknown template': 'unknown_template',
    'this order belongs to another user': 'forbidden_order',
  };
  function translatedErrorMessage(message) {
    if (!message) return undefined;
    const slug = ERROR_MESSAGE_SLUGS[String(message).trim()];
    if (!slug) return message;
    return tag('audit.err_' + slug, message);
  }

  // ---- auditDiff port ----
  const FIELD_LABELS = {
    status: 'Trạng thái', active: 'Hoạt động', price: 'Giá', prices: 'Giá', base_price: 'Giá',
    total_amount: 'Tổng tiền', discount: 'Số tiền giảm', payable: 'Số tiền phải trả', seat_type: 'Loại ghế',
    is_gap: 'Lối đi', code: 'Mã', deleted: 'Đã xóa', adjust_kind: 'Loại điều chỉnh', adjust_value: 'Giá trị điều chỉnh',
    day_of_week: 'Ngày trong tuần', start_time: 'Giờ bắt đầu', end_time: 'Giờ kết thúc', starts_at: 'Bắt đầu lúc',
    ends_at: 'Kết thúc lúc', specific_date: 'Ngày cụ thể', priority: 'Độ ưu tiên', standard: 'Giá ghế thường',
    vip: 'Giá ghế VIP', couple: 'Giá ghế đôi', recliner: 'Giá ghế nằm', left: 'Ghế trái', right: 'Ghế phải',
    col_span: 'Số cột chiếm', role: 'Vai trò', name: 'Tên', email: 'Email', phone: 'Số điện thoại',
    quantity: 'Số lượng', amount: 'Số tiền', resource_type: 'Loại đối tượng',
  };
  const HIDDEN_SUBSTRINGS = ['password', 'token', 'secret', 'signature'];
  const ALLOWED_AT_KEYS = { starts_at: 1, ends_at: 1, start_time: 1, end_time: 1 };
  function isHiddenKey(key) {
    const lower = String(key).toLowerCase();
    if (key === 'id') return true;
    if (HIDDEN_SUBSTRINGS.some((s) => lower.includes(s))) return true;
    if (lower.endsWith('_at') && !ALLOWED_AT_KEYS[key]) return true;
    return false;
  }
  const MONEY_KEY_RE = /price|amount|discount|payable|total/i;
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  const truncate = (v, max) => { v = String(v); max = max || 70; return v.length > max ? v.slice(0, max) + '…' : v; };
  function safeStringify(v) {
    try { return JSON.stringify(v) ?? String(v); } catch (e) { return '[unserializable]'; }
  }
  function humanize(key) {
    return String(key).split(/[_.]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  function labelFor(key) {
    return tag('audit.field_' + key, FIELD_LABELS[key] || humanize(key));
  }
  function isPlainObject(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }
  function isReferenceObject(o) { return typeof o.name === 'string' || typeof o.code === 'string' || typeof o.title === 'string'; }
  function formatDiffValue(key, value, parentKey) {
    try {
      if (value === undefined || value === null) return '—';
      if (typeof value === 'boolean') return value ? 'Có' : 'Không';
      if (typeof value === 'number') {
        const isMoney = MONEY_KEY_RE.test(key) || (parentKey !== undefined && MONEY_KEY_RE.test(parentKey));
        if (isMoney && Number.isFinite(value)) return fmt.money(value);
        return String(value);
      }
      if (typeof value === 'string') {
        if (ISO_DATE_RE.test(value)) return fmt.datetime(value);
        return truncate(value);
      }
      if (Array.isArray(value)) return value.length + ' mục';
      if (isPlainObject(value)) {
        for (const k of ['name', 'code', 'title']) {
          if (typeof value[k] === 'string') return truncate(value[k]);
        }
        return truncate(safeStringify(value));
      }
      return truncate(String(value));
    } catch (e) { return '—'; }
  }
  function toRecord(v) {
    try {
      if (v == null) return {};
      if (typeof v === 'string') {
        const p = JSON.parse(v);
        return isPlainObject(p) ? p : {};
      }
      if (isPlainObject(v)) return v;
      return {};
    } catch (e) { return {}; }
  }
  function canonicalEqual(a, b) {
    const canon = (v) => {
      if (Array.isArray(v)) return v.map(canon);
      if (isPlainObject(v)) {
        const out = {};
        Object.keys(v).sort().forEach((k) => { out[k] = canon(v[k]); });
        return out;
      }
      return v;
    };
    try { return JSON.stringify(canon(a)) === JSON.stringify(canon(b)); }
    catch (e) { return a === b; }
  }
  function diffAuditRows(before, after) {
    try {
      const bObj = toRecord(before), aObj = toRecord(after);
      const keys = Array.from(new Set([...Object.keys(bObj), ...Object.keys(aObj)]));
      const rows = [];
      for (const key of keys) {
        if (isHiddenKey(key)) continue;
        const bv = bObj[key], av = aObj[key];
        const sample = bv !== undefined ? bv : av;
        if (isPlainObject(sample) && !isReferenceObject(sample)) {
          const bvO = isPlainObject(bv) ? bv : {}, avO = isPlainObject(av) ? av : {};
          const subs = Array.from(new Set([...Object.keys(bvO), ...Object.keys(avO)]));
          for (const sk of subs) {
            if (isHiddenKey(sk)) continue;
            if (canonicalEqual(bvO[sk], avO[sk])) continue;
            rows.push({ key: key + '.' + sk, label: labelFor(sk), before: formatDiffValue(sk, bvO[sk], key), after: formatDiffValue(sk, avO[sk], key) });
          }
          continue;
        }
        if (canonicalEqual(bv, av)) continue;
        rows.push({ key, label: labelFor(key), before: formatDiffValue(key, bv), after: formatDiffValue(key, av) });
      }
      return rows;
    } catch (e) { return []; }
  }
  const DIFF_ROWS_COLLAPSED = 8;

  // ============================== AUDIT TAB ==============================
  const au = {
    items: [], page: 1, size: 10, detail: null, showAllDiff: false, timer: null,
    resourceEl: $id('au_resource'), bookingEl: $id('au_booking'), actorEl: $id('au_actor'),
    actionEl: $id('au_action'), rtypeEl: $id('au_rtype'), outcomeEl: $id('au_outcome'),
    fromEl: $id('au_from'), toEl: $id('au_to'),
    rowsEl: $id('au_rows'), pagerEl: $id('au_pager'), errEl: $id('au_error'),
  };
  au.actionEl.innerHTML = '<option value="">' + esc(L('audit.action')) + '</option>' +
    AUDIT_ACTIONS.map((a) => '<option value="' + esc(a) + '">' + esc(actionLabel(a)) + '</option>').join('');
  au.rtypeEl.innerHTML = '<option value="">' + esc(L('audit.resourceType')) + '</option>' +
    AUDIT_RESOURCE_TYPES.map((r) => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join('');

  async function auLoad(p, ps) {
    if (p) au.page = p;
    if (ps) au.size = ps;
    const q = new URLSearchParams({ page: String(au.page), page_size: String(au.size) });
    const put = (k, v) => { v = (v || '').trim(); if (v) q.set(k, v); };
    put('resource_id', au.resourceEl.value);
    put('booking_id', au.bookingEl.value);
    put('actor_id', au.actorEl.value);
    if (au.actionEl.value) q.set('action', au.actionEl.value);
    if (au.rtypeEl.value) q.set('resource_type', au.rtypeEl.value);
    if (au.outcomeEl.value) q.set('outcome', au.outcomeEl.value);
    if (au.fromEl.value) q.set('from', au.fromEl.value);
    if (au.toEl.value) q.set('to', au.toEl.value);
    try {
      const data = await Api.get('/admin/audit-logs?' + q);
      au.errEl.innerHTML = '';
      au.items = data.items;
      auRender();
      CP.renderPagination(au.pagerEl, data.meta, auLoad);
    } catch (e) { showErr(au.errEl, e); }
  }

  function auRender() {
    if (!au.items.length) { au.rowsEl.innerHTML = emptyRow(7, L('common.noData')); return; }
    au.rowsEl.innerHTML = au.items.map((r) => {
      const res = '<div class="flex flex-col"><span>' + esc(r.resource_type) + '</span>' +
        (r.resource_id ? '<span class="inline-flex items-center text-xs text-[var(--text-2)]">' + esc(String(r.resource_id).slice(0, 8)) + copyBtn(r.resource_id) + '</span>' : '') + '</div>';
      const bk = r.booking_id
        ? '<span class="inline-flex items-center">' + esc(r.booking_id) + copyBtn(r.booking_id) + '</span>' : '-';
      const actor = '<div class="flex flex-col"><span>' + esc(r.actor_role || '-') + '</span>' +
        (r.actor_id ? '<span class="truncate text-xs text-[var(--text-2)]">' + esc(r.actor_id) + '</span>' : '') + '</div>';
      return '<tr data-id="' + esc(r.id) + '">' +
        '<td>' + esc(fmt.datetime(r.created_at)) + '</td>' +
        '<td><span class="block truncate">' + esc(actionLabel(r.action)) + '</span></td>' +
        '<td>' + res + '</td>' +
        '<td>' + bk + '</td>' +
        '<td>' + actor + '</td>' +
        '<td>' + colorTag(r.outcome === 'success' ? 'green' : 'red', L('audit.outcome_' + r.outcome), false) + '</td>' +
        '<td class="text-right"><button type="button" class="ant-btn ant-btn-link" data-act="detail" aria-label="detail-' +
        esc(r.id) + '">' + esc(L('audit.viewDetail')) + '</button></td>' +
        '</tr>';
    }).join('');
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  const auReload1 = debounce(() => auLoad(1), 400);
  [au.resourceEl, au.bookingEl, au.actorEl].forEach((el) => el.addEventListener('input', auReload1));
  [au.actionEl, au.rtypeEl, au.outcomeEl].forEach((el) => el.addEventListener('change', () => auLoad(1)));
  [au.fromEl, au.toEl].forEach((el) => el.addEventListener('change', () => auLoad(1)));

  au.rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="detail"]');
    if (!btn) return;
    const row = au.items.find((x) => x.id === btn.closest('tr').dataset.id);
    if (row) auOpenDetail(row);
  });

  function auOpenDetail(row) {
    au.detail = row;
    au.showAllDiff = false;
    auRenderDetail();
    CP.modal.open('au_modal');
  }
  $id('au_modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="more"]')) {
      au.showAllDiff = true;
      auRenderDetail();
    }
  });

  function auRenderDetail() {
    const d = au.detail;
    const body = $id('au_d_body');
    if (!d) { body.innerHTML = ''; return; }
    const rows = diffAuditRows(d.before_json, d.after_json);
    const visible = au.showAllDiff ? rows : rows.slice(0, DIFF_ROWS_COLLAPSED);
    let h = '<div class="flex flex-col gap-4">';
    if (d.error_message) {
      h += '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') + '</span>' +
        '<div class="flex-1">' + esc(translatedErrorMessage(d.error_message)) + '</div></div>';
    }
    if (!rows.length) {
      h += '<span class="text-[var(--text-2)]">' + esc(L('audit.noChanges')) + '</span>';
    } else {
      h += '<div class="ant-table-wrap"><table class="ant-table ant-table-sm"><thead><tr>' +
        '<th style="width:180px">' + esc(L('audit.field')) + '</th>' +
        '<th>' + esc(L('audit.before')) + '</th>' +
        '<th>' + esc(L('audit.after')) + '</th></tr></thead><tbody>' +
        visible.map((r) => '<tr><td>' + esc(r.label) + '</td><td>' + esc(r.before) + '</td><td>' + esc(r.after) + '</td></tr>').join('') +
        '</tbody></table></div>';
      if (!au.showAllDiff && rows.length > DIFF_ROWS_COLLAPSED) {
        h += '<div><button type="button" class="ant-btn ant-btn-link" data-act="more">' + esc(L('audit.showMore')) + '</button></div>';
      }
    }
    if (d.ip || d.user_agent) {
      h += '<span class="text-xs text-[var(--text-2)]">' + esc([d.ip, d.user_agent].filter(Boolean).join(' · ')) + '</span>';
    }
    h += '<span class="inline-flex items-center text-xs text-[var(--text-2)]">ID: ' + esc(d.id) + copyBtn(d.id) + '</span>';
    body.innerHTML = h + '</div>';
  }

  // ============================== BATCH TAB ==============================
  const JOB_NAMES = ['closeDay', 'sweepExpiredHolds', 'sendTicketEmails', 'cleanup'];
  const JOB_COLOR = { running: 'blue', success: 'green', failed: 'red', skipped: 'default', stopped: 'orange' };
  const bj = {
    items: [], page: 1, size: 10, running: null,
    searchEl: $id('bj_search'),
    rowsEl: $id('bj_rows'), pagerEl: $id('bj_pager'), errEl: $id('bj_error'), runsEl: $id('bj_runs'),
  };

  async function bjLoad(p, ps) {
    if (p) bj.page = p;
    if (ps) bj.size = ps;
    const q = new URLSearchParams({ page: String(bj.page), page_size: String(bj.size) });
    const s = bj.searchEl.value.trim();
    if (s) q.set('search', s);
    try {
      const data = await Api.get('/admin/batch/jobs?' + q);
      bj.errEl.innerHTML = '';
      bj.items = data.items;
      bjRender();
      CP.renderPagination(bj.pagerEl, data.meta, bjLoad);
    } catch (e) { showErr(bj.errEl, e); }
  }

  function bjRender() {
    if (!bj.items.length) { bj.rowsEl.innerHTML = emptyRow(8, L('common.noData')); return; }
    bj.rowsEl.innerHTML = bj.items.map((r) =>
      '<tr><td>' + esc(r.job_name) + '</td>' +
      '<td>' + colorTag(JOB_COLOR[r.status] || 'default', tag('batch.status_' + r.status, r.status), false) + '</td>' +
      '<td>' + esc(tag('batch.triggeredBy_' + r.triggered_by, r.triggered_by)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(fmt.number(r.processed_rows)) + '</td>' +
      '<td class="text-right tabular-nums">' + esc(fmt.number(r.skipped_rows)) + '</td>' +
      '<td>' + esc(fmt.datetime(r.started_at)) + '</td>' +
      '<td>' + esc(fmt.datetime(r.finished_at)) + '</td>' +
      '<td><span class="block truncate">' + esc(r.error_message || '-') + '</span></td></tr>'
    ).join('');
  }

  bj.runsEl.innerHTML = JOB_NAMES.map((n) =>
    '<button type="button" class="ant-btn" data-run="' + esc(n) + '">' +
    '<span class="anticon">' + icon('PlayCircle') + '</span>' + esc(tp('batch.runJob', { name: n })) + '</button>'
  ).join('');

  bj.runsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-run]');
    if (!btn || btn.hasAttribute('disabled') || bj.running) return;
    const name = btn.dataset.run;
    const ok = await CP.confirm({
      title: tp('batch.runConfirmTitle', { name }),
      content: L('batch.runConfirmBody'),
      okText: L('batch.runAction'),
      cancelText: L('common.cancel'),
      danger: false,
    });
    if (!ok) return;
    bj.running = name;
    syncRunButtons();
    try {
      await Api.post('/admin/batch/jobs/' + name + '/run', {});
      toast('success', tp('batch.runStarted', { name }));
      bjLoad();
    } catch (err2) { err(err2); }
    bj.running = null;
    syncRunButtons();
  });
  function syncRunButtons() {
    bj.runsEl.querySelectorAll('[data-run]').forEach((b) => {
      if (bj.running === b.dataset.run) b.setAttribute('disabled', '');
      else b.removeAttribute('disabled');
    });
  }

  bj.searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') bjLoad(1); });
  $id('bj_search_btn').addEventListener('click', () => bjLoad(1));

  // A running job gets polled so results appear without a manual refresh.
  setInterval(() => { bjLoad(); }, 10_000);

  // ============================== TABS ==============================
  const loaded = {};
  function loadTab(key) {
    if (loaded[key]) return;
    loaded[key] = true;
    if (key === 'auditLogs') auLoad();
    else if (key === 'batchJobs') bjLoad();
  }
  $id('mn_tabs').addEventListener('cp:tab', (e) => loadTab(e.detail.key));
  loadTab('auditLogs');
})();
