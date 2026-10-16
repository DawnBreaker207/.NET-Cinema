import { test, expect } from '@playwright/test';

// Crawls the Razor admin console 1:1 (login once via the real form).
const PAGES: Array<{ path: string; marker: string }> = [
  { path: '/admin', marker: 'Tổng quan' },
  { path: '/admin/catalog?tab=movies', marker: 'Danh mục' },
  { path: '/admin/catalog?tab=halls', marker: 'Danh mục' },
  { path: '/admin/catalog?tab=showtimes', marker: 'Danh mục' },
  { path: '/admin/catalog?tab=concessions', marker: 'Danh mục' },
  { path: '/admin/counter', marker: 'Quầy vé' },
  { path: '/admin/bookings', marker: 'Quản lý đơn đặt vé' },
  { path: '/admin/users', marker: 'Người dùng' },
  { path: '/admin/promotions', marker: 'Khuyến mãi' },
  { path: '/admin/pricing', marker: 'Giá vé' },
  { path: '/admin/monitoring', marker: 'Giám sát hệ thống' },
  { path: '/account/profile', marker: 'Hồ sơ' },
];

test('admin console 1:1 crawl', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message.split('\n')[0]}`));
  await page.goto('http://localhost:5000/account/login');
  await page.fill('input[name="email"]', 'admin@cinema.local');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin', { timeout: 15_000 });

  for (const p of PAGES) {
    const resp = await page.goto(`http://localhost:5000${p.path}`);
    expect(resp?.status(), p.path).toBe(200);
    await expect(page.locator('main').getByText(p.marker, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
  }
  expect(errors, JSON.stringify(errors)).toEqual([]);
});
