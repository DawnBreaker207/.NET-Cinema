import { test, expect } from '@playwright/test';

// Full-site crawl: every reachable page, JS errors + failed API calls.
async function loginAs(page: any, email: string, password: string, url: string) {
  await page.goto(url);
  const box = page.locator('input[placeholder="admin@cinema.local"], input[placeholder="ban@email.com"]');
  await box.first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
}

test('crawl all pages', async ({ page, request }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`JS ${page.url()}: ${e.message.split('\n')[0]}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/v1/') && r.status() >= 400 && !r.url().includes('/auth/refresh'))
      problems.push(`API ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  const movies = await (
    await request.get('http://localhost:5000/api/v1/movies?page_size=5')
  ).json();
  const movieId = movies.data.items[0].id;
  const shows = await (
    await request.get('http://localhost:5000/api/v1/showtimes')
  ).json();
  const showId = shows.data[0].id;

  // Public customer pages (no login).
  for (const p of ['/', '/films', `/film/${movieId}`, '/pricing', '/cinema', '/offers',
    '/customer-login', '/register', '/forgot-password']) {
    await page.goto(`http://localhost:5173${p}`);
    await page.waitForTimeout(2500);
  }

  // Customer zone.
  await loginAs(page, 'customer@cinema.local', 'customer123', 'http://localhost:5173/customer-login');
  for (const p of ['/account', `/select-seat/${showId}`]) {
    await page.goto(`http://localhost:5173${p}`);
    await page.waitForTimeout(3500);
  }

  // Operator zone is Razor-only: old URLs bounce to the console.
  for (const p of ['/login', '/dashboard', '/counter', '/profile']) {
    await page.goto(`http://localhost:5173${p}`);
    await page.waitForTimeout(2000);
  }

  // Razor console (already logged into React; do its own form login).
  await page.goto('http://localhost:5000/account/login');
  await page.fill('input[name="email"]', 'admin@cinema.local');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin', { timeout: 15000 });
  for (const p of ['/admin', '/admin/movies', '/admin/halls', '/admin/showtimes',
    '/admin/combos', '/admin/counter', '/admin/orders', '/admin/users', '/admin/promotions',
    '/admin/pricing', '/admin/monitoring', '/account/profile']) {
    await page.goto(`http://localhost:5000${p}`);
    await page.waitForTimeout(1500);
  }

  console.log('PROBLEMS:\n' + (problems.length ? [...new Set(problems)].join('\n') : '(none)'));
  expect(problems, JSON.stringify([...new Set(problems)], null, 2)).toEqual([]);
});
