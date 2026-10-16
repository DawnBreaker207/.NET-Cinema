// Shared Ajax helper for Razor pages: calls the same /api/v1/* JSON API as React.
// Auth: same-origin cookies flow automatically (Web scheme); if a JWT exists
// in sessionStorage (e.g. after API login) it is sent as Bearer instead.
// Shared Ajax helper for Razor pages: calls the same /api/v1/* JSON API as React.
// Loaded by the layout AND by legacy views - guard so a second include is a no-op.
window.Api = window.Api || (function () {
  const base = '/api/v1';

  function token() { return sessionStorage.getItem('cinema.at'); }

  async function req(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const t = token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch(base + path, {
      method, credentials: 'same-origin', headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && !path.startsWith('/auth/')) {
      sessionStorage.removeItem('cinema.at');
      if (!t) window.location.href = '/account/login';
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data.code !== undefined && data.code !== 0)) {
      throw {
        code: data.code ?? res.status,
        message: data.message || res.statusText,
        reason: data.reason,
        details: data.details,
      };
    }
    return data.data;
  }

  return {
    get: (p) => req('GET', p),
    post: (p, b) => req('POST', p, b),
    put: (p, b) => req('PUT', p, b),
    patch: (p, b) => req('PATCH', p, b),
    del: (p) => req('DELETE', p),
    setToken: (t) => sessionStorage.setItem('cinema.at', t),
    clearToken: () => sessionStorage.removeItem('cinema.at'),
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  };
})();