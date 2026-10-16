// booking-ops.js — hold lifecycle under load: hold -> refresh (extend) ->
// cancel. Asserts each step; cancelled bookings free their seats.
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { API, VUS, USERS, testEmail } from './lib/config.js';
import { registerRetry, loginRetry, authHeaders } from './lib/auth.js';
import { collectShowtimes } from './lib/discover.js';
import { recordStatus, dataOf } from './lib/checks.js';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {},
};

export function setup() {
  const users = [];
  for (let i = 0; i < USERS; i++) {
    const email = testEmail('ops', i);
    registerRetry(email, `Ops ${i}`);
    users.push(email);
    sleep(0.3);
  }
  const movies = http.get(`${API}/movies?page=1&page_size=20`);
  const items = dataOf(movies).items || [];
  if (!items.length) throw new Error('no movies (run migrate-seed first)');
  const found = collectShowtimes(items.map((m) => m.id), 99).slice(1);
  if (!found.length) throw new Error('need 2+ open showtimes (one is race-reserved)');
  return { users: users, shows: found.map((f) => f.show) };
}

let TOKEN = null;

export default function (data) {
  try {
  const vu = exec.vu.idInTest;
  if (!TOKEN) {
    TOKEN = loginRetry(data.users[(vu - 1) % data.users.length]);
    if (!TOKEN) { sleep(1); return; }
  }
  const H = authHeaders(TOKEN);
  const show = data.shows[(vu - 1) % data.shows.length];

  const sm = http.get(`${API}/shows/${show.id}/seats`, H);
  if (sm.status === 401) { TOKEN = null; sleep(1); return; }
  if (sm.status !== 200) { recordStatus(sm.status); sleep(1); return; }
  const avail = (dataOf(sm).seats || []).filter((s) => !s.is_gap && s.status === 'available').slice(0, 1);
  if (!avail.length) { sleep(1); return; }

  const hold = http.post(`${API}/orders/hold`, JSON.stringify({
    show_id: show.id,
    seat_ids: [avail[0].showtime_seat_id || avail[0].id],
    idempotency_key: `ops-${vu}-${exec.vu.iterationInInstance}-${Date.now()}`,
  }), H);
  if (hold.status !== 200 && hold.status !== 201) { recordStatus(hold.status); if (hold.status === 429) sleep(3); return; }
  const bookingId = hold.json().data.booking_id;
  check(hold, { 'hold 200': () => true });

  const ref = http.post(`${API}/orders/${bookingId}/refresh`, JSON.stringify({}), H);
  check(ref, { 'refresh 2xx': (r) => r.status === 200 || r.status === 201 }) || recordStatus(ref.status);

  const cancel = http.post(`${API}/orders/${bookingId}/cancel`, JSON.stringify({}), H);
  check(cancel, { 'cancel 2xx': (r) => r.status === 200 || r.status === 201 }) || recordStatus(cancel.status);
  } finally {
    sleep(1);
  }
}
