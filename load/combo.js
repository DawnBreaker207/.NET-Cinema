// combo.js — concession orders under load (secondary write path).
// Body: { items: [{ combo_id, quantity }] } (+ optional booking_id, unused).
// Combo IDs come from public GET /combos. Authenticated (customer token).
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';import { API, USERS, testEmail } from './lib/config.js';
import { registerRetry, loginRetry, authHeaders } from './lib/auth.js';
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
    const email = testEmail('combo', i);
    registerRetry(email, `Combo ${i}`);
    users.push(email);
    sleep(0.3);
  }
  const r = http.get(`${API}/combos`);
  const items = r.status === 200 ? (r.json().data.items || r.json().data) : [];
  if (!items.length) throw new Error('no combos (run migrate-seed first)');
  return { users: users, comboIds: items.filter((c) => c.active !== false).map((c) => c.id) };
}

let TOKEN = null;

export default function (data) {
  if (!TOKEN) {
    TOKEN = loginRetry(data.users[(exec.vu.idInTest - 1) % data.users.length]);
    if (!TOKEN) { sleep(1); return; }
  }
  const cid = data.comboIds[exec.vu.iterationInInstance % data.comboIds.length];
  const r = http.post(`${API}/combo-orders`,
    JSON.stringify({ items: [{ combo_id: cid, quantity: 1 + (exec.vu.iterationInInstance % 3) }] }),
    authHeaders(TOKEN));
  check(r, { 'combo order 2xx + id': (x) => (x.status === 200 || x.status === 201) && !!dataOf(x).id }) || recordStatus(r.status);
  if (r.status === 429) sleep(3);
  sleep(1);
}
