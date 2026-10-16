// race.js — N VUs hold the SAME seat at once (thundering herd).
// Tokens are pre-fetched in setup (paced): the herd races HOLDS, not logins.
// Correct outcome: exactly ONE winner; losers get 409 (lost race) or 429
// (rate limit). Any 5xx or a second winner is a real bug.
// Uses discovered[0] showtime, which booking.js skips (same order).
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { API, testEmail } from './lib/config.js';
import { registerRetry, loginRetry, authHeaders } from './lib/auth.js';
import { collectShowtimes } from './lib/discover.js';
import { recordStatus } from './lib/checks.js';

const RACE_VUS = parseInt(__ENV.RACE_VUS || '50', 10);
const winners = new Counter('race_winners');

export const options = {
  scenarios: {
    herd: {
      executor: 'per-vu-iterations',
      vus: RACE_VUS,
      iterations: 1,
      maxDuration: '3m',
    },
  },
  thresholds: {
    race_winners: ['count==1'],
    unexpected_5xx: ['count==0'],
  },
};

export function setup() {
  const users = [];
  for (let i = 0; i < RACE_VUS; i++) {
    const email = testEmail('race', i);
    registerRetry(email, `Race ${i}`);
    users.push(email);
    sleep(0.5);
  }
  const movies = http.get(`${API}/movies?page=1&page_size=20`).json().data.items;
  if (!movies.length) throw new Error('no movies (run migrate-seed first)');
  // discovered[0]: same deterministic pick booking.js skips.
  const found = collectShowtimes(movies.map((m) => m.id), 1);
  if (!found.length) throw new Error('no open showtime for race');
  // Pre-authenticate the herd: paced so the auth limiter survives setup.
  const tokens = [];
  for (const email of users) {
    tokens.push(loginRetry(email));
    sleep(0.5);
  }
  const live = tokens.filter((t) => !!t);
  if (!live.length) throw new Error('no tokens (auth limiter saturated, retry later)');
  const showId = found[0].show.id;
  const sm = http.get(`${API}/shows/${showId}/seats`, authHeaders(live[0])).json().data;
  const seat = sm.seats.find((s) => !s.is_gap && s.status === 'available');
  if (!seat) throw new Error('no available seat for race');
  return { tokens: tokens, showId: showId, seatId: seat.showtime_seat_id || seat.id };
}

export default function (data) {
  const token = data.tokens[(exec.vu.idInTest - 1) % data.tokens.length];
  if (!token) return;
  const r = http.post(`${API}/orders/hold`, JSON.stringify({
    show_id: data.showId,
    seat_ids: [data.seatId],
    idempotency_key: `race-${exec.vu.idInTest}-${Date.now()}`,
  }), authHeaders(token));
  if (r.status === 200 || r.status === 201) winners.add(1);
  else if (!recordStatus(r.status)) {
    check(r, { 'loser gets 409/429': (x) => x.status === 409 || x.status === 429 });
  }
}
