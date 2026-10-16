// spike.js — flash-sale spike: 0 -> 200 VUs in 30s, hold 2 min, drop.
// Loop = reads + 10% hold cycles (own user per VU from setup pool).
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { API, USERS, testEmail } from './lib/config.js';
import { registerRetry, loginRetry, authHeaders } from './lib/auth.js';
import { collectShowtimes } from './lib/discover.js';
import { recordStatus, dataOf } from './lib/checks.js';

export const options = {
  stages: [
    { duration: '30s', target: 200 },
    { duration: '2m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {},
};

export function setup() {
  const users = [];
  for (let i = 0; i < USERS; i++) {
    const email = testEmail('spike', i);
    registerRetry(email, `Spike ${i}`);
    users.push(email);
    sleep(0.3);
  }
  const movies = http.get(`${API}/movies?page=1&page_size=20`);
  const items = dataOf(movies).items || [];
  if (!items.length) throw new Error('no movies (run migrate-seed first)');
  const found = collectShowtimes(items.map((m) => m.id), 1);
  if (!found.length) throw new Error('no open showtime for spike');
  return { users: users, showId: found[0].show.id };
}

let TOKEN = null;

export default function (data) {
  const email = data.users[(exec.vu.idInTest - 1) % data.users.length];
  if (!TOKEN) {
    TOKEN = loginRetry(email);
    if (!TOKEN) { sleep(1); return; }
  }
  const H = authHeaders(TOKEN);

  let r = http.get(`${API}/movies?page=1&page_size=20`);
  check(r, { 'movies 2xx': (x) => x.status === 200 }) || recordStatus(r.status);
  const items = r.status === 200 ? r.json().data.items : [];
  if (!items.length) { sleep(1); return; }

  if (exec.vu.iterationInInstance % 10 === 0) {
    const sm = http.get(`${API}/shows/${data.showId}/seats`, H);
    if (sm.status !== 200) { if (sm.status === 401) TOKEN = null; recordStatus(sm.status); sleep(1); return; }
    const avail = (dataOf(sm).seats || []).filter((s) => !s.is_gap && s.status === 'available').slice(0, 1);
    if (!avail.length) { sleep(1); return; }
    r = http.post(`${API}/orders/hold`, JSON.stringify({
      show_id: data.showId,
      seat_ids: [avail[0].showtime_seat_id || avail[0].id],
      idempotency_key: `spike-${exec.vu.idInTest}-${exec.vu.iterationInInstance}-${Date.now()}`,
    }), H);
    if (r.status !== 200 && r.status !== 201) { recordStatus(r.status); if (r.status === 429) sleep(3); }
  }
  sleep(1);
}
