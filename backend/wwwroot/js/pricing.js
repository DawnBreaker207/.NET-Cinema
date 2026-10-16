/* Pricing page (Razor port of React features/pricing/PricingPage + BasePriceForm + PricingRuleFormModal). */
(function () {
  'use strict';
  const root = document.getElementById('cp-pricing');
  if (!root) return;

  const L = (k) => (window.CP_LANG && window.CP_LANG[k]) || k;
  const tp = (k, vars) => Object.entries(vars || {}).reduce((s, p) => s.split('{{' + p[0] + '}}').join(String(p[1])), L(k));
  const fmt = CP.fmt, esc = CP.esc, icon = CP.icon, toast = CP.toast;
  const $id = (id) => document.getElementById(id);
  const isEn = document.documentElement.lang === 'en';

  const sMax = (label, max) => isEn ? label + ' must be up to ' + max + ' characters' : 'Độ dài tối đa trường ' + label + ' là ' + max + ' ký tự';
  const nMin = (label, min) => isEn ? label + ' must be minimum ' + min : label + ' phải lớn hơn hoặc bằng ' + min;

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

  // ============================== BASE PRICES ==============================
  const baseInputs = Array.from(document.querySelectorAll('.pr-base-price'));
  function baseNum(input) {
    const n = Number((input.value || '').replace(/\D/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  baseInputs.forEach((input) => {
    input.addEventListener('input', () => {
      const digits = (input.value || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      input.value = digits ? fmt.money(Number(digits)) : '';
      fieldErr(input, 'pr_e_' + input.dataset.seat, '');
    });
  });

  async function baseLoad() {
    try {
      const data = await Api.get('/admin/pricing/base');
      $id('pr_base_error').innerHTML = '';
      const byType = {};
      (data || []).forEach((p) => { byType[p.seat_type] = p.price; });
      baseInputs.forEach((input) => {
        const v = byType[input.dataset.seat];
        input.value = v == null ? '' : fmt.money(v);
      });
    } catch (e) {
      showErr($id('pr_base_error'), e);
    } finally {
      $id('pr_base_loading').style.display = 'none';
      $id('pr_base_fields').style.display = '';
    }
  }

  let baseSaving = false;
  async function baseSave() {
    if (baseSaving) return;
    let ok = true;
    const prices = {};
    baseInputs.forEach((input) => {
      const raw = (input.value || '').trim();
      if (!raw) { fieldErr(input, 'pr_e_' + input.dataset.seat, L('common.requiredField')); ok = false; }
      else { fieldErr(input, 'pr_e_' + input.dataset.seat, ''); prices[input.dataset.seat] = baseNum(input); }
    });
    if (!ok) return;
    baseSaving = true;
    $id('pr_base_save').disabled = true;
    try {
      const data = await Api.put('/admin/pricing/base', { prices });
      const byType = {};
      (data || []).forEach((p) => { byType[p.seat_type] = p.price; });
      baseInputs.forEach((input) => {
        const v = byType[input.dataset.seat];
        input.value = v == null ? '' : fmt.money(v);
      });
      toast('success', L('pricing.baseSaved'));
    } catch (e) {
      // applyApiFieldErrors: bind per-seat messages when the server names them.
      let mapped = false;
      if (e && e.details) {
        Object.keys(e.details).forEach((k) => {
          const input = baseInputs.find((x) => x.dataset.seat === k);
          if (input) { fieldErr(input, 'pr_e_' + k, String(e.details[k])); mapped = true; }
        });
      }
      if (!mapped) err(e);
    } finally {
      baseSaving = false;
      $id('pr_base_save').disabled = false;
    }
  }
  $id('pr_base_save').addEventListener('click', baseSave);

  // ============================== RULES ==============================
  const pr = {
    items: [], page: 1, size: 10, pendingId: null, editing: null, saving: false,
    searchEl: $id('pr_search'), rowsEl: $id('pr_rows'), pagerEl: $id('pr_pager'), errEl: $id('pr_error'),
  };

  async function prLoad(p, ps) {
    if (p) pr.page = p;
    if (ps) pr.size = ps;
    const q = new URLSearchParams({ page: String(pr.page), page_size: String(pr.size) });
    const s = pr.searchEl.value.trim();
    if (s) q.set('search', s);
    try {
      const data = await Api.get('/admin/pricing/rules?' + q);
      pr.errEl.innerHTML = '';
      pr.items = data.items;
      prRender();
      CP.renderPagination(pr.pagerEl, data.meta, prLoad);
    } catch (e) { showErr(pr.errEl, e); }
  }

  function prRender() {
    if (!pr.items.length) { pr.rowsEl.innerHTML = emptyRow(8, L('common.noData')); return; }
    pr.rowsEl.innerHTML = pr.items.map((r) => {
      const busy = pr.pendingId === r.id;
      const dow = r.day_of_week === undefined || r.day_of_week === null
        ? '<span class="text-[var(--text-2)]">' + esc(L('pricing.dayOfWeekAny')) + '</span>'
        : esc(L('pricing.dow_' + r.day_of_week));
      const win = (r.start_time || r.end_time)
        ? esc((r.start_time ? r.start_time.slice(0, 5) : '—') + ' - ' + (r.end_time ? r.end_time.slice(0, 5) : '—'))
        : '<span class="text-[var(--text-2)]">' + esc(L('pricing.timeWindowAny')) + '</span>';
      const dt = r.specific_date
        ? esc(fmt.date(r.specific_date))
        : '<span class="text-[var(--text-2)]">—</span>';
      const adj = r.adjust_kind === 'percent'
        ? esc(tp('pricing.adjustPercent', { value: r.adjust_value }))
        : esc(tp('pricing.adjustFixed', { value: fmt.money(r.adjust_value) }));
      return '<tr data-id="' + esc(r.id) + '">' +
        '<td>' + esc(r.name) + '</td>' +
        '<td>' + dow + '</td>' +
        '<td>' + win + '</td>' +
        '<td>' + dt + '</td>' +
        '<td>' + adj + '</td>' +
        '<td class="text-right tabular-nums">' + esc(String(r.priority)) + '</td>' +
        '<td>' + colorTag(r.active ? 'green' : 'default', L(r.active ? 'pricing.enabled' : 'pricing.disabled'), false) + '</td>' +
        '<td><div class="flex items-center gap-1">' +
        iconBtn('toggle', r.id, r.active ? 'Stop' : 'CheckCircle', L(r.active ? 'pricing.markOff' : 'pricing.markOn'), false, busy) +
        iconBtn('edit', r.id, 'Edit', L('common.edit'), false, false) +
        iconBtn('del', r.id, 'Delete', L('common.delete'), true, busy) +
        '</div></td></tr>';
    }).join('');
  }

  pr.rowsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.hasAttribute('disabled')) return;
    const row = pr.items.find((x) => x.id === btn.dataset.id);
    if (!row) return;
    if (btn.dataset.act === 'edit') { prOpenModal(row); return; }
    if (btn.dataset.act === 'toggle') {
      const ok = await CP.confirm({ title: L(row.active ? 'pricing.offConfirm' : 'pricing.onConfirm'), okText: L('common.confirm'), danger: false });
      if (!ok) return;
      pr.pendingId = row.id; prRender();
      try {
        await Api.patch('/admin/pricing/rules/' + row.id, { active: !row.active });
        toast('success', L('common.updateSuccess'));
      } catch (err2) { err(err2); }
      pr.pendingId = null;
      prLoad();
      return;
    }
    if (btn.dataset.act === 'del') {
      const ok = await CP.confirm({ title: L('pricing.deleteRuleConfirm'), okText: L('common.delete') });
      if (!ok) return;
      pr.pendingId = row.id; prRender();
      try {
        await Api.del('/admin/pricing/rules/' + row.id);
        toast('success', L('pricing.deleteRuleSuccess'));
      } catch (err2) { err(err2); }
      pr.pendingId = null;
      prLoad();
    }
  });

  // ---- rule form modal ----
  const prF = {
    name: $id('pr_f_name'), dow: $id('pr_f_dow'), date: $id('pr_f_date'),
    t0: $id('pr_f_t0'), t1: $id('pr_f_t1'), priority: $id('pr_f_priority'),
    kind: $id('pr_f_kind'), value: $id('pr_f_value'),
  };
  function prClearErrors() {
    fieldErr(prF.name, 'pr_e_name', '');
    fieldErr(null, 'pr_e_date', '');
    fieldErr(null, 'pr_e_time', '');
    fieldErr(prF.priority, 'pr_e_priority', '');
    fieldErr(prF.value, 'pr_e_value', '');
  }
  function prOpenModal(row) {
    pr.editing = row || null;
    $id('pr_modal_title').textContent = L(row ? 'pricing.editRuleTitle' : 'pricing.createRuleTitle');
    prF.name.value = row ? row.name : '';
    prF.dow.value = row && row.day_of_week !== undefined && row.day_of_week !== null ? String(row.day_of_week) : '';
    prF.date.value = row && row.specific_date ? row.specific_date : '';
    prF.t0.value = row && row.start_time ? row.start_time.slice(0, 5) : '';
    prF.t1.value = row && row.end_time ? row.end_time.slice(0, 5) : '';
    prF.priority.value = row ? row.priority : 0;
    prF.kind.value = row ? row.adjust_kind : 'percent';
    prF.value.value = row ? row.adjust_value : 0;
    prClearErrors();
    CP.modal.open('pr_modal');
  }
  function prNum(el) {
    const s = (el.value || '').trim();
    if (s === '') return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  function prValidate() {
    let ok = true;
    const name = prF.name.value.trim();
    if (!name) { fieldErr(prF.name, 'pr_e_name', L('common.requiredField')); ok = false; }
    else if (name.length > 255) { fieldErr(prF.name, 'pr_e_name', sMax(L('pricing.ruleName'), 255)); ok = false; }
    else fieldErr(prF.name, 'pr_e_name', '');
    const pri = prNum(prF.priority);
    if (pri === undefined || Number.isNaN(pri)) { fieldErr(prF.priority, 'pr_e_priority', L('common.requiredField')); ok = false; }
    else if (pri < 0) { fieldErr(prF.priority, 'pr_e_priority', nMin(L('pricing.priority'), 0)); ok = false; }
    else fieldErr(prF.priority, 'pr_e_priority', '');
    const av = prNum(prF.value);
    if (av === undefined || Number.isNaN(av)) { fieldErr(prF.value, 'pr_e_value', L('common.requiredField')); ok = false; }
    else fieldErr(prF.value, 'pr_e_value', '');
    if (!prF.kind.value) { fieldErr(prF.kind, 'pr_e_value', L('common.requiredField')); ok = false; }
    return ok;
  }
  async function prSave() {
    if (pr.saving) return;
    if (!prValidate()) return;
    const creating = !pr.editing;
    const payload = {
      name: prF.name.value.trim(),
      day_of_week: prF.dow.value === '' ? undefined : Number(prF.dow.value),
      start_time: prF.t0.value || undefined,
      end_time: prF.t1.value || undefined,
      specific_date: prF.date.value || undefined,
      adjust_kind: prF.kind.value,
      adjust_value: prNum(prF.value),
      priority: prNum(prF.priority),
      active: creating ? false : pr.editing.active,
    };
    pr.saving = true;
    $id('pr_save').disabled = true;
    try {
      if (creating) {
        await Api.post('/admin/pricing/rules', payload);
        toast('success', L('pricing.createRuleSuccess'));
      } else {
        await Api.patch('/admin/pricing/rules/' + pr.editing.id, payload);
        toast('success', L('common.updateSuccess'));
      }
      CP.modal.close('pr_modal');
      pr.editing = null;
      prLoad();
    } catch (e) {
      const map = {
        name: ['name'], priority: ['priority'], adjust_value: ['value'], adjust_kind: ['value'],
        start_time: ['time'], end_time: ['time'], specific_date: ['date'], day_of_week: [null],
      };
      let mapped = false;
      if (e && e.details) {
        Object.keys(e.details).forEach((k) => {
          const t = map[k];
          if (t) {
            const key = t[0];
            fieldErr(key ? prF[key] : null, 'pr_e_' + key, String(e.details[k]));
            mapped = true;
          }
        });
      }
      if (!mapped) err(e);
    } finally {
      pr.saving = false;
      $id('pr_save').disabled = false;
    }
  }

  $id('pr_new').addEventListener('click', () => prOpenModal(null));
  $id('pr_save').addEventListener('click', prSave);
  pr.searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') prLoad(1); });
  $id('pr_search_btn').addEventListener('click', () => prLoad(1));

  baseLoad();
  prLoad();
})();
