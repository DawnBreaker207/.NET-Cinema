// Status classification shared by all scenarios.
// 409 (lost race / already held) and 429 (rate limit) are EXPECTED outcomes:
// counted separately, never treated as failures. Only 5xx/unexpected fail.
import { Counter, Trend } from 'k6/metrics';

export const expected409 = new Counter('expected_409');
export const expected429 = new Counter('expected_429');
export const unexpected5xx = new Counter('unexpected_5xx');
export const holdLatency = new Trend('hold_latency');
export const payLatency = new Trend('pay_latency');
export const confirmLatency = new Trend('confirm_latency');

export function ok2xx(s) {
  return s >= 200 && s < 300;
}

// JSON that never throws: error bodies (429 pages, HTML) parse to {}.
export function tryJson(r) {
  try {
    return r.json();
  } catch (e) {
    return {};
  }
}

export function dataOf(r) {
  const j = tryJson(r);
  return (j && j.data) || {};
}

// Record one response status into the expected/fail counters. Returns true
// when the caller should treat it as a hard failure.
export function recordStatus(s) {
  if (s === 409) {
    expected409.add(1);
    return false;
  }
  if (s === 429) {
    expected429.add(1);
    return false;
  }
  if (s >= 500 || s === 0) {
    unexpected5xx.add(1);
    return true;
  }
  return false;
}
