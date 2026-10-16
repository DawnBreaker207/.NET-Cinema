// auth.js — login/refresh rotation under load + lockout probe.
// Scenarios share nothing; lockout probe uses a DEDICATED user so the
// account lock it triggers never affects other scenarios.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, VUS, PASSWORD, testEmail } from './lib/config.js';
import { registerRetry, login } from './lib/auth.js';
import { recordStatus, dataOf } from './lib/checks.js';

export const options = {
  scenarios: {
    login_loop: {
      executor: 'ramping-vus',
      startVUs: 1,
      // Paced to ~3rps: measures healthy login latency. Heavier login load
      // just documents the auth limiter (see ratelimit.js for that).
      stages: [{ duration: '1m', target: 8 }, { duration: '2m', target: 8 }, { duration: '30s', target: 0 }],
      exec: 'loginLoop',
    },
    refresh_loop: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [{ duration: '1m', target: 4 }, { duration: '2m', target: 4 }, { duration: '30s', target: 0 }],
      exec: 'refreshLoop',
    },
    lockout_probe: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      exec: 'lockoutProbe',
    },
  },
  thresholds: {},
};

export function setup() {
  const users = [];
  for (let i = 0; i < 20; i++) {
    const email = testEmail('auth', i);
    registerRetry(email, `Auth ${i}`);
    users.push(email);
    sleep(0.3);
  }
  const lockEmail = testEmail('lockout', 1);
  registerRetry(lockEmail, 'Lockout Probe');
  return { users: users, lockEmail: lockEmail };
}

export function loginLoop(data) {
  const email = data.users[__VU % data.users.length];
  const r = http.post(`${API}/auth/login`,
    JSON.stringify({ email: email, password: PASSWORD, device_id: `k6-${__VU}` }),
    { headers: { 'Content-Type': 'application/json' } });
  check(r, { 'login 2xx + token': (x) => (x.status === 200 || x.status === 201) && !!dataOf(x).access_token }) || recordStatus(r.status);
  sleep(1 + Math.random() * 2);
}

export function refreshLoop(data) {
  const email = data.users[__VU % data.users.length];
  const lr = http.post(`${API}/auth/login`,
    JSON.stringify({ email: email, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } });
  if (lr.status !== 200 && lr.status !== 201) { recordStatus(lr.status); sleep(2); return; }
  const rt = dataOf(lr).refresh_token;
  if (!rt) { sleep(2); return; }
  const r = http.post(`${API}/auth/refresh`, JSON.stringify({ refresh_token: rt }),
    { headers: { 'Content-Type': 'application/json' } });
  check(r, { 'refresh 2xx + new pair': (x) => (x.status === 200 || x.status === 201) && !!dataOf(x).access_token }) || recordStatus(r.status);
  sleep(2);
}

export function lockoutProbe(data) {
  // 7 wrong passwords: must NEVER return 200 or 5xx; lockout (non-200) is
  // the correct system answer, recorded here for the report.
  for (let i = 0; i < 7; i++) {
    const r = http.post(`${API}/auth/login`,
      JSON.stringify({ email: data.lockEmail, password: 'wrong-pass' }),
      { headers: { 'Content-Type': 'application/json' } });
    console.log(`lockout attempt ${i + 1}: status=${r.status}`);
    check(r, { 'wrong pass never 200/5xx': (x) => x.status !== 200 && x.status < 500 });
    sleep(1);
  }
}
