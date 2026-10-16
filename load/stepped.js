// stepped.js — stepped load 10 -> 50 -> 100 -> 200 VUs, 5 min hold per level.
// Same loop as reads.js (catalog soak, no writes). One JSON per run = record.
// Thresholds stay empty until the baseline run sets them.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, DEMO_CUSTOMER } from './lib/config.js';
import { loginRetry, authHeaders } from './lib/auth.js';
import { recordStatus, dataOf } from './lib/checks.js';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 200 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 0 },
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
