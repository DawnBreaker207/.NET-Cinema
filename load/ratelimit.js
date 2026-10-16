// ratelimit.js — ramp one public endpoint until 429s appear.
// Goal: find the REAL limit onset vs RATE_LIMIT_* env, verify 429 shape
// (never 500), watch recovery after cooldown. No auth (public path).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { API } from './lib/config.js';
import { expected429, unexpected5xx } from './lib/checks.js';

const first429at = new Trend('first_429_rps');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {},
};

let reported = false;

export default function () {
  // No sleep: maximum pressure per VU to find the onset fast.
  const r = http.get(`${API}/movies?page=1&page_size=5`);
  if (r.status === 429) {
    expected429.add(1);
    if (!reported) {
      reported = true;
      console.log(`first 429 at VU=${__VU} iter=${__ITER}`);
    }
  } else if (r.status >= 500 || r.status === 0) {
    unexpected5xx.add(1);
  } else {
    check(r, { 'non-limited 2xx': (x) => x.status === 200 });
  }
}
