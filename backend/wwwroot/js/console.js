/* Console kit: antd-dark look in plain JS. Mirrors Go frontend src/utils/format.ts. */
(function () {
  'use strict';
  // Legacy views include console.js a second time - keep the first initialisation.
  if (window.CP) return;

  const TZ = 'Asia/Ho_Chi_Minh';
  const numFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

  const pad = (n) => String(n).padStart(2, '0');
  const toDate = (v) => (v instanceof Date ? v : new Date(v));

  function parts(v) {
    // dd/MM/yyyy HH:mm in cinema timezone
    const d = toDate(v);
    if (isNaN(d)) return null;
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
    return { dd: p.day, MM: p.month, yyyy: p.year, HH: p.hour === '24' ? '00' : p.hour, mm: p.minute };
  }

  const fmt = {
    money(n) { return n === null || n === undefined ? '-' : numFmt.format(n) + ' ₫'; },
    number(n) { return n === null || n === undefined ? '-' : numFmt.format(n); },
    percent(n) { return n === null || n === undefined ? '-' : numFmt.format(n) + '%'; },
    date(v) { const p = v ? parts(v) : null; return p ? `${p.dd}/${p.MM}/${p.yyyy}` : '-'; },
    datetime(v) { const p = v ? parts(v) : null; return p ? `${p.dd}/${p.MM}/${p.yyyy} ${p.HH}:${p.mm}` : '-'; },
    time(v) { const p = v ? parts(v) : null; return p ? `${p.HH}:${p.mm}` : '-'; },
    duration(mins) {
      if (!mins || mins <= 0) return '-';
      const h = Math.floor(mins / 60), m = mins % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    },
    apiDate(v) { const p = v ? parts(v) : null; return p ? `${p.yyyy}-${p.MM}-${p.dd}` : ''; },
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const icon = (name) => (window.CP_ICONS && window.CP_ICONS[name]) || '';

  // i18n: dictionaries injected by _Layout (see Views/LangData.cs).
  const T = (k) => (window.CP_LANG && window.CP_LANG[k]) || k;
  const tp = (k, vars) => Object.entries(vars || {}).reduce((s, p) => s.split('{{' + p[0] + '}}').join(String(p[1])), T(k));

  // ---------- message toast ----------
  function ensureMessages() {
    let el = document.getElementById('cp-messages');
    if (!el) { el = document.createElement('div'); el.id = 'cp-messages'; document.body.appendChild(el); }
    return el;
  }
  function toast(type, text) {
    const host = ensureMessages();
    const icons = { success: 'CheckCircleFilled', error: 'CloseCircleFilled', info: 'InfoCircleFilled', warning: 'ExclamationCircleFilled' };
    const el = document.createElement('div');
    el.className = `cp-message cp-message-${type}`;
    el.innerHTML = `<span class="anticon text-base">${icon(icons[type])}</span><span>${esc(text)}</span>`;
    host.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, 2600);
  }

  // ---------- modal ----------
  const modal = {
    open(id) { document.getElementById(id)?.classList.add('open'); },
    close(id) { document.getElementById(id)?.classList.remove('open'); },
    closeAll() { document.querySelectorAll('.ant-modal-mask.open,.ant-drawer-mask.open').forEach((m) => m.classList.remove('open')); },
  };

  // ---------- confirm (antd Modal.confirm) ----------
  function confirmDialog(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.className = 'ant-modal-mask open';
      host.style.zIndex = '1200';
      host.innerHTML = `
        <div class="ant-modal w-[416px]">
          <div class="ant-modal-body">
            <div class="flex gap-3">
              ${o.danger === false ? '' : `<span class="anticon mt-0.5 text-xl text-[#E8A33D]">${icon('ExclamationCircleFilled')}</span>`}
              <div>
                <div class="mb-1 font-semibold text-white">${esc(o.title || T('common.confirm'))}</div>
                ${o.content ? `<div class="text-sm text-[var(--text-2)]">${esc(o.content)}</div>` : ''}
              </div>
            </div>
          </div>
          <div class="ant-modal-footer">
            <button class="ant-btn" data-x="cancel">${esc(o.cancelText || T('common.cancel'))}</button>
            <button class="ant-btn ${o.danger === false ? 'ant-btn-primary' : 'ant-btn-primary'}" data-x="ok"
              ${o.danger === false ? '' : 'style="background:#D22F27;border-color:#D22F27"'}>${esc(o.okText || T('common.confirm'))}</button>
          </div>
        </div>`;
      const done = (v) => { host.remove(); resolve(v); };
      host.querySelector('[data-x="ok"]').onclick = () => done(true);
      host.querySelector('[data-x="cancel"]').onclick = () => done(false);
      host.onclick = (e) => { if (e.target === host) done(false); };
      document.body.appendChild(host);
    });
  }

  // ---------- tabs ----------
  function initTabs(root) {
    (root || document).querySelectorAll('.ant-tabs').forEach((tabs) => {
      if (tabs.dataset.bound) return;
      tabs.dataset.bound = '1';
      // :scope keeps nested tab groups independent: a child tab must not toggle its ancestors.
      const ownTabs = (el) => Array.from(el.querySelectorAll(':scope > .ant-tabs-nav > .ant-tabs-tab'));
      const ownPanes = (el) => Array.from(el.querySelectorAll(':scope > .ant-tabs-content > .ant-tabs-tabpane'));
      ownTabs(tabs).forEach((tab) => {
        tab.addEventListener('click', () => {
          const key = tab.dataset.tab;
          ownTabs(tabs).forEach((t) => t.classList.toggle('active', t === tab));
          ownPanes(tabs).forEach((p) => p.classList.toggle('active', p.dataset.tab === key));
          tabs.dispatchEvent(new CustomEvent('cp:tab', { detail: { key } }));
        });
      });
    });
  }

  // ---------- dropdown ----------
  function initDropdowns() {
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-dropdown]');
      document.querySelectorAll('.cp-dropdown.open').forEach((d) => {
        if (!trigger || d.id !== trigger.dataset.dropdown) d.classList.remove('open');
      });
      if (trigger) {
        const menu = document.getElementById(trigger.dataset.dropdown);
        if (menu) {
          menu.classList.toggle('open');
          const r = trigger.getBoundingClientRect();
          menu.style.position = 'fixed';
          menu.style.top = r.bottom + 6 + 'px';
          const right = Math.max(8, window.innerWidth - r.right);
          menu.style.right = right + 'px';
          menu.style.left = 'auto';
        }
      }
    });
  }

  // ---------- pagination ----------
  // render(el, meta, onPage)  meta: {page, page_size, total, total_pages}
  function renderPagination(el, meta, onPage) {
    if (!el) return;
    const m = meta || { page: 1, page_size: 10, total: 0, total_pages: 0 };
    const pages = [];
    const last = m.total_pages;
    const cur = m.page;
    const push = (p) => pages.push(`<span class="ant-pagination-item ${p === cur ? 'active' : ''}" data-page="${p}">${p}</span>`);
    for (let p = 1; p <= last; p++) if (p === 1 || p === last || Math.abs(p - cur) <= 2) push(p);
    const html = `
      <span class="ant-pagination-total">${esc(tp('common.totalItems', { total: numFmt.format(m.total) }))}</span>
      <span class="ant-pagination-prev ${cur <= 1 ? 'disabled' : ''}" data-page="${cur - 1}"><span class="anticon">${icon('Left')}</span></span>
      ${pages.join('')}
      <span class="ant-pagination-next ${cur >= last ? 'disabled' : ''}" data-page="${cur + 1}"><span class="anticon">${icon('Right')}</span></span>
      <span class="ant-pagination-options">
        <select class="ant-input" style="width:110px" data-page-size>
          ${[10, 20, 50].map((s) => `<option value="${s}" ${s === m.page_size ? 'selected' : ''}>${s} / ${document.documentElement.lang === 'en' ? 'page' : 'trang'}</option>`).join('')}
        </select>
      </span>`;
    el.innerHTML = html;
    el.querySelectorAll('[data-page]').forEach((b) => b.onclick = () => {
      const p = Number(b.dataset.page);
      if (p >= 1 && p <= last && p !== cur) onPage(p, m.page_size);
    });
    const sizeSel = el.querySelector('[data-page-size]');
    if (sizeSel) sizeSel.onchange = () => onPage(1, Number(sizeSel.value));
  }

  // ---------- switch ----------
  function initSwitches(root) {
    (root || document).querySelectorAll('.ant-switch').forEach((sw) => {
      if (sw.dataset.bound) return;
      sw.dataset.bound = '1';
      sw.addEventListener('click', () => {
        if (sw.hasAttribute('disabled')) return;
        sw.classList.toggle('on');
        sw.dispatchEvent(new CustomEvent('cp:change', { detail: { on: sw.classList.contains('on') } }));
      });
    });
  }
  const switchOn = (el, on) => el.classList.toggle('on', !!on);

  // ---------- custom select ----------
  function makeSelect(host, options, value, onChange) {
    // options: [{value,label}]
    host.classList.add('cp-select');
    const current = () => options.find((o) => String(o.value) === String(value));
    const paint = () => {
      host.innerHTML = `<span data-label>${esc(current()?.label ?? '')}</span><span class="anticon cp-select-arrow">${icon('Down')}</span>`;
    };
    paint();
    host.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.cp-select-menu').forEach((m) => { if (m.dataset.host !== host.id) m.remove(); });
      let menu = document.getElementById(host.id + '-menu');
      if (menu) { menu.remove(); return; }
      menu = document.createElement('div');
      menu.id = host.id + '-menu';
      menu.className = 'cp-select-menu';
      menu.dataset.host = host.id;
      menu.style.minWidth = host.offsetWidth + 'px';
      menu.innerHTML = options.map((o) =>
        `<div class="cp-select-item ${String(o.value) === String(value) ? 'selected' : ''}" data-value="${esc(String(o.value))}">${esc(o.label)}</div>`).join('');
      const r = host.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = r.bottom + 4 + 'px';
      menu.style.left = r.left + 'px';
      menu.style.right = 'auto';
      document.body.appendChild(menu);
      menu.querySelectorAll('.cp-select-item').forEach((item) => item.onclick = (ev) => {
        ev.stopPropagation();
        value = item.dataset.value;
        paint();
        menu.remove();
        onChange && onChange(value);
      });
    };
  }

  // ---------- drawer ----------
  function openDrawer(id) {
    document.getElementById(id)?.classList.add('open');
    document.getElementById(id + '-mask')?.classList.add('open');
  }
  function closeDrawer(id) {
    document.getElementById(id)?.classList.remove('open');
    document.getElementById(id + '-mask')?.classList.remove('open');
  }

  // ---------- collapse ----------
  function initCollapse() {
    const btn = document.getElementById('cp-collapse');
    if (!btn) return;
    const set = (on) => {
      document.body.classList.toggle('cp-collapsed', on);
      localStorage.setItem('cp.collapsed', on ? '1' : '0');
    };
    if (localStorage.getItem('cp.collapsed') === '1') set(true);
    btn.onclick = () => set(!document.body.classList.contains('cp-collapsed'));
  }

  // ---------- modal bindings ([data-close], mask click, Esc) ----------
  function initModals() {
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (c) { document.getElementById(c.dataset.close)?.classList.remove('open'); return; }
      if (e.target.classList && e.target.classList.contains('ant-modal-mask')) e.target.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.closeAll(); });
  }

  window.CP = {
    fmt, esc, icon, toast, modal, confirm: confirmDialog, initTabs, initDropdowns,
    renderPagination, initSwitches, switchOn, makeSelect, openDrawer, closeDrawer, initCollapse,
    T, tp,
    api: (path, opts) => window.api ? window.api(path, opts) : fetch(path, opts).then((r) => r.json()),
  };
  window.fmt = fmt;

  document.addEventListener('DOMContentLoaded', () => {
    initTabs(); initDropdowns(); initSwitches(); initCollapse(); initModals();
  });
})();
