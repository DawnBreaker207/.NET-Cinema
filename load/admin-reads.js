// admin-reads.js — heavy operator endpoints under load (admin demo account).
// These run the costliest queries (overview, audit, daily/breakdown reports).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, VUS, DEMO_ADMIN } from './lib/config.js';
import { login, authHeaders } from './lib/auth.js';
import { recordStatus } from './lib/checks.js';

const PATHS = [
  '/admin/overview',
  '/admin/audit-logs?page=1&page_size=20',
  '/admin/reports/daily',
  '/admin/reports/breakdown',
  '/staff/overview',
  '/users/me',
];

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {},
};

export function setup() {
  const token = login(DEMO_ADMIN.email, DEMO_ADMIN.password);
  if (!token) throw new Error('setup admin login failed (seeded admin)');
  return { token: token };
}

export default function (data) {
  const H = authHeaders(data.token);
  const p = PATHS[(__VU + __ITER) % PATHS.length];
  const r = http.get(`${API}${p}`, H);
  check(r, { [`GET ${p} 2xx`]: (x) => x.status === 200 }) || recordStatus(r.status);
  sleep(1);
}
