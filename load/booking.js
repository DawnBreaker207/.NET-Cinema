// booking.js — full write flow under load: hold -> pay (mock) -> confirm.
// Data partitioning (no accidental wars): VU i uses user pool[i] and
// showtimes[1 + (i % (n-1))]; showtime[0] is reserved for race.js.
// Confirm is RECORDED, not asserted (needs a settled payment first).
// Every iteration ends in sleep: early returns never spin.
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { API, VUS, USERS, HOLD_SEATS, testEmail } from './lib/config.js';
import { registerRetry, loginRetry, authHeaders } from './lib/auth.js';
import { collectShowtimes } from './lib/discover.js';
import { recordStatus, holdLatency, payLatency, confirmLatency, dataOf } from './lib/checks.js';

export const options = {
  stages: [
    { duration: '1m', target: VUS },
    { duration: '3m', target: VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {},
};

export function setup() {
  const users = [];
  for (let i = 0; i < USERS; i++) {
    const email = testEmail('book', i);
    registerRetry(email, `Book ${i}`);
    users.push(email);
    sleep(0.3);
  }
  const movies = http.get(`${API}/movies?page=1&page_size=20`);
  const items = dataOf(movies).items || [];
  if (!items.length) throw new Error('no movies (run migrate-seed first)');
  // Skip discovered[0]: reserved for race.js (same deterministic order).
  const found = collectShowtimes(items.map((m) => m.id), 99).slice(1);
  if (!found.length) throw new Error('need 2+ open showtimes (one is race-reserved)');
  return { users: users, shows: found.map((f) => f.show) };
}

let TOKEN = null;

export default function (data) {
  try {
    const vu = exec.vu.idInTest;
    // Token reuse: login once per VU (15m TTL outlives the run). 401 resets it.
    if (!TOKEN) {
      TOKEN = loginRetry(data.users[(vu - 1) % data.users.length]);
      if (!TOKEN) return;
    }
    const H = authHeaders(TOKEN);
    const show = data.shows[(vu - 1) % data.shows.length];

    const sm = http.get(`${API}/shows/${show.id}/seats`, H);
    if (sm.status === 401) { TOKEN = null; return; }
    if (sm.status !== 200) { recordStatus(sm.status); return; }
    const avail = (dataOf(sm).seats || []).filter((s) => !s.is_gap && s.status === 'available').slice(0, HOLD_SEATS);
    if (!avail.length) return;

    const t0 = Date.now();
    const hold = http.post(`${API}/orders/hold`, JSON.stringify({
      show_id: show.id,
      seat_ids: avail.map((s) => s.showtime_seat_id || s.id),
      idempotency_key: `book-${vu}-${exec.vu.iterationInInstance}-${Date.now()}`,
    }), H);
    holdLatency.add(Date.now() - t0);
    const hb = dataOf(hold);
    if (hold.status === 401) { TOKEN = null; return; }
    if (hold.status !== 200 && hold.status !== 201) { recordStatus(hold.status); if (hold.status === 429) sleep(3); return; }
    check(hold, { 'hold has booking_id': () => !!hb.booking_id });
    if (!hb.booking_id) return;

    const t1 = Date.now();
    const pay = http.post(`${API}/orders/${hb.booking_id}/pay`, JSON.stringify({ provider: 'mock' }), H);
    payLatency.add(Date.now() - t1);
    if (pay.status !== 200 && pay.status !== 201) { recordStatus(pay.status); return; }

    const t2 = Date.now();
    const confirm = http.post(`${API}/orders/${hb.booking_id}/confirm`, JSON.stringify({}), H);
    confirmLatency.add(Date.now() - t2);
    console.log(`confirm status=${confirm.status}`);
  } finally {
    sleep(1);
  }
}
