/* Profile page (Razor port of React features/profile/ProfilePage). */
(function () {
  'use strict';
  const root = document.getElementById('cp-profile');
  if (!root) return;

  const L = (k) => (window.CP_LANG && window.CP_LANG[k]) || k;
  const esc = CP.esc, icon = CP.icon, toast = CP.toast;
  const $id = (id) => document.getElementById(id);
  const isEn = document.documentElement.lang === 'en';

  const sMin = (label, min) => isEn ? label + ' must be at least ' + min + ' characters' : 'Độ dài tối thiểu trường ' + label + ' là ' + min + ' ký tự';
  const sMax = (label, max) => isEn ? label + ' must be up to ' + max + ' characters' : 'Độ dài tối đa trường ' + label + ' là ' + max + ' ký tự';
  const err = (e, m) => toast('error', (e && e.message) || m || L('common.somethingWrong'));
  function fieldErr(input, explain, msg) {
    if (typeof explain === 'string') explain = $id(explain);
    if (explain) { explain.textContent = msg || ''; explain.style.display = msg ? '' : 'none'; }
    if (input) input.style.borderColor = msg ? '#D22F27' : '';
  }

  let me = null;

  const SIMPLE_SVG = '<svg width="64" height="41" viewBox="0 0 64 41" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g transform="translate(0 1)" fill="none" fill-rule="evenodd">' +
    '<ellipse fill="#272727" cx="32" cy="33" rx="32" ry="7"/>' +
    '<g fill-rule="nonzero" stroke="#373737">' +
    '<path d="M55 12.76L44.854 1.258C44.367.474 43.656 0 42.907 0H21.093c-.749 0-1.46.474-1.947 1.257L9 12.761V22h46v-9.24z"/>' +
    '<path d="M41.613 15.931c0-1.605.994-2.93 2.227-2.931H55v18.137C55 33.26 53.68 35 52.05 35h-40.1C10.32 35 9 33.259 9 31.137V13h11.16c1.233 0 2.227 1.323 2.227 2.928v.022c0 1.605 1.005 2.901 2.237 2.901h14.752c1.232 0 2.237-1.308 2.237-2.913v-.007z" fill="#1d1d1d"/>' +
    '</g></g></svg>';

  function paintHeader() {
    const initials = ((me && (me.full_name || me.email)) || '?').charAt(0).toUpperCase();
    $id('pf_avatar').textContent = initials;
    $id('pf_name').textContent = (me && me.full_name) || '';
    $id('pf_email').textContent = (me && me.email) || '';
    const layoutAvatar = document.querySelector('.cp-avatar');
    if (layoutAvatar) layoutAvatar.textContent = initials;
  }

  async function loadMe() {
    try {
      me = await Api.get('/users/me');
      $id('pf_loading').style.display = 'none';
      $id('pf_wrap').style.display = '';
      paintHeader();
      $id('pf_f_email').value = me.email || '';
      $id('pf_f_name').value = me.full_name || '';
      $id('pf_f_phone').value = me.phone || '';
    } catch (e) {
      $id('pf_loading').innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') +
        '</span><div class="flex-1">' + esc((e && e.message) || L('common.somethingWrong')) + '</div></div>';
    }
  }

  // ---- profile tab ----
  let savingProfile = false;
  async function saveProfile() {
    if (savingProfile || !me) return;
    const nameEl = $id('pf_f_name'), phoneEl = $id('pf_f_phone');
    const name = nameEl.value.trim();
    let ok = true;
    if (!name) { fieldErr(nameEl, 'pf_e_name', L('common.requiredField')); ok = false; }
    else if (name.length < 2) { fieldErr(nameEl, 'pf_e_name', sMin(L('user.fullName'), 2)); ok = false; }
    else fieldErr(nameEl, 'pf_e_name', '');
    if (!ok) return;
    savingProfile = true;
    $id('pf_save').disabled = true;
    try {
      me = await Api.put('/users/me', { full_name: name, phone: phoneEl.value.trim() });
      paintHeader();
      toast('success', L('common.updateSuccess'));
    } catch (e) {
      const map = { full_name: 'pf_e_name', phone: 'pf_e_phone' };
      let mapped = false;
      if (e && e.details) {
        Object.keys(e.details).forEach((k) => {
          if (map[k]) {
            fieldErr(k === 'full_name' ? nameEl : phoneEl, map[k], String(e.details[k]));
            mapped = true;
          }
        });
      }
      if (!mapped) err(e);
    } finally {
      savingProfile = false;
      $id('pf_save').disabled = false;
    }
  }
  $id('pf_save').addEventListener('click', saveProfile);

  // ---- password tab ----
  document.querySelectorAll('[data-eye]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $id(btn.dataset.eye);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = '<span class="anticon">' + icon(show ? 'Eye' : 'EyeInvisible') + '</span>';
    });
  });
  let savingPw = false;
  async function savePassword() {
    if (savingPw) return;
    const cur = $id('pf_f_cur'), nw = $id('pf_f_new'), cf = $id('pf_f_confirm');
    let ok = true;
    if (!cur.value) { fieldErr(cur, 'pf_e_cur', L('common.requiredField')); ok = false; }
    else fieldErr(cur, 'pf_e_cur', '');
    if (!nw.value) { fieldErr(nw, 'pf_e_new', L('common.requiredField')); ok = false; }
    else if (nw.value.length < 6) { fieldErr(nw, 'pf_e_new', sMin(L('customer.passwordNew'), 6)); ok = false; }
    else if (nw.value.length > 72) { fieldErr(nw, 'pf_e_new', sMax(L('customer.passwordNew'), 72)); ok = false; }
    else fieldErr(nw, 'pf_e_new', '');
    if (!cf.value) { fieldErr(cf, 'pf_e_confirm', L('common.requiredField')); ok = false; }
    else if (cf.value !== nw.value) { fieldErr(cf, 'pf_e_confirm', L('customer.passwordMismatch')); ok = false; }
    else fieldErr(cf, 'pf_e_confirm', '');
    if (!ok) return;
    savingPw = true;
    $id('pf_pw_save').disabled = true;
    try {
      const pair = await Api.put('/users/me/password', { current_password: cur.value, new_password: nw.value });
      if (pair && pair.access_token) Api.setToken(pair.access_token);
      if (pair && pair.refresh_token) { try { localStorage.setItem('cinema.rt', pair.refresh_token); } catch (e2) { /* ignore */ } }
      cur.value = ''; nw.value = ''; cf.value = '';
      toast('success', L('customer.passwordChanged'));
    } catch (e) {
      err(e);
    } finally {
      savingPw = false;
      $id('pf_pw_save').disabled = false;
    }
  }
  $id('pf_pw_save').addEventListener('click', savePassword);

  // ---- sessions tab ----
  function deviceId() {
    try {
      let id = localStorage.getItem('cp_device_id');
      if (id) return id;
      if (typeof crypto.randomUUID === 'function') id = crypto.randomUUID();
      else {
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const hex = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
        id = hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
      }
      localStorage.setItem('cp_device_id', id);
      return id;
    } catch (e) { return ''; }
  }
  let sessionsLoaded = false, revoking = false;
  async function loadSessions() {
    const host = $id('pf_sessions');
    host.innerHTML = '<div class="ant-skeleton-line" style="width:38%"></div><div class="ant-skeleton-line"></div><div class="ant-skeleton-line"></div>';
    try {
      const did = deviceId();
      const data = await Api.get('/users/me/sessions' + (did ? '?device_id=' + encodeURIComponent(did) : ''));
      renderSessions(data || []);
    } catch (e) {
      host.innerHTML = '<div class="ant-alert ant-alert-error"><span class="ant-alert-icon anticon">' + icon('CloseCircleFilled') +
        '</span><div class="flex-1">' + esc((e && e.message) || L('common.somethingWrong')) + '</div></div>';
    }
  }
  function renderSessions(items) {
    const host = $id('pf_sessions');
    if (!items.length) {
      host.innerHTML = '<div class="ant-empty">' + SIMPLE_SVG + '<div>' + esc(L('customer.accountNoSessions')) + '</div></div>';
      return;
    }
    host.innerHTML = items.map((s) =>
      '<div class="ant-list-item"><div class="flex flex-col"><span>' + esc(s.user_agent || L('customer.accountUnknownDevice')) +
      (s.is_current ? ' <span class="ant-tag ant-tag-blue" style="margin-left:8px">' + esc(L('customer.accountCurrentDevice')) + '</span>' : '') + '</span>' +
      '<span class="text-xs text-[var(--text-2)]">' + esc(L('customer.accountSessionLastUsed')) + ': ' +
      (s.last_used_at ? esc(fmt.datetime(s.last_used_at)) : '-') + '</span></div>' +
      (!s.is_current ? '<button type="button" class="ant-btn ant-btn-link ant-btn-dangerous" data-revoke="' + esc(s.id) + '"' +
        (revoking ? ' disabled' : '') + '>' + esc(L('customer.accountSignOutDevice')) + '</button>' : '') +
      '</div>'
    ).join('');
  }
  $id('pf_sessions').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-revoke]');
    if (!btn || btn.hasAttribute('disabled') || revoking) return;
    revoking = true;
    try {
      await Api.del('/users/me/sessions/' + btn.dataset.revoke);
      await loadSessions();
    } catch (err2) {
      err(err2);
    } finally {
      revoking = false;
    }
  });

  // tabs: lazy-load sessions on first activation
  $id('pf_tabs').addEventListener('cp:tab', (e) => {
    if (e.detail.key === 'sessions' && !sessionsLoaded) {
      sessionsLoaded = true;
      loadSessions();
    }
  });

  loadMe();
})();
