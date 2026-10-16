// Auth helpers: register throwaway users, login, bearer headers.
// Token envelope: { code, message, data: { access_token, refresh_token } }.
import http from 'k6/http';
import { sleep } from 'k6';
import { API, PASSWORD } from './config.js';

export function register(email, fullName) {
  return http.post(
    `${API}/auth/register`,
    JSON.stringify({ email: email, password: PASSWORD, full_name: fullName || email }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

// Register with backoff on 429. 409 (already exists) counts as usable:
// retrying the same email after a 429 lands here once the limiter refills.
export function registerRetry(email, fullName) {
  let r = null;
  for (let i = 0; i < 6; i++) {
    r = register(email, fullName);
    if (r.status === 200 || r.status === 201 || r.status === 409) return r;
    if (r.status !== 429) return r;
    sleep(1 + i * 2);
  }
  return r;
}

export function login(email, password) {
  const r = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: email, password: password || PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (r.status !== 200) return null;
  try {
    return r.json().data.access_token;
  } catch (e) {
    return null;
  }
}

// Login with backoff on 429 (shared auth limiter). Returns token or null.
export function loginRetry(email, password) {
  for (let i = 0; i < 6; i++) {
    const t = login(email, password);
    if (t) return t;
    sleep(1 + i * 2);
  }
  return null;
}

export function authHeaders(token) {
  return { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
}
