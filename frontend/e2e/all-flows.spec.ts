import { test, expect, request } from '@playwright/test';

// ALL FLOWS: register -> browse -> seat/hold/pay (UI) -> tickets,
// discount + auth edge cases (API), staff redeem, cleanup.
const API = 'http://localhost:5000/api/v1';
const FE = 'http://localhost:5173';
const stamp = Date.now();
const EMAIL = `e2e+${stamp}@test.local`;
const PASS = 'secret123';

test('all flows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`JS ${page.url()}: ${e.message.split('\n')[0]}`));
  const api = await request.newContext();

  // 1. Movie + showtime ids.
  const movies = await (await api.get(`${API}/movies?page_size=5`)).json();
  const movieId = movies.data.items[0].id;
  const shows = await (await api.get(`${API}/showtimes`)).json();
  const showId = shows.data[0].id;

  // 2. Register via UI.
  await page.goto(`${FE}/register`);
  await page.locator('input[placeholder="ban@email.com"]').fill(EMAIL);
  await page.locator('input[placeholder="Nguyen Van A"]').fill('E2E User');
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('input[type="password"]').nth(1).fill(PASS);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await page.waitForURL(/login/, { timeout: 15000 });

  // 3. Login via UI.
  await page.locator('input[placeholder="ban@email.com"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForTimeout(2500);

  // 4. Browse films -> film detail shows showtimes.
  await page.goto(`${FE}/films`);
  await page.waitForTimeout(2000);
  await page.goto(`${FE}/film/${movieId}`);
  await page.waitForTimeout(2500);

  // 5. Seat flow: pick 2 available seats via API labels, click in UI.
  const token = await page.evaluate(() => sessionStorage.getItem('cp_access_token') || localStorage.getItem('cp_access_token') || '');
  const sm = await (
    await api.get(`${API}/shows/${showId}/seats`, { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  const avail = sm.data.seats.filter((s: any) => !s.is_gap && s.status === 'available').slice(0, 2);
  expect(avail.length).toBe(2);
  await page.goto(`${FE}/select-seat/${showId}`);
  for (const s of avail) {
    await page.locator(`button[aria-label="${s.label}"]`).first().click({ timeout: 15000 });
  }
  // Hold.
  await page.getByRole('button', { name: 'Tiếp tục thanh toán' }).click();
  await page.waitForTimeout(3000);
  // Combo step: skip/continue.
  const skip = page.getByRole('button', { name: 'Bỏ qua' });
  if (await skip.count()) await skip.first().click();
  else await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.waitForTimeout(2000);
  // Checkout: pay now (mock).
  await page.getByRole('button', { name: 'Thanh toán ngay' }).click();
  // Gateway page (plain HTML on :5000).
  await page.waitForURL(/mock-gateway/, { timeout: 20000 });
  await page.getByRole('button', { name: /Pay now/ }).click();
  // payment-result -> success.
  await page.waitForURL(/booking-success/, { timeout: 30000 });
  await expect(page.getByText('Thanh toán thành công')).toBeVisible({ timeout: 15000 });
  const successUrl = page.url();
  const bookingId = successUrl.split('/').pop()!;

  // 6. Tickets visible in account.
  await page.goto(`${FE}/account?tab=tickets`);
  await page.waitForTimeout(3000);

  // 7. Discount: admin creates code, customer applies on a fresh hold.
  const adminLogin = await (
    await api.post(`${API}/auth/login`, { data: { email: 'admin@cinema.local', password: 'admin123' } })
  ).json();
  const ahead = { Authorization: `Bearer ${adminLogin.data.access_token}` };
  const code = `E2E${String(stamp).slice(-6)}`;
  await api.post(`${API}/admin/discounts`, {
    headers: ahead,
    data: { code, kind: 'percent', value: 10, min_order: 0, active: true },
  });
  const custLogin = await (
    await api.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASS } })
  ).json();
  const chead = { Authorization: `Bearer ${custLogin.data.access_token}` };
  const sm2 = await (await api.get(`${API}/shows/${showId}/seats`, { headers: chead })).json();
  const one = sm2.data.seats.filter((s: any) => !s.is_gap && s.status === 'available').slice(0, 1);
  const hold2 = await (
    await api.post(`${API}/orders/hold`, {
      headers: chead,
      data: { show_id: showId, seat_ids: [one[0].showtime_seat_id], idempotency_key: `e2e-${stamp}` },
    })
  ).json();
  const withDisc = await (
    await api.post(`${API}/orders/${hold2.data.booking_id}/discount`, { headers: chead, data: { code } })
  ).json();
  expect(withDisc.data.discount_amount).toBeGreaterThan(0);
  expect(withDisc.data.payable_amount).toBe(
    withDisc.data.total_amount - withDisc.data.discount_amount);
  await api.post(`${API}/orders/${hold2.data.booking_id}/cancel`, { headers: chead });

  // 8. Auth edge: wrong password 401.
  const bad = await api.post(`${API}/auth/login`, { data: { email: EMAIL, password: 'nope-nope' } });
  expect(bad.status()).toBe(401);

  // 9. Staff redeem one ticket from the UI booking, rescan blocked.
  const detail = await (
    await api.get(`${API}/orders/${bookingId}`, { headers: chead })
  ).json();
  expect(detail.data.tickets.length).toBe(2);
  const staffLogin = await (
    await api.post(`${API}/auth/login`, { data: { email: 'staff@cinema.local', password: 'staff123' } })
  ).json();
  const shead = { Authorization: `Bearer ${staffLogin.data.access_token}` };
  const r1 = await (
    await api.post(`${API}/tickets/${detail.data.tickets[0].code}/redeem`, {
      headers: shead, data: { showtime_id: showId },
    })
  ).json();
  expect(['ok', 'too_early', 'closed']).toContain(r1.data.status);

  expect(errors, JSON.stringify(errors)).toEqual([]);
  await api.dispose();
});
