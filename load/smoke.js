// smoke.js — 1 VU walks the full customer flow once. Every check must pass.
// Purpose: prove the flow is completable before any load run.
// NOTE on mock checkout: pay returns a redirect_url to the mock gateway page.
// Following it needs a browser-like form submit, out of scope here; smoke
// asserts pay initiation (redirect_url present). Confirm is attempted and its
// status LOGGED (409 booking_not_paid is correct: settling needs checkout).
import http from 'k6/http';
import { check } from 'k6';
import { API, testEmail } from './lib/config.js';
import { register, login, authHeaders } from './lib/auth.js';
import { collectShowtimes } from './lib/discover.js';
import { dataOf } from './lib/checks.js';

export const options = {
  scenarios: { one: { executor: 'per-vu-iterations', vus: 1, iterations: 1 } },
  thresholds: { checks: ['rate==1.0'] },
};

export default function () {
  const email = testEmail('smoke', 1);

  const reg = register(email, 'Smoke Test');
  check(reg, { 'register 2xx': (r) => r.status === 200 || r.status === 201 });

  const token = login(email);
  check(token, { 'login returns token': (t) => !!t });
  if (!token) return;
  const H = authHeaders(token);

  const movies = http.get(`${API}/movies?page=1&page_size=20`);
  const items = dataOf(movies).items || [];
  check(movies, { 'movies 200 + non-empty': (r) => r.status === 200 && items.length > 0 });
  if (!items.length) return;

  const found = collectShowtimes(items.map((m) => m.id), 1);
  check(found, { 'open future showtime exists': (a) => a.length > 0 });
  if (!found.length) return;
  const showId = found[0].show.id;

  const sm = http.get(`${API}/shows/${showId}/seats`, H);
  const seats = (dataOf(sm).seats || []).filter((s) => !s.is_gap && s.status === 'available');
  check(sm, { 'seatmap 200': (r) => r.status === 200 });
  check(seats, { 'available seat exists': (a) => a.length > 0 });
  if (!seats.length) return;

  const hold = http.post(`${API}/orders/hold`,
    JSON.stringify({ show_id: showId, seat_ids: [seats[0].showtime_seat_id || seats[0].id], idempotency_key: `smoke-${Date.now()}` }), H);
  const hb = dataOf(hold);
  check(hold, { 'hold 2xx + booking_id': (r) => (r.status === 200 || r.status === 201) && !!hb.booking_id });
  if (!hb.booking_id) return;

  const pay = http.post(`${API}/orders/${hb.booking_id}/pay`, JSON.stringify({ provider: 'mock' }), H);
  const pb = dataOf(pay);
  check(pay, { 'pay 2xx + redirect_url': (r) => (r.status === 200 || r.status === 201) && !!pb.redirect_url });

  const confirm = http.post(`${API}/orders/${hb.booking_id}/confirm`, JSON.stringify({}), H);
  console.log(`confirm status=${confirm.status} body=${confirm.body.slice(0, 160)}`);
}
