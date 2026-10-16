/* Promotions page (Razor port of React PromotionPage + discounts/campaigns/articles tabs). */
(function () {
  'use strict';
  const root = document.getElementById('cp-promotions');
  if (!root) return;

  const L = (k) => (window.CP_LANG && window.CP_LANG[k]) || k;
  const tp = (k, vars) => Object.entries(vars || {}).reduce((s, p) => s.split('{{' + p[0] + '}}').join(String(p[1])), L(k));
  const tag = (k, fb) => { const v = L(k); return v === k ? fb : v; };
  const fmt = CP.fmt, esc = CP.esc, icon = CP.icon, toast = CP.toast;
  const $id = (id) => document.getElementById(id);
  const isEn = document.documentElement.lang === 'en';

  // antd defaultValidateMessages (locale vi_VN / en_US).
  const sMin = (label, min) => isEn ? label + ' must be at least ' + min + ' characters' : 'Độ dài tối thiểu trường ' + label + ' là ' + min + ' ký tự';
  const sMax = (label, max) => isEn ? label + ' must be up to ' + max + ' characters' : 'Độ dài tối đa trường ' + label + ' là ' + max + ' ký tự';
  const nMin = (label, min) => isEn ? label + ' must be minimum ' + min : label + ' phải lớn hơn hoặc bằng ' + min;
  const nMax = (label, max) => isEn ? label + ' must be maximum ' + max : label + ' phải nhỏ hơn hoặc bằng ' + max;

  const SIMPLE_SVG = '<svg width="64" height="41" viewBox="0 0 64 41" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g transform="translate(0 1)" fill="none" fill-rule="evenodd">' +
    '<ellipse fill="#272727" cx="32" cy="33" rx="32" ry="7"/>' +
    '<g fill-rule="nonzero" stroke="#373737">' +
    '<path d="M55 12.76L44.854 1.258C44.367.474 43.656 0 42.907 0H21.093c-.749 0-1.46.474-1.947 1.257L9 12.761V22h46v-9.24z"/>' +
    '<path d="M41.613 15.931c0-1.605.994-2.93 2.227-2.931H55v18.137C55 33.26 53.68 35 52.05 35h-40.1C10.32 35 9 33.259 9 31.137V13h11.16c1.233 0 2.227 1.323 2.227 2.928v.022c0 1.605 1.005 2.901 2.237 2.901h14.752c1.232 0 2.237-1.308 2.237-2.913v-.007z" fill="#1d1d1d"/>' +
    '</g></g></svg>';
  const emptyRow = (cols, text) => '<tr class="ant-table-empty"><td colspan="' + cols + '">' +
    '<div class="ant-empty" style="padding:8px 0">' + SIMPLE_SVG + '<div>' + esc(text) + '</div></div></td></tr>';
  const standaloneEmpty = (text) => '<div class="ant-empty" style="width:100%;padding:16px 0">' +
    SIMPLE_SVG + '<div>' + esc(text) + '</div></div>';

  const err = (e, m) => toast('error', (e && e.message) || m || L('common.somethingWrong'));
  function showErr(el, e) {
    el.innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') +
      '</span><div class="flex-1">' + esc((e && e.message) || L('common.somethingWrong')) + '</div></div>';
  }

  function fieldErr(input, explain, msg) {
    if (typeof explain === 'string') explain = $id(explain);
    if (explain) { explain.textContent = msg || ''; explain.style.display = msg ? '' : 'none'; }
    if (input) input.style.borderColor = msg ? '#D22F27' : '';
  }

  const colorTag = (color, text, bordered) =>
    '<span class="ant-tag' + (color && color !== 'default' ? ' ant-tag-' + color : '') + '"' +
    (bordered === false ? ' style="border-color:transparent"' : '') + '>' + esc(text) + '</span>';

  function iconBtn(act, id, iconName, title, danger, disabled) {
    return '<button type="button" class="ant-btn ant-btn-text ant-btn-icon' + (danger ? ' ant-btn-dangerous' : '') + '"' +
      ' data-act="' + act + '" data-id="' + esc(id) + '" title="' + esc(title) + '" aria-label="' + act + '-' + esc(id) + '"' +
      (disabled ? ' disabled' : '') + '><span class="anticon">' + icon(iconName) + '</span></button>';
  }

  function toLocalInput(v) {
    if (!v) return '';
    const d = fmt.apiDate(v), t = fmt.time(v);
    return d ? d + 'T' + t : '';
  }
  function toISO(v) {
    v = (v || '').trim();
    if (!v) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  function numVal(el, fallback) {
    const s = (el.value || '').trim();
    if (s === '') return fallback;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  // ============================== DISCOUNTS ==============================
  const dc = {
    items: [], page: 1, size: 10, pendingId: null, editing: null, saving: false,
    searchEl: $id('dc_search'), activeEl: $id('dc_active'),
    rowsEl: $id('dc_rows'), pagerEl: $id('dc_pager'), errEl: $id('dc_error'),
  };

  async function dcLoad(p, ps) {
    if (p) dc.page = p;
    if (ps) dc.size = ps;
    const q = new URLSearchParams({ page: String(dc.page), page_size: String(dc.size) });
    const s = dc.searchEl.value.trim();
    if (s) q.set('search', s);
    if (dc.activeEl.value !== 'all') q.set('active', dc.activeEl.value === 'active' ? 'true' : 'false');
    try {
      const data = await Api.get('/admin/discounts?' + q);
      dc.errEl.innerHTML = '';
      dc.items = data.items;
      dcRender();
      CP.renderPagination(dc.pagerEl, data.meta, dcLoad);
    } catch (e) { showErr(dc.errEl, e); }
  }

  function dcRuleHtml(r) {
    const main = r.kind === 'percent'
      ? tp('discount.rulePercent', { value: r.value })
      : tp('discount.ruleAmount', { value: fmt.money(r.value) });
    let sub = '';
    if (r.kind === 'percent' && r.max_discount) {
      sub += '<div class="text-xs text-[var(--text-2)]">' + esc(tp('discount.capUpTo', { value: fmt.money(r.max_discount) })) + '</div>';
    }
    if (r.min_order > 0) {
      sub += '<div class="text-xs text-[var(--text-2)]">' + esc(tp('discount.minFrom', { value: fmt.money(r.min_order) })) + '</div>';
    }
    return '<div class="flex flex-col"><span>' + esc(main) + '</span>' + sub + '</div>';
  }

  function dcRender() {
    if (!dc.items.length) { dc.rowsEl.innerHTML = emptyRow(6, L('common.noData')); return; }
    dc.rowsEl.innerHTML = dc.items.map((r) => {
      const exhausted = r.max_uses != null && r.used_count >= r.max_uses;
      const usage = r.max_uses == null
        ? tp('discount.usedUnlimited', { used: r.used_count })
        : r.used_count + '/' + r.max_uses;
      const win = (r.starts_at || r.ends_at)
        ? '<span class="text-xs">' + esc((r.starts_at ? fmt.datetime(r.starts_at) : '—') + ' → ' + (r.ends_at ? fmt.datetime(r.ends_at) : '—')) + '</span>'
        : '<span class="text-xs text-[var(--text-2)]">' + esc(L('discount.windowAlways')) + '</span>';
      const busy = dc.pendingId === r.id;
      return '<tr data-id="' + esc(r.id) + '">' +
        '<td><div class="flex flex-col"><strong class="font-mono">' + esc(r.code) + '</strong>' +
        (r.description ? '<span class="text-xs text-[var(--text-2)]">' + esc(r.description) + '</span>' : '') + '</div></td>' +
        '<td>' + dcRuleHtml(r) + '</td>' +
        '<td class="text-right"><div class="flex flex-col items-end"><span class="tabular-nums">' + esc(usage) + '</span>' +
        (exhausted ? colorTag('warning', L('discount.exhausted')) : '') + '</div></td>' +
        '<td>' + win + '</td>' +
        '<td>' + colorTag(r.active ? 'green' : 'default', L(r.active ? 'discount.enabled' : 'discount.disabled'), false) + '</td>' +
        '<td><div class="flex items-center gap-1">' +
        iconBtn('toggle', r.id, r.active ? 'Stop' : 'CheckCircle', L(r.active ? 'discount.markOff' : 'discount.markOn'), false, busy) +
        iconBtn('edit', r.id, 'Edit', L('common.edit'), false, false) +
        iconBtn('del', r.id, 'Delete', L('common.delete'), true, busy) +
        '</div></td></tr>';
    }).join('');
  }

  dc.rowsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.hasAttribute('disabled')) return;
    const row = dc.items.find((x) => x.id === btn.dataset.id);
    if (!row) return;
    if (btn.dataset.act === 'edit') { dcOpenModal(row); return; }
    if (btn.dataset.act === 'toggle') {
      const ok = await CP.confirm({ title: L(row.active ? 'discount.offConfirm' : 'discount.onConfirm'), okText: L('common.confirm'), danger: false });
      if (!ok) return;
      dc.pendingId = row.id; dcRender();
      try {
        await Api.patch('/admin/discounts/' + row.id, { active: !row.active });
        toast('success', L('common.updateSuccess'));
      } catch (err2) { err(err2); }
      dc.pendingId = null;
      dcLoad();
      return;
    }
    if (btn.dataset.act === 'del') {
      const ok = await CP.confirm({ title: L('discount.deleteConfirm'), content: L('discount.deleteHint'), okText: L('common.delete') });
      if (!ok) return;
      dc.pendingId = row.id; dcRender();
      try {
        await Api.del('/admin/discounts/' + row.id);
        toast('success', L('discount.deleteSuccess'));
      } catch (err2) { err(err2); }
      dc.pendingId = null;
      dcLoad();
    }
  });

  // ---- discount form modal ----
  const dcF = {
    code: $id('dc_f_code'), kind: $id('dc_f_kind'), value: $id('dc_f_value'), max: $id('dc_f_max'),
    min: $id('dc_f_min'), maxuses: $id('dc_f_maxuses'), from: $id('dc_f_from'), to: $id('dc_f_to'), desc: $id('dc_f_desc'),
  };
  function dcClearErrors() {
    ['code', 'value', 'max', 'min', 'maxuses', 'desc'].forEach((k) => fieldErr(dcF[k], 'dc_e_' + k, ''));
    fieldErr(null, 'dc_e_window', '');
  }
  function dcSyncKind() {
    const isP = dcF.kind.value === 'percent';
    $id('dc_lb_value').textContent = L(isP ? 'discount.valuePercent' : 'discount.valueAmount');
    $id('dc_w_max').style.display = isP ? '' : 'none';
  }
  function dcOpenModal(row) {
    dc.editing = row || null;
    $id('dc_modal_title').textContent = L(row ? 'discount.editTitle' : 'discount.createTitle');
    dcF.code.value = row ? row.code : '';
    dcF.code.disabled = !!row;
    $id('dc_extra_code').textContent = L(row ? 'discount.codeLocked' : 'discount.codeHint');
    dcF.kind.value = row ? row.kind : 'percent';
    dcF.kind.disabled = !!row;
    $id('dc_extra_kind').style.display = row ? '' : 'none';
    dcF.value.value = row ? row.value : 10;
    dcF.max.value = row && row.max_discount != null ? row.max_discount : '';
    dcF.min.value = row ? row.min_order : 0;
    dcF.maxuses.value = row && row.max_uses != null ? row.max_uses : '';
    dcF.from.value = row ? toLocalInput(row.starts_at) : '';
    dcF.to.value = row ? toLocalInput(row.ends_at) : '';
    dcF.desc.value = row ? (row.description || '') : '';
    dcClearErrors();
    dcSyncKind();
    CP.modal.open('dc_modal');
  }
  dcF.kind.addEventListener('change', () => {
    dcSyncKind();
    // antd re-validates dependent fields on change once they show errors.
    if ($id('dc_e_value').style.display !== 'none' || $id('dc_e_max').style.display !== 'none') dcValidate();
  });

  function dcValidate() {
    const creating = !dc.editing;
    const isP = dcF.kind.value === 'percent';
    let ok = true;
    const fail = (input, key, msg) => { fieldErr(input, 'dc_e_' + key, msg); if (msg) ok = false; };
    if (creating) {
      const code = dcF.code.value.trim();
      if (!code) fail(dcF.code, 'code', L('common.requiredField'));
      else if (code.length < 3) fail(dcF.code, 'code', sMin(L('discount.code'), 3));
      else if (code.length > 32) fail(dcF.code, 'code', sMax(L('discount.code'), 32));
      else fail(dcF.code, 'code', '');
    } else fail(dcF.code, 'code', '');
    if (!dcF.kind.value) fail(dcF.kind, 'code', L('common.requiredField'));
    const vLabel = L(isP ? 'discount.valuePercent' : 'discount.valueAmount');
    const v = numVal(dcF.value, undefined);
    if (v === undefined || Number.isNaN(v)) fail(dcF.value, 'value', L('common.requiredField'));
    else if (v < 1) fail(dcF.value, 'value', nMin(vLabel, 1));
    else if (isP && v > 100) fail(dcF.value, 'value', nMax(vLabel, 100));
    else fail(dcF.value, 'value', '');
    if (isP) {
      const m = numVal(dcF.max, undefined);
      if (m !== undefined && !Number.isNaN(m) && m < 1) fail(dcF.max, 'max', nMin(L('discount.maxDiscount'), 1));
      else fail(dcF.max, 'max', m !== undefined && Number.isNaN(m) ? nMin(L('discount.maxDiscount'), 1) : '');
      if (m !== undefined && Number.isNaN(m)) ok = false;
    } else fail(dcF.max, 'max', '');
    const mo = numVal(dcF.min, undefined);
    if (mo === undefined || Number.isNaN(mo)) fail(dcF.min, 'min', L('common.requiredField'));
    else if (mo < 0) fail(dcF.min, 'min', nMin(L('discount.minOrder'), 0));
    else fail(dcF.min, 'min', '');
    const mu = numVal(dcF.maxuses, undefined);
    if (mu !== undefined && (Number.isNaN(mu) || mu < 1)) fail(dcF.maxuses, 'maxuses', nMin(L('discount.maxUses'), 1));
    else fail(dcF.maxuses, 'maxuses', '');
    const desc = dcF.desc.value.trim();
    if (desc.length > 2000) fail(dcF.desc, 'desc', sMax(L('discount.description'), 2000));
    else fail(dcF.desc, 'desc', '');
    return ok;
  }

  async function dcSave() {
    if (!dc.saving && !dcValidate()) return;
    if (dc.saving) return;
    const isP = dcF.kind.value === 'percent';
    const creating = !dc.editing;
    const maxRaw = numVal(dcF.max, undefined);
    const muRaw = numVal(dcF.maxuses, undefined);
    const shared = {
      description: dcF.desc.value.trim(),
      value: numVal(dcF.value, 0),
      max_discount: isP ? (maxRaw === undefined || Number.isNaN(maxRaw) ? undefined : maxRaw) : undefined,
      min_order: numVal(dcF.min, 0),
      starts_at: toISO(dcF.from.value),
      ends_at: toISO(dcF.to.value),
      max_uses: muRaw === undefined || Number.isNaN(muRaw) ? undefined : muRaw,
      // Not editable here: a new code starts inactive; toggling is the table's own switch.
      active: creating ? false : dc.editing.active,
    };
    const payload = creating
      ? Object.assign({ code: dcF.code.value.trim().toUpperCase(), kind: dcF.kind.value }, shared)
      : shared;
    dc.saving = true;
    $id('dc_save').disabled = true;
    try {
      if (creating) {
        await Api.post('/admin/discounts', payload);
        toast('success', L('discount.createSuccess'));
      } else {
        await Api.patch('/admin/discounts/' + dc.editing.id, payload);
        toast('success', L('common.updateSuccess'));
      }
      CP.modal.close('dc_modal');
      dc.editing = null;
      dcLoad();
    } catch (e) {
      const map = { code: ['code'], value: ['value'], max_discount: ['max'], min_order: ['min'], max_uses: ['maxuses'], description: ['desc'], ends_at: ['window'], starts_at: ['window'] };
      let mapped = false;
      if (e && e.details) {
        Object.keys(e.details).forEach((k) => {
          const t = map[k];
          if (t) {
            const key = t[0];
            const input = key === 'window' ? null : dcF[key];
            fieldErr(input, 'dc_e_' + key, String(e.details[k]));
            mapped = true;
          }
        });
      }
      if (!mapped) err(e);
    } finally {
      dc.saving = false;
      $id('dc_save').disabled = false;
    }
  }

  $id('dc_new').addEventListener('click', () => dcOpenModal(null));
  $id('dc_save').addEventListener('click', dcSave);
  dc.searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') dcLoad(1); });
  $id('dc_search_btn').addEventListener('click', () => dcLoad(1));
  dc.activeEl.addEventListener('change', () => dcLoad(1));
  $id('dc_warn').querySelector('[data-close-alert]').addEventListener('click', () => $id('dc_warn').remove());

  // ============================== CAMPAIGNS ==============================
  const cm = {
    items: [], page: 1, size: 10, pendingId: null, editing: null, saving: false, linksFor: null,
    searchEl: $id('cm_search'), activeEl: $id('cm_active'),
    rowsEl: $id('cm_rows'), pagerEl: $id('cm_pager'), errEl: $id('cm_error'),
  };

  async function cmLoad(p, ps) {
    if (p) cm.page = p;
    if (ps) cm.size = ps;
    const q = new URLSearchParams({ page: String(cm.page), page_size: String(cm.size) });
    const s = cm.searchEl.value.trim();
    if (s) q.set('search', s);
    if (cm.activeEl.value !== 'all') q.set('active', cm.activeEl.value === 'active' ? 'true' : 'false');
    try {
      const data = await Api.get('/admin/campaigns?' + q);
      cm.errEl.innerHTML = '';
      cm.items = data.items;
      cmRender();
      CP.renderPagination(cm.pagerEl, data.meta, cmLoad);
    } catch (e) { showErr(cm.errEl, e); }
  }

  function cmRender() {
    if (!cm.items.length) { cm.rowsEl.innerHTML = emptyRow(5, L('common.noData')); return; }
    cm.rowsEl.innerHTML = cm.items.map((r) => {
      const busy = cm.pendingId === r.id;
      return '<tr data-id="' + esc(r.id) + '">' +
        '<td><div class="flex flex-col"><strong>' + esc(r.name) + '</strong>' +
        (r.description ? '<span class="text-xs text-[var(--text-2)]">' + esc(r.description) + '</span>' : '') + '</div></td>' +
        '<td><span class="text-xs">' + esc(fmt.datetime(r.starts_at) + ' → ' + fmt.datetime(r.ends_at)) + '</span></td>' +
        '<td class="text-right tabular-nums">' + esc(String(r.per_user_limit)) + '</td>' +
        '<td>' + colorTag(r.active ? 'green' : 'default', L(r.active ? 'campaign.enabled' : 'campaign.disabled'), false) + '</td>' +
        '<td><div class="flex items-center gap-1">' +
        iconBtn('toggle', r.id, r.active ? 'Stop' : 'CheckCircle', L(r.active ? 'campaign.markOff' : 'campaign.markOn'), false, busy) +
        iconBtn('links', r.id, 'Link', L('campaign.linksTitle'), false, false) +
        iconBtn('edit', r.id, 'Edit', L('common.edit'), false, false) +
        iconBtn('del', r.id, 'Delete', L('common.delete'), true, busy) +
        '</div></td></tr>';
    }).join('');
  }

  cm.rowsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.hasAttribute('disabled')) return;
    const row = cm.items.find((x) => x.id === btn.dataset.id);
    if (!row) return;
    if (btn.dataset.act === 'edit') { cmOpenModal(row); return; }
    if (btn.dataset.act === 'links') { cmOpenLinks(row.id); return; }
    if (btn.dataset.act === 'toggle') {
      const ok = await CP.confirm({ title: L(row.active ? 'campaign.offConfirm' : 'campaign.onConfirm'), okText: L('common.confirm'), danger: false });
      if (!ok) return;
      cm.pendingId = row.id; cmRender();
      try {
        await Api.patch('/admin/campaigns/' + row.id, { active: !row.active });
        toast('success', L('common.updateSuccess'));
      } catch (err2) { err(err2); }
      cm.pendingId = null;
      cmLoad();
      return;
    }
    if (btn.dataset.act === 'del') {
      const ok = await CP.confirm({ title: L('campaign.deleteConfirm'), content: L('campaign.deleteHint'), okText: L('common.delete') });
      if (!ok) return;
      cm.pendingId = row.id; cmRender();
      try {
        await Api.del('/admin/campaigns/' + row.id);
        toast('success', L('campaign.deleteSuccess'));
      } catch (err2) { err(err2); }
      cm.pendingId = null;
      cmLoad();
    }
  });

  // ---- campaign form modal ----
  const cmF = { name: $id('cm_f_name'), from: $id('cm_f_from'), to: $id('cm_f_to'), limit: $id('cm_f_limit'), desc: $id('cm_f_desc') };
  function cmClearErrors() {
    fieldErr(cmF.name, 'cm_e_name', '');
    fieldErr(null, 'cm_e_window', '');
    fieldErr(cmF.limit, 'cm_e_limit', '');
    fieldErr(cmF.desc, 'cm_e_desc', '');
  }
  function cmOpenModal(row) {
    cm.editing = row || null;
    $id('cm_modal_title').textContent = L(row ? 'campaign.editTitle' : 'campaign.createTitle');
    cmF.name.value = row ? row.name : '';
    cmF.from.value = row ? toLocalInput(row.starts_at) : '';
    cmF.to.value = row ? toLocalInput(row.ends_at) : '';
    cmF.limit.value = row ? row.per_user_limit : 1;
    cmF.desc.value = row ? (row.description || '') : '';
    cmClearErrors();
    CP.modal.open('cm_modal');
  }
  function cmValidate() {
    let ok = true;
    const name = cmF.name.value.trim();
    if (!name) { fieldErr(cmF.name, 'cm_e_name', L('common.requiredField')); ok = false; }
    else if (name.length > 255) { fieldErr(cmF.name, 'cm_e_name', sMax(L('campaign.name'), 255)); ok = false; }
    else fieldErr(cmF.name, 'cm_e_name', '');
    const t0 = toISO(cmF.from.value), t1 = toISO(cmF.to.value);
    if (!t0 || !t1) { fieldErr(null, 'cm_e_window', L('common.requiredField')); ok = false; }
    else fieldErr(null, 'cm_e_window', '');
    const lim = numVal(cmF.limit, undefined);
    if (lim === undefined || Number.isNaN(lim)) { fieldErr(cmF.limit, 'cm_e_limit', L('common.requiredField')); ok = false; }
    else if (lim < 1) { fieldErr(cmF.limit, 'cm_e_limit', nMin(L('campaign.perUserLimit'), 1)); ok = false; }
    else fieldErr(cmF.limit, 'cm_e_limit', '');
    const desc = cmF.desc.value.trim();
    if (desc.length > 2000) { fieldErr(cmF.desc, 'cm_e_desc', sMax(L('campaign.description'), 2000)); ok = false; }
    else fieldErr(cmF.desc, 'cm_e_desc', '');
    return ok;
  }
  async function cmSave() {
    if (cm.saving) return;
    if (!cmValidate()) return;
    const creating = !cm.editing;
    const payload = {
      name: cmF.name.value.trim(),
      description: cmF.desc.value.trim(),
      starts_at: toISO(cmF.from.value),
      ends_at: toISO(cmF.to.value),
      per_user_limit: numVal(cmF.limit, 1),
      active: creating ? false : cm.editing.active,
    };
    cm.saving = true;
    $id('cm_save').disabled = true;
    try {
      if (creating) {
        await Api.post('/admin/campaigns', payload);
        toast('success', L('campaign.createSuccess'));
      } else {
        await Api.patch('/admin/campaigns/' + cm.editing.id, payload);
        toast('success', L('common.updateSuccess'));
      }
      CP.modal.close('cm_modal');
      cm.editing = null;
      cmLoad();
    } catch (e) {
      const map = { name: 'cm_e_name', description: 'cm_e_desc', per_user_limit: 'cm_e_limit', ends_at: 'cm_e_window', starts_at: 'cm_e_window' };
      const inputs = { name: cmF.name, description: cmF.desc, per_user_limit: cmF.limit };
      let mapped = false;
      if (e && e.details) {
        Object.keys(e.details).forEach((k) => {
          if (map[k]) { fieldErr(inputs[k] || null, map[k], String(e.details[k])); mapped = true; }
        });
      }
      if (!mapped) err(e);
    } finally {
      cm.saving = false;
      $id('cm_save').disabled = false;
    }
  }

  $id('cm_new').addEventListener('click', () => cmOpenModal(null));
  $id('cm_save').addEventListener('click', cmSave);
  cm.searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') cmLoad(1); });
  $id('cm_search_btn').addEventListener('click', () => cmLoad(1));
  cm.activeEl.addEventListener('change', () => cmLoad(1));
  $id('cm_warn').querySelector('[data-close-alert]').addEventListener('click', () => $id('cm_warn').remove());

  // ---- campaign links modal ----
  const lk = { id: null, detail: null, busy: false };
  const lkPick = { code: $id('cm_lk_code_pick'), combo: $id('cm_lk_combo_pick'), article: $id('cm_lk_article_pick') };

  function linkTag(text, kind, id) {
    return '<span class="ant-tag">' + esc(text) +
      '<span class="ant-tag-x" data-unlink-kind="' + kind + '" data-unlink-id="' + esc(id) + '" title="' + esc(L('common.delete')) + '">' +
      '<span class="anticon">' + icon('Close') + '</span></span></span>';
  }

  async function cmOpenLinks(id) {
    lk.id = id;
    lkPick.code.value = ''; lkPick.combo.value = ''; lkPick.article.value = '';
    $id('cm_lk_codes').innerHTML = '';
    $id('cm_lk_combos').innerHTML = '';
    $id('cm_lk_articles').innerHTML = '';
    CP.modal.open('cm_links');
    await cmLinksReload();
  }

  async function cmLinksReload() {
    if (!lk.id) return;
    try {
      const [detail, codes, combos, articles] = await Promise.all([
        Api.get('/admin/campaigns/' + lk.id),
        Api.get('/admin/discounts?page=1&page_size=100&active=true'),
        Api.get('/admin/concessions?page=1&page_size=100&active=true'),
        Api.get('/admin/articles?page=1&page_size=100'),
      ]);
      lk.detail = detail;
      const linkedCodes = new Set((detail.discount_codes || []).map((c) => c.id));
      const linkedCombos = new Set((detail.combos || []).map((c) => c.combo_id));
      const linkedArticles = new Set((detail.articles || []).map((a) => a.id));
      $id('cm_lk_codes').innerHTML = (detail.discount_codes || []).length
        ? detail.discount_codes.map((c) => linkTag(c.code, 'discount-codes', c.id)).join('')
        : standaloneEmpty(L('campaign.noneLinked'));
      $id('cm_lk_combos').innerHTML = (detail.combos || []).length
        ? detail.combos.map((c) => linkTag(c.name, 'combos', c.combo_id)).join('')
        : standaloneEmpty(L('campaign.noneLinked'));
      $id('cm_lk_articles').innerHTML = (detail.articles || []).length
        ? detail.articles.map((a) => linkTag(a.title, 'articles', a.id)).join('')
        : standaloneEmpty(L('campaign.noneLinked'));
      fillPick(lkPick.code, L('campaign.pickCode'), (codes.items || []).filter((c) => !linkedCodes.has(c.id)).map((c) => ({ value: c.id, label: c.code })));
      fillPick(lkPick.combo, L('campaign.pickCombo'), (combos.items || []).filter((c) => !linkedCombos.has(c.id)).map((c) => ({ value: c.id, label: c.name + ' (' + fmt.money(c.price) + ')' })));
      fillPick(lkPick.article, L('campaign.pickArticle'), (articles.items || []).filter((a) => !linkedArticles.has(a.id)).map((a) => ({ value: a.id, label: a.title })));
      syncAttachButtons();
    } catch (e) { err(e); }
  }

  function fillPick(sel, placeholder, opts) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">' + esc(placeholder) + '</option>' +
      opts.map((o) => '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>').join('');
    sel.value = opts.some((o) => o.value === cur) ? cur : '';
  }
  function syncAttachButtons() {
    $id('cm_lk_code_add').disabled = !lkPick.code.value;
    $id('cm_lk_combo_add').disabled = !lkPick.combo.value;
    $id('cm_lk_article_add').disabled = !lkPick.article.value;
  }
  Object.values(lkPick).forEach((s) => s.addEventListener('change', syncAttachButtons));

  async function cmAttach(kind, pickEl) {
    const itemId = pickEl.value;
    if (!itemId || !lk.id || lk.busy) return;
    lk.busy = true;
    syncAttachButtons();
    try {
      await Api.post('/admin/campaigns/' + lk.id + '/' + kind + '/' + itemId, {});
      pickEl.value = '';
      await cmLinksReload();
    } catch (e) { err(e); }
    lk.busy = false;
    syncAttachButtons();
  }
  $id('cm_lk_code_add').addEventListener('click', () => cmAttach('discount-codes', lkPick.code));
  $id('cm_lk_combo_add').addEventListener('click', () => cmAttach('combos', lkPick.combo));
  $id('cm_lk_article_add').addEventListener('click', () => cmAttach('articles', lkPick.article));

  $id('cm_links').addEventListener('click', async (e) => {
    const x = e.target.closest('[data-unlink-kind]');
    if (!x || !lk.id) return;
    try {
      await Api.del('/admin/campaigns/' + lk.id + '/' + x.dataset.unlinkKind + '/' + x.dataset.unlinkId);
      await cmLinksReload();
    } catch (err2) { err(err2); }
  });

  // ============================== ARTICLES ==============================
  const ar = {
    items: [], page: 1, size: 10, pendingId: null, editing: null, saving: false, uploading: false,
    searchEl: $id('ar_search'), typeEl: $id('ar_type'),
    rowsEl: $id('ar_rows'), pagerEl: $id('ar_pager'), errEl: $id('ar_error'),
  };
  const ARTICLE_COLOR = { published: 'success', hidden: 'default', draft: 'warning' };
  const articleStatusLabel = (s) => tag('article.status' + s[0].toUpperCase() + s.slice(1), s);

  async function arLoad(p, ps) {
    if (p) ar.page = p;
    if (ps) ar.size = ps;
    const q = new URLSearchParams({ page: String(ar.page), page_size: String(ar.size) });
    const s = ar.searchEl.value.trim();
    if (s) q.set('search', s);
    if (ar.typeEl.value !== 'all') q.set('type', ar.typeEl.value);
    try {
      const data = await Api.get('/admin/articles?' + q);
      ar.errEl.innerHTML = '';
      ar.items = data.items;
      arRender();
      CP.renderPagination(ar.pagerEl, data.meta, arLoad);
    } catch (e) { showErr(ar.errEl, e); }
  }

  function arRender() {
    if (!ar.items.length) { ar.rowsEl.innerHTML = emptyRow(5, L('common.noData')); return; }
    ar.rowsEl.innerHTML = ar.items.map((r) => {
      const busy = ar.pendingId === r.id;
      const typeLabel = L(r.type === 'news' ? 'article.typeNews' : 'article.typePromotion');
      return '<tr data-id="' + esc(r.id) + '">' +
        '<td><div class="flex flex-col"><span>' + esc(r.title) + '</span>' +
        '<span class="text-xs text-[var(--text-2)]">/' + esc(r.slug) + ' · ' + esc(typeLabel) + '</span>' +
        (r.summary ? '<span class="text-xs text-[var(--text-2)]">' + esc(r.summary) + '</span>' : '') + '</div></td>' +
        '<td>' + colorTag(ARTICLE_COLOR[r.status] || 'default', articleStatusLabel(r.status)) + '</td>' +
        '<td class="text-right tabular-nums">' + esc(String(r.views)) + '</td>' +
        '<td><span class="text-xs">' + esc(fmt.datetime(r.updated_at)) + '</span></td>' +
        '<td><div class="flex items-center gap-1">' +
        (r.status === 'published'
          ? iconBtn('hide', r.id, 'EyeInvisible', L('article.markHidden'), false, busy)
          : iconBtn('publish', r.id, 'Eye', L('article.markPublished'), false, busy)) +
        iconBtn('edit', r.id, 'Edit', L('common.edit'), false, false) +
        iconBtn('del', r.id, 'Delete', L('common.delete'), true, busy) +
        '</div></td></tr>';
    }).join('');
  }

  ar.rowsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.hasAttribute('disabled')) return;
    const row = ar.items.find((x) => x.id === btn.dataset.id);
    if (!row) return;
    const act = btn.dataset.act;
    if (act === 'edit') { arOpenDrawer(row); return; }
    if (act === 'del') {
      const ok = await CP.confirm({ title: L('article.deleteConfirm'), content: L('article.deleteHint'), okText: L('common.delete') });
      if (!ok) return;
      ar.pendingId = row.id; arRender();
      try {
        await Api.del('/admin/articles/' + row.id);
        toast('success', L('article.deleteSuccess'));
      } catch (err2) { err(err2); }
      ar.pendingId = null;
      arLoad();
      return;
    }
    if (act === 'hide' || act === 'publish') {
      const next = act === 'publish' ? 'published' : 'hidden';
      const ok = await CP.confirm({ title: L(act === 'publish' ? 'article.publishConfirm' : 'article.hideConfirm'), okText: L('common.confirm'), danger: false });
      if (!ok) return;
      ar.pendingId = row.id; arRender();
      try {
        await Api.put('/admin/articles/' + row.id, { status: next });
        toast('success', L(next === 'published' ? 'article.publishedSuccess' : 'article.hiddenSuccess'));
      } catch (err2) { err(err2); }
      ar.pendingId = null;
      arLoad();
    }
  });

  // ---- article drawer ----
  const arMask = $id('ar_d_mask'), arDrawer = $id('ar_drawer');
  const arF = {
    title: $id('ar_f_title'), slug: $id('ar_f_slug'), type: $id('ar_f_type'),
    summary: $id('ar_f_summary'), thumb: $id('ar_f_thumb'), file: $id('ar_thumb_file'),
  };
  let quill = null;
  const POSTER_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
  const POSTER_MAX_BYTES = 5 * 1024 * 1024;

  function slugify(t) {
    return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function quillHtml() {
    if (!quill) return '';
    const html = quill.root.innerHTML;
    return html === '<p><br></p>' ? '' : html;
  }
  function ensureQuill() {
    if (quill || typeof Quill === 'undefined') return;
    quill = new Quill('#ar_f_editor', {
      theme: 'snow',
      placeholder: L('article.contentPlaceholder'),
      modules: {
        toolbar: [
          [{ header: [2, 3, false] }],
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link'],
          ['clean'],
        ],
      },
    });
    quill.root.style.minHeight = '260px';
    quill.on('text-change', () => {
      fieldErr(null, 'ar_e_content', '');
    });
  }
  function arThumbPreview() {
    const url = arF.thumb.value.trim();
    $id('ar_thumb_prev_wrap').style.display = url ? '' : 'none';
    if (url) $id('ar_thumb_prev').src = url;
  }
  function arOpenDrawer(row) {
    ar.editing = row || null;
    $id('ar_d_title').textContent = L(row ? 'article.editTitle' : 'article.createTitle');
    arF.title.value = row ? row.title : '';
    arF.slug.value = row ? row.slug : '';
    arF.type.value = row ? row.type : 'news';
    arF.summary.value = row ? (row.summary || '') : '';
    arF.thumb.value = row ? (row.thumbnail_url || '') : '';
    ensureQuill();
    if (quill) {
      quill.setText('');
      if (row && row.content) quill.clipboard.dangerouslyPasteHTML(row.content);
    }
    ['title', 'summary', 'thumb', 'type'].forEach((k) => fieldErr(arF[k], 'ar_e_' + k, ''));
    fieldErr(null, 'ar_e_content', '');
    arThumbPreview();
    arMask.classList.add('open');
    arDrawer.classList.add('open');
    arDrawer.setAttribute('aria-hidden', 'false');
  }
  function arCloseDrawer() {
    ar.editing = null;
    arMask.classList.remove('open');
    arDrawer.classList.remove('open');
    arDrawer.setAttribute('aria-hidden', 'true');
  }
  arF.title.addEventListener('input', () => {
    if (!ar.editing) arF.slug.value = slugify(arF.title.value);
  });
  arF.thumb.addEventListener('input', arThumbPreview);

  // thumbnail upload (React: Upload beforeUpload guards + mediaApi.uploadPoster)
  $id('ar_thumb_btn').addEventListener('click', () => arF.file.click());
  arF.file.addEventListener('change', async () => {
    const file = arF.file.files && arF.file.files[0];
    arF.file.value = '';
    if (!file || ar.uploading) return;
    if (!POSTER_ACCEPT.includes(file.type)) { err({ message: L('article.thumbnailTypeInvalid') }); return; }
    if (file.size > POSTER_MAX_BYTES) { err({ message: L('article.thumbnailTooLarge') }); return; }
    ar.uploading = true;
    const btn = $id('ar_thumb_btn');
    const old = btn.innerHTML;
    btn.innerHTML = '<span class="ant-spin"></span>';
    try {
      const form = new FormData();
      form.append('file', file);
      const headers = {};
      const t = sessionStorage.getItem('cinema.at');
      if (t) headers['Authorization'] = 'Bearer ' + t;
      const res = await fetch('/api/v1/admin/uploads/poster', { method: 'POST', credentials: 'same-origin', headers, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.code !== undefined && data.code !== 0)) throw { message: data.message || res.statusText };
      arF.thumb.value = (data.data && data.data.url) || '';
      arThumbPreview();
      fieldErr(arF.thumb, 'ar_e_thumb', '');
      toast('success', L('article.thumbnailUploaded'));
    } catch (e2) { err(e2); }
    btn.innerHTML = old;
    ar.uploading = false;
  });

  function arValidate() {
    let ok = true;
    const title = arF.title.value.trim();
    if (!title) { fieldErr(arF.title, 'ar_e_title', L('common.requiredField')); ok = false; }
    else if (title.length > 255) { fieldErr(arF.title, 'ar_e_title', sMax(L('article.title'), 255)); ok = false; }
    else fieldErr(arF.title, 'ar_e_title', '');
    const summary = arF.summary.value.trim();
    if (summary.length > 500) { fieldErr(arF.summary, 'ar_e_summary', sMax(L('article.summary'), 500)); ok = false; }
    else fieldErr(arF.summary, 'ar_e_summary', '');
    const thumb = arF.thumb.value.trim();
    if (thumb.length > 1024) { fieldErr(arF.thumb, 'ar_e_thumb', sMax(L('article.thumbnail'), 1024)); ok = false; }
    else fieldErr(arF.thumb, 'ar_e_thumb', '');
    if (!arF.type.value) { fieldErr(arF.type, 'ar_e_type', L('common.requiredField')); ok = false; }
    else fieldErr(arF.type, 'ar_e_type', '');
    const content = quillHtml();
    if (!content) {
      fieldErr(null, 'ar_e_content', L('common.requiredField'));
      ok = false;
    }
    return ok;
  }

  async function arSave() {
    if (ar.saving) return;
    if (!arValidate()) return;
    const creating = !ar.editing;
    const payload = {
      title: arF.title.value.trim(),
      summary: arF.summary.value.trim(),
      thumbnail_url: arF.thumb.value.trim(),
      content: quillHtml(),
      type: arF.type.value,
    };
    if (creating) payload.status = 'draft';
    ar.saving = true;
    $id('ar_save').disabled = true;
    try {
      if (creating) {
        await Api.post('/admin/articles', payload);
        toast('success', L('article.createSuccess'));
      } else {
        await Api.put('/admin/articles/' + ar.editing.id, payload);
        toast('success', L('common.updateSuccess'));
      }
      arCloseDrawer();
      arLoad();
    } catch (e) {
      const map = { title: 'title', summary: 'summary', thumbnail_url: 'thumb', content: null, type: 'type', status: null };
      let mapped = false;
      if (e && e.details) {
        Object.keys(e.details).forEach((k) => {
          const f = map[k];
          if (f === null) {
            if (k === 'content') {
              fieldErr(null, 'ar_e_content', String(e.details[k]));
              mapped = true;
            }
          } else if (f) { fieldErr(arF[f], 'ar_e_' + f, String(e.details[k])); mapped = true; }
        });
      }
      if (!mapped) err(e);
    } finally {
      ar.saving = false;
      $id('ar_save').disabled = false;
    }
  }

  $id('ar_new').addEventListener('click', () => arOpenDrawer(null));
  $id('ar_save').addEventListener('click', arSave);
  $id('ar_cancel').addEventListener('click', arCloseDrawer);
  $id('ar_d_close').addEventListener('click', arCloseDrawer);
  arMask.addEventListener('click', arCloseDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && arDrawer.classList.contains('open')) arCloseDrawer();
  });
  ar.searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') arLoad(1); });
  $id('ar_search_btn').addEventListener('click', () => arLoad(1));
  ar.typeEl.addEventListener('change', () => arLoad(1));

  // ============================== TABS ==============================
  const loaded = {};
  function loadTab(key) {
    if (loaded[key]) return;
    loaded[key] = true;
    if (key === 'discounts') dcLoad();
    else if (key === 'campaigns') cmLoad();
    else if (key === 'articles') arLoad();
  }
  $id('pm_tabs').addEventListener('cp:tab', (e) => loadTab(e.detail.key));
  loadTab('discounts');
})();
