/* Catalog page (Razor port of React features/catalog): Movies / Halls / Showtimes / Concessions tabs. */
(function () {
  'use strict';
  const root = document.getElementById('catalog-tabs');
  if (!root) return;

  const L = (k) => (window.CP_LANG && window.CP_LANG[k]) || k;
  const tp = (k, vars) => Object.entries(vars || {}).reduce((s, p) => s.split('{{' + p[0] + '}}').join(String(p[1])), L(k));
  const fmt = CP.fmt, esc = CP.esc, icon = CP.icon, toast = CP.toast;
  const $id = (id) => document.getElementById(id);
  const pane = (k) => root.querySelector('.ant-tabs-tabpane[data-tab="' + k + '"]');
  const err = (e) => toast('error', (e && e.message) || L('common.somethingWrong'));
  const msg = (e, m) => toast('error', (e && e.message) || m);

  async function uploadPoster(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/v1/admin/uploads/poster', { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data.code !== undefined && data.code !== 0)) throw { message: data.message || 'Upload failed' };
    return data.data.url;
  }
  function bindUpload(fileId, inputId, doneMsg) {
    const fileEl = $id(fileId);
    if (!fileEl) return;
    fileEl.addEventListener('change', async () => {
      const f = fileEl.files && fileEl.files[0];
      if (!f) return;
      try {
        $id(inputId).value = await uploadPoster(f);
        toast('success', doneMsg);
      } catch (e) { err(e); }
      fileEl.value = '';
    });
  }
  const emptyRow = (cols) => `<tr><td colspan="${cols}" class="py-10 text-center text-[var(--text-3)]">${esc(L('common.noData'))}</td></tr>`;

  // ============================================================ MOVIES
  function initMovies() {
    const el = pane('movies');
    const rowsEl = el.querySelector('#mv_rows');
    const pager = el.querySelector('#mv_pager');
    const searchEl = el.querySelector('#mv_search');
    let items = [], page = 1, size = 10, timer = null, editing = null;
    const STATUS = {
      draft: { label: L('movie.statusDraft'), cls: '' },
      coming_soon: { label: L('movie.statusComing_soon'), cls: 'ant-tag-blue' },
      showing: { label: L('movie.statusShowing'), cls: 'ant-tag-green' },
      ended: { label: L('movie.statusEnded'), cls: 'ant-tag-red' },
    };
    const st = (k) => STATUS[k] || { label: k, cls: '' };

    async function load(p, ps) {
      if (p) page = p;
      if (ps) size = ps;
      const q = new URLSearchParams({ page: String(page), page_size: String(size) });
      const s = searchEl.value.trim();
      if (s) q.set('search', s);
      try {
        const data = await Api.get('/movies?' + q);
        items = data.items;
        render();
        CP.renderPagination(pager, data.meta, load);
      } catch (e) { err(e); }
    }
    function render() {
      if (!items.length) { rowsEl.innerHTML = emptyRow(8); return; }
      rowsEl.innerHTML = items.map((m) => {
        const s = st(m.status);
        const poster = m.poster_url
          ? `<img class="cp-thumb" src="${esc(m.poster_url)}" alt="">`
          : `<span class="cp-thumb cp-thumb-empty">${icon('Picture')}</span>`;
        const next = m.status === 'draft' ? 'coming_soon' : (m.status === 'coming_soon' ? 'showing' : null);
        return `<tr>
          <td>${poster}</td>
          <td class="cell-strong">${esc(m.title)}</td>
          <td>${esc(m.genre)}</td>
          <td>${fmt.duration(m.duration)}</td>
          <td>${esc(m.director)}</td>
          <td>${m.release_date ? fmt.date(m.release_date) : '-'}</td>
          <td><span class="ant-tag ${s.cls}">${esc(s.label)}</span></td>
          <td><span class="flex items-center gap-1">
            ${next ? `<button type="button" class="ant-btn ant-btn-icon ant-btn-text" data-act="promote" data-id="${m.id}" title="${esc(tp('movie.promoteTo', { status: STATUS[next].label }))}">${icon('PlayCircle')}</button>` : ''}
            <button type="button" class="ant-btn ant-btn-icon ant-btn-text" data-act="edit" data-id="${m.id}" title="${esc(L('common.edit'))}">${icon('Edit')}</button>
            <button type="button" class="ant-btn ant-btn-icon ant-btn-text ant-btn-dangerous" data-act="del" data-id="${m.id}" title="${esc(L('common.delete'))}">${icon('Delete')}</button>
          </span></td>
        </tr>`;
      }).join('');
    }

    rowsEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const m = items.find((x) => x.id === btn.dataset.id);
      if (!m) return;
      if (btn.dataset.act === 'edit') return openModal(m);
      if (btn.dataset.act === 'del') {
        if (!await CP.confirm({ title: L('common.deleteConfirm'), okText: L('common.delete') })) return;
        try { await Api.del('/admin/movies/' + m.id); toast('success', L('common.deleteSuccess')); load(); } catch (ex) { err(ex); }
        return;
      }
      if (btn.dataset.act === 'promote') {
        const next = m.status === 'draft' ? 'coming_soon' : 'showing';
        if (!await CP.confirm({ title: tp('movie.promoteConfirm', { status: STATUS[next].label }), okText: L('common.confirm'), danger: false })) return;
        try {
          await Api.put('/admin/movies/' + m.id, movieBody(m, next));
          toast('success', tp('movie.promotedTo', { status: STATUS[next].label }));
          load();
        } catch (ex) { err(ex); }
      }
    });

    function movieBody(m, status) {
      return {
        title: m.title, genre: m.genre, duration: m.duration, director: m.director,
        description: m.description, poster_url: m.poster_url, backdrop_url: m.backdrop_url,
        trailer_url: m.trailer_url, cast: m.cast, age_rating: m.age_rating || 'P',
        release_date: m.release_date, status: status || m.status,
      };
    }
    function openModal(m) {
      editing = m || null;
      $id('mv_modal_title').textContent = m ? L('movie.editTitle') : L('movie.createTitle');
      $id('mv_id').value = m ? m.id : '';
      $id('mv_title').value = m ? m.title : '';
      $id('mv_genre').value = m ? m.genre : '';
      $id('mv_duration').value = m ? m.duration : '';
      $id('mv_director').value = m ? m.director : '';
      $id('mv_age').value = (m && m.age_rating) || 'P';
      $id('mv_status').value = (m && m.status) || 'draft';
      $id('mv_release').value = m && m.release_date ? fmt.apiDate(m.release_date) : '';
      $id('mv_cast').value = (m && m.cast) || '';
      $id('mv_poster').value = (m && m.poster_url) || '';
      $id('mv_backdrop').value = (m && m.backdrop_url) || '';
      $id('mv_trailer').value = (m && m.trailer_url) || '';
      $id('mv_desc').value = (m && m.description) || '';
      CP.modal.open('mv_modal');
    }
    async function save() {
      const body = {
        title: $id('mv_title').value.trim(),
        genre: $id('mv_genre').value.trim(),
        duration: Number($id('mv_duration').value) || 0,
        director: $id('mv_director').value.trim(),
        age_rating: $id('mv_age').value,
        status: $id('mv_status').value,
        release_date: $id('mv_release').value || fmt.apiDate(new Date()),
        cast: $id('mv_cast').value.trim() || null,
        poster_url: $id('mv_poster').value.trim() || null,
        backdrop_url: $id('mv_backdrop').value.trim() || null,
        trailer_url: $id('mv_trailer').value.trim() || null,
        description: $id('mv_desc').value.trim() || null,
      };
      if (!body.title || !body.genre || !body.duration || !body.director) { toast('warning', L('common.requiredField')); return; }
      try {
        if (editing) await Api.put('/admin/movies/' + editing.id, body);
        else await Api.post('/admin/movies', body);
        toast('success', editing ? L('common.updateSuccess') : L('common.createSuccess'));
        CP.modal.close('mv_modal');
        load();
      } catch (e) { err(e); }
    }

    el.querySelector('#mv_new').onclick = () => openModal(null);
    el.querySelector('#mv_save').onclick = save;
    searchEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { page = 1; load(); }, 400);
    });
    bindUpload('mv_poster_file', 'mv_poster', L('movie.posterUploaded'));
    bindUpload('mv_backdrop_file', 'mv_backdrop', L('movie.posterUploaded'));
    load();
  }

  // ============================================================ HALLS
  function initHalls() {
    const el = pane('halls');
    const cardsEl = el.querySelector('#hl_cards');
    const pager = el.querySelector('#hl_pager');
    const searchEl = el.querySelector('#hl_search');
    const panel = el.querySelector('#hl_panel');
    const gridEl = el.querySelector('#hl_grid');
    let items = [], page = 1, size = 10, timer = null;
    let cur = null, curSeats = [], editing = false, cloning = null;
    let selected = new Set(), edits = new Map();

    const SEAT_STYLE = {
      standard: { bg: '#D1D5DB', fg: '#1F2937', label: L('hall.seatType_standard') },
      vip: { bg: '#EAB308', fg: '#1F1300', label: L('hall.seatType_vip') },
      couple: { bg: '#DB2777', fg: '#FFFFFF', label: L('hall.seatType_couple') },
      recliner: { bg: '#0F766E', fg: '#FFFFFF', label: L('hall.seatType_recliner') },
    };

    async function load(p, ps) {
      if (p) page = p;
      if (ps) size = ps;
      const q = new URLSearchParams({ page: String(page), page_size: String(size) });
      const s = searchEl.value.trim();
      if (s) q.set('search', s);
      try {
        const data = await Api.get('/admin/halls?' + q);
        items = data.items;
        renderCards();
        CP.renderPagination(pager, data.meta, load);
        if (!cur && items.length) select(items[0]);
      } catch (e) { err(e); }
    }
    function renderCards() {
      if (!items.length) {
        cardsEl.innerHTML = `<div class="col-span-full py-10 text-center text-[var(--text-3)]">${esc(L('common.noData'))}</div>`;
        return;
      }
      cardsEl.innerHTML = items.map((h) => `
        <div class="ant-card cursor-pointer transition-colors ${cur && cur.id === h.id ? 'border-brand bg-brand/15' : ''}"
             data-hall="${h.id}">
          <div class="p-4">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate font-semibold text-white">${esc(h.name)}</div>
                <div class="mt-1 text-sm text-[var(--text-2)]">${h.rows} × ${h.seats_per_row}</div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <button type="button" class="ant-btn ant-btn-icon ant-btn-text" data-act="clone" title="${esc(L('hall.clone'))}">${icon('Copy')}</button>
                <button type="button" class="ant-btn ant-btn-icon ant-btn-text" data-act="toggle" title="${esc(h.active ? L('hall.deactivate') : L('hall.activate'))}">${icon('Poweroff')}</button>
                <button type="button" class="ant-btn ant-btn-icon ant-btn-text ant-btn-dangerous" data-act="delete" title="${esc(L('common.delete'))}">${icon('Delete')}</button>
              </div>
            </div>
            <div class="mt-3"><span class="ant-tag ${h.active ? 'ant-tag-green' : ''}">${esc(h.active ? L('hall.activeYes') : L('hall.activeNo'))}</span></div>
          </div>
        </div>`).join('');
    }

    cardsEl.addEventListener('click', async (e) => {
      const card = e.target.closest('[data-hall]');
      if (!card) return;
      const hall = items.find((h) => h.id === card.dataset.hall);
      if (!hall) return;
      const act = e.target.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'clone') { openClone(hall); return; }
        if (a === 'delete') {
          if (!await CP.confirm({ title: L('hall.deleteConfirm'), okText: L('common.delete') })) return;
          try {
            await Api.del('/admin/halls/' + hall.id);
            toast('success', L('common.deleteSuccess'));
            if (cur && cur.id === hall.id) { cur = null; panel.classList.add('hidden'); }
            load();
          } catch (ex) { err(ex); }
          return;
        }
        if (a === 'toggle') {
          const turnOn = !hall.active;
          if (!turnOn && !await CP.confirm({ title: L('hall.deactivate'), okText: L('common.confirm') })) return;
          try {
            await Api.put('/admin/halls/' + hall.id, { active: turnOn });
            toast('success', L('common.updateSuccess'));
            load();
          } catch (ex) { err(ex); }
          return;
        }
        return;
      }
      select(hall);
    });

    async function select(hall) {
      cur = hall;
      curSeats = []; selected.clear(); edits.clear(); editing = false;
      panel.classList.remove('hidden');
      renderCards();
      renderPanel();
      await loadSeats();
    }
    async function loadSeats() {
      try {
        curSeats = await Api.get(`/admin/halls/${cur.id}/seats`);
        selected.clear(); edits.clear();
        renderPanel();
      } catch (e) { err(e); }
    }

    function renderPanel() {
      if (!cur) return;
      const titleText = tp('hall.seatsTitle', { name: cur.name });
      el.querySelector('#hl_panel_title').innerHTML =
        esc(titleText).replace(esc(cur.name), `<strong>${esc(cur.name)}</strong>`);
      el.querySelector('#hl_edit').classList.toggle('ant-btn-primary', editing);
      const seatCount = curSeats.filter((s) => !s.is_gap).length;
      const gapCount = curSeats.filter((s) => s.is_gap).length;
      const doubleCount = curSeats.filter((s) => !s.is_gap && (s.col_span || 1) > 1).length;
      el.querySelector('#hl_tag').innerHTML =
        `<span class="ant-tag ${cur.active ? 'ant-tag-green' : ''}">${esc(cur.active ? L('hall.activeYes') : L('hall.activeNo'))}</span>`;
      el.querySelector('#hl_summary').innerHTML =
        esc(tp('hall.gridSummary', {
          cells: cur.rows * cur.seats_per_row,
          seats: seatCount,
          sellable: seatCount,
          gaps: gapCount,
          doubles: doubleCount,
        })) +
        (edits.size ? ` <span class="ant-tag ant-tag-gold ml-2">${esc(L('hall.unsavedChanges'))}</span>` : '');
      const counts = {};
      curSeats.forEach((s) => { if (!s.is_gap) counts[s.seat_type] = (counts[s.seat_type] || 0) + 1; });
      el.querySelector('#hl_pills').innerHTML = Object.keys(SEAT_STYLE)
        .map((k) => `<span class="rounded px-2 py-0.5 text-xs font-medium" style="background:${SEAT_STYLE[k].bg};color:${SEAT_STYLE[k].fg}">${esc(SEAT_STYLE[k].label)} · ${counts[k] || 0}</span>`)
        .join('');
      el.querySelector('#hl_editbar').classList.toggle('hidden', !editing);
      el.querySelector('#hl_sel_count').textContent = tp('hall.selectedCount', { count: selected.size });
      renderGrid();
    }

    function renderGrid() {
      const map = new Map();
      curSeats.forEach((s) => { if (!map.has(s.row_label)) map.set(s.row_label, []); map.get(s.row_label).push(s); });
      const maxCol = curSeats.reduce((m, s) => Math.max(m, s.col_number + (s.col_span || 1) - 1), 0);
      let html = '<div class="inline-block">';
      html += '<div class="mb-1.5 flex items-center gap-1.5"><span class="w-6"></span>' +
        Array.from({ length: maxCol }, (_, i) => `<span style="width:40px" class="text-center text-[10px] text-[var(--text-3)]">${i + 1}</span>`).join('') + '</div>';
      map.forEach((arr, row) => {
        arr.sort((a, b) => a.col_number - b.col_number);
        html += `<div class="mb-1.5 flex items-center gap-1.5">
          <button type="button" class="w-6 text-xs text-[var(--text-3)] hover:text-brand" data-row="${esc(row)}"
                  title="${esc(tp('hall.selectRow', { row }))}">${esc(row)}</button>
          ${arr.map(seatHtml).join('')}
        </div>`;
      });
      html += '</div>';
      gridEl.innerHTML = html;
    }
    function seatHtml(s) {
      const style = SEAT_STYLE[s.seat_type] || SEAT_STYLE.standard;
      const span = s.col_span || 1;
      const w = span * 40 + (span - 1) * 6;
      const base = `width:${w}px;height:34px;`;
      const skin = s.is_gap
        ? 'background:transparent;border:1px dashed rgba(255,255,255,.25);color:rgba(255,255,255,.4);'
        : `background:${style.bg};color:${style.fg};`;
      const sel = selected.has(s.label) ? 'outline:2px solid #2563EB;outline-offset:1px;' : '';
      return `<button type="button" class="flex items-center justify-center rounded-md text-xs font-medium ${s.is_gap ? '' : 'hover:brightness-110'}"
        style="${base}${skin}${sel}" data-seat="${esc(s.label)}" title="${esc(s.label)}">${s.is_gap ? '' : s.col_number}</button>`;
    }

    gridEl.addEventListener('click', (e) => {
      const rowBtn = e.target.closest('[data-row]');
      if (rowBtn && editing) {
        const row = rowBtn.dataset.row;
        const rowSeats = curSeats.filter((s) => s.row_label === row && !s.is_gap);
        const allIn = rowSeats.every((s) => selected.has(s.label));
        rowSeats.forEach((s) => allIn ? selected.delete(s.label) : selected.add(s.label));
        renderPanel();
        return;
      }
      const seatBtn = e.target.closest('[data-seat]');
      if (!seatBtn) return;
      const seat = curSeats.find((s) => s.label === seatBtn.dataset.seat);
      if (!seat) return;
      if (editing) {
        if (selected.has(seat.label)) selected.delete(seat.label); else selected.add(seat.label);
        renderPanel();
        return;
      }
      quickEdit(seatBtn, seat);
    });

    // quick edit popover (view mode)
    let popEl = null;
    function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
    document.addEventListener('click', (e) => { if (popEl && !e.target.closest('#hl-quick') && !e.target.closest('[data-seat]')) closePop(); });
    function quickEdit(anchor, seat) {
      closePop();
      const pop = document.createElement('div');
      pop.id = 'hl-quick';
      pop.className = 'cp-select-menu';
      pop.style.minWidth = '220px';
      pop.style.zIndex = '1100';
      pop.innerHTML = `
        <div class="px-3 py-2 text-xs text-[var(--text-3)]">${esc(tp('hall.quickEdit', { label: seat.label }))}</div>
        ${Object.keys(SEAT_STYLE).map((k) => `<div class="cp-select-item ${seat.seat_type === k && !seat.is_gap ? 'selected' : ''}" data-type="${k}">
          <span class="mr-2 inline-block h-3 w-3 rounded-sm" style="background:${SEAT_STYLE[k].bg}"></span>${esc(SEAT_STYLE[k].label)}</div>`).join('')}
        ${seat.seat_type === 'couple' ? `<div class="cp-select-item" data-act="split">${esc(L('hall.splitCouple'))}</div>` : ''}
        <div class="cp-select-item" data-act="toggle-gap">${esc(seat.is_gap ? L('hall.markAsSeat') : L('hall.markAsGap'))}</div>`;
      document.body.appendChild(pop);
      const r = anchor.getBoundingClientRect();
      pop.style.position = 'fixed';
      pop.style.top = Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 8) + 'px';
      pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
      popEl = pop;
      pop.querySelectorAll('[data-type]').forEach((it) => it.onclick = () => {
        closePop();
        applyChange([{ selector: { labels: [seat.label] }, seat_type: it.dataset.type, is_gap: false }]);
      });
      pop.querySelector('[data-act="toggle-gap"]').onclick = () => {
        closePop();
        applyChange([{ selector: { labels: [seat.label] }, is_gap: !seat.is_gap }]);
      };
      const splitBtn = pop.querySelector('[data-act="split"]');
      if (splitBtn) splitBtn.onclick = async () => {
        closePop();
        if (!await CP.confirm({ title: L('hall.splitCoupleConfirmTitle'), content: L('hall.splitCoupleConfirmBody'), okText: L('common.confirm') })) return;
        try {
          await Api.post(`/admin/halls/${cur.id}/seats/split`, { label: seat.label });
          toast('success', L('hall.splitCoupleSuccess'));
          await loadSeats();
        } catch (e) { err(e); }
      };
    }

    async function applyChange(changes) {
      try {
        await Api.patch(`/admin/halls/${cur.id}/seats`, { changes });
        await loadSeats();
      } catch (e) { err(e); }
    }

    // editbar
    el.querySelector('#hl_edit').onclick = () => {
      editing = !editing;
      selected.clear();
      renderPanel();
    };
    const typeWrap = el.querySelector('#hl_type_wrap');
    typeWrap.innerHTML = `<select class="ant-input" style="width:170px"><option value="">${esc(L('hall.setSeatType'))}</option>` +
      ['standard', 'vip', 'recliner'].map((k) => `<option value="${k}">${esc(SEAT_STYLE[k].label)}</option>`).join('') + '</select>';
    typeWrap.querySelector('select').onchange = (ev) => {
      const type = ev.target.value;
      ev.target.value = '';
      if (!type || !selected.size) return;
      let skipped = 0;
      selected.forEach((label) => {
        const s = curSeats.find((x) => x.label === label);
        if (!s) return;
        if (s.col_span > 1 || s.seat_type === 'couple') { skipped++; return; }
        s.is_gap = false;
        s.seat_type = type;
        edits.set(label, Object.assign({}, edits.get(label), { seat_type: type, is_gap: false }));
      });
      if (skipped) toast('warning', tp('hall.bulkSkippedCouples', { count: skipped }));
      renderPanel();
    };
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editAction(b.dataset.edit));
    async function editAction(a) {
      if (a === 'clear') { selected.clear(); renderPanel(); return; }
      if (a === 'select-all') { curSeats.filter((s) => !s.is_gap).forEach((s) => selected.add(s.label)); renderPanel(); return; }
      if (a === 'to-gap' || a === 'to-seat') {
        if (!selected.size) return;
        const gap = a === 'to-gap';
        selected.forEach((label) => {
          const s = curSeats.find((x) => x.label === label);
          if (!s) return;
          s.is_gap = gap;
          edits.set(label, Object.assign({}, edits.get(label), { is_gap: gap, seat_type: gap ? undefined : s.seat_type }));
        });
        renderPanel();
        return;
      }
      if (a === 'merge') {
        if (selected.size !== 2) { toast('warning', L('x.mergeNeedsTwo')); return; }
        const [a1, b1] = [...selected].map((l) => curSeats.find((s) => s.label === l));
        if (!a1 || !b1 || a1.row_label !== b1.row_label || Math.abs(a1.col_number - b1.col_number) !== 1) { toast('warning', L('x.mergeNeedsTwo')); return; }
        const left = a1.col_number < b1.col_number ? a1 : b1;
        const right = a1.col_number < b1.col_number ? b1 : a1;
        try {
          await Api.post(`/admin/halls/${cur.id}/seats/merge`, { left_label: left.label, right_label: right.label });
          toast('success', L('hall.mergeCoupleSuccess'));
          await loadSeats();
        } catch (e) { err(e); }
        return;
      }
      if (a === 'split') {
        if (selected.size !== 1) { toast('warning', L('hall.splitCoupleAlreadySplit')); return; }
        const s = curSeats.find((x) => x.label === [...selected][0]);
        if (!s || (s.col_span < 2 && s.seat_type !== 'couple')) { toast('warning', L('hall.splitCoupleAlreadySplit')); return; }
        if (!await CP.confirm({ title: L('hall.splitCoupleConfirmTitle'), content: L('hall.splitCoupleConfirmBody'), okText: L('common.confirm') })) return;
        try {
          await Api.post(`/admin/halls/${cur.id}/seats/split`, { label: s.label });
          toast('success', L('hall.splitCoupleSuccess'));
          await loadSeats();
        } catch (e) { err(e); }
        return;
      }
      if (a === 'discard') { if (edits.size) await loadSeats(); return; }
      if (a === 'save') {
        if (!edits.size) return;
        const groups = new Map();
        edits.forEach((ch, label) => {
          const key = (ch.seat_type || '') + '|' + (ch.is_gap === undefined ? '' : String(ch.is_gap));
          if (!groups.has(key)) groups.set(key, { selector: { labels: [] }, seat_type: ch.seat_type || null, is_gap: ch.is_gap === undefined ? null : ch.is_gap });
          groups.get(key).selector.labels.push(label);
        });
        try {
          await Api.patch(`/admin/halls/${cur.id}/seats`, { changes: [...groups.values()] });
          toast('success', L('hall.saveSuccess'));
          await loadSeats();
        } catch (e) { err(e); }
      }
    }

    // kebab menu: structure ops
    el.querySelectorAll('#hl_menu [data-menu]').forEach((a) => a.onclick = () => {
      el.querySelector('#hl_menu').classList.remove('open');
      structureAction(a.dataset.menu);
    });
    async function ensureSaved() {
      if (!edits.size) return true;
      if (!await CP.confirm({ title: L('hall.saveBeforeAddColumn'), okText: L('hall.saveChanges'), danger: false })) return false;
      const saveBtn = el.querySelector('[data-edit="save"]');
      saveBtn.click();
      // wait a tick for the save to clear edits
      await new Promise((r) => setTimeout(r, 400));
      return true;
    }
    async function structureAction(m) {
      const lastRow = [...new Set(curSeats.map((s) => s.row_label))].pop();
      if (m === 'add-row') {
        if (!await ensureSaved()) return;
        try { const r = await Api.post(`/admin/halls/${cur.id}/seats/rows`); toast('success', L('hall.addRowSuccess').replace('{{row}}', (r && (r.row_label || r.row)) || '')); await loadSeats(); } catch (e) { err(e); }
        return;
      }
      if (m === 'add-column') {
        if (!await ensureSaved()) return;
        try { await Api.post(`/admin/halls/${cur.id}/seats/columns`); toast('success', L('hall.addColumnSuccess')); await loadSeats(); } catch (e) { err(e); }
        return;
      }
      if (m === 'delete-row') {
        if (!await CP.confirm({ title: L('hall.deleteRowConfirmTitle'), content: L('hall.deleteRowConfirmBody'), okText: L('common.delete') })) return;
        try {
          await Api.del(`/admin/halls/${cur.id}/seats/rows/${encodeURIComponent(lastRow)}`);
          toast('success', L('hall.deleteRowSuccess').replace('{{row}}', lastRow));
          await loadSeats();
        } catch (e) { err(e); }
        return;
      }
      if (m === 'regenerate') {
        if (!await CP.confirm({
          title: L('hall.regenerateWarnTitle'),
          content: L('hall.regenerateWarnBody') + ' ' + L('hall.regenerateScopeNote'),
          okText: L('hall.regenerateConfirm'),
        })) return;
        try {
          await Api.put(`/admin/halls/${cur.id}/layout`, { name: cur.name, rows: cur.rows, seats_per_row: cur.seats_per_row });
          toast('success', L('hall.regenerateSuccess'));
          await loadSeats();
        } catch (e) { err(e); }
      }
    }

    // create + clone modals
    let templates = [];
    (async () => {
      try {
        templates = await Api.get('/admin/hall-templates');
        const sel = $id('hc_tpl');
        sel.innerHTML = templates.map((t, i) =>
          `<option value="${esc(t.name)}" ${i === 1 ? 'selected' : ''}>${esc(L('hall.template_' + t.name))} (~${t.seat_count})</option>`).join('');
      } catch (e) { /* templates optional */ }
    })();
    $id('hl_new').onclick = () => { $id('hc_name').value = ''; CP.modal.open('hl_create_modal'); };
    $id('hc_save').onclick = async () => {
      const name = $id('hc_name').value.trim();
      if (!name) { toast('warning', L('common.requiredField')); return; }
      const tplName = $id('hc_tpl').value;
      const tpl = templates.find((t) => t.name === tplName);
      try {
        await Api.post('/admin/halls', {
          name, template: tplName || null,
          rows: tpl ? tpl.rows : 0, seats_per_row: tpl ? tpl.seats_per_row : 0,
        });
        toast('success', L('common.createSuccess'));
        CP.modal.close('hl_create_modal');
        load();
      } catch (e) { err(e); }
    };
    function openClone(hall) {
      cloning = hall;
      $id('hcl_title').textContent = tp('hall.cloneTitle', { name: hall.name });
      $id('hcl_name').value = tp('hall.cloneNameSuggestion', { name: hall.name });
      CP.modal.open('hl_clone_modal');
    }
    $id('hcl_save').onclick = async () => {
      const name = $id('hcl_name').value.trim();
      if (!name) { toast('warning', L('common.requiredField')); return; }
      try {
        await Api.post(`/admin/halls/${cloning.id}/clone`, { name });
        toast('success', L('hall.cloneSuccess'));
        CP.modal.close('hl_clone_modal');
        load();
      } catch (e) { err(e); }
    };

    searchEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { page = 1; load(); }, 400);
    });
    load();
  }

  // ============================================================ SHOWTIMES
  function initShowtimes() {
    const el = pane('showtimes');
    const rowsEl = el.querySelector('#st_rows');
    const pager = el.querySelector('#st_pager');
    let items = [], page = 1, size = 10, editing = null, optionsLoaded = false;

    const STATUS = {
      open: { label: L('showtime.statusOpen'), cls: 'ant-tag-green' },
      closed: { label: L('showtime.statusClosed'), cls: '' },
      cancelled: { label: L('showtime.statusCancelled'), cls: 'ant-tag-red' },
    };
    const st = (k) => STATUS[k] || { label: k, cls: '' };

    async function loadOptions() {
      if (optionsLoaded) return;
      const [mv, hl] = await Promise.all([Api.get('/movies?page_size=100'), Api.get('/admin/halls?page_size=100')]);
      const mo = mv.items.map((m) => `<option value="${m.id}">${esc(m.title)} (${esc(m.age_rating)})</option>`).join('');
      el.querySelector('#st_movie').insertAdjacentHTML('beforeend', mo);
      el.querySelector('#st_f_movie').innerHTML = `<option value="">${esc(L('showtime.moviePlaceholder'))}</option>` + mo;
      const ho = hl.items.map((h) => `<option value="${h.id}">${esc(h.name)}${h.active ? '' : ' — ' + esc(L('showtime.hallInactive'))}</option>`).join('');
      el.querySelector('#st_hall').insertAdjacentHTML('beforeend', ho);
      el.querySelector('#st_f_hall').innerHTML = `<option value="">${esc(L('showtime.hallPlaceholder'))}</option>` + ho;
      optionsLoaded = true;
    }

    async function load(p, ps) {
      if (p) page = p;
      if (ps) size = ps;
      const q = new URLSearchParams({ page: String(page), page_size: String(size) });
      const mv = el.querySelector('#st_movie').value; if (mv) q.set('movie_id', mv);
      const hl = el.querySelector('#st_hall').value; if (hl) q.set('hall_id', hl);
      const stt = el.querySelector('#st_status').value; if (stt) q.set('status', stt);
      const from = el.querySelector('#st_from').value; if (from) q.set('from', from);
      const to = el.querySelector('#st_to').value; if (to) q.set('to', to);
      try {
        const data = await Api.get('/admin/showtimes?' + q);
        items = data.items;
        render();
        CP.renderPagination(pager, data.meta, load);
      } catch (e) { err(e); }
    }
    function render() {
      if (!items.length) { rowsEl.innerHTML = emptyRow(6); return; }
      rowsEl.innerHTML = items.map((s) => {
        const s2 = st(s.status);
        return `<tr>
          <td class="cell-strong">${esc(s.movie_title)} <span class="ant-tag ml-2">${esc(s.age_rating)}</span></td>
          <td>${esc(s.hall_name)}</td>
          <td>${fmt.datetime(s.start_at)}</td>
          <td>${fmt.datetime(s.end_at)}</td>
          <td><span class="ant-tag ${s2.cls}">${esc(s2.label)}</span></td>
          <td><span class="flex items-center gap-1">
            <button type="button" class="ant-btn ant-btn-icon ant-btn-text" data-act="edit" data-id="${s.id}" title="${esc(L('common.edit'))}">${icon('Edit')}</button>
            ${s.status === 'open' ? `<button type="button" class="ant-btn ant-btn-icon ant-btn-text" data-act="cancel" data-id="${s.id}" title="${esc(L('showtime.cancelCta'))}">${icon('Stop')}</button>` : ''}
            <button type="button" class="ant-btn ant-btn-icon ant-btn-text ant-btn-dangerous" data-act="del" data-id="${s.id}" title="${esc(L('common.delete'))}">${icon('Delete')}</button>
          </span></td>
        </tr>`;
      }).join('');
    }

    rowsEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const s = items.find((x) => x.id === btn.dataset.id);
      if (!s) return;
      if (btn.dataset.act === 'edit') return openModal(s);
      if (btn.dataset.act === 'del') {
        if (!await CP.confirm({ title: L('showtime.deleteConfirm'), content: L('showtime.deleteHint'), okText: L('common.delete') })) return;
        try { await Api.del('/admin/showtimes/' + s.id); toast('success', L('common.deleteSuccess')); load(); } catch (ex) { err(ex); }
        return;
      }
      if (btn.dataset.act === 'cancel') {
        if (!await CP.confirm({ title: L('showtime.cancelConfirm'), content: L('showtime.cancelHint'), okText: L('showtime.cancelCta') })) return;
        try {
          const r = await Api.post(`/admin/showtimes/${s.id}/cancel`);
          const n = (r && (r.refunded_count ?? r.count ?? r.refunded)) || 0;
          toast('success', n > 0 ? tp('showtime.cancelSuccessWithRefunds', { count: n }) : L('showtime.cancelSuccess'));
          load();
        } catch (ex) { err(ex); }
      }
    });

    function openModal(s) {
      editing = s || null;
      $id('st_modal_title').textContent = s ? L('showtime.editTitle') : L('showtime.createTitle');
      $id('st_id').value = s ? s.id : '';
      $id('st_f_movie').value = s ? s.movie_id : '';
      $id('st_f_hall').value = s ? s.hall_id : '';
      $id('st_f_status').value = (s && s.status) || 'open';
      $id('st_f_start').value = s ? `${fmt.apiDate(s.start_at)}T${fmt.time(s.start_at)}` : '';
      CP.modal.open('st_modal');
    }
    async function save() {
      const movieId = $id('st_f_movie').value;
      const hallId = $id('st_f_hall').value;
      const start = $id('st_f_start').value;
      if (!movieId || !hallId || !start) { toast('warning', L('common.requiredField')); return; }
      const body = {
        movie_id: movieId, hall_id: hallId,
        start_at: start.length === 16 ? start + ':00+07:00' : start,
        status: $id('st_f_status').value,
      };
      try {
        if (editing) await Api.put('/admin/showtimes/' + editing.id, body);
        else await Api.post('/admin/showtimes', body);
        toast('success', editing ? L('common.updateSuccess') : L('common.createSuccess'));
        CP.modal.close('st_modal');
        load();
      } catch (e) { err(e); }
    }

    $id('st_new').onclick = async () => { await loadOptions(); openModal(null); };
    $id('st_save').onclick = save;
    ['st_movie', 'st_hall', 'st_status', 'st_from', 'st_to'].forEach((id) => {
      $id(id).addEventListener('change', () => { page = 1; load(); });
    });
    el.querySelectorAll('.ant-date-shell').forEach((sh) => {
      sh.addEventListener('click', () => {
        const inp = sh.querySelector('input');
        if (inp && inp.showPicker) { try { inp.showPicker(); } catch (_) { /* picker already open */ } }
      });
    });
    (async () => { await loadOptions().catch(() => {}); load(); })();
  }

  // ============================================================ CONCESSIONS
  function initConcessions() {
    const el = pane('concessions');
    const rowsEl = el.querySelector('#cc_rows');
    const pager = el.querySelector('#cc_pager');
    const searchEl = el.querySelector('#cc_search');
    const activeEl = el.querySelector('#cc_active');
    const alertEl = el.querySelector('#cc_alert');
    if (alertEl) alertEl.querySelector('.ant-alert-close').addEventListener('click', () => alertEl.remove());
    let items = [], page = 1, size = 10, timer = null, editing = null;

    async function load(p, ps) {
      if (p) page = p;
      if (ps) size = ps;
      const q = new URLSearchParams({ page: String(page), page_size: String(size) });
      const s = searchEl.value.trim();
      if (s) q.set('search', s);
      if (activeEl.value) q.set('active', activeEl.value);
      try {
        const data = await Api.get('/admin/concessions?' + q);
        items = data.items;
        render();
        CP.renderPagination(pager, data.meta, load);
      } catch (e) { err(e); }
    }
    function render() {
      if (!items.length) { rowsEl.innerHTML = emptyRow(4); return; }
      rowsEl.innerHTML = items.map((c) => {
        return `<tr>
          <td>
            <span class="block cell-strong">${esc(c.name)}</span>
            ${c.description ? `<span class="block text-xs text-[var(--text-3)]">${esc(c.description)}</span>` : ''}
          </td>
          <td class="text-right">${c.price > 0 ? fmt.money(c.price) : `<span class="ant-tag ant-tag-gold">${esc(L('concession.priceFree'))}</span>`}</td>
          <td><span class="ant-tag ${c.active ? 'ant-tag-green' : ''}">${esc(c.active ? L('concession.onSale') : L('concession.offSale'))}</span></td>
          <td><span class="flex items-center gap-1">
            <button type="button" class="ant-btn ant-btn-icon ant-btn-text" data-act="toggle" data-id="${c.id}" title="${esc(c.active ? L('concession.offSale') : L('concession.onSale'))}">${icon(c.active ? 'Stop' : 'CheckCircle')}</button>
            <button type="button" class="ant-btn ant-btn-icon ant-btn-text" data-act="edit" data-id="${c.id}" title="${esc(L('common.edit'))}">${icon('Edit')}</button>
            <button type="button" class="ant-btn ant-btn-icon ant-btn-text ant-btn-dangerous" data-act="del" data-id="${c.id}" title="${esc(L('common.delete'))}">${icon('Delete')}</button>
          </span></td>
        </tr>`;
      }).join('');
    }

    rowsEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const c = items.find((x) => x.id === btn.dataset.id);
      if (!c) return;
      const body = (active) => ({
        name: c.name, description: c.description, price: c.price, image_url: c.image_url, active,
      });
      if (btn.dataset.act === 'edit') return openModal(c);
      if (btn.dataset.act === 'toggle') {
        if (c.active && !await CP.confirm({ title: L('concession.offSaleConfirm'), okText: L('common.confirm') })) return;
        try {
          await Api.patch('/admin/concessions/' + c.id, body(!c.active));
          toast('success', L('common.updateSuccess'));
          load();
        } catch (ex) { err(ex); }
        return;
      }
      if (btn.dataset.act === 'del') {
        if (!await CP.confirm({ title: L('concession.deleteConfirm'), content: L('concession.deleteHint'), okText: L('common.delete') })) return;
        try { await Api.del('/admin/concessions/' + c.id); toast('success', L('concession.deleteSuccess')); load(); } catch (ex) { err(ex); }
      }
    });

    function openModal(c) {
      editing = c || null;
      $id('cc_modal_title').textContent = c ? L('concession.editTitle') : L('concession.createTitle');
      $id('cc_id').value = c ? c.id : '';
      $id('cc_name').value = c ? c.name : '';
      $id('cc_price').value = c ? c.price : '';
      $id('cc_image').value = (c && c.image_url) || '';
      $id('cc_desc').value = (c && c.description) || '';
      CP.switchOn($id('cc_active_sw'), c ? c.active : true);
      CP.modal.open('cc_modal');
    }
    async function save() {
      const body = {
        name: $id('cc_name').value.trim(),
        price: Number($id('cc_price').value) || 0,
        description: $id('cc_desc').value.trim() || null,
        image_url: $id('cc_image').value.trim() || null,
        active: $id('cc_active_sw').classList.contains('on'),
      };
      if (!body.name) { toast('warning', L('common.requiredField')); return; }
      try {
        if (editing) await Api.patch('/admin/concessions/' + editing.id, body);
        else await Api.post('/admin/concessions', body);
        toast('success', editing ? L('common.updateSuccess') : L('common.createSuccess'));
        CP.modal.close('cc_modal');
        load();
      } catch (e) { err(e); }
    }

    $id('cc_new').onclick = () => openModal(null);
    $id('cc_save').onclick = save;
    activeEl.addEventListener('change', () => { page = 1; load(); });
    searchEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { page = 1; load(); }, 400);
    });
    bindUpload('cc_image_file', 'cc_image', L('concession.imageUploaded'));
    load();
  }

  // ============================================================ BOOT
  const inits = { movies: initMovies, halls: initHalls, showtimes: initShowtimes, concessions: initConcessions };
  const done = {};
  function activate(key) {
    if (!inits[key] || done[key]) return;
    done[key] = true;
    try { inits[key](); } catch (e) { console.error(e); toast('error', L('common.somethingWrong')); }
  }
  root.addEventListener('cp:tab', (e) => activate(e.detail.key));
  activate(root.dataset.initial || 'movies');
})();
