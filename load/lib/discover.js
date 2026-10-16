// Showtime discovery: ListForMovie is DAY-scoped (?date=, default today),
// so search today + next 3 days (seed covers exactly that window).
// Deterministic for a given DB state (API order stable) — race.js takes
// discovered[0], booking.js skips it via slice(1). No overlap.
import http from 'k6/http';
import { API } from './config.js';

export function listMovies(pageSize) {
  const r = http.get(`${API}/movies?page=1&page_size=${pageSize || 20}`);
  if (r.status !== 200) return [];
  try {
    return r.json().data.items || [];
  } catch (e) {
    return [];
  }
}

// YYYY-MM-DD in cinema TZ (PC runs +07 too; adjust if yours differs).
function dayStr(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function openFuture(movieId) {
  const out = [];
  for (let day = 0; day < 4; day++) {
    const r = http.get(`${API}/movies/${movieId}/showtimes?date=${dayStr(day)}`);
    if (r.status !== 200) continue;
    let arr = [];
    try {
      arr = r.json().data || [];
    } catch (e) {
      continue;
    }
    const now = new Date();
    for (const s of arr) {
      if (s.status === 'open' && new Date(s.start_at) > now) out.push({ show: s, movieId: movieId });
    }
  }
  return out;
}

// Collect open future showtimes across movies in order, up to minCount.
export function collectShowtimes(movieIds, minCount) {
  const out = [];
  const need = minCount || 1;
  for (const id of movieIds) {
    for (const s of openFuture(id)) {
      out.push(s);
      if (out.length >= need) return out;
    }
  }
  return out;
}
