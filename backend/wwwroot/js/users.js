/* Users page (Razor port of React features/user/UsersPage + UserFormModal). */
(function () {
  'use strict';
  const root = document.getElementById('cp-users');
  if (!root) return;

  const L = (k) => (window.CP_LANG && window.CP_LANG[k]) || k;
  const fmt = CP.fmt, esc = CP.esc, icon = CP.icon, toast = CP.toast;
  const $id = (id) => document.getElementById(id);
  const isEn = document.documentElement.lang === 'en';
  const uid = root.dataset.uid || '';

  const ROLES = ['customer', 'staff', 'admin'];
  const roleLabel = (r) => L('user.role_' + r);

  const searchEl = $id('us_search'), searchBtn = $id('us_search_btn');
  const roleEl = $id('us_role'), activeEl = $id('us_active');
  const rowsEl = $id('us_rows'), pagerEl = $id('us_pager'), errEl = $id('us_error');

  let items = [], page = 1, size = 10, pendingId = null;

  /* antd Empty.PRESENTED_IMAGE_SIMPLE, dark-token colors, used inside empty tables. */
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

  async function load(p, ps) {
    if (p) page = p;
    if (ps) size = ps;
    const q = new URLSearchParams({ page: String(page), page_size: String(size) });
    const s = searchEl.value.trim();
    if (s) q.set('search', s);
    if (roleEl.value) q.set('role', roleEl.value);
    if (activeEl.value !== 'all') q.set('active', activeEl.value === 'active' ? 'true' : 'false');
    try {
      const data = await Api.get('/admin/users?' + q);
      errEl.innerHTML = '';
      items = data.items;
      render();
      CP.renderPagination(pagerEl, data.meta, load);
    } catch (e) { showErr(e); }
  }

  function rowHtml(u) {
    const self = u.id === uid;
    const busy = pendingId === u.id;
    return '<tr data-id="' + esc(u.id) + '">' +
      '<td><div class="flex items-center gap-1.5"><span>' + esc(u.full_name || '-') + '</span>' +
      (self ? '<span class="ant-tag" style="border-color:transparent">' + esc(L('user.you')) + '</span>' : '') +
      '</div><div class="text-xs text-[var(--text-2)]">' + esc(u.email) + (u.phone ? ' · ' + esc(u.phone) : '') + '</div></td>' +
      '<td><select class="ant-input ant-input-sm us-role" style="width:150px" data-act="role"' +
      (self ? ' disabled title="' + esc(L('user.cannotChangeOwnRole')) + '"' : (busy ? ' disabled' : '')) + '>' +
      ROLES.map((r) => '<option value="' + r + '"' + (r === u.role ? ' selected' : '') + '>' + esc(roleLabel(r)) + '</option>').join('') +
      '</select></td>' +
      '<td><div class="flex items-center gap-2"' + (self && u.active ? ' title="' + esc(L('user.cannotLockSelf')) + '"' : '') + '>' +
      '<span class="ant-switch ant-switch-sm' + (u.active ? ' on' : '') + '" data-act="active"' +
      ((self && u.active) || busy ? ' disabled' : '') + '><span class="ant-switch-dot"></span></span>' +
      '<span' + (u.active ? '' : ' class="text-[var(--text-2)]"') + '>' + esc(L(u.active ? 'user.statusActive' : 'user.statusLocked')) + '</span>' +
      '</div></td>' +
      '<td>' + esc(fmt.datetime(u.created_at)) + '</td>' +
      '</tr>';
  }

  function render() {
    rowsEl.innerHTML = items.length ? items.map(rowHtml).join('') : emptyRow(4, L('common.noData'));
  }

  function setBusy(id, busy) {
    const tr = rowsEl.querySelector('tr[data-id="' + id + '"]');
    if (!tr) return;
    tr.querySelectorAll('select').forEach((el) => { if (busy) el.setAttribute('disabled', ''); else el.removeAttribute('disabled'); });
    const sw = tr.querySelector('.ant-switch');
    if (sw && busy) sw.setAttribute('disabled', '');
  }

  async function applyChange(u, patch) {
    pendingId = u.id;
    setBusy(u.id, true);
    try {
      await Api.patch('/admin/users/' + u.id, patch);
      toast('success', L('common.updateSuccess'));
    } catch (e) {
      err(e);
    } finally {
      pendingId = null;
      await load();
    }
  }

  rowsEl.addEventListener('change', (e) => {
    const sel = e.target.closest('select.us-role');
    if (!sel) return;
    const tr = sel.closest('tr');
    const u = items.find((x) => x.id === tr.dataset.id);
    if (!u || u.role === sel.value) return;
    applyChange(u, { role: sel.value });
  });

  rowsEl.addEventListener('click', (e) => {
    const sw = e.target.closest('.ant-switch[data-act="active"]');
    if (!sw || sw.hasAttribute('disabled')) return;
    const tr = sw.closest('tr');
    const u = items.find((x) => x.id === tr.dataset.id);
    if (!u) return;
    applyChange(u, { active: !u.active });
  });

  // ---- search + filters ----
  searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(1); });
  searchBtn.addEventListener('click', () => load(1));
  roleEl.addEventListener('change', () => load(1));
  activeEl.addEventListener('change', () => load(1));
  $id('us_hint').querySelector('[data-close-alert]').addEventListener('click', () => $id('us_hint').remove());

  // ---- create modal ----
  const fEmail = $id('us_f_email'), fName = $id('us_f_name'), fPass = $id('us_f_pass'), fRole = $id('us_f_role');
  const feEmail = $id('us_e_email'), feName = $id('us_e_name'), fePass = $id('us_e_password');

  function fieldErr(input, explain, msg) {
    explain.textContent = msg || '';
    explain.style.display = msg ? '' : 'none';
    input.style.borderColor = msg ? '#D22F27' : '';
  }
  function clearErrors() { fieldErr(fEmail, feEmail, ''); fieldErr(fName, feName, ''); fieldErr(fPass, fePass, ''); }

  function setEye(hidden) {
    $id('us_pass_eye').innerHTML = '<span class="anticon">' + icon(hidden ? 'EyeInvisible' : 'Eye') + '</span>';
  }

  function openModal() {
    fEmail.value = ''; fName.value = ''; fPass.value = ''; fRole.value = 'staff';
    fPass.type = 'password';
    setEye(true);
    clearErrors();
    CP.modal.open('us_modal');
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const vMin = (label, min) => isEn ? label + ' must be at least ' + min + ' characters' : 'Độ dài tối thiểu trường ' + label + ' là ' + min + ' ký tự';
  const vMax = (label, max) => isEn ? label + ' must be up to ' + max + ' characters' : 'Độ dài tối đa trường ' + label + ' là ' + max + ' ký tự';
  const nMin = (label, min) => isEn ? label + ' must be minimum ' + min : label + ' phải lớn hơn hoặc bằng ' + min;
  const nMax = (label, max) => isEn ? label + ' must be maximum ' + max : label + ' phải nhỏ hơn hoặc bằng ' + max;

  function validate() {
    let ok = true;
    const email = fEmail.value.trim();
    if (!email) { fieldErr(fEmail, feEmail, L('common.requiredField')); ok = false; }
    else if (!emailRe.test(email)) { fieldErr(fEmail, feEmail, L('user.emailInvalid')); ok = false; }
    else if (email.length > 255) { fieldErr(fEmail, feEmail, vMax(L('user.email'), 255)); ok = false; }
    else fieldErr(fEmail, feEmail, '');
    const name = fName.value.trim();
    if (!name) { fieldErr(fName, feName, L('common.requiredField')); ok = false; }
    else if (name.length < 2) { fieldErr(fName, feName, vMin(L('user.fullName'), 2)); ok = false; }
    else if (name.length > 255) { fieldErr(fName, feName, vMax(L('user.fullName'), 255)); ok = false; }
    else fieldErr(fName, feName, '');
    const pass = fPass.value;
    if (!pass) { fieldErr(fPass, fePass, L('common.requiredField')); ok = false; }
    else if (pass.length < 6) { fieldErr(fPass, fePass, vMin(L('user.password'), 6)); ok = false; }
    else if (pass.length > 72) { fieldErr(fPass, fePass, vMax(L('user.password'), 72)); ok = false; }
    else fieldErr(fPass, fePass, '');
    return ok;
  }

  async function save() {
    if (!validate()) return;
    const btn = $id('us_save');
    btn.disabled = true;
    try {
      await Api.post('/admin/users', {
        email: fEmail.value.trim(),
        full_name: fName.value.trim(),
        password: fPass.value,
        role: fRole.value,
      });
      toast('success', L('user.createSuccess'));
      CP.modal.close('us_modal');
      load();
    } catch (e) {
      // A duplicate email is 409 with no details, so it falls through to a toast.
      const map = { email: [fEmail, feEmail], full_name: [fName, feName], password: [fPass, fePass] };
      let mapped = false;
      if (e && e.details) {
        Object.keys(e.details).forEach((k) => {
          const t = map[k];
          if (t) { fieldErr(t[0], t[1], String(e.details[k])); mapped = true; }
        });
      }
      if (!mapped) err(e);
    } finally {
      btn.disabled = false;
    }
  }

  $id('us_new').addEventListener('click', openModal);
  $id('us_save').addEventListener('click', save);
  $id('us_pass_eye').addEventListener('click', () => {
    const show = fPass.type === 'password';
    fPass.type = show ? 'text' : 'password';
    setEye(!show);
  });

  load();
})();
