// events.js — SSE realtime stream probe (experimental).
// k6 cannot consume SSE frames: it buffers until timeout. So the assertion
// is inverted: a LONG-lived 200/timeout means the stream stays open (PASS),
// an immediate 401/404 means auth/routing is broken (FAIL).
// Token comes from GET /events/token (authenticated); stream at
// GET /events/shows/:id?token=... If the token endpoint shape differs, the
// setup error tells you the actual contract — adjust and rerun.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, VUS, DEMO_CUSTOMER } from './lib/config.js';
import { loginRetry, authHeaders } from './lib/auth.js';
import { collectShowtimes } from './lib/discover.js';
import { recordStatus } from './lib/checks.js';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '2m', target: 5 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {},
};

export function setup() {
  const token = loginRetry(DEMO_CUSTOMER.email, DEMO_CUSTOMER.password);
  if (!token) throw new Error('setup login failed (demo customer)');
  const movies = http.get(`${API}/movies?page=1&page_size=5`).json().data.items;
  if (!movies.length) throw new Error('no movies (run migrate-seed first)');
  const found = collectShowtimes(movies.map((m) => m.id), 1);
  if (!found.length) throw new Error('no open showtime for SSE probe');
  // Token is per-showtime: /events/token?show_id=... (400 without it).
  const tr = http.get(`${API}/events/token?show_id=${found[0].show.id}`, authHeaders(token));
  if (tr.status !== 200) throw new Error(`events/token -> ${tr.status} (check contract): ${tr.body.slice(0, 120)}`);
  let sseToken;
  try {
    const d = tr.json().data;
    sseToken = typeof d === 'string' ? d : (d.token || d.sse_token);
  } catch (e) { sseToken = null; }
  if (!sseToken) throw new Error('no SSE token in /events/token response (check contract)');
  return { sseToken: sseToken, showId: found[0].show.id };
}

export default function (data) {
  // 12s client timeout against a stream that never ends: surviving past
  // ~10s proves the stream stays open under (idle) load.
  const r = http.get(`${API}/events/shows/${data.showId}?token=${data.sseToken}`, { timeout: '12s' });
  check(r, { 'stream stays open (>=10s, no 4xx/5xx)': (x) => (x.status === 200 && x.timings.duration >= 9000) || x.error_code === 1050 }) || recordStatus(r.status);
  sleep(5);
}
