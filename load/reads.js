// reads.js — catalog soak: movies, details, showtimes, seatmaps in a loop.
// No writes. Baseline run records latencies; set thresholds after it.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, VUS, DEMO_CUSTOMER } from './lib/config.js';
import { loginRetry, authHeaders } from './lib/auth.js';
import { recordStatus, dataOf } from './lib/checks.js';

export const options = {
  stages: [
    { duration: '1m', target: VUS },
    { duration: '3m', target: VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {},
};

export function setup() {
  const token = loginRetry(DEMO_CUSTOMER.email, DEMO_CUSTOMER.password);
  if (!token) throw new Error('setup login failed (demo customer)');
  const movies = http.get(`${API}/movies?page=1&page_size=20`);
  const items = dataOf(movies).items || [];
  if (!items.length) throw new Error('no movies (run migrate-seed first)');
  return { token: token, movieIds: items.map((m) => m.id) };
}

export default function (data) {
  const H = authHeaders(data.token);
  const movieId = data.movieIds[__VU % data.movieIds.length];

  let r = http.get(`${API}/movies?page=1&page_size=20`);
  check(r, { 'movies 2xx': (x) => x.status === 200 }) || recordStatus(r.status);

  r = http.get(`${API}/movies/${movieId}`);
  check(r, { 'movie detail 2xx': (x) => x.status === 200 }) || recordStatus(r.status);

  r = http.get(`${API}/movies/${movieId}/showtimes`);
  check(r, { 'showtimes 2xx': (x) => x.status === 200 }) || recordStatus(r.status);
  const shows = r.status === 200 ? (dataOf(r) || []).filter((s) => s.status === 'open') : [];

  if (shows.length) {
    const sid = shows[(__VU + __ITER) % shows.length].id;
    r = http.get(`${API}/shows/${sid}/seats`, H);
    check(r, { 'seatmap 2xx': (x) => x.status === 200 }) || recordStatus(r.status);
  }
  sleep(1 + Math.random() * 2);
}
