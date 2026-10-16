import { test, expect } from '@playwright/test';

test('click console link end to end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  // Staff on client.
  await page.goto('http://localhost:5173/customer-login');
  await page.locator('input[placeholder="ban@email.com"]').fill('staff@cinema.local');
  await page.locator('input[type="password"]').fill('staff123');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForTimeout(2500);
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1500);
  // Open avatar menu, click Quản trị viên.
  await page.locator('header').first().getByRole('button').last().click();
  const link = page.locator('a[href="http://localhost:5000/admin/counter"]');
  await expect(link).toBeVisible({ timeout: 10000 });
  await link.click();
  // Razor login (no cookie yet).
  await page.waitForURL('**/account/login**', { timeout: 15000 });
  await page.screenshot({ path: 'test-results/hop-razor-login.png' });
  await page.fill('input[name="email"]', 'staff@cinema.local');
  await page.fill('input[name="password"]', 'staff123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/counter', { timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/hop-counter.png', fullPage: true });
  expect(errors, JSON.stringify(errors)).toEqual([]);
});
