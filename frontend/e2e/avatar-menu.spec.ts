import { test, expect } from '@playwright/test';

test('avatar menu shows console link', async ({ page }) => {
  await page.goto('http://localhost:5173/customer-login');
  await page.locator('input[placeholder="ban@email.com"]').fill('staff@cinema.local');
  await page.locator('input[type="password"]').fill('staff123');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForTimeout(2500);
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1500);
  // Open avatar menu: click avatar button in header.
  const header = page.locator('header').first();
  await header.getByRole('button').last().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/avatar-menu.png' });
  const link = page.locator('a[href="http://localhost:5000/admin/counter"]');
  await expect(link).toBeVisible({ timeout: 10000 });
});
