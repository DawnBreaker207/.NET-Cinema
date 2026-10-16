// soak.js — endurance: low VUs for 30 min to catch leaks (memory,
// connections, hold-expiry sweeps, audit growth). Reads + periodic hold/cancel.
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';import { API, DEMO_CUSTOMER, USERS, testEmail } from './lib/config.js';
import { registerRetry, loginRetry, authHeaders } from './lib/auth.js';
import { collectShowtimes } from './lib/discover.js';
import { recordStatus, dataOf } from './lib/checks.js';

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '10m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {},
};

export function setup() {
  const token = loginRetry(DEMO_CUSTOMER.email, DEMO_CUSTOMER.password);
  if (!token) throw new Error('setup login failed (demo customer)');
  const users = [];
  for (let i = 0; i < Math.min(USERS, 20); i++) {
    const email = testEmail('soak', i);
    registerRetry(email, `Soak ${i}`);
    users.push(email);
    sleep(0.3);
  }
  const movies = http.get(`${API}/movies?page=1&page_size=20`);
  const items = dataOf(movies).items || [];
  if (!items.length) throw new Error('no movies (run migrate-seed first)');
  const found = collectShowtimes(items.map((m) => m.id), 1);
  if (!found.length) throw new Error('no open showtime for soak');
  return { token: token, users: users, showId: found[0].show.id };
}

export default function (data) {
  const H = authHeaders(data.token);
  const r = http.get(`${API}/movies?page=1&page_size=20`);
  check(r, { 'movies 2xx': (x) => x.status === 200 }) || recordStatus(r.status);
  const items = r.status === 200 ? r.json().data.items : [];

  // Every 10th iteration per VU: full hold -> cancel cycle (exercises TTL sweep).
  if (items.length && exec.vu.iterationInInstance % 10 === 0) {
    const token = loginRetry(data.users[exec.vu.idInTest % data.users.length]);
    if (token) {
      const HH = authHeaders(token);
      const sm = http.get(`${API}/shows/${data.showId}/seats`, HH);
      if (sm.status === 200) {
        const avail = (dataOf(sm).seats || []).filter((s) => !s.is_gap && s.status === 'available').slice(0, 1);
        if (avail.length) {
          const hold = http.post(`${API}/orders/hold`, JSON.stringify({
            show_id: data.showId,
              seat_ids: [avail[0].showtime_seat_id || avail[0].id],
              idempotency_key: `soak-${exec.vu.idInTest}-${exec.vu.iterationInInstance}-${Date.now()}`,
            }), HH);
            if (hold.status === 200 || hold.status === 201) {
              const cancel = http.post(`${API}/orders/${hold.json().data.booking_id}/cancel`, JSON.stringify({}), HH);
              check(cancel, { 'cancel 2xx': (x) => x.status === 200 || x.status === 201 }) || recordStatus(cancel.status);
            } else recordStatus(hold.status);
          }
        } else recordStatus(sm.status);
      }
    }
  }
  sleep(5 + Math.random() * 5);
}
